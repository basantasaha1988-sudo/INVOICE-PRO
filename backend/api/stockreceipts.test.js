/**
 * backend/api/stockreceipts.test.js
 *
 * Test runner : Jest
 * Install     : npm install --save-dev jest supertest
 * Run         : npx jest stockreceipts.test.js
 *
 * Strategy
 * --------
 * - `../db` is mocked so no real SQL Server is needed.
 * - Each test rebuilds the mock chain (pool → transaction → request)
 *   to simulate different DB outcomes cleanly.
 * - supertest mounts only the stockreceipts router under /api/stock-receipts.
 */

'use strict';

const express    = require('express');
const request    = require('supertest');

// ── Mock db BEFORE requiring the router ──────────────────────────────────────
jest.mock('../db', () => {
  const sql = {
    Int:        'Int',
    Decimal:    () => 'Decimal',
    NVarChar:   (n) => `NVarChar(${n})`,
    MAX:        'MAX',
  };
  return { sql, getPool: jest.fn() };
});

const { getPool } = require('../db');
const router      = require('../api/stockreceipts'); // path relative to backend/

// ── Helper: build the mock DB chain ──────────────────────────────────────────
/**
 * @param {object} opts
 * @param {object|null} opts.stockRow   - row returned by SELECT … ITEMMASTER (null = not found)
 * @param {object}      opts.insertRow  - row returned by INSERT … STOCK_RECEIPTS
 * @param {Error|null}  opts.throwOn    - if set, .query() rejects with this error
 */
function buildMockPool({ stockRow = { Stock: 10 }, insertRow = {}, throwOn = null } = {}) {
  let callCount = 0;

  const mockRequest = {
    input: jest.fn().mockReturnThis(),
    query: jest.fn().mockImplementation(async () => {
      if (throwOn) throw throwOn;
      callCount++;
      if (callCount === 1) {
        // First query: SELECT stock from ITEMMASTER
        return { recordset: stockRow ? [stockRow] : [] };
      }
      if (callCount === 2) {
        // Second query: UPDATE ITEMMASTER
        return { rowsAffected: [1] };
      }
      // Third query: INSERT STOCK_RECEIPTS … OUTPUT INSERTED.*
      return { recordset: [insertRow] };
    }),
  };

  const mockTransaction = {
    begin:    jest.fn().mockResolvedValue(undefined),
    commit:   jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    request:  jest.fn().mockReturnValue(mockRequest),
  };

  const mockPool = {
    transaction: jest.fn().mockReturnValue(mockTransaction),
    request:     jest.fn().mockReturnValue(mockRequest), // for GET queries
  };

  getPool.mockResolvedValue(mockPool);
  return { mockPool, mockTransaction, mockRequest };
}

