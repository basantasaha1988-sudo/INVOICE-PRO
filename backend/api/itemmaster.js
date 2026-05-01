const express = require("express");
const { getPool, sql } = require("../db");
const router = express.Router();

// GET all items from ITEMMASTER
router.get("/", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query("SELECT * FROM ITEMMASTER");
    res.json(result.recordset);
  } catch (err) {
    console.error("GET /itemmaster error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST create new item
router.post("/", async (req, res) => {
  const { name, defaultRate, defaultTaxPercent } = req.body;
  console.log("POST /api/itemmaster body:", req.body);

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Item Name is required' });
  }

  try {
    const pool = await getPool();
    await pool.request()
      .input("name", sql.NVarChar(255), name.trim())
      .input("rate", sql.Decimal(18, 2), defaultRate ?? 0)
      .input("tax",  sql.Decimal(5, 2),  defaultTaxPercent ?? 0)
      .query(`
        INSERT INTO ITEMMASTER (ItemName, Rate, Tax, CreatedDate)
        VALUES (@name, @rate, @tax, GETDATE())
      `);
    res.json({ success: true, message: "Item created" });
  } catch (err) {
    console.error("POST /itemmaster error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id/stock  — update stock only (used by Inventory page)
// MUST be defined before PUT /:id to avoid Express treating "stock" as an :id value
router.patch("/:id/stock", async (req, res) => {
  const { id } = req.params;
  const { stock } = req.body;

  if (stock === undefined || stock === null || isNaN(Number(stock))) {
    return res.status(400).json({ error: "stock value is required" });
  }

  try {
    const pool = await getPool();

    // Auto-add Stock column if missing (safe migration)
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM sys.columns
        WHERE name = 'Stock' AND object_id = OBJECT_ID('ITEMMASTER')
      )
      BEGIN
        ALTER TABLE ITEMMASTER ADD Stock DECIMAL(18,2) NOT NULL DEFAULT 0;
      END
    `);

    await pool.request()
      .input("id",    sql.Int,           parseInt(id))
      .input("stock", sql.Decimal(18, 2), Number(stock))
      .query("UPDATE ITEMMASTER SET Stock = @stock WHERE ItemCode = @id");

    res.json({ success: true, message: "Stock updated" });
  } catch (err) {
    console.error("PATCH /itemmaster/:id/stock error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update item name, rate, tax
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, defaultRate, defaultTaxPercent } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input("id",   sql.Int,           parseInt(id))
      .input("name", sql.NVarChar(255), name)
      .input("rate", sql.Decimal(18, 2), defaultRate)
      .input("tax",  sql.Decimal(5, 2),  defaultTaxPercent)
      .query(`
        UPDATE ITEMMASTER
        SET ItemName = @name, Rate = @rate, Tax = @tax
        WHERE ItemCode = @id
      `);
    res.json({ success: true, message: "Item updated" });
  } catch (err) {
    console.error("PUT /itemmaster error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getPool();
    await pool.request()
      .input("id", sql.Int, parseInt(id))
      .query("DELETE FROM ITEMMASTER WHERE ItemCode = @id");
    res.json({ success: true, message: "Item deleted" });
  } catch (err) {
    console.error("DELETE /itemmaster error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;