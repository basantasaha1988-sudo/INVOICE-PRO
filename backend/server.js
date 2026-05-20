require('dotenv').config();
const express = require('express');
const sql = require('mssql');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── Request logging middleware ─────────────────────────────
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});

// ── Route modules ─────────────────────────────────────────────────────────────
app.use('/api/saleinvoice',  require('./api/saleinvoice'));
app.use('/api/itemmaster',   require('./api/itemmaster'));
app.use('/api/companies',    require('./api/companies'));


// ─── DB Config ────────────────────────────────────────────
const dbConfig = {
  server:   process.env.DB_SERVER   || '192.168.0.205',
  database: process.env.DB_NAME     || 'InvoicePro',
  user:     process.env.DB_USER     || 'sa',
  password: process.env.DB_PASS     || 'infotech@123',
  port:     parseInt(process.env.DB_PORT || '1433'),
  options: {
    trustServerCertificate: true,
    encrypt: false,
  },
  pool: {
    max: 10, min: 0, idleTimeoutMillis: 30000
  }
};

const pool = new sql.ConnectionPool(dbConfig);
const poolConnect = pool.connect();

// ─── Seed PaymentMethod table if empty ───────────────────
const seedPaymentMethods = async () => {
  try {
    const check = await pool.request().query(
      'SELECT COUNT(*) AS cnt FROM dbo.PaymentMethod'
    );
    if (check.recordset[0].cnt === 0) {
      // Insert one by one for compatibility with all MSSQL versions
      const methods = ['Cash', 'UPI', 'Card', 'Cheque', 'Bank Transfer', 'NEFT', 'RTGS'];
      for (const name of methods) {
        await pool.request()
          .input('n', sql.NVarChar(50), name)
          .query(`INSERT INTO dbo.PaymentMethod (MethodName, IsActive) VALUES (@n, 1)`);
      }
      console.log('✅ PaymentMethod table seeded with', methods.length, 'methods');
    } else {
      console.log('✅ PaymentMethod already has rows, skipping seed');
    }
  } catch (err) {
    console.warn('⚠ Could not seed PaymentMethod:', err.message);
  }
};

// ─── USERS MANAGEMENT (modular route) ──────────────────────
const { router: usersRouter, setPool: setUsersPool } = require('./api/users');
app.use('/api/users', usersRouter);

poolConnect.then(async () => {
  console.log('✅ Connected to InvoicePro SQL Server at', dbConfig.server);
  // Initialize pool reference for users module after connection is ready
  setUsersPool(pool);
  console.log('✅ User Management API initialized');
  await seedPaymentMethods();
}).catch(err => {
  console.error('❌ DB Connection Failed:', err.message);
});

