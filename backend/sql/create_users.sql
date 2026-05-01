-- Run this in your MS SQL Server (InvoicePro database) to create the users table

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
BEGIN
    CREATE TABLE users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        username NVARCHAR(100) NOT NULL UNIQUE,
        password NVARCHAR(255) NOT NULL,
        email NVARCHAR(255) NULL,
        created_at DATETIME DEFAULT GETDATE()
    );

    -- Default admin user (change password after first login!)
    INSERT INTO users (username, password) VALUES ('admin', 'admin123');

    PRINT 'users table created with default admin/admin123 credentials.';
END
ELSE
BEGIN
    PRINT 'users table already exists.';
END
