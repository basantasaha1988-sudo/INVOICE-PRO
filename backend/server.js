// ─── server.js ───────────────────────────────────────────────────────────────
// Express + mssql backend for InvoicePro
// Run: node server.js
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── SQL Server Config ────────────────────────────────────────────────────────
const dbConfig = {
  user: 'sa',
  password: 'infotech@123',      // ← change this
  server: '192.168.0.205',
  database: 'InvoicePro',
  options: {
    encrypt: false,                    // set true if using Azure
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// ─── DB Pool ─────────────────────────────────────────────────────────────────
let pool;
async function getPool() {
  if (!pool) {
    pool = await sql.connect(dbConfig);
    console.log('✅ Connected to SQL Server');
  }
  return pool;
}

// ─── Multer (logo upload — stores as base64 in DB) ───────────────────────────
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — company_details
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/companies — list all
app.get('/api/companies', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request().query(`
      SELECT id, logo, company_name AS name, address
      FROM dbo.company_details
      ORDER BY id DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /api/companies error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/companies — add new
app.post('/api/companies', async (req, res) => {
  try {
    const { name, address, logo } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    const db = await getPool();
    const result = await db.request()
      .input('name', sql.VarChar(150), name.trim())
      .input('address', sql.NVarChar(sql.MAX), address || '')
      .input('logo', sql.VarChar(255), logo || null)
      .query(`
        INSERT INTO dbo.company_details (company_name, address, logo)
        OUTPUT INSERTED.id, INSERTED.logo, INSERTED.company_name AS name, INSERTED.address
        VALUES (@name, @address, @logo)
      `);

    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error('POST /api/companies error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/companies/:id — update
app.put('/api/companies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, logo } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    const db = await getPool();
    const result = await db.request()
      .input('id', sql.Int, parseInt(id))
      .input('name', sql.VarChar(150), name.trim())
      .input('address', sql.NVarChar(sql.MAX), address || '')
      .input('logo', sql.VarChar(255), logo || null)
      .query(`
        UPDATE dbo.company_details
        SET company_name = @name, address = @address, logo = @logo
        OUTPUT INSERTED.id, INSERTED.logo, INSERTED.company_name AS name, INSERTED.address
        WHERE id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('PUT /api/companies/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/companies/:id — delete
app.delete('/api/companies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getPool();

    await db.request()
      .input('id', sql.Int, parseInt(id))
      .query('DELETE FROM dbo.company_details WHERE id = @id');

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/companies/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/companies/search?q=term — search
app.get('/api/companies/search', async (req, res) => {
  try {
    const { q = '' } = req.query;
    const db = await getPool();
    const result = await db.request()
      .input('term', sql.NVarChar(200), `%${q}%`)
      .query(`
        SELECT id, logo, company_name AS name, address
        FROM dbo.company_details
        WHERE company_name LIKE @term OR address LIKE @term
        ORDER BY id DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — ITEMMASTER
// Table: dbo.ITEMMASTER
// Columns: ItemCode (PK, int), ItemName (nvarchar255), Rate (decimal18,2),
//          Tax (decimal5,2), CreatedDate (datetime), Stock (decimal18,2)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/itemmaster — list all items
app.get('/api/itemmaster', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request().query(`
      SELECT ItemCode, ItemName, Rate, Tax, CreatedDate, Stock
      FROM dbo.ITEMMASTER
      ORDER BY ItemCode DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /api/itemmaster error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/itemmaster — add new item
app.post('/api/itemmaster', async (req, res) => {
  try {
    const { name, defaultRate, defaultTaxPercent } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Item name is required' });
    }

    const db = await getPool();
    const result = await db.request()
      .input('name',  sql.NVarChar(255), name.trim())
      .input('rate',  sql.Decimal(18, 2), defaultRate  ?? 0)
      .input('tax',   sql.Decimal(5,  2), defaultTaxPercent ?? 9)
      .query(`
        INSERT INTO dbo.ITEMMASTER (ItemName, Rate, Tax, CreatedDate, Stock)
        OUTPUT
          INSERTED.ItemCode,
          INSERTED.ItemName,
          INSERTED.Rate,
          INSERTED.Tax,
          INSERTED.CreatedDate,
          INSERTED.Stock
        VALUES (@name, @rate, @tax, GETDATE(), 0)
      `);

    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error('POST /api/itemmaster error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/itemmaster/:id — update item
app.put('/api/itemmaster/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, defaultRate, defaultTaxPercent } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Item name is required' });
    }

    const db = await getPool();
    const result = await db.request()
      .input('id',   sql.Int,          parseInt(id))
      .input('name', sql.NVarChar(255), name.trim())
      .input('rate', sql.Decimal(18, 2), defaultRate ?? 0)
      .input('tax',  sql.Decimal(5,  2), defaultTaxPercent ?? 9)
      .query(`
        UPDATE dbo.ITEMMASTER
        SET ItemName = @name, Rate = @rate, Tax = @tax
        OUTPUT
          INSERTED.ItemCode,
          INSERTED.ItemName,
          INSERTED.Rate,
          INSERTED.Tax,
          INSERTED.CreatedDate,
          INSERTED.Stock
        WHERE ItemCode = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('PUT /api/itemmaster/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/itemmaster/:id/stock — RECEIVE stock (adds quantity)
app.patch('/api/itemmaster/:id/stock', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, note } = req.body;

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Quantity must be a positive number' });
    }

    const db = await getPool();
    const result = await db.request()
      .input('id',  sql.Int,           parseInt(id))
      .input('qty', sql.Decimal(18, 2), qty)
      .query(`
        UPDATE dbo.ITEMMASTER
        SET Stock = ISNULL(Stock, 0) + @qty
        OUTPUT
          INSERTED.ItemCode, INSERTED.ItemName, INSERTED.Rate,
          INSERTED.Tax, INSERTED.CreatedDate, INSERTED.Stock
        WHERE ItemCode = @id
      `);

    if (result.recordset.length === 0)
      return res.status(404).json({ error: 'Item not found' });

    console.log('Stock received: ItemCode=' + id + ' qty=' + qty + (note ? ' note=' + note : ''));
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('PATCH stock error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/itemmaster/:id/stock/set — SET stock to exact value (Edit Stock)
app.patch('/api/itemmaster/:id/stock/set', async (req, res) => {
  try {
    const { id } = req.params;
    const { stock } = req.body;

    const qty = parseFloat(stock);
    if (isNaN(qty) || qty < 0) {
      return res.status(400).json({ error: 'Stock must be 0 or more' });
    }

    const db = await getPool();
    const result = await db.request()
      .input('id',    sql.Int,           parseInt(id))
      .input('stock', sql.Decimal(18, 2), qty)
      .query(`
        UPDATE dbo.ITEMMASTER
        SET Stock = @stock
        OUTPUT
          INSERTED.ItemCode, INSERTED.ItemName, INSERTED.Rate,
          INSERTED.Tax, INSERTED.CreatedDate, INSERTED.Stock
        WHERE ItemCode = @id
      `);

    if (result.recordset.length === 0)
      return res.status(404).json({ error: 'Item not found' });

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('PATCH stock/set error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/itemmaster/:id — delete item
app.delete('/api/itemmaster/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getPool();

    await db.request()
      .input('id', sql.Int, parseInt(id))
      .query('DELETE FROM dbo.ITEMMASTER WHERE ItemCode = @id');

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/itemmaster/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 InvoicePro API running on http://localhost:${PORT}`);
});