// ─── Health check ─────────────────────────────────────────
app.get('/api/ping', async (req, res) => {
  try {
    await poolConnect;
    await pool.request().query('SELECT 1 AS ok');
    res.json({ ok: true, server: dbConfig.server, db: dbConfig.database });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── LOGIN ────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required.' });
  }

  try {
    await poolConnect;
    const result = await pool.request()
      .input('username', sql.NVarChar, username.trim())
      .input('password', sql.NVarChar, password)
      .query('SELECT id, username FROM users WHERE username = @username AND password = @password');

    if (result.recordset.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }

    return res.json({ success: true, user: result.recordset[0] });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});


// ─── CUSTOMERS CRUD ────────────────────────────────────────

// GET all
app.get('/api/customers', async (req, res) => {
  try {
    await poolConnect;
    const result = await pool.request().query(`
      SELECT CustomerID, CustomerName, Phone, Email, Address, CreatedAt
      FROM dbo.Customer
      ORDER BY CustomerName
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upsert (insert or update by name) — called from Sale Invoice & Customer Master
app.post('/api/customers/upsert', async (req, res) => {
  const { name, phone, address } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Customer name is required' });
  try {
    await poolConnect;
    const existing = await pool.request()
      .input('n', sql.NVarChar(150), name.trim())
      .query(`SELECT CustomerID FROM dbo.Customer WHERE LOWER(CustomerName) = LOWER(@n)`);
    if (existing.recordset.length > 0) {
      const id = existing.recordset[0].CustomerID;
      await pool.request()
        .input('id',  sql.Int,          id)
        .input('ph',  sql.VarChar(20),  phone   || '')
        .input('addr',sql.NVarChar(300),address || '')
        .query(`UPDATE dbo.Customer SET Phone=@ph, Address=@addr WHERE CustomerID=@id`);
      return res.json({ success: true, customerId: id, action: 'updated' });
    }
    const ins = await pool.request()
      .input('n',    sql.NVarChar(150), name.trim())
      .input('ph',   sql.VarChar(20),   phone   || '')
      .input('addr', sql.NVarChar(300), address || '')
      .query(`INSERT INTO dbo.Customer (CustomerName,Phone,Address,CreatedAt)
              OUTPUT INSERTED.CustomerID
              VALUES (@n,@ph,@addr,GETDATE())`);
    res.json({ success: true, customerId: ins.recordset[0].CustomerID, action: 'inserted' });
  } catch (err) {
    console.error('POST /api/customers/upsert:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update by CustomerID
app.put('/api/customers/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, phone, address } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Customer name is required' });
  try {
    await poolConnect;
    await pool.request()
      .input('id',   sql.Int,          id)
      .input('n',    sql.NVarChar(150), name.trim())
      .input('ph',   sql.VarChar(20),   phone   || '')
      .input('addr', sql.NVarChar(300), address || '')
      .query(`UPDATE dbo.Customer
              SET CustomerName=@n, Phone=@ph, Address=@addr
              WHERE CustomerID=@id`);
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/customers/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id
app.delete('/api/customers/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await poolConnect;
    await pool.request()
      .input('id', sql.Int, id)
      .query(`DELETE FROM dbo.Customer WHERE CustomerID=@id`);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/customers/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET All Payment Methods (including inactive) — for Master UI ─────────
app.get('/api/payment-methods/all', async (req, res) => {
  try {
    await poolConnect;
    const result = await pool.request().query(`
      SELECT PaymentMethodID, MethodName,
             ISNULL(Description,'') AS Description,
             IsActive
      FROM dbo.PaymentMethod
      ORDER BY MethodName
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST — Add payment method ─────────────────────────────
app.post('/api/payment-methods', async (req, res) => {
  const { MethodName, Description, IsActive } = req.body;
  if (!MethodName?.trim()) return res.status(400).json({ error: 'MethodName is required' });
  try {
    await poolConnect;
    // Check duplicate name
    const dup = await pool.request()
      .input('n', sql.NVarChar(50), MethodName.trim())
      .query(`SELECT PaymentMethodID FROM dbo.PaymentMethod WHERE LOWER(MethodName)=LOWER(@n)`);
    if (dup.recordset.length > 0) return res.status(409).json({ error: `"${MethodName}" already exists` });

    const ins = await pool.request()
      .input('n',    sql.NVarChar(50),  MethodName.trim())
      .input('desc', sql.NVarChar(150), Description || null)
      .input('act',  sql.Bit,           IsActive != null ? IsActive : 1)
      .query(`
        INSERT INTO dbo.PaymentMethod (MethodName, Description, IsActive)
        OUTPUT INSERTED.PaymentMethodID
        VALUES (@n, @desc, @act)
      `);
    res.status(201).json({ ok: true, PaymentMethodID: ins.recordset[0].PaymentMethodID });
  } catch (err) {
    // Description column may not exist yet — try without it
    if (err.message.includes('Description')) {
      try {
        const ins2 = await pool.request()
          .input('n',   sql.NVarChar(50), MethodName.trim())
          .input('act', sql.Bit,          IsActive != null ? IsActive : 1)
          .query(`
            INSERT INTO dbo.PaymentMethod (MethodName, IsActive)
            OUTPUT INSERTED.PaymentMethodID
            VALUES (@n, @act)
          `);
        return res.status(201).json({ ok: true, PaymentMethodID: ins2.recordset[0].PaymentMethodID });
      } catch (e2) {
        return res.status(500).json({ error: e2.message });
      }
    }
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /:id — Update payment method ─────────────────────
app.put('/api/payment-methods/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { MethodName, Description, IsActive } = req.body;
  if (!MethodName?.trim()) return res.status(400).json({ error: 'MethodName is required' });
  try {
    await poolConnect;
    try {
      await pool.request()
        .input('id',   sql.Int,          id)
        .input('n',    sql.NVarChar(50),  MethodName.trim())
        .input('desc', sql.NVarChar(150), Description || null)
        .input('act',  sql.Bit,           IsActive != null ? IsActive : 1)
        .query(`UPDATE dbo.PaymentMethod SET MethodName=@n, Description=@desc, IsActive=@act WHERE PaymentMethodID=@id`);
    } catch (e) {
      // Fallback if Description column missing
      await pool.request()
        .input('id',  sql.Int,         id)
        .input('n',   sql.NVarChar(50), MethodName.trim())
        .input('act', sql.Bit,          IsActive != null ? IsActive : 1)
        .query(`UPDATE dbo.PaymentMethod SET MethodName=@n, IsActive=@act WHERE PaymentMethodID=@id`);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /:id — Delete payment method ──────────────────
app.delete('/api/payment-methods/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await poolConnect;
    // Prevent deleting if used in receipts
    const inUse = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 ReceiptID FROM dbo.ReceiptHeader WHERE PaymentMethodID=@id`);
    if (inUse.recordset.length > 0) {
      return res.status(409).json({ error: 'Cannot delete — this method is used in existing receipts. Deactivate it instead.' });
    }
    await pool.request()
      .input('id', sql.Int, id)
      .query(`DELETE FROM dbo.PaymentMethod WHERE PaymentMethodID=@id`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET Payment Methods ───────────────────────────────────
app.get('/api/payment-methods', async (req, res) => {
  try {
    await poolConnect;

    // Fetch rows
    let result;
    try {
      result = await pool.request().query(`
        SELECT PaymentMethodID, MethodName FROM dbo.PaymentMethod WHERE IsActive = 1 ORDER BY MethodName
      `);
    } catch {
      result = await pool.request().query(`
        SELECT PaymentMethodID, MethodName FROM dbo.PaymentMethod ORDER BY MethodName
      `);
    }

    // If empty → seed inline, then re-fetch
    if (result.recordset.length === 0) {
      console.log('PaymentMethod table empty — seeding now...');
      const methods = ['Cash', 'UPI', 'Card', 'Cheque', 'Bank Transfer', 'NEFT', 'RTGS'];
      for (const name of methods) {
        try {
          await pool.request()
            .input('n', sql.NVarChar(50), name)
            .query(`INSERT INTO dbo.PaymentMethod (MethodName, IsActive) VALUES (@n, 1)`);
        } catch (e) {
          console.warn('Seed insert failed for', name, e.message);
        }
      }
      // Re-fetch after seeding
      try {
        result = await pool.request().query(`
          SELECT PaymentMethodID, MethodName FROM dbo.PaymentMethod ORDER BY MethodName
        `);
      } catch (e) {
        console.error('Re-fetch after seed failed:', e.message);
      }
    }

    console.log('Payment methods returned:', result.recordset.length);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /api/payment-methods error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET Sale Bills (unpaid/partial for a customer) ────────
// FIX: SALE_BILLS uses BillID (UniqueIdentifier) as PK, not SaleBillID (Int).
// We expose BillID as LinkedBillID for the receipt form.
// CustomerName is stored in SALE_BILLS directly (no CustomerID FK in that table).
// PaidAmount / Status / UpdatedAt must exist — run migration SQL if missing.
app.get('/api/sale-bills', async (req, res) => {
  try {
    await poolConnect;
    const { customerId } = req.query;

    const request = pool.request();
    let query = `
      SELECT
        CAST(BillID AS NVARCHAR(36))        AS LinkedBillID,
        BillNo,
        BillDate,
        GrandTotal                          AS NetAmount,
        ISNULL(PaidAmount, 0)               AS PaidAmount,
        GrandTotal - ISNULL(PaidAmount, 0)  AS DueAmount,
        ISNULL(Status, 'Unpaid')            AS Status,
        CustomerName
      FROM dbo.SALE_BILLS
      WHERE ISNULL(Status, 'Unpaid') IN ('Unpaid', 'Partial')
    `;

    if (customerId) {
      // SALE_BILLS stores CustomerName text; look up name from Customer table
      request.input('cid', sql.Int, parseInt(customerId));
      query += `
        AND CustomerName = (
          SELECT CustomerName FROM dbo.Customer WHERE CustomerID = @cid
        )
      `;
    }
    query += ' ORDER BY BillDate DESC';

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET All Receipts ─────────────────────────────────────
// FIX: ReceiptHeader uses LinkedBillID (UniqueIdentifier FK → SALE_BILLS.BillID)
app.get('/api/receipts', async (req, res) => {
  try {
    await poolConnect;
    const result = await pool.request().query(`
      SELECT 
        rh.ReceiptID,
        rh.ReceiptNo,
        rh.ReceiptDate,
        c.CustomerName,
        rh.TotalAmount,
        rh.DiscountAmount,
        rh.NetAmount,
        rh.Status,
        rh.Notes,
        pm.MethodName     AS PaymentMethod,
        sb.BillNo         AS LinkedInvoice,
        pt.AmountPaid,
        pt.ReferenceNo,
        pt.PaidAt,
        rh.CreatedAt
      FROM dbo.ReceiptHeader rh
      JOIN dbo.Customer       c  ON c.CustomerID       = rh.CustomerID
      JOIN dbo.PaymentMethod  pm ON pm.PaymentMethodID = rh.PaymentMethodID
      LEFT JOIN dbo.SALE_BILLS sb ON sb.BillID          = rh.LinkedBillID
      LEFT JOIN dbo.PaymentTransaction pt ON pt.ReceiptID = rh.ReceiptID
      ORDER BY rh.CreatedAt DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE Receipt ───────────────────────────────────────
// FIX: uses LinkedBillID (UniqueIdentifier) for SALE_BILLS reversal
app.delete('/api/receipts/:id', async (req, res) => {
  const tx = new sql.Transaction(pool);
  try {
    await poolConnect;
    await tx.begin();
    const id = parseInt(req.params.id);

    // Get linked BillID and paid amount before deleting
    const info = await new sql.Request(tx)
      .input('id', sql.Int, id)
      .query(`
        SELECT rh.LinkedBillID, pt.AmountPaid
        FROM dbo.ReceiptHeader rh
        LEFT JOIN dbo.PaymentTransaction pt ON pt.ReceiptID = rh.ReceiptID
        WHERE rh.ReceiptID = @id
      `);

    if (info.recordset.length === 0) {
      await tx.rollback();
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const { LinkedBillID, AmountPaid } = info.recordset[0];

    // Delete PaymentTransaction
    await new sql.Request(tx)
      .input('id', sql.Int, id)
      .query(`DELETE FROM dbo.PaymentTransaction WHERE ReceiptID = @id`);

    // Delete ReceiptDetail
    await new sql.Request(tx)
      .input('id', sql.Int, id)
      .query(`DELETE FROM dbo.ReceiptDetail WHERE ReceiptID = @id`);

    // Delete ReceiptHeader
    await new sql.Request(tx)
      .input('id', sql.Int, id)
      .query(`DELETE FROM dbo.ReceiptHeader WHERE ReceiptID = @id`);

    // Reverse PaidAmount on SALE_BILLS if linked
    // FIX: use BillID (UniqueIdentifier) not SaleBillID (Int)
    if (LinkedBillID && AmountPaid) {
      await new sql.Request(tx)
        .input('paid', sql.Decimal(18,2),   AmountPaid)
        .input('bid',  sql.UniqueIdentifier, LinkedBillID)
        .query(`
          UPDATE dbo.SALE_BILLS
          SET PaidAmount = CASE
                WHEN ISNULL(PaidAmount,0) - @paid < 0 THEN 0
                ELSE ISNULL(PaidAmount,0) - @paid
              END,
              Status = CASE
                WHEN ISNULL(PaidAmount,0) - @paid <= 0 THEN 'Unpaid'
                ELSE 'Partial'
              END,
              UpdatedAt = GETDATE()
          WHERE BillID = @bid
        `);
    }

    await tx.commit();
    res.json({ ok: true, deleted: id });
  } catch (err) {
    await tx.rollback();
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/receipts  (MAIN SAVE) ──────────────────────
// FIX: Uses LinkedBillID (UniqueIdentifier) instead of SaleBillID (Int).
// Writes atomically to:
//   1. dbo.ReceiptHeader       — master receipt record
//   2. dbo.ReceiptDetail       — line items
//   3. dbo.PaymentTransaction  — payment record
//   4. dbo.SALE_BILLS          — updates PaidAmount/Status when bill linked
app.post('/api/receipts', async (req, res) => {
  const tx = new sql.Transaction(pool);
  try {
    await poolConnect;
    await tx.begin();

    const {
      ReceiptNo, ReceiptDate, CustomerID,
      LinkedBillID,     // UniqueIdentifier string from SALE_BILLS.BillID (optional)
      PaymentMethodID, TotalAmount, DiscountAmount,
      NetAmount, Status, Notes,
      Items = [],
      Payment
    } = req.body;

    // Validate required fields
    if (!ReceiptNo || !CustomerID || !PaymentMethodID || !NetAmount) {
      await tx.rollback();
      return res.status(400).json({ message: 'ReceiptNo, CustomerID, PaymentMethodID, NetAmount are required' });
    }

    // Check duplicate ReceiptNo
    const dupCheck = await new sql.Request(tx)
      .input('rno', sql.VarChar(30), ReceiptNo)
      .query(`SELECT ReceiptID FROM dbo.ReceiptHeader WHERE ReceiptNo = @rno`);
    if (dupCheck.recordset.length > 0) {
      await tx.rollback();
      return res.status(409).json({ message: `Receipt No "${ReceiptNo}" already exists` });
    }

    // 1️⃣  Insert ReceiptHeader
    // FIX: LinkedBillID is UniqueIdentifier FK to SALE_BILLS.BillID
    const hRes = await new sql.Request(tx)
      .input('ReceiptNo',       sql.VarChar(30),       ReceiptNo)
      .input('ReceiptDate',     sql.Date,               ReceiptDate || new Date())
      .input('CustomerID',      sql.Int,                parseInt(CustomerID))
      .input('LinkedBillID',    sql.UniqueIdentifier,   LinkedBillID || null)
      .input('PaymentMethodID', sql.Int,                parseInt(PaymentMethodID))
      .input('TotalAmount',     sql.Decimal(18,2),      parseFloat(TotalAmount)    || 0)
      .input('DiscountAmount',  sql.Decimal(18,2),      parseFloat(DiscountAmount) || 0)
      .input('NetAmount',       sql.Decimal(18,2),      parseFloat(NetAmount))
      .input('Status',          sql.VarChar(20),        Status || 'Paid')
      .input('Notes',           sql.NVarChar(500),      Notes || null)
      .query(`
        INSERT INTO dbo.ReceiptHeader
          (ReceiptNo, ReceiptDate, CustomerID, LinkedBillID, PaymentMethodID,
           TotalAmount, DiscountAmount, NetAmount, Status, Notes, CreatedAt)
        OUTPUT INSERTED.ReceiptID
        VALUES
          (@ReceiptNo, @ReceiptDate, @CustomerID, @LinkedBillID, @PaymentMethodID,
           @TotalAmount, @DiscountAmount, @NetAmount, @Status, @Notes, GETDATE())
      `);

    const ReceiptID = hRes.recordset[0].ReceiptID;

    // 2️⃣  Insert ReceiptDetail rows
    for (const item of Items) {
      await new sql.Request(tx)
        .input('ReceiptID',       sql.Int,           ReceiptID)
        .input('ItemDescription', sql.VarChar(250),  item.ItemDescription || item.companyName || 'Receipt item')
        .input('Quantity',        sql.Int,           parseInt(item.Quantity)        || 1)
        .input('UnitPrice',       sql.Decimal(18,2), parseFloat(item.UnitPrice)     || 0)
        .input('TaxRate',         sql.Decimal(5,2),  parseFloat(item.TaxRate)       || 0)
        .input('TaxAmount',       sql.Decimal(18,2), parseFloat(item.TaxAmount)     || 0)
        .input('LineTotal',       sql.Decimal(18,2), parseFloat(item.LineTotal)     || 0)
        .query(`
          INSERT INTO dbo.ReceiptDetail
            (ReceiptID, ItemDescription, Quantity, UnitPrice, TaxRate, TaxAmount, LineTotal)
          VALUES
            (@ReceiptID, @ItemDescription, @Quantity, @UnitPrice, @TaxRate, @TaxAmount, @LineTotal)
        `);
    }

    // 3️⃣  Insert PaymentTransaction
    const amountPaid  = parseFloat(Payment?.AmountPaid  || NetAmount);
    const referenceNo = Payment?.ReferenceNo || null;
    const pmID        = parseInt(Payment?.PaymentMethodID || PaymentMethodID);

    await new sql.Request(tx)
      .input('ReceiptID',       sql.Int,           ReceiptID)
      .input('PaymentMethodID', sql.Int,           pmID)
      .input('AmountPaid',      sql.Decimal(18,2), amountPaid)
      .input('ReferenceNo',     sql.VarChar(100),  referenceNo)
      .query(`
        INSERT INTO dbo.PaymentTransaction
          (ReceiptID, PaymentMethodID, AmountPaid, ReferenceNo, PaidAt, Status)
        VALUES
          (@ReceiptID, @PaymentMethodID, @AmountPaid, @ReferenceNo, GETDATE(), 'Success')
      `);

    // 4️⃣  Update SALE_BILLS if linked invoice
    // FIX: use BillID (UniqueIdentifier) not SaleBillID (Int)
    if (LinkedBillID) {
      await new sql.Request(tx)
        .input('paid', sql.Decimal(18,2),   amountPaid)
        .input('bid',  sql.UniqueIdentifier, LinkedBillID)
        .query(`
          UPDATE dbo.SALE_BILLS
          SET
            PaidAmount = ISNULL(PaidAmount, 0) + @paid,
            Status = CASE
              WHEN ISNULL(PaidAmount, 0) + @paid >= GrandTotal THEN 'Paid'
              WHEN ISNULL(PaidAmount, 0) + @paid > 0           THEN 'Partial'
              ELSE 'Unpaid'
            END,
            UpdatedAt = GETDATE()
          WHERE BillID = @bid
        `);
    }

    await tx.commit();
    console.log(`✅ Receipt saved: ${ReceiptNo} (ID: ${ReceiptID})`);
    res.status(201).json({ ok: true, ReceiptID, ReceiptNo });

  } catch (err) {
    try { await tx.rollback(); } catch (_) {}
    console.error('❌ Save failed:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// FIX: Port 3001 matches frontend default: VITE_API_URL || 'http://localhost:3001/api'
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 InvoicePro API running on http://localhost:${PORT}`);
});