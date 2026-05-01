-- Run this in your MS SQL Server to create the ITEMMASTER table

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ITEMMASTER')
BEGIN
    CREATE TABLE ITEMMASTER (
        ID VARCHAR(50) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL,
        DefaultRate DECIMAL(18,2) NOT NULL DEFAULT 0,
        DefaultTaxPercent DECIMAL(18,2) NOT NULL DEFAULT 0,
        Stock DECIMAL(18,2) NOT NULL DEFAULT 0
    );
END

