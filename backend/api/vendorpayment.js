// backend/api/vendorpayment.js
// Vendor Payment API
// GET    /api/vendor-payments              — list all payments (optional ?supplierId= &viId=)
// GET    /api/vendor-payments/:id          — single payment
// POST   /api/vendor-payments              — create payment (auto-updates VI status)
// DELETE /api/vendor-payments/:id          — delete payment

const express = require('express');
const { getPool, sql } = require('../db');
const router = express.Router();

// ── Auto-create table if it doesn't exist ─────────────────────────────────────
const ensureTable = async () => {
  const pool = await getPool();
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'VENDOR_PAYMENT' AND schema_id = SCHEMA_ID('dbo'))
    BEGIN
      CREATE TABLE dbo.VENDOR_PAYMENT (
        VPID            INT IDENTITY(1,1) PRIMARY KEY,
        VPNo            NVARCHAR(50)    NOT NULL,
        VPDate          DATE            NOT NULL DEFAULT GETDATE(),
        SupplierID      INT             NULL,
        SupplierName    NVARCHAR(200)   NOT NULL,
        LinkedVIID      INT             NULL,
        LinkedVINo      NVARCHAR(50)    NULL,
        InvoiceTotal    DECIMAL(18,2)   NULL,
        PaymentMethodID INT             NULL,
        PaymentAmount   DECIMAL(18,2)   NOT NULL DEFAULT 0,
        DiscountAmount  DECIMAL(18,2)   NOT NULL DEFAULT 0,
        ReferenceNo     NVARCHAR(100)   NULL,
        PaymentType     NVARCHAR(30)    NOT NULL DEFAULT 'againstInvoice',
        Status          NVARCHAR(20)    NOT NULL DEFAULT 'Paid',
        Remarks         NVARCHAR(MAX)   NULL,
        CreatedAt       DATETIME        NOT NULL DEFAULT GETDATE()
      );
      PRINT 'Created VENDOR_PAYMENT';
    END
  `);
};

ensureTable().catch(err => console.warn('⚠ Vendor payment table auto-create:', err.message));

// ── Helper: recalculate and update vendor invoice status ──────────────────────
const syncVIStatus = async (pool, viid) => {
  if (!viid) return;
  try {
    // Get invoice total
    const hRes = await pool.request()
      .input('viid', sql.Int, viid)
      .query(`SELECT GrandTotal FROM dbo.VENDOR_INVOICE_HEADER WHERE VIID = @viid`);
    if (!hRes.recordset.length) return;

    const grandTotal = parseFloat(hRes.recordset[0].GrandTotal || 0);

    // Sum active payments
    const pRes = await pool.request()
      .input('viid', sql.Int, viid)
      .query(`
        SELECT ISNULL(SUM(PaymentAmount), 0) AS PaidTotal
        FROM dbo.VENDOR_PAYMENT
        WHERE LinkedVIID = @viid AND Status != 'Cancelled'
      `);
    const paidTotal = parseFloat(pRes.recordset[0].PaidTotal || 0);

    let newStatus = 'Unpaid';
    if (paidTotal >= grandTotal) newStatus = 'Paid';
    else if (paidTotal > 0)      newStatus = 'Partial';

    await pool.request()
      .input('viid',   sql.Int,          viid)
      .input('status', sql.NVarChar(20), newStatus)
      .query(`
        UPDATE dbo.VENDOR_INVOICE_HEADER
        SET Status = @status, UpdatedAt = GETDATE()
        WHERE VIID = @viid
      `);
  } catch (err) {
    console.warn('syncVIStatus error:', err.message);
  }
};

// ── GET all vendor payments ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const req_ = pool.request();
    let where = '1=1';

    if (req.query.supplierId) {
      req_.input('SupplierID', sql.Int, parseInt(req.query.supplierId));
      where += ' AND p.SupplierID = @SupplierID';
    }
    if (req.query.viId) {
      req_.input('LinkedVIID', sql.Int, parseInt(req.query.viId));
      where += ' AND p.LinkedVIID = @LinkedVIID';
    }

    const result = await req_.query(`
      SELECT
        p.VPID, p.VPNo, p.VPDate,
        p.SupplierID, p.SupplierName,
        p.LinkedVIID, p.LinkedVINo, p.InvoiceTotal,
        p.PaymentMethodID, p.PaymentAmount, p.DiscountAmount,
        p.ReferenceNo, p.PaymentType, p.Status, p.Remarks, p.CreatedAt,
        pm.MethodName AS PaymentMethod
      FROM dbo.VENDOR_PAYMENT p
      LEFT JOIN dbo.PaymentMethod pm ON pm.PaymentMethodID = p.PaymentMethodID
      WHERE ${where}
      ORDER BY p.CreatedAt DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /vendor-payments error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET single payment ────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, parseInt(req.params.id))
      .query(`
        SELECT p.*, pm.MethodName AS PaymentMethod
        FROM dbo.VENDOR_PAYMENT p
        LEFT JOIN dbo.PaymentMethod pm ON pm.PaymentMethodID = p.PaymentMethodID
        WHERE p.VPID = @id
      `);
    if (!result.recordset.length) return res.status(404).json({ error: 'Payment not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('GET /vendor-payments/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST create vendor payment ────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const {
    vpNo, vpDate, supplierID, supplierName,
    linkedVIID, linkedVINo, invoiceTotal,
    paymentMethodID, paymentAmount, discountAmount,
    referenceNo, paymentType, status, remarks,
  } = req.body;

  if (!vpNo?.trim())         return res.status(400).json({ error: 'Payment number is required' });
  if (!supplierName?.trim()) return res.status(400).json({ error: 'Supplier name is required' });
  if (!paymentAmount || parseFloat(paymentAmount) <= 0)
    return res.status(400).json({ error: 'Payment amount must be greater than 0' });

  try {
    const pool = await getPool();

    const insert = await pool.request()
      .input('VPNo',            sql.NVarChar(50),      vpNo.trim())
      .input('VPDate',          sql.Date,              vpDate       ? new Date(vpDate)   : new Date())
      .input('SupplierID',      sql.Int,               supplierID   ? parseInt(supplierID) : null)
      .input('SupplierName',    sql.NVarChar(200),     supplierName.trim())
      .input('LinkedVIID',      sql.Int,               linkedVIID   ? parseInt(linkedVIID) : null)
      .input('LinkedVINo',      sql.NVarChar(50),      linkedVINo   || null)
      .input('InvoiceTotal',    sql.Decimal(18,2),     invoiceTotal ? parseFloat(invoiceTotal) : null)
      .input('PaymentMethodID', sql.Int,               paymentMethodID ? parseInt(paymentMethodID) : null)
      .input('PaymentAmount',   sql.Decimal(18,2),     parseFloat(paymentAmount))
      .input('DiscountAmount',  sql.Decimal(18,2),     parseFloat(discountAmount || 0))
      .input('ReferenceNo',     sql.NVarChar(100),     referenceNo  || null)
      .input('PaymentType',     sql.NVarChar(30),      paymentType  || 'againstInvoice')
      .input('Status',          sql.NVarChar(20),      status       || 'Paid')
      .input('Remarks',         sql.NVarChar(sql.MAX), remarks      || null)
      .query(`
        INSERT INTO dbo.VENDOR_PAYMENT
          (VPNo, VPDate, SupplierID, SupplierName, LinkedVIID, LinkedVINo, InvoiceTotal,
           PaymentMethodID, PaymentAmount, DiscountAmount, ReferenceNo, PaymentType, Status, Remarks)
        OUTPUT INSERTED.VPID
        VALUES
          (@VPNo, @VPDate, @SupplierID, @SupplierName, @LinkedVIID, @LinkedVINo, @InvoiceTotal,
           @PaymentMethodID, @PaymentAmount, @DiscountAmount, @ReferenceNo, @PaymentType, @Status, @Remarks)
      `);

    const vpid = insert.recordset[0].VPID;

    // Sync vendor invoice status if linked
    if (linkedVIID) await syncVIStatus(pool, parseInt(linkedVIID));

    res.status(201).json({ VPID: vpid, VPNo: vpNo, message: 'Vendor payment saved' });
  } catch (err) {
    console.error('POST /vendor-payments error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE vendor payment ─────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();

    // Fetch linked VI before deleting
    const existing = await pool.request()
      .input('id', sql.Int, parseInt(req.params.id))
      .query(`SELECT LinkedVIID FROM dbo.VENDOR_PAYMENT WHERE VPID = @id`);

    if (!existing.recordset.length) return res.status(404).json({ error: 'Payment not found' });
    const linkedVIID = existing.recordset[0].LinkedVIID;

    await pool.request()
      .input('id', sql.Int, parseInt(req.params.id))
      .query(`DELETE FROM dbo.VENDOR_PAYMENT WHERE VPID = @id`);

    // Re-sync VI status after deletion
    if (linkedVIID) await syncVIStatus(pool, linkedVIID);

    res.json({ message: 'Vendor payment deleted' });
  } catch (err) {
    console.error('DELETE /vendor-payments/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;