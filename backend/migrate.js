// backend/migrate.js
// Auto-creates all missing tables on server startup.
// Safe to run repeatedly — uses IF NOT EXISTS throughout.

const { getPool } = require('./db');

const migrate = async () => {
  const pool = await getPool();
  const r = () => pool.request();

  // ── company_details ────────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='company_details' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.company_details (
      id           INT IDENTITY(1,1) PRIMARY KEY,
      company_name NVARCHAR(150) NOT NULL,
      address      NVARCHAR(MAX) NULL,
      logo         VARCHAR(MAX)  NULL,
      created_at   DATETIME      NOT NULL DEFAULT GETDATE()
    )
  `);

  // ── project_master ─────────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='project_master' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.project_master (
      id           INT IDENTITY(1,1) PRIMARY KEY,
      company_id   INT           NOT NULL,
      project_name NVARCHAR(200) NOT NULL,
      description  NVARCHAR(MAX) NULL,
      created_at   DATETIME      NOT NULL DEFAULT GETDATE()
    )
  `);

  // ── ITEMMASTER ─────────────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='ITEMMASTER' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.ITEMMASTER (
      ItemCode    INT IDENTITY(1,1) PRIMARY KEY,
      ItemName    NVARCHAR(255)  NOT NULL,
      Rate        DECIMAL(18,2)  NOT NULL DEFAULT 0,
      Tax         DECIMAL(5,2)   NOT NULL DEFAULT 0,
      Stock       DECIMAL(18,3)  NOT NULL DEFAULT 0,
      CreatedDate DATETIME       NOT NULL DEFAULT GETDATE()
    )
  `);

  await r().query(`
    IF NOT EXISTS (
      SELECT * FROM sys.columns
      WHERE name = 'Stock' AND object_id = OBJECT_ID('dbo.ITEMMASTER')
    )
    ALTER TABLE dbo.ITEMMASTER ADD Stock DECIMAL(18,3) NOT NULL DEFAULT 0
  `);

  // ── users ──────────────────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='users' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.users (
      id         INT IDENTITY(1,1) PRIMARY KEY,
      username   NVARCHAR(100)  NOT NULL UNIQUE,
      password   NVARCHAR(255)  NOT NULL,
      created_at DATETIME       NOT NULL DEFAULT GETDATE()
    )
  `);

  // ── Customer ───────────────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='Customer' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.Customer (
      CustomerID   INT IDENTITY(1,1) PRIMARY KEY,
      CustomerName NVARCHAR(150)  NOT NULL,
      Phone        VARCHAR(20)    NULL,
      Email        NVARCHAR(150)  NULL,
      Address      NVARCHAR(300)  NULL,
      CreatedAt    DATETIME       NOT NULL DEFAULT GETDATE()
    )
  `);

  // ── PaymentMethod ──────────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PaymentMethod' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.PaymentMethod (
      PaymentMethodID INT IDENTITY(1,1) PRIMARY KEY,
      MethodName      NVARCHAR(50)   NOT NULL,
      Description     NVARCHAR(150)  NULL,
      IsActive        BIT            NOT NULL DEFAULT 1
    )
  `);

  // ── ReceiptHeader ──────────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='ReceiptHeader' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.ReceiptHeader (
      ReceiptID       INT IDENTITY(1,1)  PRIMARY KEY,
      ReceiptNo       VARCHAR(30)        NOT NULL UNIQUE,
      ReceiptDate     DATE               NOT NULL,
      CustomerID      INT                NOT NULL,
      LinkedBillID    UNIQUEIDENTIFIER   NULL,
      PaymentMethodID INT                NOT NULL,
      TotalAmount     DECIMAL(18,2)      NOT NULL DEFAULT 0,
      DiscountAmount  DECIMAL(18,2)      NOT NULL DEFAULT 0,
      NetAmount       DECIMAL(18,2)      NOT NULL,
      Status          VARCHAR(20)        NOT NULL DEFAULT 'Paid',
      Notes           NVARCHAR(500)      NULL,
      CreatedAt       DATETIME           NOT NULL DEFAULT GETDATE()
    )
  `);

  // ── ReceiptDetail ──────────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='ReceiptDetail' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.ReceiptDetail (
      DetailID        INT IDENTITY(1,1) PRIMARY KEY,
      ReceiptID       INT            NOT NULL,
      ItemDescription VARCHAR(250)   NOT NULL,
      Quantity        INT            NOT NULL DEFAULT 1,
      UnitPrice       DECIMAL(18,2)  NOT NULL DEFAULT 0,
      TaxRate         DECIMAL(5,2)   NOT NULL DEFAULT 0,
      TaxAmount       DECIMAL(18,2)  NOT NULL DEFAULT 0,
      LineTotal       DECIMAL(18,2)  NOT NULL DEFAULT 0,
      CONSTRAINT FK_RECEIPT_DETAIL FOREIGN KEY (ReceiptID)
        REFERENCES dbo.ReceiptHeader(ReceiptID) ON DELETE CASCADE
    )
  `);

  // ── PaymentTransaction ─────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PaymentTransaction' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.PaymentTransaction (
      TransactionID   INT IDENTITY(1,1) PRIMARY KEY,
      ReceiptID       INT            NOT NULL,
      PaymentMethodID INT            NOT NULL,
      AmountPaid      DECIMAL(18,2)  NOT NULL,
      ReferenceNo     VARCHAR(100)   NULL,
      LinkedInvoice   NVARCHAR(30)   NULL,
      PaidAt          DATETIME       NOT NULL DEFAULT GETDATE(),
      Status          VARCHAR(20)    NOT NULL DEFAULT 'Success'
    )
  `);

  await r().query(`
    IF NOT EXISTS (
      SELECT * FROM sys.columns
      WHERE name='LinkedInvoice' AND object_id=OBJECT_ID('dbo.PaymentTransaction')
    )
    ALTER TABLE dbo.PaymentTransaction ADD LinkedInvoice NVARCHAR(30) NULL
  `);

  // ── SUPPLIER_MASTER ────────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='SUPPLIER_MASTER' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.SUPPLIER_MASTER (
      SupplierID      INT IDENTITY(1,1) PRIMARY KEY,
      SupplierCode    NVARCHAR(30)   NULL,
      SupplierName    NVARCHAR(200)  NOT NULL,
      ContactPerson   NVARCHAR(150)  NULL,
      Phone           NVARCHAR(30)   NULL,
      Email           NVARCHAR(150)  NULL,
      Address         NVARCHAR(400)  NULL,
      GSTNo           NVARCHAR(20)   NULL,
      PaymentTerms    NVARCHAR(100)  NULL,
      IsActive        BIT            NOT NULL DEFAULT 1,
      Notes           NVARCHAR(MAX)  NULL,
      CreatedAt       DATETIME2(7)   NOT NULL DEFAULT GETDATE(),
      UpdatedAt       DATETIME2(7)   NULL
    )
  `);

  await r().query(`
    IF NOT EXISTS (
      SELECT * FROM sys.columns
      WHERE name='UpdatedAt' AND object_id=OBJECT_ID('dbo.SUPPLIER_MASTER')
    )
    ALTER TABLE dbo.SUPPLIER_MASTER ADD UpdatedAt DATETIME2(7) NULL
  `);

  // ── SUPPLIER_MASTER trigger ────────────────────────────────────────────────
  // FIX: Drop the old trigger explicitly first, then recreate.
  // This ensures any previously deployed trigger (which may have been created
  // during a time when the INSERT used an OUTPUT clause) is fully removed.
  // The trigger MUST NOT use OUTPUT in any form — SQL Server forbids OUTPUT
  // on DML statements targeting tables that have enabled triggers, unless the
  // OUTPUT goes INTO a table variable. The UPDATE inside the trigger is safe
  // because it is a separate internal statement, not an OUTPUT clause.
  await r().query(`
    IF OBJECT_ID('dbo.trg_SUPPLIER_MASTER_SupplierCode', 'TR') IS NOT NULL
      DROP TRIGGER dbo.trg_SUPPLIER_MASTER_SupplierCode
  `);

  await r().query(`
    CREATE TRIGGER dbo.trg_SUPPLIER_MASTER_SupplierCode
    ON dbo.SUPPLIER_MASTER
    AFTER INSERT
    AS
    BEGIN
      SET NOCOUNT ON;
      UPDATE sm
      SET    sm.SupplierCode = 'SUP-' + RIGHT('0000' + CAST(sm.SupplierID AS NVARCHAR(10)), 4)
      FROM   dbo.SUPPLIER_MASTER sm
      INNER JOIN inserted i ON sm.SupplierID = i.SupplierID
      WHERE  sm.SupplierCode IS NULL OR sm.SupplierCode = '';
    END
  `);

  // ── STOCK_TRANSACTIONS ─────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='STOCK_TRANSACTIONS' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.STOCK_TRANSACTIONS (
      TransactionID  INT IDENTITY(1,1) PRIMARY KEY,
      TxnType        NVARCHAR(20)   NOT NULL,
      ItemName       NVARCHAR(255)  NULL,
      Qty            DECIMAL(18,3)  NULL,
      Note           NVARCHAR(500)  NULL,
      Description    NVARCHAR(500)  NULL,
      TxnDate        DATE           NOT NULL DEFAULT CAST(GETDATE() AS DATE),
      CreatedAt      DATETIME       NOT NULL DEFAULT GETDATE()
    )
  `);

  // ── STOCK_RECEIPTS ─────────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='STOCK_RECEIPTS' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.STOCK_RECEIPTS (
      ReceiptID     INT IDENTITY(1,1) PRIMARY KEY,
      GRNDocNo      NVARCHAR(30)   NOT NULL,
      CompanyID     INT            NULL,
      CompanyName   NVARCHAR(150)  NULL,
      ProjectName   NVARCHAR(200)  NULL,
      ItemCode      INT            NULL,
      ItemName      NVARCHAR(255)  NOT NULL,
      QtyReceived   DECIMAL(18,3)  NOT NULL,
      StockBefore   DECIMAL(18,3)  NOT NULL DEFAULT 0,
      StockAfter    DECIMAL(18,3)  NOT NULL DEFAULT 0,
      Note          NVARCHAR(500)  NULL,
      LinkedPODocNo NVARCHAR(30)   NULL,
      LinkedPOID    INT            NULL,
      ReceiptDate   DATE           NOT NULL DEFAULT CAST(GETDATE() AS DATE),
      ReceivedAt    DATETIME       NOT NULL DEFAULT GETDATE()
    )
  `);

  await r().query(`
    IF NOT EXISTS (
      SELECT * FROM sys.columns
      WHERE name='LinkedPODocNo' AND object_id=OBJECT_ID('dbo.STOCK_RECEIPTS')
    )
    ALTER TABLE dbo.STOCK_RECEIPTS ADD LinkedPODocNo NVARCHAR(30) NULL
  `);

  await r().query(`
    IF NOT EXISTS (
      SELECT * FROM sys.columns
      WHERE name='LinkedPOID' AND object_id=OBJECT_ID('dbo.STOCK_RECEIPTS')
    )
    ALTER TABLE dbo.STOCK_RECEIPTS ADD LinkedPOID INT NULL
  `);

  // ── PO_HEADER ──────────────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PO_HEADER' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.PO_HEADER (
      POID          INT IDENTITY(1,1) PRIMARY KEY,
      PODocNo       NVARCHAR(30)   NOT NULL,
      CompanyID     INT            NULL,
      CompanyName   NVARCHAR(150)  NULL,
      ProjectName   NVARCHAR(200)  NULL,
      SupplierID    INT            NULL,
      SupplierName  NVARCHAR(200)  NOT NULL,
      OrderDate     DATE           NOT NULL DEFAULT CAST(GETDATE() AS DATE),
      DeliveryDate  DATE           NULL,
      Status        NVARCHAR(20)   NOT NULL DEFAULT 'Draft',
      Note          NVARCHAR(MAX)  NULL,
      CreatedAt     DATETIME       NOT NULL DEFAULT GETDATE()
    )
  `);

  // ── PO_ITEMS ───────────────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PO_ITEMS' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.PO_ITEMS (
      POItemID    INT IDENTITY(1,1) PRIMARY KEY,
      POID        INT             NOT NULL,
      ItemCode    INT             NULL,
      ItemName    NVARCHAR(255)   NOT NULL,
      Qty         DECIMAL(18,3)   NOT NULL DEFAULT 0,
      UnitPrice   DECIMAL(18,2)   NOT NULL DEFAULT 0,
      TotalPrice  AS (Qty * UnitPrice) PERSISTED,
      CONSTRAINT FK_PO_ITEMS_HEADER FOREIGN KEY (POID)
        REFERENCES dbo.PO_HEADER(POID) ON DELETE CASCADE
    )
  `);

  // ── GRN_HEADER ─────────────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='GRN_HEADER' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.GRN_HEADER (
      GRNID        INT IDENTITY(1,1) PRIMARY KEY,
      GRNDocNo     NVARCHAR(30)   NOT NULL,
      POID         INT            NULL,
      SupplierID   INT            NULL,
      SupplierName NVARCHAR(200)  NULL,
      CompanyID    INT            NULL,
      CompanyName  NVARCHAR(150)  NULL,
      ProjectName  NVARCHAR(200)  NULL,
      ReceiptDate  DATE           NOT NULL DEFAULT CAST(GETDATE() AS DATE),
      InvoiceRef   NVARCHAR(50)   NULL,
      Note         NVARCHAR(MAX)  NULL,
      CreatedAt    DATETIME       NOT NULL DEFAULT GETDATE()
    )
  `);

  // ── GRN_ITEMS ──────────────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='GRN_ITEMS' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.GRN_ITEMS (
      GRNItemID    INT IDENTITY(1,1) PRIMARY KEY,
      GRNID        INT             NOT NULL,
      POItemID     INT             NULL,
      ItemCode     INT             NULL,
      ItemName     NVARCHAR(255)   NOT NULL,
      POQty        DECIMAL(18,3)   NOT NULL DEFAULT 0,
      QtyReceived  DECIMAL(18,3)   NOT NULL DEFAULT 0,
      UnitPrice    DECIMAL(18,2)   NULL,
      StockBefore  DECIMAL(18,3)   NOT NULL DEFAULT 0,
      StockAfter   DECIMAL(18,3)   NOT NULL DEFAULT 0,
      CONSTRAINT FK_GRN_ITEMS_HEADER FOREIGN KEY (GRNID)
        REFERENCES dbo.GRN_HEADER(GRNID) ON DELETE CASCADE
    )
  `);

  // ── SALE_BILLS ─────────────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='SALE_BILLS' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.SALE_BILLS (
      BillID           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      BillNo           NVARCHAR(30)     NOT NULL,
      BillDate         DATE             NOT NULL,
      DueDate          DATE             NULL,
      Notes            NVARCHAR(MAX)    NULL,
      GSTMode          NVARCHAR(20)     NULL,
      IsInterState     BIT              NOT NULL DEFAULT 0,
      ProjectName      NVARCHAR(200)    NULL,
      CompanyName      NVARCHAR(150)    NULL,
      CompanyAddress   NVARCHAR(400)    NULL,
      CompanyCity      NVARCHAR(100)    NULL,
      CompanyState     NVARCHAR(100)    NULL,
      CompanyPincode   NVARCHAR(10)     NULL,
      CompanyGSTIN     NVARCHAR(20)     NULL,
      CompanyPhone     NVARCHAR(30)     NULL,
      CompanyEmail     NVARCHAR(150)    NULL,
      CompanyLogo      NVARCHAR(MAX)    NULL,
      CustomerName     NVARCHAR(150)    NULL,
      CustomerAddress  NVARCHAR(400)    NULL,
      CustomerCity     NVARCHAR(100)    NULL,
      CustomerState    NVARCHAR(100)    NULL,
      CustomerPincode  NVARCHAR(10)     NULL,
      CustomerGSTIN    NVARCHAR(20)     NULL,
      CustomerPhone    NVARCHAR(30)     NULL,
      GrossAmount      DECIMAL(18,2)    NOT NULL DEFAULT 0,
      DiscountAmount   DECIMAL(18,2)    NOT NULL DEFAULT 0,
      TaxableAmount    DECIMAL(18,2)    NOT NULL DEFAULT 0,
      CGSTAmount       DECIMAL(18,2)    NOT NULL DEFAULT 0,
      SGSTAmount       DECIMAL(18,2)    NOT NULL DEFAULT 0,
      IGSTAmount       DECIMAL(18,2)    NOT NULL DEFAULT 0,
      TotalTax         DECIMAL(18,2)    NOT NULL DEFAULT 0,
      GrandTotal       DECIMAL(18,2)    NOT NULL DEFAULT 0,
      PaidAmount       DECIMAL(18,2)    NULL     DEFAULT 0,
      Status           NVARCHAR(20)     NULL     DEFAULT 'Unpaid',
      SavedAt          DATETIME         NOT NULL DEFAULT GETDATE(),
      UpdatedAt        DATETIME         NULL
    )
  `);

  // ── SALE_BILL_ITEMS ────────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='SALE_BILL_ITEMS' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.SALE_BILL_ITEMS (
      ItemID          INT IDENTITY(1,1) PRIMARY KEY,
      BillID          UNIQUEIDENTIFIER  NOT NULL,
      Line_No         INT               NOT NULL DEFAULT 1,
      ItemName        NVARCHAR(255)     NOT NULL,
      HSN             NVARCHAR(20)      NULL,
      Unit            NVARCHAR(20)      NULL,
      Qty             DECIMAL(18,3)     NOT NULL DEFAULT 0,
      Rate            DECIMAL(18,2)     NOT NULL DEFAULT 0,
      DiscPercent     DECIMAL(5,2)      NOT NULL DEFAULT 0,
      GSTPercent      DECIMAL(5,2)      NOT NULL DEFAULT 0,
      GrossAmount     DECIMAL(18,2)     NOT NULL DEFAULT 0,
      DiscountAmount  DECIMAL(18,2)     NOT NULL DEFAULT 0,
      TaxableAmount   DECIMAL(18,2)     NOT NULL DEFAULT 0,
      TaxAmount       DECIMAL(18,2)     NOT NULL DEFAULT 0,
      LineTotal       DECIMAL(18,2)     NOT NULL DEFAULT 0,
      CONSTRAINT FK_SALE_BILL_ITEMS FOREIGN KEY (BillID)
        REFERENCES dbo.SALE_BILLS(BillID) ON DELETE CASCADE
    )
  `);

  // ── ItemTransferHeader ─────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='ItemTransferHeader' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.ItemTransferHeader (
      TransferID    INT IDENTITY(1,1) PRIMARY KEY,
      TransferDocNo NVARCHAR(30)  NOT NULL,
      FromCompanyID INT           NULL,
      ToCompanyID   INT           NULL,
      TransferDate  DATE          NOT NULL DEFAULT CAST(GETDATE() AS DATE),
      Note          NVARCHAR(MAX) NULL,
      CreatedAt     DATETIME      NOT NULL DEFAULT GETDATE()
    )
  `);

  // ── ItemTransferDetail ─────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='ItemTransferDetail' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.ItemTransferDetail (
      TransferDetailID INT IDENTITY(1,1) PRIMARY KEY,
      TransferID       INT           NOT NULL,
      ItemCode         INT           NULL,
      ItemName         NVARCHAR(255) NOT NULL,
      Qty              DECIMAL(18,3) NOT NULL DEFAULT 0,
      CONSTRAINT FK_TRANSFER_DETAIL FOREIGN KEY (TransferID)
        REFERENCES dbo.ItemTransferHeader(TransferID) ON DELETE CASCADE
    )
  `);


  // ── CONSUMPTION_HEADER ─────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='CONSUMPTION_HEADER' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.CONSUMPTION_HEADER (
      ConsumptionID   INT IDENTITY(1,1) PRIMARY KEY,
      DocNo           NVARCHAR(30)  NOT NULL,
      CompanyID       INT           NULL,
      CompanyName     NVARCHAR(150) NOT NULL DEFAULT '',
      ProjectName     NVARCHAR(200) NOT NULL DEFAULT '',
      ConsumptionDate DATE          NOT NULL DEFAULT CAST(GETDATE() AS DATE),
      Remarks         NVARCHAR(MAX) NULL,
      CreatedAt       DATETIME      NOT NULL DEFAULT GETDATE()
    )
  `);

  // ── CONSUMPTION_ITEMS ──────────────────────────────────────────────────────
  await r().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='CONSUMPTION_ITEMS' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE dbo.CONSUMPTION_ITEMS (
      ConsumptionItemID INT IDENTITY(1,1) PRIMARY KEY,
      ConsumptionID     INT           NOT NULL,
      [LineNo]          INT           NOT NULL DEFAULT 1,
      ItemCode          INT           NULL,
      ItemName          NVARCHAR(255) NOT NULL DEFAULT '',
      QtyConsumed       DECIMAL(18,3) NOT NULL DEFAULT 0,
      StockBefore       DECIMAL(18,3) NOT NULL DEFAULT 0,
      StockAfter        DECIMAL(18,3) NOT NULL DEFAULT 0,
      Remarks           NVARCHAR(500) NULL,
      CONSTRAINT FK_CONSUMPTION_ITEMS FOREIGN KEY (ConsumptionID)
        REFERENCES dbo.CONSUMPTION_HEADER(ConsumptionID) ON DELETE CASCADE
    )
  `);

  console.log('✅ All tables verified / created');
};

module.exports = migrate;