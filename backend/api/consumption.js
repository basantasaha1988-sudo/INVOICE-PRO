// backend/api/consumption.js
// Consumption (Material Issue) API
// POST   /api/consumption         — create a consumption voucher (deducts stock)
// GET    /api/consumption         — list all consumption records
// GET    /api/consumption/:id     — get single consumption with items
// PUT    /api/consumption/:id     — edit header fields only (no stock re-calc)
// DELETE /api/consumption/:id     — delete + reverse stock deduction

const express = require('express');
const { getPool, sql } = require('../db');
const router = express.Router();

// ── GET all consumption records ───────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { company_id } = req.query;
    const request = pool.request();

    let where = '';
    if (company_id) {
      request.input('CompanyID', sql.Int, parseInt(company_id));
      where = ' WHERE h.CompanyID = @CompanyID';
    }

    const result = await request.query(`
      SELECT
        h.ConsumptionID,
        h.DocNo,
        h.CompanyID,
        h.CompanyName,
        h.ProjectName,
        h.ConsumptionDate,
        h.Remarks,
        h.CreatedAt,
        (
          SELECT COUNT(*) FROM dbo.CONSUMPTION_ITEMS ci
          WHERE ci.ConsumptionID = h.ConsumptionID
        ) AS ItemCount,
        (
          SELECT ISNULL(SUM(ci.QtyConsumed), 0) FROM dbo.CONSUMPTION_ITEMS ci
          WHERE ci.ConsumptionID = h.ConsumptionID
        ) AS TotalQty
      FROM dbo.CONSUMPTION_HEADER h
      ${where}
      ORDER BY h.ConsumptionDate DESC, h.CreatedAt DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /consumption error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET single consumption with items ─────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const pool = await getPool();

    const header = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM dbo.CONSUMPTION_HEADER WHERE ConsumptionID = @id');

    if (!header.recordset.length)
      return res.status(404).json({ error: 'Consumption record not found' });

    const items = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT ci.*, im.Stock AS CurrentStock
        FROM dbo.CONSUMPTION_ITEMS ci
        LEFT JOIN dbo.ITEMMASTER im ON im.ItemCode = ci.ItemCode
        WHERE ci.ConsumptionID = @id
        ORDER BY ci.[LineNo]
      `);

    res.json({ ...header.recordset[0], items: items.recordset });
  } catch (err) {
    console.error('GET /consumption/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST — create consumption voucher + deduct stock atomically ───────────────
router.post('/', async (req, res) => {
  const { docNo, companyId, companyName, projectName, consumptionDate, remarks, items } = req.body;

  if (!docNo?.trim())        return res.status(400).json({ error: 'Document number is required' });
  if (!companyId)            return res.status(400).json({ error: 'Company is required' });
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'At least one item is required' });

  for (const it of items) {
    if (!it.itemCode)                   return res.status(400).json({ error: 'Item is required for all rows' });
    if (!it.qty || Number(it.qty) <= 0) return res.status(400).json({ error: `Quantity must be > 0 for ${it.itemName || 'item'}` });
  }

  const parsedDate = consumptionDate ? new Date(consumptionDate) : new Date();
  if (isNaN(parsedDate.getTime())) return res.status(400).json({ error: 'Invalid date' });

  let pool, transaction;
  try {
    pool = await getPool();
    transaction = pool.transaction();
    await transaction.begin();

    // 1. Insert header
    const hdr = await transaction.request()
      .input('DocNo',           sql.NVarChar(30),      docNo.trim())
      .input('CompanyID',       sql.Int,               parseInt(companyId))
      .input('CompanyName',     sql.NVarChar(150),     companyName  || '')
      .input('ProjectName',     sql.NVarChar(200),     projectName  || '')
      .input('ConsumptionDate', sql.Date,              parsedDate)
      .input('Remarks',         sql.NVarChar(sql.MAX), remarks || '')
      .query(`
        INSERT INTO dbo.CONSUMPTION_HEADER
          (DocNo, CompanyID, CompanyName, ProjectName, ConsumptionDate, Remarks)
        OUTPUT INSERTED.ConsumptionID
        VALUES
          (@DocNo, @CompanyID, @CompanyName, @ProjectName, @ConsumptionDate, @Remarks)
      `);

    const consumptionId = hdr.recordset[0].ConsumptionID;

    // 2. For each item: check stock, deduct, insert line
    const savedItems = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const qty = Number(it.qty);

      // Fetch current stock with row lock
      const stockRes = await transaction.request()
        .input('ItemCode', sql.Int, parseInt(it.itemCode))
        .query('SELECT ISNULL(Stock,0) AS Stock, ItemName FROM dbo.ITEMMASTER WITH (UPDLOCK) WHERE ItemCode = @ItemCode');

      if (!stockRes.recordset.length) {
        await transaction.rollback();
        return res.status(404).json({ error: `Item ${it.itemName || it.itemCode} not found` });
      }

      const stockBefore = Number(stockRes.recordset[0].Stock);
      const stockAfter  = stockBefore - qty;

      if (stockAfter < 0) {
        await transaction.rollback();
        return res.status(400).json({
          error: `Insufficient stock for "${it.itemName}". Available: ${stockBefore}, Required: ${qty}`
        });
      }

      // Deduct from ITEMMASTER
      await transaction.request()
        .input('ItemCode',   sql.Int,           parseInt(it.itemCode))
        .input('StockAfter', sql.Decimal(18,3), stockAfter)
        .query('UPDATE dbo.ITEMMASTER SET Stock = @StockAfter WHERE ItemCode = @ItemCode');

      // Insert line item
      const line = await transaction.request()
        .input('ConsumptionID', sql.Int,           consumptionId)
        .input('LineNo',        sql.Int,           i + 1)
        .input('ItemCode',      sql.Int,           parseInt(it.itemCode))
        .input('ItemName',      sql.NVarChar(255), it.itemName || '')
        .input('QtyConsumed',   sql.Decimal(18,3), qty)
        .input('StockBefore',   sql.Decimal(18,3), stockBefore)
        .input('StockAfter',    sql.Decimal(18,3), stockAfter)
        .input('Remarks',       sql.NVarChar(500), it.remarks || '')
        .query(`
          INSERT INTO dbo.CONSUMPTION_ITEMS
            (ConsumptionID, [LineNo], ItemCode, ItemName, QtyConsumed, StockBefore, StockAfter, Remarks)
          OUTPUT INSERTED.*
          VALUES
            (@ConsumptionID, @LineNo, @ItemCode, @ItemName, @QtyConsumed, @StockBefore, @StockAfter, @Remarks)
        `);

      savedItems.push(line.recordset[0]);
    }

    await transaction.commit();

    res.status(201).json({
      ConsumptionID: consumptionId,
      DocNo: docNo.trim(),
      CompanyName: companyName,
      ProjectName: projectName,
      ConsumptionDate: parsedDate,
      Remarks: remarks,
      items: savedItems,
    });

  } catch (err) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error('POST /consumption error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /:id — edit header fields (remarks, date, project) ────────────────────
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { remarks, projectName, consumptionDate } = req.body;

  const parsedDate = consumptionDate ? new Date(consumptionDate) : null;
  if (consumptionDate && isNaN(parsedDate?.getTime()))
    return res.status(400).json({ error: 'Invalid date' });

  try {
    const pool = await getPool();

    const existing = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM dbo.CONSUMPTION_HEADER WHERE ConsumptionID = @id');

    if (!existing.recordset.length)
      return res.status(404).json({ error: 'Consumption record not found' });

    const old = existing.recordset[0];

    await pool.request()
      .input('id',          sql.Int,               id)
      .input('Remarks',     sql.NVarChar(sql.MAX),  remarks      ?? old.Remarks)
      .input('ProjectName', sql.NVarChar(200),      projectName  ?? old.ProjectName)
      .input('Date',        sql.Date,               parsedDate   || old.ConsumptionDate)
      .query(`
        UPDATE dbo.CONSUMPTION_HEADER
        SET Remarks = @Remarks, ProjectName = @ProjectName, ConsumptionDate = @Date
        WHERE ConsumptionID = @id
      `);

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /consumption/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /:id — delete + reverse all stock deductions ───────────────────────
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);

  let pool, transaction;
  try {
    pool = await getPool();
    transaction = pool.transaction();
    await transaction.begin();

    // Load items to reverse
    const itemsRes = await transaction.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM dbo.CONSUMPTION_ITEMS WHERE ConsumptionID = @id');

    if (!itemsRes.recordset.length) {
      // Check header exists
      const hdr = await transaction.request()
        .input('id', sql.Int, id)
        .query('SELECT ConsumptionID FROM dbo.CONSUMPTION_HEADER WHERE ConsumptionID = @id');
      if (!hdr.recordset.length) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Consumption record not found' });
      }
    }

    // Reverse stock for each item
    for (const it of itemsRes.recordset) {
      if (it.ItemCode) {
        await transaction.request()
          .input('ItemCode', sql.Int,           it.ItemCode)
          .input('Qty',      sql.Decimal(18,3), Number(it.QtyConsumed))
          .query('UPDATE dbo.ITEMMASTER SET Stock = ISNULL(Stock,0) + @Qty WHERE ItemCode = @ItemCode');
      }
    }

    // Delete items then header (cascade should handle it, but explicit is safer)
    await transaction.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM dbo.CONSUMPTION_ITEMS WHERE ConsumptionID = @id');

    await transaction.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM dbo.CONSUMPTION_HEADER WHERE ConsumptionID = @id');

    await transaction.commit();
    res.json({ ok: true, deleted: id });

  } catch (err) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error('DELETE /consumption/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;