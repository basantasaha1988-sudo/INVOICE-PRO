const express = require("express");
const { getPool, sql } = require("../db");
const router = express.Router();

// ─── GET all bills (summary list) ────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const pool = await getPool();
    const bills = await pool.request().query(`
      SELECT b.*,
        (SELECT COUNT(*) FROM dbo.SALE_BILL_ITEMS i WHERE i.BillID = b.BillID) AS ItemCount
      FROM dbo.SALE_BILLS b
      ORDER BY b.SavedAt DESC
    `);
    const billRows = bills.recordset;

    // Fetch all items for all bills in one query, then group in JS
    const items = await pool.request().query(`
      SELECT * FROM dbo.SALE_BILL_ITEMS
      WHERE BillID IN (SELECT BillID FROM dbo.SALE_BILLS)
      ORDER BY BillID, Line_No
    `);

    // Group items by BillID
    const itemMap = {};
    items.recordset.forEach(item => {
      const id = item.BillID;
      if (!itemMap[id]) itemMap[id] = [];
      itemMap[id].push({
        id:         item.ItemLineID,
        name:       item.ItemName,
        hsn:        item.HSN        || '',
        unit:       item.Unit       || 'Nos',
        qty:        Number(item.Qty),
        rate:       Number(item.Rate),
        disc:       Number(item.DiscPercent),
        gstPercent: Number(item.GSTPercent),
      });
    });

    // Assemble bill objects matching frontend shape
    const result = billRows.map(b => ({
      id:          b.BillID,
      billNo:      b.BillNo,
      billDate:    b.BillDate ? b.BillDate.toISOString().slice(0,10) : '',
      dueDate:     b.DueDate  ? b.DueDate.toISOString().slice(0,10)  : '',
      notes:       b.Notes    || '',
      gstMode:     b.GSTMode,
      isInterState: !!b.IsInterState,
      company: {
        name:    b.CompanyName    || '',
        address: b.CompanyAddress || '',
        city:    b.CompanyCity    || '',
        state:   b.CompanyState   || '',
        pincode: b.CompanyPincode || '',
        gstin:   b.CompanyGSTIN   || '',
        phone:   b.CompanyPhone   || '',
        email:   b.CompanyEmail   || '',
        logo:    b.CompanyLogo    || null,
      },
      customer: {
        name:    b.CustomerName    || '',
        address: b.CustomerAddress || '',
        city:    b.CustomerCity    || '',
        state:   b.CustomerState   || '',
        pincode: b.CustomerPincode || '',
        gstin:   b.CustomerGSTIN   || '',
        phone:   b.CustomerPhone   || '',
      },
      totals: {
        gross:   Number(b.GrossAmount),
        disc:    Number(b.DiscountAmount),
        taxable: Number(b.TaxableAmount),
        cgst:    Number(b.CGSTAmount),
        sgst:    Number(b.SGSTAmount),
        igst:    Number(b.IGSTAmount),
        tax:     Number(b.TotalTax),
        total:   Number(b.GrandTotal),
      },
      items:   itemMap[b.BillID] || [],
      savedAt: b.SavedAt,
    }));

    res.json(result);
  } catch (err) {
    console.error("GET /saleinvoice error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST create new bill ─────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const { id, billNo, billDate, dueDate, notes, gstMode, isInterState,
          company, customer, items, totals, savedAt } = req.body;

  if (!company?.name?.trim()) return res.status(400).json({ error: "Company name required" });
  if (!customer?.name?.trim()) return res.status(400).json({ error: "Customer name required" });
  if (!items?.length) return res.status(400).json({ error: "At least one item required" });

  let pool, transaction;
  try {
    pool = await getPool();
    transaction = pool.transaction();
    await transaction.begin();

    // Insert bill header
    await transaction.request()
      .input("BillID",          sql.UniqueIdentifier, id)
      .input("BillNo",          sql.NVarChar(50),     billNo)
      .input("BillDate",        sql.Date,             billDate || null)
      .input("DueDate",         sql.Date,             dueDate  || null)
      .input("Notes",           sql.NVarChar(sql.MAX),notes    || '')
      .input("GSTMode",         sql.NVarChar(20),     gstMode  || 'inclusive')
      .input("IsInterState",    sql.Bit,              isInterState ? 1 : 0)
      .input("CompanyName",     sql.NVarChar(150),    company.name    || '')
      .input("CompanyAddress",  sql.NVarChar(500),    company.address || '')
      .input("CompanyCity",     sql.NVarChar(100),    company.city    || '')
      .input("CompanyState",    sql.NVarChar(100),    company.state   || '')
      .input("CompanyPincode",  sql.NVarChar(10),     company.pincode || '')
      .input("CompanyGSTIN",    sql.NVarChar(20),     company.gstin   || '')
      .input("CompanyPhone",    sql.NVarChar(20),     company.phone   || '')
      .input("CompanyEmail",    sql.NVarChar(150),    company.email   || '')
      .input("CompanyLogo",     sql.VarChar(sql.MAX), company.logo    || null)
      .input("CustomerName",    sql.NVarChar(150),    customer.name    || '')
      .input("CustomerAddress", sql.NVarChar(500),    customer.address || '')
      .input("CustomerCity",    sql.NVarChar(100),    customer.city    || '')
      .input("CustomerState",   sql.NVarChar(100),    customer.state   || '')
      .input("CustomerPincode", sql.NVarChar(10),     customer.pincode || '')
      .input("CustomerGSTIN",   sql.NVarChar(20),     customer.gstin   || '')
      .input("CustomerPhone",   sql.NVarChar(20),     customer.phone   || '')
      .input("GrossAmount",     sql.Decimal(18,2),    totals.gross   || 0)
      .input("DiscountAmount",  sql.Decimal(18,2),    totals.disc    || 0)
      .input("TaxableAmount",   sql.Decimal(18,2),    totals.taxable || 0)
      .input("CGSTAmount",      sql.Decimal(18,2),    totals.cgst    || 0)
      .input("SGSTAmount",      sql.Decimal(18,2),    totals.sgst    || 0)
      .input("IGSTAmount",      sql.Decimal(18,2),    totals.igst    || 0)
      .input("TotalTax",        sql.Decimal(18,2),    totals.tax     || 0)
      .input("GrandTotal",      sql.Decimal(18,2),    totals.total   || 0)
      .input("SavedAt",         sql.DateTime,         savedAt ? new Date(savedAt) : new Date())
      .query(`
        INSERT INTO dbo.SALE_BILLS (
          BillID, BillNo, BillDate, DueDate, Notes, GSTMode, IsInterState,
          CompanyName, CompanyAddress, CompanyCity, CompanyState, CompanyPincode,
          CompanyGSTIN, CompanyPhone, CompanyEmail, CompanyLogo,
          CustomerName, CustomerAddress, CustomerCity, CustomerState, CustomerPincode,
          CustomerGSTIN, CustomerPhone,
          GrossAmount, DiscountAmount, TaxableAmount,
          CGSTAmount, SGSTAmount, IGSTAmount, TotalTax, GrandTotal, SavedAt
        ) VALUES (
          @BillID, @BillNo, @BillDate, @DueDate, @Notes, @GSTMode, @IsInterState,
          @CompanyName, @CompanyAddress, @CompanyCity, @CompanyState, @CompanyPincode,
          @CompanyGSTIN, @CompanyPhone, @CompanyEmail, @CompanyLogo,
          @CustomerName, @CustomerAddress, @CustomerCity, @CustomerState, @CustomerPincode,
          @CustomerGSTIN, @CustomerPhone,
          @GrossAmount, @DiscountAmount, @TaxableAmount,
          @CGSTAmount, @SGSTAmount, @IGSTAmount, @TotalTax, @GrandTotal, @SavedAt
        )
      `);

    // Insert line items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.name) continue;

      const gross    = (item.qty || 0) * (item.rate || 0);
      const discAmt  = gross * ((item.disc || 0) / 100);
      const afterDisc = gross - discAmt;
      let taxable = afterDisc, taxAmt = 0;

      if (gstMode === 'exclusive') {
        taxable = afterDisc;
        taxAmt  = taxable * ((item.gstPercent || 0) / 100);
      } else if (gstMode === 'inclusive') {
        taxable = afterDisc / (1 + (item.gstPercent || 0) / 100);
        taxAmt  = afterDisc - taxable;
      }

      await transaction.request()
        .input("BillID",        sql.UniqueIdentifier, id)
        .input("Line_No",        sql.SmallInt,         i + 1)
        .input("ItemName",      sql.NVarChar(255),    item.name  || '')
        .input("HSN",           sql.NVarChar(50),     item.hsn   || '')
        .input("Unit",          sql.NVarChar(20),     item.unit  || 'Nos')
        .input("Qty",           sql.Decimal(18,3),    Number(item.qty)        || 0)
        .input("Rate",          sql.Decimal(18,2),    Number(item.rate)       || 0)
        .input("DiscPercent",   sql.Decimal(5,2),     Number(item.disc)       || 0)
        .input("GSTPercent",    sql.Decimal(5,2),     Number(item.gstPercent) || 0)
        .input("GrossAmount",   sql.Decimal(18,2),    gross)
        .input("DiscountAmount",sql.Decimal(18,2),    discAmt)
        .input("TaxableAmount", sql.Decimal(18,2),    taxable)
        .input("TaxAmount",     sql.Decimal(18,2),    taxAmt)
        .input("LineTotal",     sql.Decimal(18,2),    taxable + taxAmt)
        .query(`
          INSERT INTO dbo.SALE_BILL_ITEMS (
            BillID, Line_No, ItemName, HSN, Unit, Qty, Rate,
            DiscPercent, GSTPercent,
            GrossAmount, DiscountAmount, TaxableAmount, TaxAmount, LineTotal
          ) VALUES (
            @BillID, @Line_No, @ItemName, @HSN, @Unit, @Qty, @Rate,
            @DiscPercent, @GSTPercent,
            @GrossAmount, @DiscountAmount, @TaxableAmount, @TaxAmount, @LineTotal
          )
        `);
    }

    await transaction.commit();
    res.json({ success: true, id });
  } catch (err) {
    await transaction.rollback();
    console.error("POST /saleinvoice error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT update existing bill ─────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { billNo, billDate, dueDate, notes, gstMode, isInterState,
          company, customer, items, totals } = req.body;

  let pool, transaction;
  try {
    pool = await getPool();
    transaction = pool.transaction();
    await transaction.begin();

    // Update bill header
    await transaction.request()
      .input("BillID",          sql.UniqueIdentifier, id)
      .input("BillNo",          sql.NVarChar(50),     billNo)
      .input("BillDate",        sql.Date,             billDate || null)
      .input("DueDate",         sql.Date,             dueDate  || null)
      .input("Notes",           sql.NVarChar(sql.MAX),notes    || '')
      .input("GSTMode",         sql.NVarChar(20),     gstMode  || 'inclusive')
      .input("IsInterState",    sql.Bit,              isInterState ? 1 : 0)
      .input("CompanyName",     sql.NVarChar(150),    company.name    || '')
      .input("CompanyAddress",  sql.NVarChar(500),    company.address || '')
      .input("CompanyCity",     sql.NVarChar(100),    company.city    || '')
      .input("CompanyState",    sql.NVarChar(100),    company.state   || '')
      .input("CompanyPincode",  sql.NVarChar(10),     company.pincode || '')
      .input("CompanyGSTIN",    sql.NVarChar(20),     company.gstin   || '')
      .input("CompanyPhone",    sql.NVarChar(20),     company.phone   || '')
      .input("CompanyEmail",    sql.NVarChar(150),    company.email   || '')
      .input("CompanyLogo",     sql.VarChar(sql.MAX), company.logo    || null)
      .input("CustomerName",    sql.NVarChar(150),    customer.name    || '')
      .input("CustomerAddress", sql.NVarChar(500),    customer.address || '')
      .input("CustomerCity",    sql.NVarChar(100),    customer.city    || '')
      .input("CustomerState",   sql.NVarChar(100),    customer.state   || '')
      .input("CustomerPincode", sql.NVarChar(10),     customer.pincode || '')
      .input("CustomerGSTIN",   sql.NVarChar(20),     customer.gstin   || '')
      .input("CustomerPhone",   sql.NVarChar(20),     customer.phone   || '')
      .input("GrossAmount",     sql.Decimal(18,2),    totals.gross   || 0)
      .input("DiscountAmount",  sql.Decimal(18,2),    totals.disc    || 0)
      .input("TaxableAmount",   sql.Decimal(18,2),    totals.taxable || 0)
      .input("CGSTAmount",      sql.Decimal(18,2),    totals.cgst    || 0)
      .input("SGSTAmount",      sql.Decimal(18,2),    totals.sgst    || 0)
      .input("IGSTAmount",      sql.Decimal(18,2),    totals.igst    || 0)
      .input("TotalTax",        sql.Decimal(18,2),    totals.tax     || 0)
      .input("GrandTotal",      sql.Decimal(18,2),    totals.total   || 0)
      .input("UpdatedAt",       sql.DateTime,         new Date())
      .query(`
        UPDATE dbo.SALE_BILLS SET
          BillNo=@BillNo, BillDate=@BillDate, DueDate=@DueDate, Notes=@Notes,
          GSTMode=@GSTMode, IsInterState=@IsInterState,
          CompanyName=@CompanyName, CompanyAddress=@CompanyAddress,
          CompanyCity=@CompanyCity, CompanyState=@CompanyState,
          CompanyPincode=@CompanyPincode, CompanyGSTIN=@CompanyGSTIN,
          CompanyPhone=@CompanyPhone, CompanyEmail=@CompanyEmail, CompanyLogo=@CompanyLogo,
          CustomerName=@CustomerName, CustomerAddress=@CustomerAddress,
          CustomerCity=@CustomerCity, CustomerState=@CustomerState,
          CustomerPincode=@CustomerPincode, CustomerGSTIN=@CustomerGSTIN,
          CustomerPhone=@CustomerPhone,
          GrossAmount=@GrossAmount, DiscountAmount=@DiscountAmount,
          TaxableAmount=@TaxableAmount, CGSTAmount=@CGSTAmount,
          SGSTAmount=@SGSTAmount, IGSTAmount=@IGSTAmount,
          TotalTax=@TotalTax, GrandTotal=@GrandTotal, UpdatedAt=@UpdatedAt
        WHERE BillID=@BillID
      `);

    // Delete old items and re-insert fresh
    await transaction.request()
      .input("BillID", sql.UniqueIdentifier, id)
      .query("DELETE FROM dbo.SALE_BILL_ITEMS WHERE BillID = @BillID");

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.name) continue;

      const gross     = (item.qty || 0) * (item.rate || 0);
      const discAmt   = gross * ((item.disc || 0) / 100);
      const afterDisc = gross - discAmt;
      let taxable = afterDisc, taxAmt = 0;

      if (gstMode === 'exclusive') {
        taxable = afterDisc;
        taxAmt  = taxable * ((item.gstPercent || 0) / 100);
      } else if (gstMode === 'inclusive') {
        taxable = afterDisc / (1 + (item.gstPercent || 0) / 100);
        taxAmt  = afterDisc - taxable;
      }

      await transaction.request()
        .input("BillID",        sql.UniqueIdentifier, id)
        .input("Line_No",        sql.SmallInt,         i + 1)
        .input("ItemName",      sql.NVarChar(255),    item.name  || '')
        .input("HSN",           sql.NVarChar(50),     item.hsn   || '')
        .input("Unit",          sql.NVarChar(20),     item.unit  || 'Nos')
        .input("Qty",           sql.Decimal(18,3),    Number(item.qty)        || 0)
        .input("Rate",          sql.Decimal(18,2),    Number(item.rate)       || 0)
        .input("DiscPercent",   sql.Decimal(5,2),     Number(item.disc)       || 0)
        .input("GSTPercent",    sql.Decimal(5,2),     Number(item.gstPercent) || 0)
        .input("GrossAmount",   sql.Decimal(18,2),    gross)
        .input("DiscountAmount",sql.Decimal(18,2),    discAmt)
        .input("TaxableAmount", sql.Decimal(18,2),    taxable)
        .input("TaxAmount",     sql.Decimal(18,2),    taxAmt)
        .input("LineTotal",     sql.Decimal(18,2),    taxable + taxAmt)
        .query(`
          INSERT INTO dbo.SALE_BILL_ITEMS (
            BillID, Line_No, ItemName, HSN, Unit, Qty, Rate,
            DiscPercent, GSTPercent,
            GrossAmount, DiscountAmount, TaxableAmount, TaxAmount, LineTotal
          ) VALUES (
            @BillID, @Line_No, @ItemName, @HSN, @Unit, @Qty, @Rate,
            @DiscPercent, @GSTPercent,
            @GrossAmount, @DiscountAmount, @TaxableAmount, @TaxAmount, @LineTotal
          )
        `);
    }

    await transaction.commit();
    res.json({ success: true });
  } catch (err) {
    await transaction.rollback();
    console.error("PUT /saleinvoice error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE bill ──────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getPool();
    // SALE_BILL_ITEMS cascade deletes automatically via FK ON DELETE CASCADE
    await pool.request()
      .input("BillID", sql.UniqueIdentifier, id)
      .query("DELETE FROM dbo.SALE_BILLS WHERE BillID = @BillID");
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /saleinvoice error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;