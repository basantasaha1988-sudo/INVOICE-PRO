const sql = require("mssql");

const config = {
  user: "sa",
  password: "infotech@123",
  server: "192.168.0.205",
  port: 1433,
  database: "InvoicePro",
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
    pool = await new sql.ConnectionPool(config).connect();
    console.log("MSSQL Pool connected");
  }
  return pool;
};

module.exports = { sql, getPool };

