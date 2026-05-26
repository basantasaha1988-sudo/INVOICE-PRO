// backend/api/grn.js
// Goods Received Note (GRN) API — PO Receive Entry
//
// GET    /api/grn                  — list all GRNs (summary)
// GET    /api/grn/:id              — single GRN with items
// GET    /api/grn/by-po/:poid      — GRNs for a specific PO
// POST   /api/grn                  — create GRN (updates stock + marks PO Received)
// DELETE /api/grn/:id              — delete GRN (reverses stock)

const express = require('express');
const { getPool, sql } = require('../db');
const router = express.Router();

// ── GET all GRNs ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        h.GRNID, h.GRNDocNo, h.POID, p.PODocNo,
        h.SupplierID, h.SupplierName,
        h.CompanyID, h.CompanyName, h.ProjectName,
        h.ReceiptDate, h.InvoiceRef, h.Note, h.CreatedAt,
        COUNT(i.GRNItemID)                                      AS ItemCount,
        SUM(i.QtyReceived)                                      AS TotalQtyReceived,
        SUM(i.QtyReceived * ISNULL(i.UnitPrice, 0))             AS TotalValue
      FROM dbo.GRN_HEADER h
      LEFT JOIN dbo.GRN_ITEMS i ON i.GRNID = h.GRNID
      LEFT JOIN dbo.PO_HEADER p ON p.POID  = h.POID
      GROUP BY
        h.GRNID, h.GRNDocNo, h.POID, p.PODocNo,
        h.SupplierID, h.SupplierName,
        h.CompanyID, h.CompanyName, h.ProjectName,
        h.ReceiptDate, h.InvoiceRef, h.Note, h.CreatedAt
      ORDER BY h.CreatedAt DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /grn error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET GRNs for a PO ─────────────────────────────────────────────────────────
