import React, { useState, useEffect, useCallback } from 'react';
import './ReceiptPayment.css';
import { useDarkMode } from '../App';

// Use Vite proxy (/api → backend) so it works in both dev and production
const API = import.meta.env.VITE_API_URL || '/api';

const getHeaders = () => ({
  'Content-Type': 'application/json',
});

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

// ─── Auto-generate receipt number ────────────────────────
const genReceiptNo = () => {
  const d = new Date();
  const yr = d.getFullYear();
  const ms = String(d.getTime()).slice(-5);
  return `RCP-${yr}-${ms}`;
};

const ReceiptPayment = ({
  invoice = {},
  receipts = [],
  onClose,
  onReceiptSaved,
  onDeleteReceipt,
}) => {
  const { isDark } = useDarkMode();

  const [customers,      setCustomers]      = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [saleBills,      setSaleBills]      = useState([]);
  const [savedReceipts,  setSavedReceipts]  = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [apiStatus,      setApiStatus]      = useState('idle'); // idle | ok | error
  const [toast,          setToast]          = useState(null);

  const [formData, setFormData] = useState({
    receiptNo:       genReceiptNo(),
    receiptDate:     new Date().toISOString().split('T')[0],
    customerID:      '',
    linkedBillID:    '',   // FIX: UniqueIdentifier string from SALE_BILLS.BillID
    paymentMethodID: '',
    referenceNo:     '',
    totalAmount:     '',
    discountAmount:  '0',
    netAmount:       '',
    status:          'Paid',
    remarks:         '',
    // Legacy fields kept for compatibility
    companyName:     '',
    paymentDocNumber:'',
    amount:          '',
    receiptAmount:   '',
    mode:            'Cash',
    type:            'againstBill',
  });

  // ─── Toast helper ──────────────────────────────────────
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ─── Load dropdowns from API ───────────────────────────
  const loadDropdowns = useCallback(async () => {
    try {
      const [cRes, pmRes] = await Promise.all([
        fetch(`${API}/customers`,       { headers: getHeaders() }),
        fetch(`${API}/payment-methods`, { headers: getHeaders() }),
      ]);

      if (cRes.ok) {
        setCustomers(await cRes.json());
      } else {
        const err = await cRes.json().catch(() => ({}));
        console.error('Customers API error:', cRes.status, err);
        setApiStatus('error');
        return;
      }

      if (pmRes.ok) {
        setPaymentMethods(await pmRes.json());
      } else {
        // PaymentMethod may fail if IsActive column missing — retry without filter
        try {
          const fallback = await fetch(`${API}/payment-methods-all`, { headers: getHeaders() });
          if (fallback.ok) setPaymentMethods(await fallback.json());
        } catch {}
      }

      setApiStatus('ok');
    } catch (err) {
      console.error('loadDropdowns network error:', err);
      setApiStatus('error');
    }
  }, []);

  // ─── Load saved receipts ───────────────────────────────
  const loadReceipts = useCallback(async () => {
    try {
      const res = await fetch(`${API}/receipts`, { headers: getHeaders() });
      if (res.ok) setSavedReceipts(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    loadDropdowns();
    loadReceipts();
  }, [loadDropdowns, loadReceipts]);

  // ─── Pre-fill from invoice prop ───────────────────────
  useEffect(() => {
    if (invoice && Object.keys(invoice).length > 0) {
      setFormData(prev => ({
        ...prev,
        companyName:      invoice.customerName  || invoice.companyName  || '',
        paymentDocNumber: invoice.invoiceNumber || invoice.billNo       || '',
        amount:           invoice.totalAmount   || invoice.total        || '',
        receiptAmount:    invoice.balance       || invoice.totalAmount  || invoice.total || '',
        totalAmount:      invoice.totalAmount   || invoice.total        || '',
        netAmount:        invoice.balance       || invoice.totalAmount  || invoice.total || '',
        remarks: `Payment received against Invoice #${invoice.invoiceNumber || invoice.billNo || ''}`,
      }));
    }
  }, [invoice]);

  // ─── Load bills when customer changes ─────────────────
  const handleCustomerChange = async (e) => {
    const cid = e.target.value;
    const cust = customers.find(c => String(c.CustomerID) === String(cid));
    setFormData(prev => ({
      ...prev,
      customerID:   cid,
      companyName:  cust?.CustomerName || '',
      linkedBillID: '',
    }));
    setSaleBills([]);
    if (!cid) return;
    try {
      const res = await fetch(`${API}/sale-bills?customerId=${cid}`, { headers: getHeaders() });
      if (res.ok) setSaleBills(await res.json());
    } catch {}
  };

  // ─── Handle bill selection ────────────────────────────
  const handleBillChange = (e) => {
    const bid = e.target.value;
    const bill = saleBills.find(b => String(b.LinkedBillID) === String(bid));
    setFormData(prev => ({
      ...prev,
      linkedBillID:    bid,
      paymentDocNumber: bill?.BillNo    || prev.paymentDocNumber,
      totalAmount:      bill?.NetAmount || prev.totalAmount,
      amount:           bill?.NetAmount || prev.amount,
      netAmount:        bill?.DueAmount || bill?.NetAmount || prev.netAmount,
      receiptAmount:    bill?.DueAmount || bill?.NetAmount || prev.receiptAmount,
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      // Keep netAmount in sync with receiptAmount for legacy compat
      if (name === 'receiptAmount') updated.netAmount = value;
      if (name === 'amount')        updated.totalAmount = value;
      return updated;
    });
  };

  const resetForm = () => {
    setFormData({
      receiptNo:       genReceiptNo(),
      receiptDate:     new Date().toISOString().split('T')[0],
      customerID:      '',
      linkedBillID:    '',
      paymentMethodID: '',
      referenceNo:     '',
      totalAmount:     '',
      discountAmount:  '0',
      netAmount:       '',
      status:          'Paid',
      remarks:         '',
      companyName:     '',
      paymentDocNumber:'',
      amount:          '',
      receiptAmount:   '',
      mode:            'Cash',
      type:            'againstBill',
    });
    setSaleBills([]);
  };

  // ─── SUBMIT — Save to SQL ─────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Resolve IDs — support both dropdown and legacy free-text
    const custID  = formData.customerID  || null;
    const pmID    = formData.paymentMethodID ||
      paymentMethods.find(p => p.MethodName === formData.mode)?.PaymentMethodID ||
      null;
    const netAmt  = parseFloat(formData.netAmount || formData.receiptAmount) || 0;
    const totAmt  = parseFloat(formData.totalAmount || formData.amount)       || netAmt;

    if (!formData.receiptNo)  return showToast('Receipt No is required', 'error');
    if (!custID)               return showToast('Please select a customer from the dropdown', 'error');
    if (!pmID)                 return showToast('Please select a payment method', 'error');
    if (!netAmt)               return showToast('Receipt amount is required', 'error');

    // Build payload matching server.js
    // FIX: Never fallback to hardcoded IDs — always use validated values
    const payload = {
      ReceiptNo:        formData.receiptNo,
      ReceiptDate:      formData.receiptDate,
      CustomerID:       parseInt(custID),
      LinkedBillID:     formData.linkedBillID || null,
      PaymentMethodID:  parseInt(pmID),
      TotalAmount:      totAmt,
      DiscountAmount:   parseFloat(formData.discountAmount) || 0,
      NetAmount:        netAmt,
      Status:           formData.status,
      Notes:            formData.remarks || null,
      Items: [{
        ItemDescription: formData.paymentDocNumber
          ? `Payment against ${formData.paymentDocNumber}`
          : formData.remarks || 'Receipt payment',
        Quantity:  1,
        UnitPrice: netAmt,
        TaxRate:   0,
        TaxAmount: 0,
        LineTotal: netAmt,
      }],
      Payment: {
        PaymentMethodID: parseInt(pmID),
        AmountPaid:      netAmt,
        ReferenceNo:     formData.referenceNo || null,
      },
    };

    setLoading(true);
    try {
      const res  = await fetch(`${API}/receipts`, {
        method:  'POST',
        headers: getHeaders(),
        body:    JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);

      showToast(`✓ Receipt ${data.ReceiptNo} saved to SQL Server!`, 'success');

      // Legacy callback
      if (onReceiptSaved) {
        onReceiptSaved({
          id:             data.ReceiptID,
          date:           new Date().toLocaleDateString('en-IN'),
          paymentDocNumber: formData.paymentDocNumber,
          companyName:    formData.companyName,
          invoiceTotal:   totAmt,
          receiptAmount:  netAmt,
          balance:        totAmt - netAmt,
          mode:           formData.mode,
          type:           formData.type,
          remarks:        formData.remarks,
        });
      }

      await loadReceipts();
      resetForm();
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ─── DELETE ───────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this receipt from the database?')) return;
    try {
      const res = await fetch(`${API}/receipts/${id}`, {
        method: 'DELETE', headers: getHeaders(),
      });
      if (!res.ok) throw new Error('Delete failed');
      showToast('Receipt deleted', 'info');
      setSavedReceipts(prev => prev.filter(r => r.ReceiptID !== id));
      if (onDeleteReceipt) onDeleteReceipt(id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Display: prefer DB receipts, fall back to prop
  const displayReceipts = savedReceipts.length > 0 ? savedReceipts : receipts;

  return (
    <div className={`receipt-container ${isDark ? 'dark-mode' : ''}`}>

      {/* Toast */}
      {toast && (
        <div className={`rp-toast rp-toast--${toast.type}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="d-flex align-items-center mb-4 gap-3">
        <button
          className="g-btn g-btn-ghost g-btn-sm p-2"
          onClick={onClose}
          style={{ minWidth: '50px', height: '50px' }}
        >
          ← Back
        </button>
        <h2 className="mb-0 fw-bold">
          <i className="bi bi-receipt me-2 text-success"></i>
          Receipt Payment
        </h2>
        <span
          className={`badge ms-auto ${
            apiStatus === 'ok'    ? 'bg-success' :
            apiStatus === 'error' ? 'bg-danger'  : 'bg-secondary'
          }`}
          style={{ fontSize: 11 }}
        >
          {apiStatus === 'ok'    ? '● SQL Connected' :
           apiStatus === 'error' ? '● API Offline'   : '● Connecting…'}
        </span>
      </div>

      {/* Form */}
      <div className="receipt-form">
        <form onSubmit={handleSubmit}>
          <div className="form-grid">

            {/* Receipt No + Date */}
            <div className="form-group">
              <label>Receipt No <span className="text-danger">*</span></label>
              <input
                type="text"
                name="receiptNo"
                value={formData.receiptNo}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Receipt Date</label>
              <input
                type="date"
                name="receiptDate"
                value={formData.receiptDate}
                onChange={handleChange}
              />
            </div>

            {/* Customer */}
            <div className="form-group">
              <label>Customer <span className="text-danger">*</span></label>
              <select
                name="customerID"
                value={formData.customerID}
                onChange={handleCustomerChange}
                required
                disabled={apiStatus === 'error' || customers.length === 0}
              >
                <option value="">
                  {apiStatus === 'error'
                    ? '⚠ API Error — check console'
                    : customers.length === 0
                    ? '⏳ Loading customers…'
                    : '— Select Customer —'}
                </option>
                {customers.map(c => (
                  <option key={c.CustomerID} value={c.CustomerID}>
                    {c.CustomerName}
                  </option>
                ))}
              </select>
              {apiStatus === 'error' && (
                <small className="text-danger">
                  Cannot load customers. Is the backend running on port 3001?
                </small>
              )}
              {apiStatus === 'ok' && customers.length === 0 && (
                <small className="text-warning">
                  No customers found in dbo.Customer. Please add customers first.
                </small>
              )}
            </div>

            {/* Linked Invoice */}
            <div className="form-group">
              <label>Against Invoice (optional)</label>
              <select
                name="linkedBillID"
                value={formData.linkedBillID}
                onChange={handleBillChange}
              >
                <option value="">— Advance / Walk-in —</option>
                {saleBills.map(b => (
                  <option key={b.LinkedBillID} value={b.LinkedBillID}>
                    {b.BillNo} — Due: ₹{fmt(b.DueAmount)}
                  </option>
                ))}
              </select>
            </div>

            {/* Invoice total (read-only if from bill) */}
            <div className="form-group">
              <label>Invoice Total (₹)</label>
              <input
                type="number"
                step="0.01"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                className="form-control-plaintext text-success fw-bold"
                readOnly={!!formData.linkedBillID}
                placeholder="0.00"
              />
            </div>

            {/* Receipt Amount */}
            <div className="form-group">
              <label>Receipt Amount (₹) <span className="text-danger">*</span></label>
              <input
                type="number"
                step="0.01"
                name="receiptAmount"
                value={formData.receiptAmount}
                onChange={handleChange}
                required
                placeholder="0.00"
              />
            </div>

            {/* Payment Method */}
            <div className="form-group">
              <label>Payment Method <span className="text-danger">*</span></label>
              <select
                name="paymentMethodID"
                value={formData.paymentMethodID}
                onChange={handleChange}
                required
                disabled={paymentMethods.length === 0}
              >
                <option value="">
                  {paymentMethods.length === 0 ? '⏳ Loading…' : '— Select Method —'}
                </option>
                {paymentMethods.map(p => (
                  <option key={p.PaymentMethodID} value={p.PaymentMethodID}>
                    {p.MethodName}
                  </option>
                ))}
              </select>
            </div>

            {/* Reference No */}
            <div className="form-group">
              <label>Reference No / TrxID</label>
              <input
                type="text"
                name="referenceNo"
                value={formData.referenceNo}
                onChange={handleChange}
                placeholder="Cheque no / bKash TrxID / UPI ref…"
              />
            </div>

            {/* Payment Doc No */}
            <div className="form-group">
              <label>Payment Doc / Invoice No</label>
              <input
                type="text"
                name="paymentDocNumber"
                value={formData.paymentDocNumber}
                onChange={handleChange}
                placeholder="INV-2026-XXXXX"
              />
            </div>

            {/* Status */}
            <div className="form-group">
              <label>Status</label>
              <select name="status" value={formData.status} onChange={handleChange}>
                <option value="Paid">Paid</option>
                <option value="Partial">Partial</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            {/* Payment Type */}
            <div className="form-group">
              <label>Payment Type</label>
              <select name="type" value={formData.type} onChange={handleChange}>
                <option value="againstBill">Against Bill</option>
                <option value="advance">Advance</option>
                <option value="fullSettlement">Full Settlement</option>
              </select>
            </div>

            {/* Discount */}
            <div className="form-group">
              <label>Discount Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                name="discountAmount"
                value={formData.discountAmount}
                onChange={handleChange}
                placeholder="0.00"
              />
            </div>

            {/* Remarks */}
            <div className="form-group full-width">
              <label>Remarks</label>
              <textarea
                rows="3"
                name="remarks"
                value={formData.remarks}
                onChange={handleChange}
                placeholder="Payment reference, cheque no, notes..."
              />
            </div>
          </div>

          <div className="d-flex gap-3 flex-wrap">
            <button type="submit" className="submit-btn" disabled={loading}>
              <i className="bi bi-check-circle me-2"></i>
              {loading ? 'Saving to SQL…' : 'Save Receipt to SQL Server'}
            </button>
            <button type="button" className="g-btn g-btn-ghost" onClick={resetForm}>
              <i className="bi bi-arrow-clockwise me-2"></i>
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* Receipts Grid */}
      <div className="table-container mt-5">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h4 className="fw-bold mb-0">
            <i className="bi bi-list-ul me-2 text-primary"></i>
            Saved Receipts{' '}
            <span className="badge bg-primary">{displayReceipts.length}</span>
          </h4>
          <button
            className="g-btn g-btn-ghost g-btn-sm"
            onClick={loadReceipts}
            title="Refresh from DB"
          >
            <i className="bi bi-arrow-clockwise"></i> Refresh
          </button>
        </div>

        {displayReceipts.length === 0 ? (
          <div className="text-center py-5">
            <i className="bi bi-inbox display-1 text-muted d-block mb-3"></i>
            <h5 className="text-muted">No receipts saved yet</h5>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle">
              <thead className="table-dark">
                <tr>
                  <th>Date</th>
                  <th>Receipt No</th>
                  <th>Customer</th>
                  <th>Invoice</th>
                  <th className="text-end">Total</th>
                  <th className="text-end">Paid</th>
                  <th>Method</th>
                  <th>Ref No</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayReceipts.map(r => {
                  // Support both DB shape and legacy prop shape
                  const id         = r.ReceiptID   || r.id;
                  const date       = r.ReceiptDate  || r.date;
                  const rno        = r.ReceiptNo    || r.paymentDocNumber;
                  const cname      = r.CustomerName || r.companyName;
                  const invoice_   = r.LinkedInvoice|| r.paymentDocNumber;
                  const total      = r.TotalAmount  || r.invoiceTotal || 0;
                  const paid       = r.AmountPaid   || r.receiptAmount|| 0;
                  const method     = r.PaymentMethod|| r.mode;
                  const refno      = r.ReferenceNo  || '';
                  const status     = r.Status       || 'Paid';

                  return (
                    <tr key={id}>
                      <td><small>{String(date).split('T')[0]}</small></td>
                      <td><span className="badge bg-primary">{rno}</span></td>
                      <td className="fw-semibold">{cname}</td>
                      <td><small className="text-muted">{invoice_}</small></td>
                      <td className="text-end">₹{fmt(total)}</td>
                      <td className="text-end text-success fw-bold">₹{fmt(paid)}</td>
                      <td><span className="badge bg-info text-dark">{method}</span></td>
                      <td><small className="text-muted">{refno}</small></td>
                      <td>
                        <span className={`badge ${
                          status === 'Paid'      ? 'bg-success' :
                          status === 'Partial'   ? 'bg-warning text-dark' :
                          status === 'Cancelled' ? 'bg-danger'  : 'bg-secondary'
                        }`}>{status}</span>
                      </td>
                      <td>
                        <button
                          className="g-btn g-btn-danger g-btn-sm"
                          onClick={() => handleDelete(id)}
                          title="Delete"
                        >
                          <i className="bi bi-trash"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="table-secondary fw-bold">
                <tr>
                  <td colSpan="4">Total ({displayReceipts.length} receipts)</td>
                  <td className="text-end">
                    ₹{fmt(displayReceipts.reduce((s,r) => s + parseFloat(r.TotalAmount||r.invoiceTotal||0), 0))}
                  </td>
                  <td className="text-end text-success">
                    ₹{fmt(displayReceipts.reduce((s,r) => s + parseFloat(r.AmountPaid||r.receiptAmount||0), 0))}
                  </td>
                  <td colSpan="4"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReceiptPayment;