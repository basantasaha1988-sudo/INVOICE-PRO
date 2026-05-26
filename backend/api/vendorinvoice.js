// backend/api/vendorinvoice.js
// Vendor Invoice API
// GET    /api/vendor-invoices              — list all vendor invoices (optional ?supplierId= &status=)
// GET    /api/vendor-invoices/:id          — single invoice with line items
// POST   /api/vendor-invoices              — create invoice + items
// PATCH  /api/vendor-invoices/:id/status   — update status only
// DELETE /api/vendor-invoices/:id          — delete invoice + items

const express = require('express');
const { getPool, sql } = require('../db');
const router = express.Router();

// ── Auto-create tables if they don't exist ────────────────────────────────────
const ensureTables = async () => {
  const pool = await getPool();

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'VENDOR_INVOICE_HEADER' AND schema_id = SCHEMA_ID('dbo'))
    BEGIN
      CREATE TABLE dbo.VENDOR_INVOICE_HEADER (
        VIID            INT IDENTITY(1,1) PRIMARY KEY,
        VINo            NVARCHAR(50)    NOT NULL,
        VIDate          DATE            NOT NULL DEFAULT GETDATE(),
        DueDate         DATE            NULL,
        SupplierID      INT             NULL,
        SupplierName    NVARCHAR(200)   NOT NULL,
        PaymentMethodID INT             NULL,
        ReferenceNo     NVARCHAR(100)   NULL,
        Subtotal        DECIMAL(18,2)   NOT NULL DEFAULT 0,
        TotalTax        DECIMAL(18,2)   NOT NULL DEFAULT 0,
        GrandTotal      DECIMAL(18,2)   NOT NULL DEFAULT 0,
        Status          NVARCHAR(20)    NOT NULL DEFAULT 'Unpaid',
        Notes           NVARCHAR(MAX)   NULL,
        CreatedAt       DATETIME        NOT NULL DEFAULT GETDATE(),
        UpdatedAt       DATETIME        NOT NULL DEFAULT GETDATE()
      );
      PRINT 'Created VENDOR_INVOICE_HEADER';
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'VENDOR_INVOICE_ITEMS' AND schema_id = SCHEMA_ID('dbo'))
    BEGIN
      CREATE TABLE dbo.VENDOR_INVOICE_ITEMS (
        VIItemID    INT IDENTITY(1,1) PRIMARY KEY,
        VIID        INT             NOT NULL,
        ItemName    NVARCHAR(255)   NOT NULL,
        Qty         DECIMAL(18,3)   NOT NULL DEFAULT 0,
        UnitPrice   DECIMAL(18,2)   NOT NULL DEFAULT 0,
        TaxPct      DECIMAL(5,2)    NOT NULL DEFAULT 0,
        LineTotal   DECIMAL(18,2)   NOT NULL DEFAULT 0,
        CONSTRAINT FK_VI_ITEMS_HEADER FOREIGN KEY (VIID)
          REFERENCES dbo.VENDOR_INVOICE_HEADER(VIID) ON DELETE CASCADE
      );
      PRINT 'Created VENDOR_INVOICE_ITEMS';
    END
  `);
};

ensureTables().catch(err => console.warn('⚠ Vendor invoice table auto-create:', err.message));

// ── GET all vendor invoices ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const req_ = pool.request();

    let where = '1=1';

    if (req.query.supplierId) {
      req_.input('SupplierID', sql.Int, parseInt(req.query.supplierId));
      where += ' AND h.SupplierID = @SupplierID';
    }

    // Support comma-separated status filter: ?status=Unpaid,Partial
    if (req.query.status) {
      const statuses = req.query.status.split(',').map(s => `'${s.trim().replace(/'/g, "''")}'`).join(',');
      where += ` AND h.Status IN (${statuses})`;
    }

    const result = await req_.query(`
      SELECT
        h.VIID, h.VINo, h.VIDate, h.DueDate,
        h.SupplierID, h.SupplierName,
        h.PaymentMethodID, h.ReferenceNo,
        h.Subtotal, h.TotalTax, h.GrandTotal,
        h.Status, h.Notes, h.CreatedAt,
        pm.MethodName AS PaymentMethod,
        COUNT(i.VIItemID) AS ItemCount
      FROM dbo.VENDOR_INVOICE_HEADER h
      LEFT JOIN dbo.PaymentMethod pm ON pm.PaymentMethodID = h.PaymentMethodID
      LEFT JOIN dbo.VENDOR_INVOICE_ITEMS i ON i.VIID = h.VIID
      WHERE ${where}
      GROUP BY
        h.VIID, h.VINo, h.VIDate, h.DueDate,
        h.SupplierID, h.SupplierName,
        h.PaymentMethodID, h.ReferenceNo,
        h.Subtotal, h.TotalTax, h.GrandTotal,
        h.Status, h.Notes, h.CreatedAt,
        pm.MethodName
      ORDER BY h.CreatedAt DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /vendor-invoices error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET single vendor invoice with items ──────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const id   = parseInt(req.params.id);

    const hRes = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT h.*, pm.MethodName AS PaymentMethod
        FROM dbo.VENDOR_INVOICE_HEADER h
        LEFT JOIN dbo.PaymentMethod pm ON pm.PaymentMethodID = h.PaymentMethodID
        WHERE h.VIID = @id
      `);

    if (!hRes.recordset.length) return res.status(404).json({ error: 'Invoice not found' });

    const iRes = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT * FROM dbo.VENDOR_INVOICE_ITEMS WHERE VIID = @id ORDER BY VIItemID`);

    res.json({ ...hRes.recordset[0], items: iRes.recordset });
  } catch (err) {
    console.error('GET /vendor-invoices/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST create vendor invoice ────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const {
    viNo, viDate, dueDate, supplierID, supplierName,
    paymentMethodID, referenceNo, subtotal, totalTax, grandTotal,
    status, notes, items = [],
  } = req.body;

  if (!viNo?.trim())       return res.status(400).json({ error: 'VI number is required' });
  if (!supplierName?.trim()) return res.status(400).json({ error: 'Supplier name is required' });
  if (!items.length)       return res.status(400).json({ error: 'At least one item is required' });

  const pool = await getPool();
  const txn  = pool.transaction();

  try {
    await txn.begin();
    const req_ = txn.request();

    const headerInsert = await req_
      .input('VINo',            sql.NVarChar(50),    viNo.trim())
      .input('VIDate',          sql.Date,            viDate        ? new Date(viDate)    : new Date())
      .input('DueDate',         sql.Date,            dueDate       ? new Date(dueDate)   : null)
      .input('SupplierID',      sql.Int,             supplierID    ? parseInt(supplierID): null)
      .input('SupplierName',    sql.NVarChar(200),   supplierName.trim())
      .input('PaymentMethodID', sql.Int,             paymentMethodID ? parseInt(paymentMethodID) : null)
      .input('ReferenceNo',     sql.NVarChar(100),   referenceNo   || null)
      .input('Subtotal',        sql.Decimal(18,2),   parseFloat(subtotal   || 0))
      .input('TotalTax',        sql.Decimal(18,2),   parseFloat(totalTax   || 0))
      .input('GrandTotal',      sql.Decimal(18,2),   parseFloat(grandTotal || 0))
      .input('Status',          sql.NVarChar(20),    status        || 'Unpaid')
      .input('Notes',           sql.NVarChar(sql.MAX), notes       || null)
      .query(`
        INSERT INTO dbo.VENDOR_INVOICE_HEADER
          (VINo, VIDate, DueDate, SupplierID, SupplierName, PaymentMethodID,
           ReferenceNo, Subtotal, TotalTax, GrandTotal, Status, Notes)
        OUTPUT INSERTED.VIID
        VALUES
          (@VINo, @VIDate, @DueDate, @SupplierID, @SupplierName, @PaymentMethodID,
           @ReferenceNo, @Subtotal, @TotalTax, @GrandTotal, @Status, @Notes)
      `);

    const viid = headerInsert.recordset[0].VIID;

    for (const item of items) {
      if (!item.itemName?.trim()) continue;
      const lt = parseFloat(item.qty || 0) * parseFloat(item.unitPrice || 0);
      const tax = lt * (parseFloat(item.taxPct || 0) / 100);
      await txn.request()
        .input('VIID',      sql.Int,          viid)
        .input('ItemName',  sql.NVarChar(255), item.itemName.trim())
        .input('Qty',       sql.Decimal(18,3), parseFloat(item.qty       || 0))
        .input('UnitPrice', sql.Decimal(18,2), parseFloat(item.unitPrice || 0))
        .input('TaxPct',    sql.Decimal(5,2),  parseFloat(item.taxPct    || 0))
        .input('LineTotal', sql.Decimal(18,2), lt + tax)
        .query(`
          INSERT INTO dbo.VENDOR_INVOICE_ITEMS (VIID, ItemName, Qty, UnitPrice, TaxPct, LineTotal)
          VALUES (@VIID, @ItemName, @Qty, @UnitPrice, @TaxPct, @LineTotal)
        `);
    }

    await txn.commit();
    res.status(201).json({ VIID: viid, VINo: viNo, message: 'Vendor invoice created' });
  } catch (err) {
    await txn.rollback().catch(() => {});
    console.error('POST /vendor-invoices error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH status ──────────────────────────────────────────────────────────────
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const allowed = ['Unpaid', 'Paid', 'Partial', 'Cancelled', 'Overdue'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('id',     sql.Int,         parseInt(req.params.id))
      .input('status', sql.NVarChar(20), status)
      .query(`
        UPDATE dbo.VENDOR_INVOICE_HEADER
        SET Status = @status, UpdatedAt = GETDATE()
        WHERE VIID = @id
      `);
    res.json({ message: 'Status updated', status });
  } catch (err) {
    console.error('PATCH /vendor-invoices/:id/status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE vendor invoice ─────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, parseInt(req.params.id))
      .query(`DELETE FROM dbo.VENDOR_INVOICE_HEADER WHERE VIID = @id`);

    if (!result.rowsAffected[0]) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ message: 'Vendor invoice deleted' });
  } catch (err) {
    console.error('DELETE /vendor-invoices/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;