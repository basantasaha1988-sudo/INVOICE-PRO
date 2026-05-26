import React, { useState, useEffect, useCallback } from 'react';
import { useDarkMode } from '../App';

const API = import.meta.env.VITE_API_URL || '/api';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const genVPNo = () => {
  const d = new Date();
  return `VP-${d.getFullYear()}-${String(d.getTime()).slice(-5)}`;
};

const VendorPayment = () => {
  const { isDark } = useDarkMode();

  const [suppliers,       setSuppliers]       = useState([]);
  const [paymentMethods,  setPaymentMethods]  = useState([]);
  const [vendorInvoices,  setVendorInvoices]  = useState([]);
  const [payments,        setPayments]        = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [toast,           setToast]           = useState(null);
  const [viewPayment,     setViewPayment]     = useState(null);

  const [form, setForm] = useState({
    vpNo:            genVPNo(),
    vpDate:          new Date().toISOString().split('T')[0],
    supplierID:      '',
    supplierName:    '',
    linkedVIID:      '',
    linkedVINo:      '',
    invoiceTotal:    '',
    paymentMethodID: '',
    paymentAmount:   '',
    discountAmount:  '0',
    referenceNo:     '',
    paymentType:     'againstInvoice',
    status:          'Paid',
    remarks:         '',
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Balance calc ─────────────────────────────────────────────────────────
  const alreadyPaid = payments
    .filter(p => p.LinkedVINo === form.linkedVINo && form.linkedVINo)
    .reduce((s, p) => s + parseFloat(p.PaymentAmount || 0), 0);

  const balance = Math.max(0, parseFloat(form.invoiceTotal || 0) - alreadyPaid - parseFloat(form.discountAmount || 0));

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadDropdowns = useCallback(async () => {
    try {
      const [sRes, pmRes] = await Promise.all([
        fetch(`${API}/suppliers`),
        fetch(`${API}/payment-methods`),
      ]);
      if (sRes.ok)  setSuppliers(await sRes.json());
      if (pmRes.ok) setPaymentMethods(await pmRes.json());
    } catch (err) {
      console.warn('Dropdown load error:', err.message);
    }
  }, []);

  const loadVendorInvoices = useCallback(async (supplierID) => {
    if (!supplierID) { setVendorInvoices([]); return; }
    try {
      const res = await fetch(`${API}/vendor-invoices?supplierId=${supplierID}&status=Unpaid,Partial`);
      if (res.ok) setVendorInvoices(await res.json());
    } catch (err) {
      console.warn('Load vendor invoices error:', err.message);
    }
  }, []);

  const loadPayments = useCallback(async () => {
    try {
      const res = await fetch(`${API}/vendor-payments`);
      if (res.ok) setPayments(await res.json());
    } catch (err) {
      console.warn('Load vendor payments error:', err.message);
    }
  }, []);

  useEffect(() => {
    loadDropdowns();
    loadPayments();
  }, [loadDropdowns, loadPayments]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => {
      const next = { ...prev, [name]: value };

      if (name === 'supplierID') {
        const sup = suppliers.find(s => String(s.SupplierID) === value);
        next.supplierName   = sup?.SupplierName || '';
        next.linkedVIID     = '';
        next.linkedVINo     = '';
        next.invoiceTotal   = '';
        next.paymentAmount  = '';
        loadVendorInvoices(value);
      }

      if (name === 'linkedVIID') {
        const inv = vendorInvoices.find(v => String(v.VIID) === value);
        if (inv) {
          // Compute how much has already been paid
          const paid = payments
            .filter(p => p.LinkedVINo === inv.VINo)
            .reduce((s, p) => s + parseFloat(p.PaymentAmount || 0), 0);
          const bal = Math.max(0, parseFloat(inv.GrandTotal || 0) - paid);
          next.linkedVINo   = inv.VINo;
          next.invoiceTotal = String(inv.GrandTotal || '');
          next.paymentAmount= String(bal);
        }
      }

      return next;
    });
  };

  const resetForm = () => {
    setForm({
      vpNo:            genVPNo(),
      vpDate:          new Date().toISOString().split('T')[0],
      supplierID:      '',
      supplierName:    '',
      linkedVIID:      '',
      linkedVINo:      '',
      invoiceTotal:    '',
      paymentMethodID: '',
      paymentAmount:   '',
      discountAmount:  '0',
      referenceNo:     '',
      paymentType:     'againstInvoice',
      status:          'Paid',
      remarks:         '',
    });
    setVendorInvoices([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.supplierID) return showToast('Please select a supplier', 'error');
    if (!form.paymentAmount || parseFloat(form.paymentAmount) <= 0)
      return showToast('Payment amount must be greater than 0', 'error');

    setLoading(true);
    try {
      const res = await fetch(`${API}/vendor-payments`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      showToast(`✅ Payment ${form.vpNo} saved!`);
      resetForm();
      loadPayments();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this payment record?')) return;
    try {
      const res = await fetch(`${API}/vendor-payments/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('Payment deleted');
      loadPayments();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ── Summary stats ────────────────────────────────────────────────────────
  const totalPaid     = payments.filter(p => p.Status === 'Paid').reduce((s, p) => s + parseFloat(p.PaymentAmount || 0), 0);
  const totalPending  = payments.filter(p => p.Status !== 'Paid').reduce((s, p) => s + parseFloat(p.PaymentAmount || 0), 0);

  const card = {
    background:    isDark ? 'rgba(30,37,51,0.95)' : 'rgba(255,255,255,0.85)',
    backdropFilter:'blur(24px)',
    borderRadius:  20,
    border:        `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)'}`,
    boxShadow:     '0 8px 32px rgba(100,100,200,0.10)',
    padding:       '28px 32px',
    marginBottom:  28,
  };

  const inputStyle = {
    background:   isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.9)',
    border:       `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(26,86,219,0.18)'}`,
    borderRadius: 10,
    color:        isDark ? '#f1f5f9' : '#1e293b',
    padding:      '9px 14px',
    width:        '100%',
    fontSize:     14,
    outline:      'none',
  };

  const labelStyle = {
    fontWeight: 600, fontSize: 13,
    color: isDark ? '#94a3b8' : '#64748b',
    marginBottom: 5, display: 'block',
  };

  const btnPrimary = {
    background: 'linear-gradient(135deg,#16a34a,#0ea5e9)',
    color: '#fff', border: 'none', borderRadius: 10,
    padding: '10px 24px', fontWeight: 700, fontSize: 14,
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
  };

  const statCard = (label, value, color, icon) => (
    <div style={{
      background:    isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.9)',
      border:        `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`,
      borderRadius:  14, padding: '18px 22px',
      display:       'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 160,
    }}>
      <div style={{ background: `${color}20`, borderRadius: 12, padding: 12, display: 'flex' }}>
        <i className={`bi ${icon}`} style={{ color, fontSize: 22 }}></i>
      </div>
      <div>
        <div style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '16px 0', maxWidth: 1300, margin: '0 auto' }}>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.type === 'error' ? '#dc2626' : '#16a34a',
          color: '#fff', padding: '12px 22px', borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)', fontWeight: 600, fontSize: 14,
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'slideIn 0.3s ease',
        }}>
          <i className={`bi ${toast.type === 'error' ? 'bi-x-circle' : 'bi-check-circle'}`}></i>
          {toast.msg}
        </div>
      )}

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontWeight: 800, fontSize: 28, color: isDark ? '#f1f5f9' : '#1e293b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ background: 'linear-gradient(135deg,#16a34a,#0ea5e9)', borderRadius: 12, padding: '8px 12px', display: 'flex' }}>
            <i className="bi bi-cash-stack" style={{ color: '#fff', fontSize: 22 }}></i>
          </span>
          Vendor Payment
        </h2>
        <p style={{ color: isDark ? '#94a3b8' : '#64748b', margin: 0, fontSize: 14 }}>
          Record outgoing payments to suppliers against vendor invoices
        </p>
      </div>

      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        {statCard('Total Payments', `₹${fmt(totalPaid)}`,    '#16a34a', 'bi-check-circle-fill')}
        {statCard('Pending',        `₹${fmt(totalPending)}`, '#f59e0b', 'bi-clock-fill')}
        {statCard('Transactions',   payments.length,         '#1a56db', 'bi-list-check')}
      </div>

      {/* ── Payment Form ──────────────────────────────────────────────────── */}
      <div style={card}>
        <h5 style={{ fontWeight: 700, fontSize: 16, marginBottom: 22, color: isDark ? '#f1f5f9' : '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="bi bi-plus-circle text-success"></i> New Vendor Payment
        </h5>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, marginBottom: 16 }}>

            <div>
              <label style={labelStyle}>Payment No</label>
              <input style={{ ...inputStyle, fontWeight: 700, color: '#16a34a' }}
                name="vpNo" value={form.vpNo} onChange={handleChange} required />
            </div>

            <div>
              <label style={labelStyle}>Payment Date <span style={{ color: '#dc2626' }}>*</span></label>
              <input style={inputStyle} type="date" name="vpDate" value={form.vpDate} onChange={handleChange} required />
            </div>

            <div>
              <label style={labelStyle}>Supplier <span style={{ color: '#dc2626' }}>*</span></label>
              <select style={inputStyle} name="supplierID" value={form.supplierID} onChange={handleChange} required>
                <option value="">— Select Supplier —</option>
                {suppliers.map(s => (
                  <option key={s.SupplierID} value={s.SupplierID}>{s.SupplierName}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Vendor Invoice (optional)</label>
              <select style={inputStyle} name="linkedVIID" value={form.linkedVIID} onChange={handleChange}
                disabled={!form.supplierID || vendorInvoices.length === 0}>
                <option value="">— Against Advance / No Invoice —</option>
                {vendorInvoices.map(v => (
                  <option key={v.VIID} value={v.VIID}>
                    {v.VINo} · ₹{fmt(v.GrandTotal)} · {v.Status}
                  </option>
                ))}
              </select>
              {form.supplierID && vendorInvoices.length === 0 && (
                <small style={{ color: '#94a3b8', fontSize: 11, marginTop: 3, display: 'block' }}>No unpaid invoices found for this supplier</small>
              )}
            </div>

            <div>
              <label style={labelStyle}>Invoice Total (₹)</label>
              <input style={{ ...inputStyle, color: '#1a56db', fontWeight: 700 }}
                type="number" name="invoiceTotal" value={form.invoiceTotal}
                onChange={handleChange} placeholder="0.00" readOnly={!!form.linkedVIID} />
            </div>

            <div>
              <label style={labelStyle}>Payment Amount (₹) <span style={{ color: '#dc2626' }}>*</span></label>
              <input style={{ ...inputStyle, fontWeight: 700, color: '#16a34a' }}
                type="number" step="0.01" name="paymentAmount" value={form.paymentAmount}
                onChange={handleChange} required placeholder="0.00" />
            </div>

            <div>
              <label style={labelStyle}>Discount / Adjustment (₹)</label>
              <input style={inputStyle} type="number" step="0.01" name="discountAmount"
                value={form.discountAmount} onChange={handleChange} placeholder="0.00" />
            </div>

            <div>
              <label style={labelStyle}>Balance Due (₹)</label>
              <div style={{ ...inputStyle, color: balance > 0 ? '#dc2626' : '#16a34a', fontWeight: 800, fontSize: 16 }}>
                ₹{fmt(balance)}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Payment Method <span style={{ color: '#dc2626' }}>*</span></label>
              <select style={inputStyle} name="paymentMethodID" value={form.paymentMethodID} onChange={handleChange} required>
                <option value="">— Select Method —</option>
                {paymentMethods.map(p => (
                  <option key={p.PaymentMethodID} value={p.PaymentMethodID}>{p.MethodName}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Reference No / UTR</label>
              <input style={inputStyle} name="referenceNo" value={form.referenceNo}
                onChange={handleChange} placeholder="Cheque / UPI / NEFT ref" />
            </div>

            <div>
              <label style={labelStyle}>Payment Type</label>
              <select style={inputStyle} name="paymentType" value={form.paymentType} onChange={handleChange}>
                <option value="againstInvoice">Against Invoice</option>
                <option value="advance">Advance</option>
                <option value="fullSettlement">Full Settlement</option>
                <option value="partialPayment">Partial Payment</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Status</label>
              <select style={inputStyle} name="status" value={form.status} onChange={handleChange}>
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

          </div>

          <div style={{ marginBottom: 22 }}>
            <label style={labelStyle}>Remarks</label>
            <textarea style={{ ...inputStyle, height: 64, resize: 'vertical' }}
              name="remarks" value={form.remarks} onChange={handleChange}
              placeholder="Payment notes, bank details, instructions..." />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="submit" style={btnPrimary} disabled={loading}>
              <i className="bi bi-check-circle"></i>
              {loading ? 'Saving…' : 'Save Vendor Payment'}
            </button>
            <button type="button" onClick={resetForm} style={{
              ...btnPrimary,
              background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(22,163,74,0.1)',
              color: isDark ? '#6ee7b7' : '#16a34a',
            }}>
              <i className="bi bi-arrow-clockwise"></i> Reset
            </button>
          </div>
        </form>
      </div>

      {/* ── Payment Records ───────────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <h5 style={{ fontWeight: 700, fontSize: 16, margin: 0, color: isDark ? '#f1f5f9' : '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="bi bi-list-ul text-success"></i>
            Payment History{' '}
            <span className="badge bg-success ms-1">{payments.length}</span>
          </h5>
          <button onClick={loadPayments} style={{ ...btnPrimary, background: 'rgba(22,163,74,0.1)', color: '#16a34a', padding: '7px 16px' }}>
            <i className="bi bi-arrow-clockwise"></i> Refresh
          </button>
        </div>

        {payments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: isDark ? '#64748b' : '#94a3b8' }}>
            <i className="bi bi-cash-stack" style={{ fontSize: 48, display: 'block', marginBottom: 12 }}></i>
            <div style={{ fontSize: 16, fontWeight: 600 }}>No payments recorded yet</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: isDark ? 'rgba(22,163,74,0.15)' : 'rgba(22,163,74,0.07)' }}>
                  {['Date', 'VP No', 'Supplier', 'Invoice', 'Method', 'Amount', 'Discount', 'Type', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', fontWeight: 700, color: isDark ? '#6ee7b7' : '#16a34a', whiteSpace: 'nowrap',
                      borderBottom: `2px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(22,163,74,0.2)'}`,
                      textAlign: h === 'Amount' || h === 'Discount' ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.VPID} style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'}`, transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(22,163,74,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '9px 12px', color: isDark ? '#94a3b8' : '#64748b' }}><small>{String(p.VPDate || '').split('T')[0]}</small></td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ background: 'rgba(22,163,74,0.15)', color: '#16a34a', borderRadius: 6, padding: '2px 8px', fontWeight: 700, fontSize: 12 }}>{p.VPNo}</span>
                    </td>
                    <td style={{ padding: '9px 12px', fontWeight: 600 }}>{p.SupplierName}</td>
                    <td style={{ padding: '9px 12px', color: isDark ? '#94a3b8' : '#64748b' }}><small>{p.LinkedVINo || '—'}</small></td>
                    <td style={{ padding: '9px 12px' }}><span className="badge bg-info text-dark">{p.PaymentMethod || '—'}</span></td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>₹{fmt(p.PaymentAmount)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: '#f59e0b' }}>₹{fmt(p.DiscountAmount)}</td>
                    <td style={{ padding: '9px 12px' }}><small style={{ color: isDark ? '#94a3b8' : '#64748b' }}>{p.PaymentType}</small></td>
                    <td style={{ padding: '9px 12px' }}>
                      <span className={`badge ${p.Status === 'Paid' ? 'bg-success' : p.Status === 'Pending' ? 'bg-warning text-dark' : 'bg-danger'}`}>
                        {p.Status}
                      </span>
                    </td>
                    <td style={{ padding: '9px 8px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setViewPayment(p)} style={{ background: 'rgba(22,163,74,0.12)', border: 'none', borderRadius: 7, color: '#16a34a', padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          <i className="bi bi-eye"></i>
                        </button>
                        <button onClick={() => handleDelete(p.VPID)} style={{ background: 'rgba(220,38,38,0.12)', border: 'none', borderRadius: 7, color: '#dc2626', padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          <i className="bi bi-trash3"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: isDark ? 'rgba(22,163,74,0.1)' : 'rgba(22,163,74,0.05)', fontWeight: 800 }}>
                  <td colSpan="5" style={{ padding: '10px 12px', color: isDark ? '#94a3b8' : '#64748b' }}>
                    Total ({payments.length} payments)
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#16a34a', fontSize: 15 }}>
                    ₹{fmt(payments.reduce((s, p) => s + parseFloat(p.PaymentAmount || 0), 0))}
                  </td>
                  <td colSpan="4"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── View Payment Modal ────────────────────────────────────────────── */}
      {viewPayment && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setViewPayment(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: isDark ? '#1e2533' : '#fff', color: isDark ? '#f1f5f9' : '#1e293b',
            borderRadius: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', width: '100%', maxWidth: 500, overflow: 'hidden',
          }}>
            <div style={{ background: 'linear-gradient(135deg,#16a34a,#0ea5e9)', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="bi bi-cash-stack" style={{ color: '#fff', fontSize: 22 }}></i>
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Payment Details</div>
                  <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{viewPayment.VPNo}</div>
                </div>
              </div>
              <button onClick={() => setViewPayment(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', width: 32, height: 32, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              {[
                { label: 'Payment No',   value: viewPayment.VPNo,                               icon: 'bi-hash' },
                { label: 'Date',         value: String(viewPayment.VPDate||'').split('T')[0],    icon: 'bi-calendar3' },
                { label: 'Supplier',     value: viewPayment.SupplierName,                        icon: 'bi-building' },
                { label: 'Invoice',      value: viewPayment.LinkedVINo || '—',                   icon: 'bi-file-text' },
                { label: 'Amount Paid',  value: `₹${fmt(viewPayment.PaymentAmount)}`,            icon: 'bi-currency-rupee', green: true },
                { label: 'Discount',     value: `₹${fmt(viewPayment.DiscountAmount)}`,           icon: 'bi-tag' },
                { label: 'Method',       value: viewPayment.PaymentMethod || '—',               icon: 'bi-credit-card' },
                { label: 'Ref No',       value: viewPayment.ReferenceNo || '—',                 icon: 'bi-upc' },
                { label: 'Type',         value: viewPayment.PaymentType,                         icon: 'bi-arrow-left-right' },
                { label: 'Status',       value: viewPayment.Status,                              icon: 'bi-info-circle' },
                { label: 'Remarks',      value: viewPayment.Remarks || '—',                      icon: 'bi-chat-left-text' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9'}` }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: isDark ? '#94a3b8' : '#64748b', fontSize: 13 }}>
                    <i className={`bi ${row.icon}`}></i> {row.label}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 13, color: row.green ? '#16a34a' : undefined }}>{row.value}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setViewPayment(null)} style={{ background: 'linear-gradient(135deg,#16a34a,#0ea5e9)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 24px', fontWeight: 700, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes slideIn{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}`}</style>
    </div>
  );
};

export default VendorPayment;