router.get('/by-po/:poid', async (req, res) => {
  try {
    const pool = await getPool();
    const poid = parseInt(req.params.poid);
    const [headers, items] = await Promise.all([
      pool.request().input('poid', sql.Int, poid).query(`
        SELECT h.*, p.PODocNo
        FROM dbo.GRN_HEADER h
        LEFT JOIN dbo.PO_HEADER p ON p.POID = h.POID
        WHERE h.POID = @poid
        ORDER BY h.ReceiptDate DESC, h.CreatedAt DESC
      `),
      pool.request().input('poid', sql.Int, poid).query(`
        SELECT i.*
        FROM dbo.GRN_ITEMS i
        JOIN dbo.GRN_HEADER h ON h.GRNID = i.GRNID
        WHERE h.POID = @poid
        ORDER BY i.GRNItemID
      `)
    ]);
    // Attach items to each header
    const grns = headers.recordset.map(h => ({
      ...h,
      items: items.recordset.filter(i => i.GRNID === h.GRNID)
    }));
    res.json(grns);
  } catch (err) {
    console.error('GET /grn/by-po/:poid error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET single GRN ────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const id   = parseInt(req.params.id);
    const [header, items] = await Promise.all([
      pool.request().input('id', sql.Int, id).query(`
        SELECT h.*, p.PODocNo
        FROM   dbo.GRN_HEADER h
        LEFT JOIN dbo.PO_HEADER p ON p.POID = h.POID
        WHERE  h.GRNID = @id
      `),
      pool.request().input('id', sql.Int, id).query(`
        SELECT * FROM dbo.GRN_ITEMS WHERE GRNID = @id ORDER BY GRNItemID
      `)
    ]);
    if (!header.recordset.length) return res.status(404).json({ error: 'GRN not found' });
    res.json({ ...header.recordset[0], items: items.recordset });
  } catch (err) {
    console.error('GET /grn/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST create GRN (PO Receive Entry) ───────────────────────────────────────
//
// Body: {
//   grnDocNo, poid, supplierID, supplierName,
//   companyId, companyName, projectName,
//   receiptDate, invoiceRef, note,
//   items: [{ poItemID?, itemCode, itemName, qtyReceived, unitPrice, poQty? }]
// }
//
// Effect:
//   1. Insert GRN_HEADER
//   2. For each item: read ITEMMASTER stock, update stock, insert GRN_ITEMS
//   3. If all PO items are fully received → set PO_HEADER.Status = 'Received'
//      Otherwise (partial) → set PO_HEADER.Status = 'Confirmed' (keeps open)
//
router.post('/', async (req, res) => {
  const {
    grnDocNo, poid, supplierID, supplierName,
    companyId, companyName, projectName,
    receiptDate, invoiceRef, note,
    items = []
  } = req.body;

  if (!grnDocNo?.trim())
    return res.status(400).json({ error: 'GRN Doc No is required' });
  if (!items.length)
    return res.status(400).json({ error: 'At least one item is required' });
  if (items.some(i => !i.itemName?.trim() || !(Number(i.qtyReceived) > 0)))
    return res.status(400).json({ error: 'Each item must have a name and quantity > 0' });

  const parsedDate = receiptDate ? new Date(receiptDate) : new Date();
  if (isNaN(parsedDate.getTime()))
    return res.status(400).json({ error: 'Invalid receipt date' });

  let pool, transaction;
  try {
    pool        = await getPool();
    transaction = pool.transaction();
    await transaction.begin();

    // 1. Insert GRN_HEADER
    const hResult = await transaction.request()
      .input('GRNDocNo',    sql.NVarChar(30),      grnDocNo.trim())
      .input('POID',        sql.Int,               poid        ? parseInt(poid)        : null)
      .input('SupplierID',  sql.Int,               supplierID  ? parseInt(supplierID)  : null)
      .input('SupplierName',sql.NVarChar(200),     supplierName || null)
      .input('CompanyID',   sql.Int,               companyId   ? parseInt(companyId)   : null)
      .input('CompanyName', sql.NVarChar(150),     companyName  || null)
      .input('ProjectName', sql.NVarChar(200),     projectName  || null)
      .input('ReceiptDate', sql.Date,              parsedDate)
      .input('InvoiceRef',  sql.NVarChar(50),      invoiceRef   || null)
      .input('Note',        sql.NVarChar(sql.MAX), note         || null)
      .query(`
        INSERT INTO dbo.GRN_HEADER
          (GRNDocNo, POID, SupplierID, SupplierName,
           CompanyID, CompanyName, ProjectName, ReceiptDate, InvoiceRef, Note)
        OUTPUT INSERTED.*
        VALUES
          (@GRNDocNo, @POID, @SupplierID, @SupplierName,
           @CompanyID, @CompanyName, @ProjectName, @ReceiptDate, @InvoiceRef, @Note)
      `);
    const GRNID = hResult.recordset[0].GRNID;

    // 2. Process each item — update stock + insert GRN line
    for (const item of items) {
      const qty       = Number(item.qtyReceived);
      const unitPrice = Number(item.unitPrice) || 0;

      // Fetch current stock (with row lock)
      let stockBefore = 0;
      let stockAfter  = 0;
      if (item.itemCode) {
        const stockRes = await transaction.request()
          .input('ItemCode', sql.Int, parseInt(item.itemCode))
          .query('SELECT ISNULL(Stock, 0) AS Stock FROM dbo.ITEMMASTER WITH (UPDLOCK) WHERE ItemCode = @ItemCode');

        if (stockRes.recordset.length) {
          stockBefore = Number(stockRes.recordset[0].Stock);
          stockAfter  = stockBefore + qty;

          // Update ITEMMASTER stock
          await transaction.request()
            .input('ItemCode',   sql.Int,          parseInt(item.itemCode))
            .input('StockAfter', sql.Decimal(18,3), stockAfter)
            .query('UPDATE dbo.ITEMMASTER SET Stock = @StockAfter WHERE ItemCode = @ItemCode');
        }
      }

      // Insert GRN line
      await transaction.request()
        .input('GRNID',       sql.Int,          GRNID)
        .input('POItemID',    sql.Int,          item.poItemID ? parseInt(item.poItemID) : null)
        .input('ItemCode',    sql.Int,          item.itemCode ? parseInt(item.itemCode) : null)
        .input('ItemName',    sql.NVarChar(255), item.itemName.trim())
        .input('POQty',       sql.Decimal(18,3), item.poQty   ? Number(item.poQty) : null)
        .input('QtyReceived', sql.Decimal(18,3), qty)
        .input('UnitPrice',   sql.Decimal(18,2), unitPrice)
        .input('StockBefore', sql.Decimal(18,3), stockBefore)
        .input('StockAfter',  sql.Decimal(18,3), stockAfter)
        .query(`
          INSERT INTO dbo.GRN_ITEMS
            (GRNID, POItemID, ItemCode, ItemName, POQty, QtyReceived, UnitPrice, StockBefore, StockAfter)
          VALUES
            (@GRNID, @POItemID, @ItemCode, @ItemName, @POQty, @QtyReceived, @UnitPrice, @StockBefore, @StockAfter)
        `);
    }

    // 3. Update PO status if this GRN is linked to a PO
    if (poid) {
      // Compare total ordered qty vs total received across ALL GRNs for this PO
      const qtyCheck = await transaction.request()
        .input('poid', sql.Int, parseInt(poid))
        .query(`
          SELECT
            (SELECT ISNULL(SUM(pi.Qty), 0)      FROM dbo.PO_ITEMS pi WHERE pi.POID = @poid)   AS OrderedQty,
            (SELECT ISNULL(SUM(gi.QtyReceived), 0)
             FROM   dbo.GRN_ITEMS gi
             JOIN   dbo.GRN_HEADER gh ON gh.GRNID = gi.GRNID
             WHERE  gh.POID = @poid)                                                            AS ReceivedQty
        `);
      const { OrderedQty, ReceivedQty } = qtyCheck.recordset[0];
      const newStatus = Number(ReceivedQty) >= Number(OrderedQty) ? 'Received' : 'Confirmed';

      await transaction.request()
        .input('poid',   sql.Int,          parseInt(poid))
        .input('status', sql.NVarChar(20), newStatus)
        .query(`UPDATE dbo.PO_HEADER SET Status = @status WHERE POID = @poid AND Status NOT IN ('Cancelled')`);
    }

    await transaction.commit();

    // Return full GRN
    const full = await pool.request().input('id', sql.Int, GRNID).query(`
      SELECT h.*, p.PODocNo,
             COUNT(i.GRNItemID)                          AS ItemCount,
             SUM(i.QtyReceived)                          AS TotalQtyReceived,
             SUM(i.QtyReceived * ISNULL(i.UnitPrice, 0)) AS TotalValue
      FROM   dbo.GRN_HEADER h
      LEFT JOIN dbo.GRN_ITEMS i ON i.GRNID = h.GRNID
      LEFT JOIN dbo.PO_HEADER p ON p.POID  = h.POID
      WHERE  h.GRNID = @id
      GROUP  BY h.GRNID, h.GRNDocNo, h.POID, p.PODocNo,
                h.SupplierID, h.SupplierName,
                h.CompanyID, h.CompanyName, h.ProjectName,
                h.ReceiptDate, h.InvoiceRef, h.Note, h.CreatedAt
    `);
    res.status(201).json(full.recordset[0]);

  } catch (err) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error('POST /grn error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE GRN (reverses stock) ───────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  let pool, transaction;
  try {
    pool        = await getPool();
    transaction = pool.transaction();
    await transaction.begin();

    const id = parseInt(req.params.id);

    // Load GRN header + items before deleting
    const [hRes, iRes] = await Promise.all([
      transaction.request().input('id', sql.Int, id)
        .query('SELECT * FROM dbo.GRN_HEADER WHERE GRNID = @id'),
      transaction.request().input('id', sql.Int, id)
        .query('SELECT * FROM dbo.GRN_ITEMS  WHERE GRNID = @id')
    ]);

    if (!hRes.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ error: 'GRN not found' });
    }

    const grn   = hRes.recordset[0];
    const items = iRes.recordset;

    // Reverse each item's stock
    for (const item of items) {
      if (!item.ItemCode) continue;
      await transaction.request()
        .input('ItemCode', sql.Int,          item.ItemCode)
        .input('Qty',      sql.Decimal(18,3), Number(item.QtyReceived))
        .query(`
          UPDATE dbo.ITEMMASTER
          SET    Stock = ISNULL(Stock, 0) - @Qty
          WHERE  ItemCode = @ItemCode
        `);
    }

    // Delete GRN (cascade removes items)
    await transaction.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM dbo.GRN_HEADER WHERE GRNID = @id');

    // Re-evaluate PO status
    if (grn.POID) {
      const qtyCheck = await transaction.request()
        .input('poid', sql.Int, grn.POID)
        .query(`
          SELECT
            (SELECT ISNULL(SUM(pi.Qty), 0) FROM dbo.PO_ITEMS pi WHERE pi.POID = @poid) AS OrderedQty,
            (SELECT ISNULL(SUM(gi.QtyReceived), 0)
             FROM   dbo.GRN_ITEMS gi
             JOIN   dbo.GRN_HEADER gh ON gh.GRNID = gi.GRNID
             WHERE  gh.POID = @poid) AS ReceivedQty
        `);
      const { OrderedQty, ReceivedQty } = qtyCheck.recordset[0];
      const newStatus = Number(ReceivedQty) > 0 ? 'Confirmed' : 'Confirmed'; // downgrade from Received
      await transaction.request()
        .input('poid',   sql.Int,          grn.POID)
        .input('status', sql.NVarChar(20), newStatus)
        .query(`UPDATE dbo.PO_HEADER SET Status = @status WHERE POID = @poid AND Status = 'Received'`);
    }

    await transaction.commit();
    res.json({ ok: true });

  } catch (err) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error('DELETE /grn/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;