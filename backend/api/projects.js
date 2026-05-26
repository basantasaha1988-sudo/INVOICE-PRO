// backend/api/projects.js
const express = require('express');
const { getPool, sql } = require('../db');
const router = express.Router();

// ── GET all projects (optionally filter by company) ──────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { company_id } = req.query;
    let query = `
      SELECT
        p.id,
        p.project_name AS name,
        p.description,
        p.company_id,
        c.company_name
      FROM dbo.project_master p
      INNER JOIN dbo.company_details c ON c.id = p.company_id
    `;
    const request = pool.request();
    if (company_id) {
      query += ' WHERE p.company_id = @company_id';
      request.input('company_id', sql.Int, parseInt(company_id));
    }
    query += ' ORDER BY c.company_name, p.project_name';
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /projects error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST create project ──────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { company_id, name, description } = req.body;
  if (!company_id) return res.status(400).json({ error: 'Company is required' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'Project name is required' });
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('company_id',  sql.Int,          parseInt(company_id))
      .input('name',        sql.NVarChar(200), name.trim())
      .input('description', sql.NVarChar(sql.MAX), description || '')
      .query(`
        INSERT INTO dbo.project_master (company_id, project_name, description)
        OUTPUT
          INSERTED.id,
          INSERTED.project_name AS name,
          INSERTED.description,
          INSERTED.company_id
        VALUES (@company_id, @name, @description)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error('POST /projects error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT update project ───────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { company_id, name, description } = req.body;
  if (!company_id) return res.status(400).json({ error: 'Company is required' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'Project name is required' });
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id',          sql.Int,          parseInt(id))
      .input('company_id',  sql.Int,          parseInt(company_id))
      .input('name',        sql.NVarChar(200), name.trim())
      .input('description', sql.NVarChar(sql.MAX), description || '')
      .query(`
        UPDATE dbo.project_master
        SET company_id = @company_id, project_name = @name, description = @description
        WHERE id = @id;

        SELECT
          p.id, p.project_name AS name, p.description, p.company_id,
          c.company_name
        FROM dbo.project_master p
        INNER JOIN dbo.company_details c ON c.id = p.company_id
        WHERE p.id = @id;
      `);
    if (!result.recordset.length) return res.status(404).json({ error: 'Project not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('PUT /projects error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE project ───────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query('DELETE FROM dbo.project_master WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /projects error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;