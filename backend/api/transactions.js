// backend/api/transactions.js
// Stock Transaction Log API
// GET  /api/transactions        — list recent (last 100), optional ?limit=N
// POST /api/transactions        — save a new transaction entry

const express = require('express');
const { getPool, sql } = require('../db');
const router = express.Router();

// ── GET — list recent transactions ───────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool  = await getPool();
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const result = await pool.request()
      .input('Limit', sql.Int, limit)
      .query(`
        SELECT TOP (@Limit)
          TransactionID, TxnType, ItemName, Qty,
          Note, Description, TxnDate, CreatedAt
        FROM dbo.STOCK_TRANSACTIONS
        ORDER BY CreatedAt DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /transactions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST — save a new transaction ────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { type, itemName, qty, note, description } = req.body;
  if (!type) return res.status(400).json({ error: 'type is required' });

  try {
    const pool   = await getPool();
    const insert = await pool.request()
      .input('TxnType',     sql.NVarChar(20),      type        || '')
      .input('ItemName',    sql.NVarChar(255),      itemName    || null)
      .input('Qty',         sql.Decimal(18,3),      Number(qty) || null)
      .input('Note',        sql.NVarChar(500),      note        || null)
      .input('Description', sql.NVarChar(500),      description || null)
      .input('TxnDate',     sql.Date,               new Date())
      .query(`
        INSERT INTO dbo.STOCK_TRANSACTIONS
          (TxnType, ItemName, Qty, Note, Description, TxnDate, CreatedAt)
        OUTPUT INSERTED.*
        VALUES
          (@TxnType, @ItemName, @Qty, @Note, @Description, @TxnDate, GETDATE())
      `);
    res.status(201).json(insert.recordset[0]);
  } catch (err) {
    console.error('POST /transactions error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;