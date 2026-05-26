// backend/api/stockreceipts.js
// Stock Receipt (GRN) API
// POST  /api/stock-receipts        — save GRN + update ITEMMASTER stock in one transaction
// GET   /api/stock-receipts        — list all receipts (optional ?item_code=N or ?company_id=N)

const express = require('express');
const { getPool, sql } = require('../db');
const router = express.Router();

// ── GET receipts ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { item_code, company_id } = req.query;
    const request = pool.request();

    let where = '';
    if (item_code) {
      request.input('ItemCode', sql.Int, parseInt(item_code));
      where += ' WHERE r.ItemCode = @ItemCode';
    }
    if (company_id) {
      request.input('CompanyID', sql.Int, parseInt(company_id));
      where += where ? ' AND r.CompanyID = @CompanyID' : ' WHERE r.CompanyID = @CompanyID';
    }

    const result = await request.query(`
      SELECT
        r.ReceiptID, r.GRNDocNo,
        r.CompanyID, r.CompanyName, r.ProjectName,
        r.ItemCode,  r.ItemName,
        r.QtyReceived, r.StockBefore, r.StockAfter,
        r.Note, r.ReceiptDate, r.ReceivedAt
      FROM dbo.STOCK_RECEIPTS r
      ${where}
      ORDER BY r.ReceiptDate DESC, r.ReceivedAt DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /stock-receipts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST — save GRN + update stock (atomic transaction) ──────────────────────
router.post('/', async (req, res) => {
  const {
    grnDocNo, companyId, companyName, projectName,
    itemCode, itemName, qty, note, receiptDate
  } = req.body;

  if (!grnDocNo)   return res.status(400).json({ error: 'GRN Doc No is required' });
  if (!itemCode)   return res.status(400).json({ error: 'Item is required' });
  if (!qty || Number(qty) <= 0) return res.status(400).json({ error: 'Quantity must be greater than 0' });

  // Parse receipt date — default to today if not provided
  const parsedDate = receiptDate ? new Date(receiptDate) : new Date();
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({ error: 'Invalid receipt date' });
  }

  let pool, transaction;
  try {
    pool = await getPool();
    transaction = pool.transaction();
    await transaction.begin();

    // 1. Get current stock (with row lock)
    const stockResult = await transaction.request()
      .input('ItemCode', sql.Int, parseInt(itemCode))
      .query('SELECT ISNULL(Stock, 0) AS Stock FROM dbo.ITEMMASTER WITH (UPDLOCK) WHERE ItemCode = @ItemCode');

    if (!stockResult.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Item not found' });
    }

    const stockBefore = Number(stockResult.recordset[0].Stock);
    const stockAfter  = stockBefore + Number(qty);

    // 2. Update ITEMMASTER stock
    await transaction.request()
      .input('ItemCode',    sql.Int,           parseInt(itemCode))
      .input('StockAfter',  sql.Decimal(18,3), stockAfter)
      .query('UPDATE dbo.ITEMMASTER SET Stock = @StockAfter WHERE ItemCode = @ItemCode');

    // 3. Insert STOCK_RECEIPTS record
    const insert = await transaction.request()
      .input('GRNDocNo',     sql.NVarChar(30),      grnDocNo)
      .input('CompanyID',    sql.Int,               companyId   ? parseInt(companyId) : null)
      .input('CompanyName',  sql.NVarChar(150),     companyName || null)
      .input('ProjectName',  sql.NVarChar(200),     projectName || null)
      .input('ItemCode',     sql.Int,               parseInt(itemCode))
      .input('ItemName',     sql.NVarChar(255),     itemName    || '')
      .input('QtyReceived',  sql.Decimal(18,3),     Number(qty))
      .input('StockBefore',  sql.Decimal(18,3),     stockBefore)
      .input('StockAfter',   sql.Decimal(18,3),     stockAfter)
      .input('Note',         sql.NVarChar(sql.MAX), note        || null)
      .input('ReceiptDate',  sql.Date,              parsedDate)
      .query(`
        INSERT INTO dbo.STOCK_RECEIPTS
          (GRNDocNo, CompanyID, CompanyName, ProjectName,
           ItemCode, ItemName, QtyReceived, StockBefore, StockAfter, Note, ReceiptDate)
        OUTPUT INSERTED.*
        VALUES
          (@GRNDocNo, @CompanyID, @CompanyName, @ProjectName,
           @ItemCode, @ItemName, @QtyReceived, @StockBefore, @StockAfter, @Note, @ReceiptDate)
      `);

    await transaction.commit();
    res.status(201).json(insert.recordset[0]);

  } catch (err) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error('POST /stock-receipts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /:id — edit a receive entry (adjusts stock delta) ────────────────────
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { grnDocNo, itemName, qty, note, receiptDate } = req.body;

  if (!qty || Number(qty) <= 0)
    return res.status(400).json({ error: 'Quantity must be greater than 0' });

  const parsedDate = receiptDate ? new Date(receiptDate) : new Date();
  if (isNaN(parsedDate.getTime()))
    return res.status(400).json({ error: 'Invalid receipt date' });

  let pool, transaction;
  try {
    pool = await getPool();
    transaction = pool.transaction();
    await transaction.begin();

    // 1. Load existing receipt
    const existing = await transaction.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM dbo.STOCK_RECEIPTS WHERE ReceiptID = @id');

    if (!existing.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const old = existing.recordset[0];
    const oldQty = Number(old.QtyReceived);
    const newQty = Number(qty);
    const delta = newQty - oldQty; // positive = add more, negative = reduce

    // 2. Adjust ITEMMASTER stock by delta (if item still exists)
    if (old.ItemCode) {
      await transaction.request()
        .input('ItemCode', sql.Int, old.ItemCode)
        .input('Delta', sql.Decimal(18, 3), delta)
        .query('UPDATE dbo.ITEMMASTER SET Stock = ISNULL(Stock,0) + @Delta WHERE ItemCode = @ItemCode');
    }

    // 3. Update STOCK_RECEIPTS row
    await transaction.request()
      .input('id',           sql.Int,               id)
      .input('GRNDocNo',     sql.NVarChar(30),      grnDocNo || old.GRNDocNo)
      .input('ItemName',     sql.NVarChar(255),     itemName || old.ItemName)
      .input('QtyReceived',  sql.Decimal(18, 3),    newQty)
      .input('StockAfter',   sql.Decimal(18, 3),    Number(old.StockAfter) + delta)
      .input('Note',         sql.NVarChar(sql.MAX), note ?? old.Note)
      .input('ReceiptDate',  sql.Date,              parsedDate)
      .query(`
        UPDATE dbo.STOCK_RECEIPTS
        SET GRNDocNo    = @GRNDocNo,
            ItemName    = @ItemName,
            QtyReceived = @QtyReceived,
            StockAfter  = @StockAfter,
            Note        = @Note,
            ReceiptDate = @ReceiptDate
        WHERE ReceiptID = @id
      `);

    await transaction.commit();
    res.json({ ok: true, delta });
  } catch (err) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error('PUT /stock-receipts/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /:id — delete a receive entry (reverses stock) ────────────────────
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);

  let pool, transaction;
  try {
    pool = await getPool();
    transaction = pool.transaction();
    await transaction.begin();

    // Load receipt
    const existing = await transaction.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM dbo.STOCK_RECEIPTS WHERE ReceiptID = @id');

    if (!existing.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const rec = existing.recordset[0];

    // Reverse stock on ITEMMASTER
    if (rec.ItemCode) {
      await transaction.request()
        .input('ItemCode', sql.Int, rec.ItemCode)
        .input('Qty', sql.Decimal(18, 3), Number(rec.QtyReceived))
        .query('UPDATE dbo.ITEMMASTER SET Stock = ISNULL(Stock,0) - @Qty WHERE ItemCode = @ItemCode');
    }

    // Delete the row
    await transaction.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM dbo.STOCK_RECEIPTS WHERE ReceiptID = @id');

    await transaction.commit();
    res.json({ ok: true, deleted: id });
  } catch (err) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error('DELETE /stock-receipts/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;