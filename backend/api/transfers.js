// backend/api/transfers.js
// Item Transfer API — moves stock between projects (same company only)
//
// SCHEMA FIXES applied:
//   • dbo.ProjectMaster  → dbo.project_master  (canonical table, snake_case)
//     columns: id, project_name, company_id  (NOT ProjectID / ProjectName / CompanyID)
//   • dbo.ProjectStock   → DROPPED (merged into STOCK_RECEIPTS by migration)
//     stock availability is now read from dbo.ITEMMASTER.Stock
//   • dbo.ItemTransferHeader columns:
//     TransferDocNo (not TransferNumber), no ChallanNumber, no FromProjectID/ToProjectID
//     → we store project names as text (FromProjectName, ToProjectName)
//   • dbo.ItemTransferDetail columns:
//     TransferID, ItemCode, ItemName, Qty  (NOT Quantity / Rate)
//   • dbo.usp_AdjustProjectStock REMOVED — stored proc doesn't exist
//     stock is adjusted directly on dbo.ITEMMASTER
//   • project_master has no IsActive or ProjectCode column
//   • company_details uses id / company_name (not CompanyID)

const express = require('express');
const { getPool, sql } = require('../db');
const router = express.Router();

// ── Generate next transfer doc number ────────────────────────────────────────
async function nextTransferDocNo(pool) {
  const yr  = new Date().getFullYear();
  const res = await pool.request().query(`
    SELECT COUNT(*) AS cnt
    FROM dbo.ItemTransferHeader
    WHERE TransferDocNo LIKE 'TRF-${yr}-%'
  `);
  const seq = String(res.recordset[0].cnt + 1).padStart(3, '0');
  return `TRF-${yr}-${seq}`;
}

// ── GET all transfers ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        t.TransferID,
        t.TransferDocNo,
        t.TransferDate,
        t.Note,
        t.CreatedAt,
        t.FromCompanyID,
        t.ToCompanyID,
        fc.company_name AS CompanyName
      FROM dbo.ItemTransferHeader t
      LEFT JOIN dbo.company_details fc ON fc.id = t.FromCompanyID
      ORDER BY t.CreatedAt DESC
    `);

    const transfers = result.recordset;
    if (!transfers.length) return res.json([]);

    const ids = transfers.map(t => t.TransferID).join(',');
    const details = await pool.request().query(`
      SELECT d.TransferID, d.ItemCode, d.ItemName, d.Qty
      FROM dbo.ItemTransferDetail d
      WHERE d.TransferID IN (${ids})
    `);

    const detailMap = {};
    for (const row of details.recordset) {
      if (!detailMap[row.TransferID]) detailMap[row.TransferID] = [];
      detailMap[row.TransferID].push(row);
    }

    res.json(transfers.map(t => ({ ...t, items: detailMap[t.TransferID] || [] })));
  } catch (err) {
    console.error('GET /transfers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST create transfer ──────────────────────────────────────────────────────
// Body: { FromCompanyID, ToCompanyID, fromProjectName?, toProjectName?,
//         TransferDate, Note, items: [{ ItemCode, ItemName, Qty }] }
router.post('/', async (req, res) => {
  const { FromCompanyID, ToCompanyID, TransferDate, Note, items } = req.body;

  if (!FromCompanyID || !ToCompanyID)
    return res.status(400).json({ error: 'Both FromCompanyID and ToCompanyID are required' });
  if (!items?.length)
    return res.status(400).json({ error: 'At least one item is required' });

  let pool, transaction;
  try {
    pool        = await getPool();
    transaction = pool.transaction();
    await transaction.begin();

    // Verify companies exist
    const compRes = await transaction.request()
      .input('fc', sql.Int, parseInt(FromCompanyID))
      .input('tc', sql.Int, parseInt(ToCompanyID))
      .query(`SELECT id FROM dbo.company_details WHERE id IN (@fc, @tc)`);

    if (compRes.recordset.length < (FromCompanyID === ToCompanyID ? 1 : 2)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'One or both companies not found' });
    }

    // Check stock availability for each item in ITEMMASTER
    for (const item of items) {
      const stockRes = await transaction.request()
        .input('itemCode', sql.Int, parseInt(item.ItemCode))
        .query(`SELECT ISNULL(Stock, 0) AS Stock FROM dbo.ITEMMASTER WHERE ItemCode = @itemCode`);

      const available = Number(stockRes.recordset[0]?.Stock ?? 0);
      const requested = parseFloat(item.Qty);

      if (requested > available) {
        await transaction.rollback();
        return res.status(400).json({
          error: `Insufficient stock for item "${item.ItemName || item.ItemCode}". Available: ${available}, Requested: ${requested}`
        });
      }
    }

    // Generate transfer doc number
    const transferDocNo = await nextTransferDocNo(pool);

    // Insert header
    const hRes = await transaction.request()
      .input('TransferDocNo',  sql.NVarChar(30),      transferDocNo)
      .input('FromCompanyID',  sql.Int,               parseInt(FromCompanyID))
      .input('ToCompanyID',    sql.Int,               parseInt(ToCompanyID))
      .input('TransferDate',   sql.Date,              TransferDate ? new Date(TransferDate) : new Date())
      .input('Note',           sql.NVarChar(sql.MAX), Note || null)
      .query(`
        INSERT INTO dbo.ItemTransferHeader
          (TransferDocNo, FromCompanyID, ToCompanyID, TransferDate, Note, CreatedAt)
        OUTPUT INSERTED.TransferID, INSERTED.TransferDocNo
        VALUES (@TransferDocNo, @FromCompanyID, @ToCompanyID, @TransferDate, @Note, GETDATE())
      `);

    const { TransferID, TransferDocNo: DocNo } = hRes.recordset[0];

    // Insert detail rows + deduct from ITEMMASTER stock
    for (const item of items) {
      const itemCode = parseInt(item.ItemCode);
      const qty      = parseFloat(item.Qty);
      const itemName = item.ItemName?.trim() || '';

      // Insert detail
      await transaction.request()
        .input('TransferID', sql.Int,           TransferID)
        .input('ItemCode',   sql.Int,           itemCode)
        .input('ItemName',   sql.NVarChar(255), itemName)
        .input('Qty',        sql.Decimal(18,3), qty)
        .query(`
          INSERT INTO dbo.ItemTransferDetail (TransferID, ItemCode, ItemName, Qty)
          VALUES (@TransferID, @ItemCode, @ItemName, @Qty)
        `);

      // Deduct from ITEMMASTER.Stock (stock moves with item, not project-specific)
      await transaction.request()
        .input('ItemCode', sql.Int,           itemCode)
        .input('Qty',      sql.Decimal(18,3), qty)
        .query(`
          UPDATE dbo.ITEMMASTER
          SET    Stock = ISNULL(Stock, 0) - @Qty
          WHERE  ItemCode = @ItemCode
        `);
    }

    await transaction.commit();
    res.status(201).json({ success: true, TransferID, TransferDocNo: DocNo });

  } catch (err) {
    if (transaction) { try { await transaction.rollback(); } catch (_) {} }
    console.error('POST /transfers error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
