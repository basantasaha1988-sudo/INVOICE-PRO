const express = require('express');
const { getPool, sql } = require('../db');
const router = express.Router();

// ── GET all companies ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(
      `SELECT id, logo, company_name AS name, address
       FROM dbo.company_details
       ORDER BY company_name`
    );
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /companies error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST create new company ────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, address, logo } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Company name is required' });
  }
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('name',    sql.NVarChar(150),       name.trim())
      .input('address', sql.NVarChar(sql.MAX),   address || '')
      .input('logo',    sql.VarChar(sql.MAX),    logo    || null)
      .query(`
        INSERT INTO dbo.company_details (company_name, address, logo)
        OUTPUT INSERTED.id, INSERTED.company_name AS name, INSERTED.address, INSERTED.logo
        VALUES (@name, @address, @logo)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error('POST /companies error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT update company ─────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, address, logo } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Company name is required' });
  }
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id',      sql.Int,                 parseInt(id))
      .input('name',    sql.NVarChar(150),       name.trim())
      .input('address', sql.NVarChar(sql.MAX),   address || '')
      .input('logo',    sql.VarChar(sql.MAX),    logo    || null)
      .query(`
        UPDATE dbo.company_details
        SET company_name = @name, address = @address, logo = @logo
        WHERE id = @id;
        SELECT id, company_name AS name, address, logo
        FROM dbo.company_details WHERE id = @id;
      `);
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('PUT /companies error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE company ─────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query('DELETE FROM dbo.company_details WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /companies error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;