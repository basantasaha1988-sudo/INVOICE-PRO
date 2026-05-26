// backend/api/suppliers.js
// Supplier Master API
// GET    /api/suppliers            — list all active suppliers
// GET    /api/suppliers/all        — list ALL suppliers (incl. inactive)
// GET    /api/suppliers/:id        — single supplier
// POST   /api/suppliers            — create supplier
// PUT    /api/suppliers/:id        — update supplier
// PATCH  /api/suppliers/:id/toggle — toggle IsActive
// DELETE /api/suppliers/:id        — delete supplier

const express = require('express');
const { getPool, sql } = require('../db');
const router = express.Router();

// ── GET active suppliers (dropdown-friendly) ─────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT SupplierID, SupplierCode, SupplierName,
             ContactPerson, Phone, Email, Address,
             GSTNo, IsActive, Notes, CreatedAt, UpdatedAt
      FROM   dbo.SUPPLIER_MASTER
      WHERE  IsActive = 1
      ORDER  BY SupplierName
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /suppliers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET all suppliers (master screen) ────────────────────────────────────────
router.get('/all', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT SupplierID, SupplierCode, SupplierName,
             ContactPerson, Phone, Email, Address,
             GSTNo, IsActive, Notes, CreatedAt, UpdatedAt
      FROM   dbo.SUPPLIER_MASTER
      ORDER  BY SupplierName
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /suppliers/all error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET single supplier ───────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, parseInt(req.params.id))
      .query(`SELECT * FROM dbo.SUPPLIER_MASTER WHERE SupplierID = @id`);
    if (!result.recordset.length) return res.status(404).json({ error: 'Supplier not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('GET /suppliers/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST create supplier ──────────────────────────────────────────────────────
// SupplierCode is entered manually by the user and included in the INSERT.
// No trigger or auto-generation — the value comes directly from req.body.
router.post('/', async (req, res) => {
  const {
    supplierCode, supplierName, contactPerson, phone, email,
    address, gstNo, notes
  } = req.body;

  if (!supplierCode?.trim())
    return res.status(400).json({ error: 'Supplier code is required' });
  if (!supplierName?.trim())
    return res.status(400).json({ error: 'Supplier name is required' });

  try {
    const pool = await getPool();

    // Check duplicate code
    const dupCode = await pool.request()
      .input('code', sql.NVarChar(30), supplierCode.trim())
      .query(`SELECT SupplierID FROM dbo.SUPPLIER_MASTER WHERE LOWER(SupplierCode) = LOWER(@code)`);
    if (dupCode.recordset.length)
      return res.status(409).json({ error: 'A supplier with this code already exists' });

    // Check duplicate name
    const dupName = await pool.request()
      .input('name', sql.NVarChar(200), supplierName.trim())
      .query(`SELECT SupplierID FROM dbo.SUPPLIER_MASTER WHERE LOWER(SupplierName) = LOWER(@name)`);
    if (dupName.recordset.length)
      return res.status(409).json({ error: 'A supplier with this name already exists' });

    // INSERT — SupplierCode explicitly included from user input
    await pool.request()
      .input('SupplierCode',   sql.NVarChar(30),      supplierCode.trim())
      .input('SupplierName',   sql.NVarChar(200),     supplierName.trim())
      .input('ContactPerson',  sql.NVarChar(150),     contactPerson || null)
      .input('Phone',          sql.NVarChar(30),      phone         || null)
      .input('Email',          sql.NVarChar(150),     email         || null)
      .input('Address',        sql.NVarChar(400),     address       || null)
      .input('GSTNo',          sql.NVarChar(20),      gstNo         || null)
      .input('Notes',          sql.NVarChar(sql.MAX), notes         || null)
      .query(`
        INSERT INTO dbo.SUPPLIER_MASTER
          (SupplierCode, SupplierName, ContactPerson, Phone, Email,
           Address, GSTNo, IsActive, Notes)
        VALUES
          (@SupplierCode, @SupplierName, @ContactPerson, @Phone, @Email,
           @Address, @GSTNo, 1, @Notes)
      `);

    // Fetch the inserted row (no OUTPUT clause — avoids trigger conflicts if any are added later)
    const inserted = await pool.request()
      .input('code', sql.NVarChar(30), supplierCode.trim())
      .query(`SELECT TOP 1 * FROM dbo.SUPPLIER_MASTER WHERE SupplierCode = @code`);

    res.status(201).json(inserted.recordset[0]);
  } catch (err) {
    console.error('POST /suppliers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT update supplier ───────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const {
    supplierName, contactPerson, phone, email,
    address, gstNo, notes
  } = req.body;

  if (!supplierName?.trim())
    return res.status(400).json({ error: 'Supplier name is required' });

  try {
    const pool = await getPool();
    const id   = parseInt(req.params.id);

    // Check duplicate name (exclude self)
    const dup = await pool.request()
      .input('name', sql.NVarChar(200), supplierName.trim())
      .input('id',   sql.Int,           id)
      .query(`SELECT SupplierID FROM dbo.SUPPLIER_MASTER
              WHERE LOWER(SupplierName) = LOWER(@name) AND SupplierID <> @id`);
    if (dup.recordset.length)
      return res.status(409).json({ error: 'Another supplier with this name already exists' });

    await pool.request()
      .input('id',             sql.Int,               id)
      .input('SupplierName',   sql.NVarChar(200),     supplierName.trim())
      .input('ContactPerson',  sql.NVarChar(150),     contactPerson || null)
      .input('Phone',          sql.NVarChar(30),      phone         || null)
      .input('Email',          sql.NVarChar(150),     email         || null)
      .input('Address',        sql.NVarChar(400),     address       || null)
      .input('GSTNo',          sql.NVarChar(20),      gstNo         || null)
      .input('Notes',          sql.NVarChar(sql.MAX), notes         || null)
      .query(`
        UPDATE dbo.SUPPLIER_MASTER
        SET  SupplierName  = @SupplierName,
             ContactPerson = @ContactPerson,
             Phone         = @Phone,
             Email         = @Email,
             Address       = @Address,
             GSTNo         = @GSTNo,
             Notes         = @Notes,
             UpdatedAt     = GETDATE()
        WHERE SupplierID = @id
      `);

    const updated = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT * FROM dbo.SUPPLIER_MASTER WHERE SupplierID = @id`);

    if (!updated.recordset.length) return res.status(404).json({ error: 'Supplier not found' });
    res.json(updated.recordset[0]);
  } catch (err) {
    console.error('PUT /suppliers/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH toggle active ───────────────────────────────────────────────────────
router.patch('/:id/toggle', async (req, res) => {
  try {
    const pool = await getPool();
    const id   = parseInt(req.params.id);

    await pool.request()
      .input('id', sql.Int, id)
      .query(`
        UPDATE dbo.SUPPLIER_MASTER
        SET    IsActive  = 1 - IsActive,
               UpdatedAt = GETDATE()
        WHERE  SupplierID = @id
      `);

    const updated = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT SupplierID, IsActive FROM dbo.SUPPLIER_MASTER WHERE SupplierID = @id`);

    if (!updated.recordset.length) return res.status(404).json({ error: 'Supplier not found' });
    res.json({ ok: true, ...updated.recordset[0] });
  } catch (err) {
    console.error('PATCH /suppliers/:id/toggle error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE supplier ───────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const inUse = await pool.request()
      .input('id', sql.Int, parseInt(req.params.id))
      .query(`
        SELECT 1 FROM dbo.PO_HEADER  WHERE SupplierID = @id
        UNION ALL
        SELECT 1 FROM dbo.GRN_HEADER WHERE SupplierID = @id
      `);
    if (inUse.recordset.length)
      return res.status(409).json({
        error: 'Cannot delete: supplier is referenced in purchase orders or GRN records. Deactivate instead.'
      });

    await pool.request()
      .input('id', sql.Int, parseInt(req.params.id))
      .query('DELETE FROM dbo.SUPPLIER_MASTER WHERE SupplierID = @id');
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /suppliers/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;