// ── App fixture ───────────────────────────────────────────────────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/stock-receipts', router);
  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/stock-receipts
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/stock-receipts', () => {

  const validBody = {
    grnDocNo:    'GRN-20260521-1234',
    companyId:   1,
    companyName: 'Acme Ltd',
    projectName: 'Warehouse A',
    itemCode:    42,
    itemName:    'Zira Kathi',
    qty:         90,
    note:        'Supplier: ABC, PO#123',
  };

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('201 — creates GRN record and returns inserted row', async () => {
    const insertedRow = {
      ReceiptID:   1,
      GRNDocNo:    validBody.grnDocNo,
      ItemCode:    validBody.itemCode,
      ItemName:    validBody.itemName,
      QtyReceived: validBody.qty,
      StockBefore: 10,
      StockAfter:  100,
      CompanyID:   validBody.companyId,
      CompanyName: validBody.companyName,
      ProjectName: validBody.projectName,
      Note:        validBody.note,
    };
    buildMockPool({ stockRow: { Stock: 10 }, insertRow: insertedRow });

    const res = await buildApp()
      .post('/api/stock-receipts')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.GRNDocNo).toBe(validBody.grnDocNo);
    expect(res.body.StockAfter).toBe(100);   // 10 existing + 90 received
    expect(res.body.QtyReceived).toBe(validBody.qty);
  });

  it('commits the transaction on success', async () => {
    const { mockTransaction } = buildMockPool({ stockRow: { Stock: 0 } });

    await buildApp().post('/api/stock-receipts').send(validBody);

    expect(mockTransaction.begin).toHaveBeenCalledTimes(1);
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
    expect(mockTransaction.rollback).not.toHaveBeenCalled();
  });

  it('works with zero existing stock (out-of-stock item receiving first batch)', async () => {
    buildMockPool({ stockRow: { Stock: 0 }, insertRow: { StockBefore: 0, StockAfter: 90 } });

    const res = await buildApp()
      .post('/api/stock-receipts')
      .send({ ...validBody, qty: 90 });

    expect(res.status).toBe(201);
    expect(res.body.StockAfter).toBe(90);
  });

  it('accepts an optional note field of null/empty', async () => {
    buildMockPool({ insertRow: { Note: null } });

    const res = await buildApp()
      .post('/api/stock-receipts')
      .send({ ...validBody, note: '' });

    expect(res.status).toBe(201);
  });

  it('accepts projectName as empty string (no project selected)', async () => {
    buildMockPool({ insertRow: { ProjectName: null } });

    const res = await buildApp()
      .post('/api/stock-receipts')
      .send({ ...validBody, projectName: '' });

    expect(res.status).toBe(201);
  });

  // ── Validation errors (400) ────────────────────────────────────────────────

  it('400 — missing grnDocNo', async () => {
    const { grnDocNo, ...body } = validBody;
    const res = await buildApp().post('/api/stock-receipts').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/GRN Doc No is required/i);
  });

  it('400 — missing itemCode', async () => {
    const { itemCode, ...body } = validBody;
    const res = await buildApp().post('/api/stock-receipts').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Item is required/i);
  });

  it('400 — qty is 0', async () => {
    const res = await buildApp()
      .post('/api/stock-receipts')
      .send({ ...validBody, qty: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Quantity must be greater than 0/i);
  });

  it('400 — qty is negative', async () => {
    const res = await buildApp()
      .post('/api/stock-receipts')
      .send({ ...validBody, qty: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Quantity must be greater than 0/i);
  });

  it('400 — qty is missing entirely', async () => {
    const { qty, ...body } = validBody;
    const res = await buildApp().post('/api/stock-receipts').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Quantity must be greater than 0/i);
  });

  // ── Not-found (404) ────────────────────────────────────────────────────────

  it('404 — item not found in ITEMMASTER', async () => {
    buildMockPool({ stockRow: null });  // empty recordset from SELECT

    const res = await buildApp()
      .post('/api/stock-receipts')
      .send(validBody);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Item not found/i);
  });

  it('rolls back when item is not found', async () => {
    const { mockTransaction } = buildMockPool({ stockRow: null });

    await buildApp().post('/api/stock-receipts').send(validBody);

    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
    expect(mockTransaction.commit).not.toHaveBeenCalled();
  });

  // ── DB / server errors (500) ───────────────────────────────────────────────

  it('500 — rolls back and returns error when DB throws', async () => {
    const { mockTransaction } = buildMockPool({ throwOn: new Error('Deadlock detected') });

    const res = await buildApp()
      .post('/api/stock-receipts')
      .send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Deadlock detected/i);
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
  });

  it('500 — returns error message when getPool itself fails', async () => {
    getPool.mockRejectedValue(new Error('Connection refused'));

    const res = await buildApp()
      .post('/api/stock-receipts')
      .send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Connection refused/i);
  });

  // ── Edge: fractional / string qty ─────────────────────────────────────────

  it('accepts qty passed as a numeric string ("90")', async () => {
    buildMockPool({ stockRow: { Stock: 10 }, insertRow: { StockAfter: 100 } });

    const res = await buildApp()
      .post('/api/stock-receipts')
      .send({ ...validBody, qty: '90' });

    expect(res.status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/stock-receipts
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/stock-receipts', () => {

  const sampleRecords = [
    { ReceiptID: 1, GRNDocNo: 'GRN-001', ItemCode: 42, QtyReceived: 90 },
    { ReceiptID: 2, GRNDocNo: 'GRN-002', ItemCode: 7,  QtyReceived: 20 },
  ];

  function buildGetPool(records = sampleRecords) {
    const mockRequest = {
      input: jest.fn().mockReturnThis(),
      query: jest.fn().mockResolvedValue({ recordset: records }),
    };
    getPool.mockResolvedValue({ request: jest.fn().mockReturnValue(mockRequest) });
    return mockRequest;
  }

  it('200 — returns all receipts', async () => {
    buildGetPool();
    const res = await buildApp().get('/api/stock-receipts');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].GRNDocNo).toBe('GRN-001');
  });

  it('200 — returns empty array when no receipts exist', async () => {
    buildGetPool([]);
    const res = await buildApp().get('/api/stock-receipts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('passes item_code filter to the query', async () => {
    const req = buildGetPool([sampleRecords[0]]);
    await buildApp().get('/api/stock-receipts?item_code=42');
    expect(req.input).toHaveBeenCalledWith('ItemCode', expect.anything(), 42);
  });

  it('passes company_id filter to the query', async () => {
    const req = buildGetPool([sampleRecords[1]]);
    await buildApp().get('/api/stock-receipts?company_id=1');
    expect(req.input).toHaveBeenCalledWith('CompanyID', expect.anything(), 1);
  });

  it('500 — returns error when DB throws', async () => {
    getPool.mockRejectedValue(new Error('Network error'));
    const res = await buildApp().get('/api/stock-receipts');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Network error/i);
  });
});