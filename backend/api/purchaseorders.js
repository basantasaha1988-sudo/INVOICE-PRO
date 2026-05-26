// backend/api/purchaseorders.js  (updated — SupplierID / GRN-aware)
// GET    /api/po              — list all POs (with item counts + received qty)
// GET    /api/po/:id          — single PO with full line items + GRN summary
// POST   /api/po              — create PO header + items in one transaction
// PATCH  /api/po/:id/status   — update status
// DELETE /api/po/:id          — delete PO + items (cascade)

const express = require('express');
const { getPool, sql } = require('../db');
const router = express.Router();

// ── Auto-create PO tables if they don't exist ─────────────────────────────────
const ensurePoTables = async () => {
  const pool = await getPool();
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PO_HEADER' AND schema_id = SCHEMA_ID('dbo'))
    BEGIN
      CREATE TABLE dbo.PO_HEADER (
        POID          INT IDENTITY(1,1) PRIMARY KEY,
        PODocNo       NVARCHAR(30)      NOT NULL,
        CompanyID     INT               NULL,
        CompanyName   NVARCHAR(150)     NULL,
        ProjectName   NVARCHAR(200)     NULL,
        SupplierID    INT               NULL,
        SupplierName  NVARCHAR(200)     NOT NULL,
        OrderDate     DATE              NOT NULL DEFAULT GETDATE(),
        DeliveryDate  DATE              NULL,
        Status        NVARCHAR(20)      NOT NULL DEFAULT 'Draft',
        Note          NVARCHAR(MAX)     NULL,
        CreatedAt     DATETIME          NOT NULL DEFAULT GETDATE()
      );
      PRINT 'Created PO_HEADER table';
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PO_ITEMS' AND schema_id = SCHEMA_ID('dbo'))
    BEGIN
      CREATE TABLE dbo.PO_ITEMS (
        POItemID    INT IDENTITY(1,1) PRIMARY KEY,
        POID        INT             NOT NULL,
        ItemCode    INT             NULL,
        ItemName    NVARCHAR(255)   NOT NULL,
        Qty         DECIMAL(18,3)   NOT NULL DEFAULT 0,
        UnitPrice   DECIMAL(18,2)   NOT NULL DEFAULT 0,
        TotalPrice  AS (Qty * UnitPrice) PERSISTED,
        CONSTRAINT FK_PO_ITEMS_HEADER FOREIGN KEY (POID) REFERENCES dbo.PO_HEADER(POID) ON DELETE CASCADE
      );
      PRINT 'Created PO_ITEMS table';
    END
  `);
};

// Run once at startup — non-fatal if it fails (tables may already exist)
ensurePoTables().catch(err =>
  console.warn('⚠ PO table auto-create warning:', err.message)
);

// ── GET all POs ───────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        h.POID, h.PODocNo, h.CompanyID, h.CompanyName, h.ProjectName,
        h.SupplierID, h.SupplierName, h.OrderDate, h.DeliveryDate,
        h.Status, h.Note, h.CreatedAt,
        COUNT(DISTINCT i.POItemID)      AS ItemCount,
        SUM(i.TotalPrice)               AS TotalValue,
        -- How many GRNs have been raised against this PO
        COUNT(DISTINCT g.GRNID)         AS GRNCount,
        -- Total qty received vs ordered
        ISNULL(SUM(DISTINCT gi_agg.ReceivedQty), 0)  AS TotalQtyReceived,
        ISNULL(SUM(i.Qty), 0)                         AS TotalQtyOrdered
      FROM dbo.PO_HEADER h
      LEFT JOIN dbo.PO_ITEMS  i       ON i.POID   = h.POID
      LEFT JOIN dbo.GRN_HEADER g      ON g.POID   = h.POID
      OUTER APPLY (
        SELECT SUM(gi.QtyReceived) AS ReceivedQty
        FROM   dbo.GRN_ITEMS  gi
        JOIN   dbo.GRN_HEADER gh ON gh.GRNID = gi.GRNID
        WHERE  gh.POID = h.POID
      ) gi_agg
      GROUP BY
        h.POID, h.PODocNo, h.CompanyID, h.CompanyName, h.ProjectName,
        h.SupplierID, h.SupplierName, h.OrderDate, h.DeliveryDate,
        h.Status, h.Note, h.CreatedAt
      ORDER BY h.CreatedAt DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /po error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET single PO with items + GRN summary ───────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const id   = parseInt(req.params.id);

    const [header, items, grns] = await Promise.all([
      pool.request().input('id', sql.Int, id)
        .query(`SELECT * FROM dbo.PO_HEADER WHERE POID = @id`),
      pool.request().input('id', sql.Int, id)
        .query(`SELECT * FROM dbo.PO_ITEMS WHERE POID = @id ORDER BY POItemID`),
      // Aggregate received qty per PO item across all GRNs
      pool.request().input('id', sql.Int, id)
        .query(`
          SELECT
            gi.POItemID,
            SUM(gi.QtyReceived) AS TotalReceived
          FROM dbo.GRN_ITEMS  gi
          JOIN dbo.GRN_HEADER gh ON gh.GRNID = gi.GRNID
          WHERE gh.POID = @id
          GROUP BY gi.POItemID
        `)
    ]);

    if (!header.recordset.length) return res.status(404).json({ error: 'PO not found' });

    // Merge received qty into each line item
    const receivedMap = {};
    grns.recordset.forEach(r => { receivedMap[r.POItemID] = Number(r.TotalReceived); });

    const enrichedItems = items.recordset.map(i => ({
      ...i,
      QtyReceived: receivedMap[i.POItemID] || 0,
      QtyPending:  Math.max(0, Number(i.Qty) - (receivedMap[i.POItemID] || 0))
    }));

    res.json({ ...header.recordset[0], items: enrichedItems });
  } catch (err) {
    console.error('GET /po/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST create PO ────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const {
    poDocNo, companyId, companyName, projectName,
    supplierID,   // ← NEW: from supplier master
    supplierName,
    orderDate, deliveryDate, note, items = []
  } = req.body;

  if (!poDocNo)      return res.status(400).json({ error: 'PO Doc No is required' });
  if (!supplierName) return res.status(400).json({ error: 'Supplier name is required' });
  if (!items.length) return res.status(400).json({ error: 'At least one item is required' });

  let pool, transaction;
  try {
    pool        = await getPool();
    transaction = pool.transaction();
    await transaction.begin();

    // If supplierID provided, resolve name from master
    let resolvedSupplierName = supplierName;
    if (supplierID) {
      const sRes = await transaction.request()
        .input('sid', sql.Int, parseInt(supplierID))
        .query('SELECT SupplierName FROM dbo.SUPPLIER_MASTER WHERE SupplierID = @sid');
      if (sRes.recordset.length) resolvedSupplierName = sRes.recordset[0].SupplierName;
    }

    const hResult = await transaction.request()
      .input('PODocNo',      sql.NVarChar(30),      poDocNo)
      .input('CompanyID',    sql.Int,               companyId   ? parseInt(companyId)  : null)
      .input('CompanyName',  sql.NVarChar(150),     companyName  || null)
      .input('ProjectName',  sql.NVarChar(200),     projectName  || null)
      .input('SupplierID',   sql.Int,               supplierID  ? parseInt(supplierID) : null)
      .input('SupplierName', sql.NVarChar(200),     resolvedSupplierName)
      .input('OrderDate',    sql.Date,              orderDate    ? new Date(orderDate)    : new Date())
      .input('DeliveryDate', sql.Date,              deliveryDate ? new Date(deliveryDate) : null)
      .input('Note',         sql.NVarChar(sql.MAX), note || null)
      .query(`
        INSERT INTO dbo.PO_HEADER
          (PODocNo, CompanyID, CompanyName, ProjectName,
           SupplierID, SupplierName, OrderDate, DeliveryDate, Status, Note)
        OUTPUT INSERTED.*
        VALUES
          (@PODocNo, @CompanyID, @CompanyName, @ProjectName,
           @SupplierID, @SupplierName, @OrderDate, @DeliveryDate, 'Draft', @Note)
      `);

    const POID = hResult.recordset[0].POID;

    for (const item of items) {
      await transaction.request()
        .input('POID',      sql.Int,           POID)
        .input('ItemCode',  sql.Int,           item.itemCode ? parseInt(item.itemCode) : null)
        .input('ItemName',  sql.NVarChar(255), item.itemName  || '')
        .input('Qty',       sql.Decimal(18,3), Number(item.qty) || 0)
        .input('UnitPrice', sql.Decimal(18,2), Number(item.unitPrice) || 0)
        .query(`
          INSERT INTO dbo.PO_ITEMS (POID, ItemCode, ItemName, Qty, UnitPrice)
          VALUES (@POID, @ItemCode, @ItemName, @Qty, @UnitPrice)
        `);
    }

    await transaction.commit();

    const full = await pool.request().input('id', sql.Int, POID).query(`
      SELECT h.*, COUNT(i.POItemID) AS ItemCount, SUM(i.TotalPrice) AS TotalValue
      FROM dbo.PO_HEADER h LEFT JOIN dbo.PO_ITEMS i ON i.POID = h.POID
      WHERE h.POID = @id
      GROUP BY h.POID, h.PODocNo, h.CompanyID, h.CompanyName, h.ProjectName,
               h.SupplierID, h.SupplierName, h.OrderDate, h.DeliveryDate,
               h.Status, h.Note, h.CreatedAt
    `);
    res.status(201).json(full.recordset[0]);

  } catch (err) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error('POST /po error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH update status ───────────────────────────────────────────────────────
router.patch('/:id/status', async (req, res) => {
  const validStatuses = ['Draft', 'Confirmed', 'Received', 'Cancelled'];
  const { status } = req.body;
  if (!validStatuses.includes(status))
    return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
  try {
    const pool = await getPool();
    await pool.request()
      .input('id',     sql.Int,         parseInt(req.params.id))
      .input('status', sql.NVarChar(20), status)
      .query('UPDATE dbo.PO_HEADER SET Status=@status WHERE POID=@id');
    res.json({ ok: true, status });
  } catch (err) {
    console.error('PATCH /po/:id/status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE PO ─────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    // Check if any GRNs exist for this PO
    const grnCheck = await pool.request()
      .input('id', sql.Int, parseInt(req.params.id))
      .query(`
        IF EXISTS (SELECT * FROM sys.tables WHERE name = 'GRN_HEADER' AND schema_id = SCHEMA_ID('dbo'))
          SELECT COUNT(*) AS cnt FROM dbo.GRN_HEADER WHERE POID = @id
        ELSE
          SELECT 0 AS cnt
      `);
    if (grnCheck.recordset[0].cnt > 0)
      return res.status(409).json({ error: 'Cannot delete PO: GRN records exist. Delete GRNs first.' });

    await pool.request()
      .input('id', sql.Int, parseInt(req.params.id))
      .query('DELETE FROM dbo.PO_HEADER WHERE POID=@id');
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /po/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;