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
  const [viewReceipt,    setViewReceipt]    = useState(null);
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
        const custData = await cRes.json();
        setCustomers(custData);
        // Auto-select customer matching the invoice's customer name
        if (invoice?.customer) {
          const match = custData.find(c =>
            c.CustomerName?.toLowerCase() === invoice.customer?.toLowerCase()
          );
          if (match) {
            setFormData(prev => ({ ...prev, customerID: String(match.CustomerID) }));
            // Also load their bills
            try {
              const bRes = await fetch(`${API}/sale-bills?customerId=${match.CustomerID}`, { headers: getHeaders() });
              if (bRes.ok) setSaleBills(await bRes.json());
            } catch {}
          }
        }
      } else {
        console.error('Customers API error:', cRes.status);
        setApiStatus('error');
      }

      if (pmRes.ok) {
        const methods = await pmRes.json();
        setPaymentMethods(methods);
        // Auto-select first method if none selected and methods exist
        if (methods.length > 0) {
          setFormData(prev => ({
            ...prev,
            paymentMethodID: prev.paymentMethodID || String(methods[0].PaymentMethodID),
          }));
        }
      }
      // If pmRes not ok, leave paymentMethods empty — backend will seed on next request

      setApiStatus('ok');
    } catch (err) {
      console.error('loadDropdowns network error:', err);
      setApiStatus('error'); // paymentMethods stays empty; backend seeds on next load
    }
  }, [invoice]);

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

  // ─── Auto-retry payment methods if still empty after 2s ───────────────────
  useEffect(() => {
    if (paymentMethods.length > 0) return;
    const timer = setTimeout(() => {
      if (paymentMethods.length === 0) {
        console.log('Payment methods still empty — retrying...');
        loadDropdowns();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [paymentMethods.length, loadDropdowns]);

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
          className="g-btn g-btn-primary g-btn-sm"
          onClick={onClose}
          style={{ borderRadius: 10, padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <i className="bi bi-arrow-left"></i> Back
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
              {paymentMethods.length === 0 && apiStatus === 'ok' && (
                <small style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  ⚠ No active payment methods found. Add methods via
                  <button type="button" data-bs-toggle="modal" data-bs-target="#paymentMethodModal"
                    style={{ background: 'none', border: 'none', color: '#1a56db', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 12 }}>
                    Pay Methods Master
                  </button>
                </small>
              )}
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
                        <div className="d-flex gap-1 flex-wrap">
                          <button
                            className="g-btn g-btn-sm"
                            style={{ background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 13 }}
                            onClick={() => setViewReceipt({ id, date, rno, cname, invoice_, total, paid, method, refno, status })}
                            title="View"
                          >
                            <i className="bi bi-eye"></i>
                            <span className="d-none d-md-inline ms-1">View</span>
                          </button>
                          <button
                            className="g-btn g-btn-danger g-btn-sm"
                            onClick={() => handleDelete(id)}
                            title="Delete"
                          >
                            <i className="bi bi-trash"></i>
                            <span className="d-none d-md-inline ms-1">Del</span>
                          </button>
                        </div>
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

      {/* ── View Receipt Modal ─────────────────────────── */}
      {viewReceipt && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setViewReceipt(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: isDark ? '#1e2533' : '#fff',
              color: isDark ? '#f1f5f9' : '#1e293b',
              borderRadius: 16,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              width: '100%', maxWidth: 480,
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg,#1a56db,#7e3af2)',
              padding: '18px 24px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="bi bi-receipt" style={{ color: '#fff', fontSize: 22 }}></i>
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Receipt Details</div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>{viewReceipt.rno}</div>
                </div>
              </div>
              <button
                onClick={() => setViewReceipt(null)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', width: 32, height: 32, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >×</button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px' }}>
              {[
                { label: 'Receipt No',  value: viewReceipt.rno,                         icon: 'bi-hash' },
                { label: 'Date',        value: String(viewReceipt.date).split('T')[0],   icon: 'bi-calendar3' },
                { label: 'Customer',    value: viewReceipt.cname,                        icon: 'bi-person' },
                { label: 'Invoice',     value: viewReceipt.invoice_ || '—',              icon: 'bi-file-text' },
                { label: 'Total',       value: `₹${fmt(viewReceipt.total)}`,             icon: 'bi-currency-rupee' },
                { label: 'Paid',        value: `₹${fmt(viewReceipt.paid)}`,              icon: 'bi-check-circle', green: true },
                { label: 'Method',      value: viewReceipt.method,                       icon: 'bi-credit-card' },
                { label: 'Ref No',      value: viewReceipt.refno || '—',                 icon: 'bi-upc' },
                { label: 'Status',      value: viewReceipt.status,                       icon: 'bi-info-circle' },
              ].map(row => (
                <div key={row.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '9px 0',
                  borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9'}`,
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: isDark ? '#94a3b8' : '#64748b', fontSize: 13 }}>
                    <i className={`bi ${row.icon}`}></i> {row.label}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 14, color: row.green ? '#16a34a' : undefined }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => {
                  const r = viewReceipt;
                  const win = window.open('', '_blank', 'width=480,height=640');
                  win.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                      <title>Receipt - ${r.rno}</title>
                      <style>
                        * { box-sizing: border-box; margin: 0; padding: 0; }
                        body { font-family: 'Segoe UI', sans-serif; background: #fff; color: #1e293b; padding: 32px; }
                        .header { background: linear-gradient(135deg,#1a56db,#7e3af2); color: #fff; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; }
                        .header h2 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
                        .header p  { font-size: 13px; opacity: 0.8; }
                        .row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
                        .row:last-child { border-bottom: none; }
                        .label { color: #64748b; }
                        .value { font-weight: 600; }
                        .green { color: #16a34a; }
                        .footer { margin-top: 28px; text-align: center; font-size: 12px; color: #94a3b8; }
                        @media print { body { padding: 16px; } }
                      </style>
                    </head>
                    <body>
                      <div class="header">
                        <h2>Receipt Details</h2>
                        <p>${r.rno}</p>
                      </div>
                      <div class="row"><span class="label">Receipt No</span><span class="value">${r.rno}</span></div>
                      <div class="row"><span class="label">Date</span><span class="value">${String(r.date).split('T')[0]}</span></div>
                      <div class="row"><span class="label">Customer</span><span class="value">${r.cname}</span></div>
                      <div class="row"><span class="label">Invoice</span><span class="value">${r.invoice_ || '—'}</span></div>
                      <div class="row"><span class="label">Total</span><span class="value">₹${fmt(r.total)}</span></div>
                      <div class="row"><span class="label">Paid</span><span class="value green">₹${fmt(r.paid)}</span></div>
                      <div class="row"><span class="label">Method</span><span class="value">${r.method}</span></div>
                      <div class="row"><span class="label">Ref No</span><span class="value">${r.refno || '—'}</span></div>
                      <div class="row"><span class="label">Status</span><span class="value">${r.status}</span></div>
                      <div class="footer">Secured by <strong>DIGICODE PRO</strong> · InvoicePro</div>
                    </body>
                    </html>
                  `);
                  win.document.close();
                  win.focus();
                  setTimeout(() => { win.print(); win.close(); }, 400);
                }}
                style={{
                  background: '#16a34a',
                  color: '#fff', border: 'none', borderRadius: 10,
                  padding: '9px 22px', fontWeight: 600, cursor: 'pointer', fontSize: 14,
                  display: 'flex', alignItems: 'center', gap: 7,
                }}
              >
                <i className="bi bi-printer"></i> Print
              </button>
              <button
                onClick={() => setViewReceipt(null)}
                style={{
                  background: 'linear-gradient(135deg,#1a56db,#7e3af2)',
                  color: '#fff', border: 'none', borderRadius: 10,
                  padding: '9px 24px', fontWeight: 600, cursor: 'pointer', fontSize: 14,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceiptPayment;