const express = require('express');
const sql = require('mssql');
const router = express.Router();

// Global pool reference (will be passed from server.js)
let pool;

const setPool = (sqlPool) => {
  pool = sqlPool;
};

module.exports = { router, setPool };

// ─── GET ALL USERS ──────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ success: false, error: 'Database connection not ready.' });
    }
    const result = await pool.request()
      .query('SELECT id, username, created_at FROM users ORDER BY username');
    return res.json({ success: true, users: result.recordset });
  } catch (err) {
    console.error('Get users error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch users.' });
  }
});

// ─── ADD NEW USER ────────────────────────────────────────
router.post('/add', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required.' });
  }
  if (username.trim().length < 3) {
    return res.status(400).json({ success: false, error: 'Username must be at least 3 characters.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ success: false, error: 'Password must be at least 4 characters.' });
  }

  try {
    if (!pool) {
      return res.status(500).json({ success: false, error: 'Database connection not ready.' });
    }

    const check = await pool.request()
      .input('username', sql.NVarChar, username.trim().toLowerCase())
      .query('SELECT id FROM users WHERE LOWER(username) = @username');

    if (check.recordset.length > 0) {
      return res.status(400).json({ success: false, error: 'Username already exists.' });
    }

    const result = await pool.request()
      .input('username', sql.NVarChar, username.trim())
      .input('password', sql.NVarChar, password)
      .query(`
        INSERT INTO users (username, password)
        VALUES (@username, @password);
        SELECT SCOPE_IDENTITY() AS id
      `);

    const userId = result.recordset[0].id;
    console.log(`✅ User created: ${username.trim()} (ID: ${userId})`);
    return res.status(201).json({ success: true, id: userId, username: username.trim(), message: 'User created successfully.' });
  } catch (err) {
    console.error('Add user error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to create user.' });
  }
});

// ─── CHANGE PASSWORD ────────────────────────────────────
router.post('/change-password', async (req, res) => {
  const { username, oldPassword, newPassword } = req.body;

  if (!username || !oldPassword || !newPassword) {
    return res.status(400).json({ success: false, error: 'All fields are required.' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ success: false, error: 'New password must be at least 4 characters.' });
  }
  if (oldPassword === newPassword) {
    return res.status(400).json({ success: false, error: 'New password must be different from current password.' });
  }

  try {
    if (!pool) {
      return res.status(500).json({ success: false, error: 'Database connection not ready.' });
    }

    const verify = await pool.request()
      .input('username', sql.NVarChar, username.trim())
      .input('password', sql.NVarChar, oldPassword)
      .query('SELECT id FROM users WHERE username = @username AND password = @password');

    if (verify.recordset.length === 0) {
      return res.status(401).json({ success: false, error: 'Username or current password is incorrect.' });
    }

    await pool.request()
      .input('username',    sql.NVarChar, username.trim())
      .input('newPassword', sql.NVarChar, newPassword)
      .query('UPDATE users SET password = @newPassword WHERE username = @username');

    console.log(`✅ Password changed for user: ${username.trim()}`);
    return res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change password error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to change password.' });
  }
});