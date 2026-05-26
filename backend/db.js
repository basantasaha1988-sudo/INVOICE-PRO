// backend/db.js
// Shared SQL Server connection pool — all route modules import from here.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const sql = require('mssql');

const config = {
  user:     process.env.DB_USER   || 'sa',
  password: process.env.DB_PASS   || '',
  server:   process.env.DB_SERVER || 'localhost',
  port:     parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_NAME   || 'InvoicePro',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool = null;

const getPool = async () => {
  if (!pool) {
    try {
      pool = await new sql.ConnectionPool(config).connect();
      console.log('✅ MSSQL Pool connected to', config.server, '/', config.database);
    } catch (err) {
      console.error('❌ MSSQL Pool connection failed:', err.message);
      throw err;
    }
  }
  return pool;
};

module.exports = { sql, getPool };