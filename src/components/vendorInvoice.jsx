import React, { useState, useEffect, useCallback } from 'react';
import { useDarkMode } from '../App';

const API = import.meta.env.VITE_API_URL || '/api';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const genVINo = () => {
  const d = new Date();
  return `VI-${d.getFullYear()}-${String(d.getTime()).slice(-5)}`;
};

const emptyItem = () => ({ itemName: '', qty: 1, unitPrice: 0, taxPct: 0 });

const VendorInvoice = () => {
  const { isDark } = useDarkMode();

  const [suppliers,      setSuppliers]      = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [invoices,       setInvoices]       = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [toast,          setToast]          = useState(null);
  const [viewInvoice,    setViewInvoice]    = useState(null);

  const [form, setForm] = useState({
    viNo:           genVINo(),
    viDate:         new Date().toISOString().split('T')[0],
    supplierID:     '',
    supplierName:   '',
    paymentMethodID:'',
    dueDate:        '',
    referenceNo:    '',
    status:         'Unpaid',
    notes:          '',
  });

  const [items, setItems] = useState([emptyItem()]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

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

  const loadInvoices = useCallback(async () => {
    try {
      const res = await fetch(`${API}/vendor-invoices`);
      if (res.ok) setInvoices(await res.json());
    } catch (err) {
      console.warn('Load vendor invoices error:', err.message);
    }
  }, []);

  useEffect(() => {
    loadDropdowns();
    loadInvoices();
  }, [loadDropdowns, loadInvoices]);

  // ── Computed totals ───────────────────────────────────────────────────────
  const lineTotal    = (it) => parseFloat(it.qty || 0) * parseFloat(it.unitPrice || 0);
  const lineTax      = (it) => lineTotal(it) * (parseFloat(it.taxPct || 0) / 100);
  const lineNet      = (it) => lineTotal(it) + lineTax(it);
  const subtotal     = items.reduce((s, it) => s + lineTotal(it), 0);
  const totalTax     = items.reduce((s, it) => s + lineTax(it), 0);
  const grandTotal   = subtotal + totalTax;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'supplierID') {
        const sup = suppliers.find(s => String(s.SupplierID) === value);
        next.supplierName = sup?.SupplierName || '';
      }
      return next;
    });
  };

  const handleItemChange = (idx, field, value) => {
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const addItem    = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const resetForm = () => {
    setForm({
      viNo:           genVINo(),
      viDate:         new Date().toISOString().split('T')[0],
      supplierID:     '',
      supplierName:   '',
      paymentMethodID:'',
      dueDate:        '',
      referenceNo:    '',
      status:         'Unpaid',
      notes:          '',
    });
    setItems([emptyItem()]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.supplierID) return showToast('Please select a supplier', 'error');
    const validItems = items.filter(it => it.itemName?.trim());
    if (!validItems.length) return showToast('Add at least one item', 'error');

    setLoading(true);
    try {
      const payload = {
        ...form,
        subtotal,
        totalTax,
        grandTotal,
        items: validItems,
      };
      const res = await fetch(`${API}/vendor-invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      showToast(`✅ Vendor Invoice ${form.viNo} saved!`);
      resetForm();
      loadInvoices();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this vendor invoice?')) return;
    try {
      const res = await fetch(`${API}/vendor-invoices/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('Vendor invoice deleted');
      loadInvoices();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      const res = await fetch(`${API}/vendor-invoices/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast(`Status updated to ${status}`);
      loadInvoices();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ── Status badge ─────────────────────────────────────────────────────────
  const statusBadge = (s) => {
    const map = {
      Unpaid:    'bg-warning text-dark',
      Paid:      'bg-success',
      Partial:   'bg-info text-dark',
      Cancelled: 'bg-danger',
      Overdue:   'bg-danger',
    };
    return map[s] || 'bg-secondary';
  };

  const card = {
    background:   isDark ? 'rgba(30,37,51,0.95)' : 'rgba(255,255,255,0.85)',
    backdropFilter: 'blur(24px)',
    borderRadius: 20,
    border:       `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)'}`,
    boxShadow:    '0 8px 32px rgba(100,100,200,0.10)',
    padding:      '28px 32px',
    marginBottom: 28,
  };

  const inputStyle = {
    background:   isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.9)',
    border:       `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(26,86,219,0.18)'}`,
    borderRadius: 10,
    color:        isDark ? '#f1f5f9' : '#1e293b',
    padding:      '8px 14px',
    width:        '100%',
    fontSize:     14,
    outline:      'none',
    transition:   'border-color 0.2s',
  };

  const labelStyle = {
    fontWeight:   600,
    fontSize:     13,
    color:        isDark ? '#94a3b8' : '#64748b',
    marginBottom: 5,
    display:      'block',
  };

  const btnPrimary = {
    background:   'linear-gradient(135deg,#1a56db,#7e3af2)',
    color:        '#fff',
    border:       'none',
    borderRadius: 10,
    padding:      '10px 24px',
    fontWeight:   700,
    fontSize:     14,
    cursor:       'pointer',
    display:      'flex',
    alignItems:   'center',
    gap:          8,
  };

  return (
    <div style={{ padding: '16px 0', maxWidth: 1300, margin: '0 auto' }}>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position:     'fixed', top: 20, right: 20, zIndex: 9999,
          background:   toast.type === 'error' ? '#dc2626' : '#16a34a',
          color:        '#fff', padding: '12px 22px', borderRadius: 12,
          boxShadow:    '0 8px 24px rgba(0,0,0,0.2)',
          fontWeight:   600, fontSize: 14,
          display:      'flex', alignItems: 'center', gap: 10,
          animation:    'slideIn 0.3s ease',
        }}>
          <i className={`bi ${toast.type === 'error' ? 'bi-x-circle' : 'bi-check-circle'}`}></i>
          {toast.msg}
        </div>
      )}

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontWeight: 800, fontSize: 28, color: isDark ? '#f1f5f9' : '#1e293b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)', borderRadius: 12, padding: '8px 12px', display: 'flex' }}>
            <i className="bi bi-file-earmark-text" style={{ color: '#fff', fontSize: 22 }}></i>
          </span>
          Vendor Invoice
        </h2>
        <p style={{ color: isDark ? '#94a3b8' : '#64748b', margin: 0, fontSize: 14 }}>
          Record purchase invoices from suppliers with itemised billing
        </p>
      </div>

      {/* ── New Invoice Form ──────────────────────────────────────────────── */}
      <div style={card}>
        <h5 style={{ fontWeight: 700, fontSize: 16, marginBottom: 22, color: isDark ? '#f1f5f9' : '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="bi bi-plus-circle text-warning"></i> New Vendor Invoice
        </h5>

        <form onSubmit={handleSubmit}>
          {/* Header Row 1 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>VI Number</label>
              <input style={{ ...inputStyle, fontWeight: 700, color: '#1a56db' }}
                name="viNo" value={form.viNo} onChange={handleFormChange} required />
            </div>
            <div>
              <label style={labelStyle}>Invoice Date <span style={{ color: '#dc2626' }}>*</span></label>
              <input style={inputStyle} type="date" name="viDate" value={form.viDate} onChange={handleFormChange} required />
            </div>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input style={inputStyle} type="date" name="dueDate" value={form.dueDate} onChange={handleFormChange} />
            </div>
            <div>
              <label style={labelStyle}>Supplier <span style={{ color: '#dc2626' }}>*</span></label>
              <select style={inputStyle} name="supplierID" value={form.supplierID} onChange={handleFormChange} required>
                <option value="">— Select Supplier —</option>
                {suppliers.map(s => (
                  <option key={s.SupplierID} value={s.SupplierID}>{s.SupplierName}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Payment Method</label>
              <select style={inputStyle} name="paymentMethodID" value={form.paymentMethodID} onChange={handleFormChange}>
                <option value="">— Select Method —</option>
                {paymentMethods.map(p => (
                  <option key={p.PaymentMethodID} value={p.PaymentMethodID}>{p.MethodName}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Reference No</label>
              <input style={inputStyle} name="referenceNo" value={form.referenceNo} onChange={handleFormChange} placeholder="Supplier bill / PO ref" />
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select style={inputStyle} name="status" value={form.status} onChange={handleFormChange}>
                <option value="Unpaid">Unpaid</option>
                <option value="Paid">Paid</option>
                <option value="Partial">Partial</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Items Table */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Line Items</label>
              <button type="button" onClick={addItem} style={{
                background: 'rgba(26,86,219,0.12)', border: 'none', borderRadius: 8,
                color: '#1a56db', fontWeight: 700, fontSize: 13, padding: '6px 14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <i className="bi bi-plus-lg"></i> Add Row
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: isDark ? 'rgba(26,86,219,0.2)' : 'rgba(26,86,219,0.07)' }}>
                    {['#', 'Item / Description', 'Qty', 'Unit Price (₹)', 'Tax %', 'Amount (₹)', ''].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: h.includes('₹') ? 'right' : 'left', fontWeight: 700, color: isDark ? '#93c5fd' : '#1a56db', whiteSpace: 'nowrap', borderBottom: `2px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(26,86,219,0.15)'}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'}` }}>
                      <td style={{ padding: '8px 12px', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ padding: '8px 8px' }}>
                        <input
                          style={{ ...inputStyle, minWidth: 160 }}
                          placeholder="Item name / description"
                          value={it.itemName}
                          onChange={e => handleItemChange(idx, 'itemName', e.target.value)}
                        />
                      </td>
                      <td style={{ padding: '8px 8px' }}>
                        <input style={{ ...inputStyle, width: 80, textAlign: 'right' }} type="number" min="0" step="0.001"
                          value={it.qty} onChange={e => handleItemChange(idx, 'qty', e.target.value)} />
                      </td>
                      <td style={{ padding: '8px 8px' }}>
                        <input style={{ ...inputStyle, width: 110, textAlign: 'right' }} type="number" min="0" step="0.01"
                          value={it.unitPrice} onChange={e => handleItemChange(idx, 'unitPrice', e.target.value)} />
                      </td>
                      <td style={{ padding: '8px 8px' }}>
                        <input style={{ ...inputStyle, width: 70, textAlign: 'right' }} type="number" min="0" max="100" step="0.01"
                          value={it.taxPct} onChange={e => handleItemChange(idx, 'taxPct', e.target.value)} />
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>
                        ₹{fmt(lineNet(it))}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(idx)} style={{
                            background: 'rgba(220,38,38,0.12)', border: 'none', borderRadius: 8,
                            color: '#dc2626', width: 28, height: 28, cursor: 'pointer', fontSize: 14,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <i className="bi bi-trash3"></i>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="5" style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b', fontSize: 13 }}>Subtotal</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>₹{fmt(subtotal)}</td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan="5" style={{ padding: '4px 12px', textAlign: 'right', fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b', fontSize: 13 }}>Tax</td>
                    <td style={{ padding: '4px 12px', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>₹{fmt(totalTax)}</td>
                    <td></td>
                  </tr>
                  <tr style={{ background: isDark ? 'rgba(26,86,219,0.15)' : 'rgba(26,86,219,0.06)' }}>
                    <td colSpan="5" style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 800, fontSize: 15, color: isDark ? '#f1f5f9' : '#1e293b' }}>Grand Total</td>
                    <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 900, fontSize: 16, color: '#1a56db' }}>₹{fmt(grandTotal)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 22 }}>
            <label style={labelStyle}>Notes</label>
            <textarea
              style={{ ...inputStyle, height: 72, resize: 'vertical' }}
              name="notes" value={form.notes} onChange={handleFormChange}
              placeholder="Additional notes, payment terms, delivery details..."
            />
          </div>

          {/* Submit */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="submit" style={btnPrimary} disabled={loading}>
              <i className="bi bi-check-circle"></i>
              {loading ? 'Saving…' : 'Save Vendor Invoice'}
            </button>
            <button type="button" onClick={resetForm} style={{
              ...btnPrimary,
              background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(26,86,219,0.1)',
              color: isDark ? '#93c5fd' : '#1a56db',
            }}>
              <i className="bi bi-arrow-clockwise"></i> Reset
            </button>
          </div>
        </form>
      </div>

      {/* ── Invoice List ──────────────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <h5 style={{ fontWeight: 700, fontSize: 16, margin: 0, color: isDark ? '#f1f5f9' : '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="bi bi-list-ul text-warning"></i>
            Vendor Invoices{' '}
            <span className="badge bg-warning text-dark ms-1">{invoices.length}</span>
          </h5>
          <button onClick={loadInvoices} style={{ ...btnPrimary, background: 'rgba(26,86,219,0.1)', color: '#1a56db', padding: '7px 16px' }}>
            <i className="bi bi-arrow-clockwise"></i> Refresh
          </button>
        </div>

        {invoices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: isDark ? '#64748b' : '#94a3b8' }}>
            <i className="bi bi-file-earmark-text" style={{ fontSize: 48, display: 'block', marginBottom: 12 }}></i>
            <div style={{ fontSize: 16, fontWeight: 600 }}>No vendor invoices yet</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: isDark ? 'rgba(26,86,219,0.2)' : 'rgba(26,86,219,0.06)' }}>
                  {['Date', 'VI No', 'Supplier', 'Ref', 'Subtotal', 'Tax', 'Total', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', fontWeight: 700, color: isDark ? '#93c5fd' : '#1a56db', whiteSpace: 'nowrap', borderBottom: `2px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(26,86,219,0.15)'}`, textAlign: ['Subtotal','Tax','Total'].includes(h) ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.VIID} style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'}`, transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(26,86,219,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '9px 12px', color: isDark ? '#94a3b8' : '#64748b' }}><small>{String(inv.VIDate || '').split('T')[0]}</small></td>
                    <td style={{ padding: '9px 12px' }}><span style={{ background: 'rgba(245,158,11,0.15)', color: '#d97706', borderRadius: 6, padding: '2px 8px', fontWeight: 700, fontSize: 12 }}>{inv.VINo}</span></td>
                    <td style={{ padding: '9px 12px', fontWeight: 600 }}>{inv.SupplierName}</td>
                    <td style={{ padding: '9px 12px', color: isDark ? '#94a3b8' : '#64748b' }}><small>{inv.ReferenceNo || '—'}</small></td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' }}>₹{fmt(inv.Subtotal)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: '#f59e0b' }}>₹{fmt(inv.TotalTax)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: '#1a56db' }}>₹{fmt(inv.GrandTotal)}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <select
                        value={inv.Status}
                        onChange={e => handleStatusChange(inv.VIID, e.target.value)}
                        style={{ background: 'transparent', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', outline: 'none',
                          color: inv.Status === 'Paid' ? '#16a34a' : inv.Status === 'Unpaid' ? '#d97706' : inv.Status === 'Overdue' ? '#dc2626' : '#0ea5e9'
                        }}
                      >
                        {['Unpaid','Paid','Partial','Cancelled','Overdue'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '9px 8px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setViewInvoice(inv)} style={{ background: 'rgba(26,86,219,0.12)', border: 'none', borderRadius: 7, color: '#1a56db', padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          <i className="bi bi-eye"></i>
                        </button>
                        <button onClick={() => handleDelete(inv.VIID)} style={{ background: 'rgba(220,38,38,0.12)', border: 'none', borderRadius: 7, color: '#dc2626', padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          <i className="bi bi-trash3"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: isDark ? 'rgba(26,86,219,0.1)' : 'rgba(26,86,219,0.05)', fontWeight: 800 }}>
                  <td colSpan="6" style={{ padding: '10px 12px', color: isDark ? '#94a3b8' : '#64748b' }}>
                    Total ({invoices.length} invoices)
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#1a56db', fontSize: 15 }}>
                    ₹{fmt(invoices.reduce((s, i) => s + parseFloat(i.GrandTotal || 0), 0))}
                  </td>
                  <td colSpan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── View Invoice Modal ────────────────────────────────────────────── */}
      {viewInvoice && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setViewInvoice(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: isDark ? '#1e2533' : '#fff',
            color: isDark ? '#f1f5f9' : '#1e293b',
            borderRadius: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            width: '100%', maxWidth: 500, overflow: 'hidden',
          }}>
            <div style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="bi bi-file-earmark-text" style={{ color: '#fff', fontSize: 22 }}></i>
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Vendor Invoice</div>
                  <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{viewInvoice.VINo}</div>
                </div>
              </div>
              <button onClick={() => setViewInvoice(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', width: 32, height: 32, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              {[
                { label: 'VI No',        value: viewInvoice.VINo,                               icon: 'bi-hash' },
                { label: 'Date',         value: String(viewInvoice.VIDate||'').split('T')[0],    icon: 'bi-calendar3' },
                { label: 'Supplier',     value: viewInvoice.SupplierName,                        icon: 'bi-building' },
                { label: 'Reference',    value: viewInvoice.ReferenceNo || '—',                  icon: 'bi-upc' },
                { label: 'Subtotal',     value: `₹${fmt(viewInvoice.Subtotal)}`,                 icon: 'bi-receipt' },
                { label: 'Tax',          value: `₹${fmt(viewInvoice.TotalTax)}`,                 icon: 'bi-percent' },
                { label: 'Grand Total',  value: `₹${fmt(viewInvoice.GrandTotal)}`,               icon: 'bi-currency-rupee', bold: true },
                { label: 'Status',       value: viewInvoice.Status,                              icon: 'bi-info-circle' },
                { label: 'Notes',        value: viewInvoice.Notes || '—',                        icon: 'bi-chat-left-text' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9'}` }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: isDark ? '#94a3b8' : '#64748b', fontSize: 13 }}>
                    <i className={`bi ${row.icon}`}></i> {row.label}
                  </span>
                  <span style={{ fontWeight: row.bold ? 800 : 600, fontSize: row.bold ? 16 : 14, color: row.bold ? '#f59e0b' : undefined }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setViewInvoice(null)} style={{ ...btnPrimary, background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes slideIn{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}`}</style>
    </div>
  );
};

export default VendorInvoice;