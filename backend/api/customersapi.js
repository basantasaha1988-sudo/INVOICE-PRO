const express = require('express');
const { getPool, sql } = require('../db');
const router = express.Router();

// ─── GET all customers ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT CustomerID, CustomerName, Phone, Email, Address, CreatedAt
      FROM dbo.Customer
      ORDER BY CustomerName
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /api/customers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /upsert — MUST be before /:id to avoid conflict ────────────────────
router.post('/upsert', async (req, res) => {
  const { name, phone, address } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Customer name is required' });

  try {
    const pool = await getPool();

    const existing = await pool.request()
      .input('CustomerName', sql.NVarChar(150), name.trim())
      .query(`SELECT CustomerID FROM dbo.Customer WHERE LOWER(CustomerName) = LOWER(@CustomerName)`);

    if (existing.recordset.length > 0) {
      const customerId = existing.recordset[0].CustomerID;
      await pool.request()
        .input('CustomerID', sql.Int,           customerId)
        .input('Phone',      sql.VarChar(20),   phone   || '')
        .input('Address',    sql.NVarChar(300),  address || '')
        .query(`UPDATE dbo.Customer SET Phone=@Phone, Address=@Address WHERE CustomerID=@CustomerID`);
      return res.json({ success: true, customerId, action: 'updated' });
    }

    const result = await pool.request()
      .input('CustomerName', sql.NVarChar(150), name.trim())
      .input('Phone',        sql.VarChar(20),   phone   || '')
      .input('Address',      sql.NVarChar(300),  address || '')
      .query(`
        INSERT INTO dbo.Customer (CustomerName, Phone, Address, CreatedAt)
        OUTPUT INSERTED.CustomerID
        VALUES (@CustomerName, @Phone, @Address, GETDATE())
      `);
    return res.json({ success: true, customerId: result.recordset[0].CustomerID, action: 'inserted' });

  } catch (err) {
    console.error('POST /api/customers/upsert error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /:id — update customer ───────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, phone, address } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Customer name is required' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('CustomerID',   sql.Int,           id)
      .input('CustomerName', sql.NVarChar(150),  name.trim())
      .input('Phone',        sql.VarChar(20),    phone   || '')
      .input('Address',      sql.NVarChar(300),   address || '')
      .query(`
        UPDATE dbo.Customer SET
          CustomerName = @CustomerName,
          Phone        = @Phone,
          Address      = @Address
        WHERE CustomerID = @CustomerID
      `);
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/customers/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const pool = await getPool();
    await pool.request()
      .input('CustomerID', sql.Int, id)
      .query(`DELETE FROM dbo.Customer WHERE CustomerID = @CustomerID`);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/customers/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;