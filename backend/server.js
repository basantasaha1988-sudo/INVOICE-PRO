const express = require("express");
const sql = require("mssql");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const config = {
  user: "sa",
  password: "infotech@123",
  server: "192.168.0.200",
  database: "InvoicePro",
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

// Connect DB
sql.connect(config)
  .then(() => console.log("Connected to DB"))
  .catch(err => console.log(err));

// TEST
app.get("/", (req, res) => {
  res.send("API working 🚀");
});

// ITEMS API
app.get("/items", async (req, res) => {
  try {
    const result = await sql.query("SELECT * FROM items");
    res.json(result.recordset);
  } catch (err) {
    res.send(err);
  }
});

// 🔥 LOGIN API (FIX)
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await sql.query`
      SELECT * FROM users 
      WHERE username = ${username} AND password = ${password}
    `;

    if (result.recordset.length > 0) {
      res.json({
        success: true,
        user: result.recordset[0]
      });
    } else {
      res.json({ success: false });
    }

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// START SERVER
app.listen(5000, () => {
  console.log("Server running on port 5000");
});