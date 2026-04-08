import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../App';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { v4 as uuidv4 } from 'uuid';
import { useItemMaster } from '../contexts/ItemMasterContext';
import { useCompanyMaster } from '../contexts/CompanyMasterContext';

// ─── GST rates as per Indian GST slabs ───────────────────────────────────────
const GST_SLABS = [0, 5, 12, 18, 28];
// Fixed

// ─── Bill number generator ────────────────────────────────────────────────────
const generateBillNo = () => {
  const prefix = 'INV';
  const year = new Date().getFullYear().toString().slice(-2);
  const num = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefix}-${year}-${num}`;
};

// ─── Helper: split GST into CGST + SGST or IGST ──────────────────────────────
const splitGST = (taxAmt, isInterState) => {
  if (isInterState) return { igst: taxAmt, cgst: 0, sgst: 0 };
  return { igst: 0, cgst: taxAmt / 2, sgst: taxAmt / 2 };
};

const SaleInvoice = ({ onNavigateToInventory }) => {
  const { currentTheme } = useTheme();
  const { items: itemMaster, setItems: setItemMaster } = useItemMaster();
  const { companies: companyMaster } = useCompanyMaster();

  // ── View state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'list'
  const [preview, setPreview] = useState(false);
  const previewRef = useRef(null);

  // ── GST mode ────────────────────────────────────────────────────────────────
  const [gstMode, setGstMode] = useState('inclusive'); // 'inclusive' | 'exclusive' | 'none'
  const [isInterState, setIsInterState] = useState(false); // IGST vs CGST+SGST

  // ── Company ─────────────────────────────────────────────────────────────────
  const [company, setCompany] = useState({
    name: '', address: '', city: '', state: '', pincode: '',
    gstin: '', phone: '', email: '', logo: null
  });

  // ── Customer ────────────────────────────────────────────────────────────────
  const [customer, setCustomer] = useState({
    name: '', address: '', city: '', state: '', pincode: '',
    gstin: '', phone: ''
  });

  // ── Bill meta ───────────────────────────────────────────────────────────────
  const [billNo, setBillNo] = useState(generateBillNo());
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [editingBillId, setEditingBillId] = useState(null);

  // ── Items ───────────────────────────────────────────────────────────────────
  const [items, setItems] = useState([
    { id: uuidv4(), name: '', hsn: '', qty: 1, unit: 'Nos', rate: 0, disc: 0, gstPercent: 18 }
  ]);

  // ── Saved bills ─────────────────────────────────────────────────────────────
  const [bills, setBills] = useState([]);
  const [stockWarnings, setStockWarnings] = useState([]);
  const [searchBill, setSearchBill] = useState('');

  // ── Load / save ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('sale_bills');
    if (saved) setBills(JSON.parse(saved));
    const savedCo = localStorage.getItem('invoice_company');
    if (savedCo) setCompany(JSON.parse(savedCo));
  }, []);

  useEffect(() => {
    localStorage.setItem('sale_bills', JSON.stringify(bills));
  }, [bills]);

  useEffect(() => {
    localStorage.setItem('invoice_company', JSON.stringify(company));
  }, [company]);

  // ── Stock warnings ──────────────────────────────────────────────────────────
  useEffect(() => {
    const w = [];
    items.forEach(item => {
      if (!item.name) return;
      const m = itemMaster.find(x => x.name === item.name);
      if (m && item.qty > (m.stock || 0))
        w.push(`"${item.name}" — need ${item.qty}, only ${m.stock || 0} in stock`);
    });
    setStockWarnings(w);
  }, [items, itemMaster]);

  // ── Calculations ────────────────────────────────────────────────────────────
  const calcItem = useCallback((item) => {
    const gross = item.qty * item.rate;
    const discAmt = gross * (item.disc / 100);
    const afterDisc = gross - discAmt;

    let taxable = afterDisc, taxAmt = 0;
    if (gstMode === 'exclusive') {
      taxable = afterDisc;
      taxAmt = taxable * (item.gstPercent / 100);
    } else if (gstMode === 'inclusive') {
      taxable = afterDisc / (1 + item.gstPercent / 100);
      taxAmt = afterDisc - taxable;
    }
    // gstMode === 'none': no tax

    const gst = splitGST(taxAmt, isInterState);
    return { gross, discAmt, taxable, taxAmt, ...gst, total: taxable + taxAmt };
  }, [gstMode, isInterState]);

  const summary = useCallback(() => {
    const rows = items.map(calcItem);
    return rows.reduce((acc, r) => ({
      gross: acc.gross + r.gross,
      disc: acc.disc + r.discAmt,
      taxable: acc.taxable + r.taxable,
      cgst: acc.cgst + r.cgst,
      sgst: acc.sgst + r.sgst,
      igst: acc.igst + r.igst,
      tax: acc.tax + r.taxAmt,
      total: acc.total + r.total,
    }), { gross: 0, disc: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 0 });
  }, [items, calcItem]);

  const totals = summary();

  // ── Item actions ─────────────────────────────────────────────────────────────
  const addItem = () => setItems(p => [...p, { id: uuidv4(), name: '', hsn: '', qty: 1, unit: 'Nos', rate: 0, disc: 0, gstPercent: 18 }]);
  const removeItem = (id) => setItems(p => p.filter(x => x.id !== id));
  const updateItem = (id, field, value) => setItems(p => p.map(x => x.id === id ? { ...x, [field]: value } : x));

  const handleItemSelect = (id, name) => {
    const m = itemMaster.find(x => x.name === name);
    if (m) {
      setItems(p => p.map(x => x.id === id ? {
        ...x, name: m.name, rate: m.defaultRate || 0,
        gstPercent: m.defaultTaxPercent || 18, hsn: m.hsn || ''
      } : x));
    } else {
      updateItem(id, 'name', name);
    }
  };

  // ── Company select ──────────────────────────────────────────────────────────
  const handleCompanySelect = (name) => {
    const c = companyMaster.find(x => x.name === name);
    if (c) setCompany(prev => ({ ...prev, name: c.name, address: c.address || '', gstin: c.gstin || '', logo: c.logo || prev.logo }));
  };

  // ── Logo upload ─────────────────────────────────────────────────────────────
  const handleLogo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Max 2MB'); return; }
    const reader = new FileReader();
    reader.onload = ev => setCompany(p => ({ ...p, logo: ev.target.result }));
    reader.readAsDataURL(file);
  };

  // ── Stock deduction ──────────────────────────────────────────────────────────
  const deductStock = useCallback((billItems) => {
    setItemMaster(prev => prev.map(m => {
      const bi = billItems.find(b => b.name === m.name);
      return bi ? { ...m, stock: Math.max(0, (m.stock || 0) - bi.qty) } : m;
    }));
  }, [setItemMaster]);

  const restoreStock = useCallback((billItems) => {
    setItemMaster(prev => prev.map(m => {
      const bi = billItems.find(b => b.name === m.name);
      return bi ? { ...m, stock: (m.stock || 0) + bi.qty } : m;
    }));
  }, [setItemMaster]);

  // ── Save bill ────────────────────────────────────────────────────────────────
  const saveBill = useCallback(() => {
    if (!company.name.trim()) { alert('Please enter company name'); return; }
    if (!customer.name.trim()) { alert('Please enter customer name'); return; }
    if (items.every(i => !i.name)) { alert('Please add at least one item'); return; }

    if (stockWarnings.length > 0) {
      if (!window.confirm(`Stock warning:\n${stockWarnings.join('\n')}\n\nSave anyway?`)) return;
    }

    const bill = {
      id: editingBillId || uuidv4(),
      billNo, billDate, dueDate, notes,
      company, customer, items, totals, gstMode, isInterState,
      savedAt: new Date().toISOString()
    };

    if (editingBillId) {
      const old = bills.find(b => b.id === editingBillId);
      if (old) restoreStock(old.items);
      setBills(p => p.map(b => b.id === editingBillId ? bill : b));
    } else {
      setBills(p => [bill, ...p]);
    }

    deductStock(items);
    resetForm();
    setActiveTab('list');
    alert('✅ Bill saved successfully!');
  }, [company, customer, items, totals, billNo, billDate, dueDate, notes, gstMode, isInterState, editingBillId, bills, stockWarnings, deductStock, restoreStock, setActiveTab]);

  // ── Edit / Delete ────────────────────────────────────────────────────────────
  const editBill = (bill) => {
    setActiveTab('new');
    setCompany(bill.company);
    setCustomer(bill.customer);
    setItems(bill.items.map(i => ({ ...i })));
    setBillNo(bill.billNo);
    setBillDate(bill.billDate);
    setDueDate(bill.dueDate || '');
    setNotes(bill.notes || '');
    setGstMode(bill.gstMode || 'exclusive');
    setIsInterState(bill.isInterState || false);
    setEditingBillId(bill.id);
    setPreview(false);
  };

  const deleteBill = (id) => {
    if (!window.confirm('Delete this bill?')) return;
    const bill = bills.find(b => b.id === id);
    if (bill) restoreStock(bill.items);
    setBills(p => p.filter(b => b.id !== id));
  };

  // ── Reset ────────────────────────────────────────────────────────────────────
  const resetForm = () => {
    setCustomer({ name: '', address: '', city: '', state: '', pincode: '', gstin: '', phone: '' });
    setItems([{ id: uuidv4(), name: '', hsn: '', qty: 1, unit: 'Nos', rate: 0, disc: 0, gstPercent: 18 }]);
    setBillNo(generateBillNo());
    setBillDate(new Date().toISOString().slice(0, 10));
    setDueDate('');
    setNotes('');
    setEditingBillId(null);
    setPreview(false);
    setStockWarnings([]);
  };

  // ── PDF ──────────────────────────────────────────────────────────────────────
  const generatePDF = async () => {
    const el = previewRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2 });
    const img = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const w = 210, h = (canvas.height * w) / canvas.width;
    pdf.addImage(img, 'PNG', 0, 0, w, h);
    pdf.save(`${billNo}.pdf`);
  };

  // ── Filtered bills ───────────────────────────────────────────────────────────
  const filteredBills = bills.filter(b =>
    b.customer?.name?.toLowerCase().includes(searchBill.toLowerCase()) ||
    b.billNo?.toLowerCase().includes(searchBill.toLowerCase()) ||
    b.company?.name?.toLowerCase().includes(searchBill.toLowerCase())
  );

  // ════════════════════════════════════════════════════════════════════════════
  // PREVIEW / PRINT VIEW
  // ════════════════════════════════════════════════════════════════════════════
  if (preview) {
    return (
      <div className="container-fluid py-4">
        <div className="d-flex gap-2 mb-4 no-print">
          <button className="btn btn-secondary" onClick={() => setPreview(false)}>
            <i className="bi bi-arrow-left me-1"></i>Back to Edit
          </button>
          <button className="btn btn-success" onClick={generatePDF}>
            <i className="bi bi-file-earmark-pdf me-1"></i>Download PDF
          </button>
          <button className="btn btn-primary" onClick={() => window.print()}>
            <i className="bi bi-printer me-1"></i>Print
          </button>
        </div>

        {/* ── Invoice Print Layout ── */}
        <div ref={previewRef} style={{ background: '#fff', color: '#111', maxWidth: 850, margin: '0 auto', padding: '40px', fontFamily: 'Arial, sans-serif', fontSize: 13 }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #1a56db', paddingBottom: 20, marginBottom: 20 }}>
            <div>
              {company.logo && <img src={company.logo} alt="logo" style={{ maxHeight: 60, marginBottom: 8, display: 'block' }} />}
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1a56db' }}>{company.name || 'Company Name'}</div>
              <div style={{ color: '#555', marginTop: 4 }}>{company.address}</div>
              {company.city && <div style={{ color: '#555' }}>{company.city}{company.state ? ', ' + company.state : ''} {company.pincode}</div>}
              {company.phone && <div style={{ color: '#555' }}>Ph: {company.phone}</div>}
              {company.email && <div style={{ color: '#555' }}>{company.email}</div>}
              {company.gstin && <div style={{ color: '#333', fontWeight: 600, marginTop: 4 }}>GSTIN: {company.gstin}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#1a56db', letterSpacing: 1 }}>TAX INVOICE</div>
              <table style={{ marginTop: 12, marginLeft: 'auto', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td style={{ paddingRight: 12, color: '#666' }}>Invoice No:</td><td style={{ fontWeight: 700 }}>{billNo}</td></tr>
                  <tr><td style={{ color: '#666' }}>Date:</td><td>{new Date(billDate).toLocaleDateString('en-IN')}</td></tr>
                  {dueDate && <tr><td style={{ color: '#666' }}>Due Date:</td><td>{new Date(dueDate).toLocaleDateString('en-IN')}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bill To */}
          <div style={{ display: 'flex', gap: 40, marginBottom: 24 }}>
            <div style={{ flex: 1, background: '#f0f4ff', borderRadius: 8, padding: '14px 18px' }}>
              <div style={{ fontWeight: 700, color: '#1a56db', marginBottom: 6, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Bill To</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{customer.name}</div>
              <div style={{ color: '#555', marginTop: 4 }}>{customer.address}</div>
              {customer.city && <div style={{ color: '#555' }}>{customer.city}{customer.state ? ', ' + customer.state : ''} {customer.pincode}</div>}
              {customer.phone && <div style={{ color: '#555' }}>Ph: {customer.phone}</div>}
              {customer.gstin && <div style={{ fontWeight: 600, marginTop: 4 }}>GSTIN: {customer.gstin}</div>}
            </div>
            <div style={{ flex: 1, background: '#f9fafb', borderRadius: 8, padding: '14px 18px' }}>
              <div style={{ fontWeight: 700, color: '#1a56db', marginBottom: 6, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>GST Details</div>
              <div>Mode: <strong>{gstMode === 'exclusive' ? 'GST Exclusive' : gstMode === 'inclusive' ? 'GST Inclusive' : 'No GST'}</strong></div>
              <div>Type: <strong>{isInterState ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)'}</strong></div>
            </div>
          </div>

          {/* Items Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
            <thead>
              <tr style={{ background: '#1a56db', color: '#fff' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>#</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Item / Description</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>HSN</th>
                <th style={{ padding: '8px 6px', textAlign: 'right' }}>Qty</th>
                <th style={{ padding: '8px 6px', textAlign: 'right' }}>Rate</th>
                <th style={{ padding: '8px 6px', textAlign: 'right' }}>Disc%</th>
                <th style={{ padding: '8px 6px', textAlign: 'right' }}>Taxable</th>
                {gstMode !== 'none' && isInterState && <th style={{ padding: '8px 6px', textAlign: 'right' }}>IGST</th>}
                {gstMode !== 'none' && !isInterState && <><th style={{ padding: '8px 6px', textAlign: 'right' }}>CGST</th><th style={{ padding: '8px 6px', textAlign: 'right' }}>SGST</th></>}
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.filter(i => i.name).map((item, idx) => {
                const c = calcItem(item);
                return (
                  <tr key={item.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f8faff', borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '7px 10px' }}>{idx + 1}</td>
                    <td style={{ padding: '7px 10px', fontWeight: 500 }}>{item.name}<br /><span style={{ fontSize: 11, color: '#888' }}>{item.unit}</span></td>
                    <td style={{ padding: '7px 10px', color: '#666' }}>{item.hsn || '—'}</td>
                    <td style={{ padding: '7px 6px', textAlign: 'right' }}>{item.qty}</td>
                    <td style={{ padding: '7px 6px', textAlign: 'right' }}>₹{item.rate.toFixed(2)}</td>
                    <td style={{ padding: '7px 6px', textAlign: 'right' }}>{item.disc}%</td>
                    <td style={{ padding: '7px 6px', textAlign: 'right' }}>₹{c.taxable.toFixed(2)}</td>
                    {gstMode !== 'none' && isInterState && <td style={{ padding: '7px 6px', textAlign: 'right' }}>{item.gstPercent}%<br />₹{c.igst.toFixed(2)}</td>}
                    {gstMode !== 'none' && !isInterState && <>
                      <td style={{ padding: '7px 6px', textAlign: 'right' }}>{item.gstPercent / 2}%<br />₹{c.cgst.toFixed(2)}</td>
                      <td style={{ padding: '7px 6px', textAlign: 'right' }}>{item.gstPercent / 2}%<br />₹{c.sgst.toFixed(2)}</td>
                    </>}
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700 }}>₹{c.total.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <table style={{ borderCollapse: 'collapse', minWidth: 280 }}>
              <tbody>
                <tr><td style={{ padding: '4px 16px', color: '#555' }}>Subtotal (Gross)</td><td style={{ padding: '4px 0', textAlign: 'right' }}>₹{totals.gross.toFixed(2)}</td></tr>
                {totals.disc > 0 && <tr><td style={{ padding: '4px 16px', color: '#e11d48' }}>Discount</td><td style={{ padding: '4px 0', textAlign: 'right', color: '#e11d48' }}>- ₹{totals.disc.toFixed(2)}</td></tr>}
                <tr><td style={{ padding: '4px 16px', color: '#555' }}>Taxable Amount</td><td style={{ padding: '4px 0', textAlign: 'right' }}>₹{totals.taxable.toFixed(2)}</td></tr>
                {gstMode !== 'none' && isInterState && <tr><td style={{ padding: '4px 16px', color: '#555' }}>IGST</td><td style={{ padding: '4px 0', textAlign: 'right' }}>₹{totals.igst.toFixed(2)}</td></tr>}
                {gstMode !== 'none' && !isInterState && <>
                  <tr><td style={{ padding: '4px 16px', color: '#555' }}>CGST</td><td style={{ padding: '4px 0', textAlign: 'right' }}>₹{totals.cgst.toFixed(2)}</td></tr>
                  <tr><td style={{ padding: '4px 16px', color: '#555' }}>SGST</td><td style={{ padding: '4px 0', textAlign: 'right' }}>₹{totals.sgst.toFixed(2)}</td></tr>
                </>}
                <tr style={{ background: '#1a56db', color: '#fff' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 700, fontSize: 15, borderRadius: '0 0 0 8px' }}>Grand Total</td>
                  <td style={{ padding: '10px 0 10px 20px', fontWeight: 800, fontSize: 16, textAlign: 'right', borderRadius: '0 0 8px 0', paddingRight: 8 }}>₹{totals.total.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Notes */}
          {notes && (
            <div style={{ marginTop: 24, padding: '12px 16px', background: '#fffbeb', borderLeft: '4px solid #f59e0b', borderRadius: 4 }}>
              <strong>Notes:</strong> {notes}
            </div>
          )}

          <div style={{ marginTop: 40, borderTop: '1px solid #e5e7eb', paddingTop: 16, display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: 12 }}>
            <div>Thank you for your business!</div>
            <div>Authorised Signatory: ___________________</div>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MAIN FORM
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className={`container-fluid py-4 theme-${currentTheme}`}>

      {/* ── Page Header ── */}
      <div className="glass-card shadow-xl mb-4 p-4 fade-in-up">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div>
            <h2 className="fw-bold mb-1">
              <i className="bi bi-receipt-cutoff text-primary me-2"></i>
              Sale Invoice Booking
            </h2>
            <small className="text-muted">Create GST invoices, manage bills and track sales</small>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-outline-primary" onClick={() => onNavigateToInventory && onNavigateToInventory()}>
              <i className="bi bi-boxes me-1"></i>Inventory
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total Bills', value: bills.length, color: 'primary', icon: 'bi-receipt' },
          { label: 'Total Revenue', value: '₹' + bills.reduce((s, b) => s + (b.totals?.total || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }), color: 'success', icon: 'bi-currency-rupee' },
          { label: 'Total GST Collected', value: '₹' + bills.reduce((s, b) => s + (b.totals?.tax || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }), color: 'warning', icon: 'bi-percent' },
          { label: 'Avg Bill Value', value: '₹' + (bills.length ? bills.reduce((s, b) => s + (b.totals?.total || 0), 0) / bills.length : 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }), color: 'info', icon: 'bi-graph-up' },
        ].map((s, i) => (
          <div key={i} className="col-6 col-md-3">
            <div className="glass-card p-3 h-100">
              <div className={`fw-bold fs-5 text-${s.color}`}>{s.value}</div>
              <div className="text-muted small">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="glass-card shadow-xl p-0 overflow-hidden">
        <ul className="nav nav-tabs px-4 pt-3 border-0">
          <li className="nav-item">
            <button className={`nav-link ${activeTab === 'new' ? 'active' : ''}`} onClick={() => setActiveTab('new')}>
              <i className="bi bi-file-earmark-plus me-1"></i>
              {editingBillId ? 'Edit Invoice' : 'New Invoice'}
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>
              <i className="bi bi-list-ul me-1"></i>
              Saved Bills <span className="badge bg-primary ms-1">{bills.length}</span>
            </button>
          </li>
        </ul>

        <div className="p-4">

          {/* ════════════ NEW INVOICE TAB ════════════ */}
          {activeTab === 'new' && (
            <div>
              {/* Stock warning */}
              {stockWarnings.length > 0 && (
                <div className="alert alert-warning mb-4">
                  <i className="bi bi-exclamation-triangle-fill me-2"></i>
                  <strong>Low Stock:</strong> {stockWarnings.join(' | ')}
                </div>
              )}

              {/* ── Section 1: GST Settings ── */}
              <div className="glass-card p-4 mb-4">
                <h5 className="fw-bold mb-3"><i className="bi bi-percent text-warning me-2"></i>GST Settings</h5>
                <div className="row g-3 align-items-center">
                  <div className="col-md-4">
                    <label className="form-label fw-semibold">GST Mode</label>
                    <div className="btn-group w-100" role="group">
                      {[['exclusive', 'GST Exclusive'], ['inclusive', 'GST Inclusive'], ['none', 'No GST']].map(([val, label]) => (
                        <button key={val} type="button"
                          className={`btn btn-sm ${gstMode === val ? 'btn-warning' : 'btn-outline-secondary'}`}
                          onClick={() => setGstMode(val)}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <small className="text-muted d-block mt-1">
                      {gstMode === 'exclusive' ? 'GST added on top of rate' : gstMode === 'inclusive' ? 'GST already included in rate' : 'Bill without GST'}
                    </small>
                  </div>
                  {gstMode !== 'none' && (
                    <div className="col-md-3">
                      <label className="form-label fw-semibold">Transaction Type</label>
                      <div className="form-check form-switch mt-1">
                        <input className="form-check-input" type="checkbox" id="interState" checked={isInterState} onChange={e => setIsInterState(e.target.checked)} />
                        <label className="form-check-label" htmlFor="interState">
                          {isInterState ? <span className="text-danger fw-semibold">Inter-State (IGST)</span> : <span className="text-success fw-semibold">Intra-State (CGST + SGST)</span>}
                        </label>
                      </div>
                    </div>
                  )}
                  <div className="col-md-2">
                    <label className="form-label fw-semibold">Invoice No</label>
                    <input className="form-control" value={billNo} onChange={e => setBillNo(e.target.value)} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label fw-semibold">Invoice Date</label>
                    <input type="date" className="form-control" value={billDate} onChange={e => setBillDate(e.target.value)} />
                  </div>
                  <div className="col-md-1">
                    <label className="form-label fw-semibold">Due Date</label>
                    <input type="date" className="form-control" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* ── Section 2: Company + Customer ── */}
              <div className="row g-4 mb-4">

                {/* Company */}
                <div className="col-lg-6">
                  <div className="glass-card p-4 h-100">
                    <h5 className="fw-bold mb-3"><i className="bi bi-building text-primary me-2"></i>Your Company</h5>

                    {/* Logo */}
                    <div className="mb-3 d-flex align-items-center gap-3">
                      {company.logo
                        ? <img src={company.logo} alt="logo" style={{ maxHeight: 50, borderRadius: 6 }} />
                        : <div className="text-muted border rounded p-2 text-center" style={{ width: 80, fontSize: 11 }}>No Logo</div>
                      }
                      <div>
                        <label className="btn btn-outline-secondary btn-sm">
                          <i className="bi bi-upload me-1"></i>Upload Logo
                          <input type="file" accept="image/*" className="d-none" onChange={handleLogo} />
                        </label>
                        {company.logo && <button className="btn btn-outline-danger btn-sm ms-2" onClick={() => setCompany(p => ({ ...p, logo: null }))}>Remove</button>}
                      </div>
                    </div>

                    <div className="mb-2">
                      <label className="form-label fw-semibold small">Select from Master</label>
                      <select className="form-select form-select-sm" value={company.name} onChange={e => handleCompanySelect(e.target.value)}>
                        <option value="">-- Select Company --</option>
                        {companyMaster.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>

                    <div className="row g-2">
                      <div className="col-12">
                        <label className="form-label fw-semibold small">Company Name *</label>
                        <input className="form-control form-control-sm" placeholder="Company Name" value={company.name} onChange={e => setCompany(p => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div className="col-12">
                        <label className="form-label fw-semibold small">Address</label>
                        <textarea className="form-control form-control-sm" rows="2" placeholder="Street / Area" value={company.address} onChange={e => setCompany(p => ({ ...p, address: e.target.value }))} />
                      </div>
                      <div className="col-6">
                        <input className="form-control form-control-sm" placeholder="City" value={company.city} onChange={e => setCompany(p => ({ ...p, city: e.target.value }))} />
                      </div>
                      <div className="col-4">
                        <input className="form-control form-control-sm" placeholder="State" value={company.state} onChange={e => setCompany(p => ({ ...p, state: e.target.value }))} />
                      </div>
                      <div className="col-2">
                        <input className="form-control form-control-sm" placeholder="PIN" value={company.pincode} onChange={e => setCompany(p => ({ ...p, pincode: e.target.value }))} />
                      </div>
                      <div className="col-6">
                        <label className="form-label fw-semibold small">GSTIN</label>
                        <input className="form-control form-control-sm" placeholder="22AAAAA0000A1Z5" value={company.gstin} onChange={e => setCompany(p => ({ ...p, gstin: e.target.value.toUpperCase() }))} />
                      </div>
                      <div className="col-6">
                        <label className="form-label fw-semibold small">Phone</label>
                        <input className="form-control form-control-sm" placeholder="Phone" value={company.phone} onChange={e => setCompany(p => ({ ...p, phone: e.target.value }))} />
                      </div>
                      <div className="col-12">
                        <label className="form-label fw-semibold small">Email</label>
                        <input className="form-control form-control-sm" type="email" placeholder="Email" value={company.email} onChange={e => setCompany(p => ({ ...p, email: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Customer */}
                <div className="col-lg-6">
                  <div className="glass-card p-4 h-100">
                    <h5 className="fw-bold mb-3"><i className="bi bi-person-lines-fill text-success me-2"></i>Bill To (Customer)</h5>
                    <div className="row g-2">
                      <div className="col-12">
                        <label className="form-label fw-semibold small">Customer Name *</label>
                        <input className="form-control form-control-sm" placeholder="Customer / Party Name" value={customer.name} onChange={e => setCustomer(p => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div className="col-12">
                        <label className="form-label fw-semibold small">Address</label>
                        <textarea className="form-control form-control-sm" rows="2" placeholder="Street / Area" value={customer.address} onChange={e => setCustomer(p => ({ ...p, address: e.target.value }))} />
                      </div>
                      <div className="col-6">
                        <input className="form-control form-control-sm" placeholder="City" value={customer.city} onChange={e => setCustomer(p => ({ ...p, city: e.target.value }))} />
                      </div>
                      <div className="col-4">
                        <input className="form-control form-control-sm" placeholder="State" value={customer.state} onChange={e => setCustomer(p => ({ ...p, state: e.target.value }))} />
                      </div>
                      <div className="col-2">
                        <input className="form-control form-control-sm" placeholder="PIN" value={customer.pincode} onChange={e => setCustomer(p => ({ ...p, pincode: e.target.value }))} />
                      </div>
                      <div className="col-6">
                        <label className="form-label fw-semibold small">Customer GSTIN</label>
                        <input className="form-control form-control-sm" placeholder="GSTIN (if registered)" value={customer.gstin} onChange={e => setCustomer(p => ({ ...p, gstin: e.target.value.toUpperCase() }))} />
                      </div>
                      <div className="col-6">
                        <label className="form-label fw-semibold small">Phone</label>
                        <input className="form-control form-control-sm" placeholder="Phone" value={customer.phone} onChange={e => setCustomer(p => ({ ...p, phone: e.target.value }))} />
                      </div>
                      <div className="col-12 mt-2">
                        <label className="form-label fw-semibold small">Notes / Terms</label>
                        <textarea className="form-control form-control-sm" rows="3" placeholder="Payment terms, delivery notes..." value={notes} onChange={e => setNotes(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Section 3: Items Table ── */}
              <div className="glass-card p-4 mb-4">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="fw-bold mb-0"><i className="bi bi-cart3 text-info me-2"></i>Items</h5>
                  <button className="btn btn-primary btn-sm" onClick={addItem}>
                    <i className="bi bi-plus-circle me-1"></i>Add Item
                  </button>
                </div>

                <div className="table-responsive">
                  <table className="table table-bordered table-hover align-middle mb-0">
                    <thead className="table-dark">
                      <tr>
                        <th style={{ minWidth: 160 }}>Item</th>
                        <th style={{ minWidth: 80 }}>HSN</th>
                        <th style={{ minWidth: 60 }}>Qty</th>
                        <th style={{ minWidth: 60 }}>Unit</th>
                        <th style={{ minWidth: 90 }}>Rate (₹)</th>
                        <th style={{ minWidth: 70 }}>Disc%</th>
                        {gstMode !== 'none' && <th style={{ minWidth: 80 }}>GST%</th>}
                        <th style={{ minWidth: 70 }}>Stock</th>
                        {gstMode !== 'none' && <th style={{ minWidth: 80 }}>Tax (₹)</th>}
                        <th style={{ minWidth: 90 }}>Total (₹)</th>
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => {
                        const c = calcItem(item);
                        const master = itemMaster.find(m => m.name === item.name);
                        const stock = master ? (master.stock || 0) : null;
                        const overStock = stock !== null && item.qty > stock;
                        return (
                          <tr key={item.id} className={overStock ? 'table-warning' : ''}>
                            <td>
                              <select className="form-select form-select-sm" value={item.name} onChange={e => handleItemSelect(item.id, e.target.value)}>
                                <option value="">Select item...</option>
                                {itemMaster.map(m => (
                                  <option key={m.id} value={m.name}>{m.name} (Stk:{m.stock || 0})</option>
                                ))}
                              </select>
                            </td>
                            <td><input className="form-control form-control-sm" placeholder="HSN" value={item.hsn} onChange={e => updateItem(item.id, 'hsn', e.target.value)} /></td>
                            <td><input className="form-control form-control-sm text-end" type="number" min="0" value={item.qty} onChange={e => updateItem(item.id, 'qty', parseFloat(e.target.value) || 0)} /></td>
                            <td>
                              <select className="form-select form-select-sm" value={item.unit} onChange={e => updateItem(item.id, 'unit', e.target.value)}>
                                {['Nos', 'Kg', 'Gm', 'Ltr', 'Mtr', 'Box', 'Pcs', 'Set', 'Pair'].map(u => <option key={u}>{u}</option>)}
                              </select>
                            </td>
                            <td><input className="form-control form-control-sm text-end" type="number" min="0" step="0.01" value={item.rate} onChange={e => updateItem(item.id, 'rate', parseFloat(e.target.value) || 0)} /></td>
                            <td><input className="form-control form-control-sm text-end" type="number" min="0" max="100" step="0.01" value={item.disc} onChange={e => updateItem(item.id, 'disc', parseFloat(e.target.value) || 0)} /></td>
                            {gstMode !== 'none' && (
                              <td>
                                <select className="form-select form-select-sm" value={item.gstPercent} onChange={e => updateItem(item.id, 'gstPercent', parseFloat(e.target.value))}>
                                  {GST_SLABS.map(s => <option key={s} value={s}>{s}%</option>)}
                                </select>
                              </td>
                            )}
                            <td className="text-center">
                              {stock !== null
                                ? <span className={`badge ${stock === 0 ? 'bg-danger' : stock < 10 ? 'bg-warning text-dark' : 'bg-success'}`}>{stock}</span>
                                : <span className="text-muted">—</span>}
                            </td>
                            {gstMode !== 'none' && <td className="text-end text-muted small">₹{c.taxAmt.toFixed(2)}</td>}
                            <td className="text-end fw-bold text-success">₹{c.total.toFixed(2)}</td>
                            <td>
                              <button className="btn btn-outline-danger btn-sm" onClick={() => removeItem(item.id)}>
                                <i className="bi bi-trash"></i>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Section 4: Summary + Actions ── */}
              <div className="row g-4">
                <div className="col-md-7">
                  {/* GST Breakdown */}
                  {gstMode !== 'none' && (
                    <div className="glass-card p-4 h-100">
                      <h6 className="fw-bold mb-3"><i className="bi bi-table text-warning me-2"></i>GST Breakup</h6>
                      <table className="table table-sm mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>GST%</th>
                            <th className="text-end">Taxable</th>
                            {isInterState ? <th className="text-end">IGST</th> : <><th className="text-end">CGST</th><th className="text-end">SGST</th></>}
                            <th className="text-end">Total Tax</th>
                          </tr>
                        </thead>
                        <tbody>
                          {GST_SLABS.filter(s => items.some(i => i.gstPercent === s && i.name)).map(slab => {
                            const slabItems = items.filter(i => i.gstPercent === slab && i.name);
                            const slabTaxable = slabItems.reduce((s, i) => s + calcItem(i).taxable, 0);
                            const slabTax = slabItems.reduce((s, i) => s + calcItem(i).taxAmt, 0);
                            const slabCgst = slabItems.reduce((s, i) => s + calcItem(i).cgst, 0);
                            const slabSgst = slabItems.reduce((s, i) => s + calcItem(i).sgst, 0);
                            if (slabTaxable === 0) return null;
                            return (
                              <tr key={slab}>
                                <td><span className="badge bg-secondary">{slab}%</span></td>
                                <td className="text-end">₹{slabTaxable.toFixed(2)}</td>
                                {isInterState ? <td className="text-end">₹{slabTax.toFixed(2)}</td> : <>
                                  <td className="text-end">₹{slabCgst.toFixed(2)}</td>
                                  <td className="text-end">₹{slabSgst.toFixed(2)}</td>
                                </>}
                                <td className="text-end fw-bold">₹{slabTax.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="col-md-5">
                  <div className="glass-card p-4">
                    <table className="table table-sm mb-3">
                      <tbody>
                        <tr><td className="text-muted">Gross Amount</td><td className="text-end">₹{totals.gross.toFixed(2)}</td></tr>
                        {totals.disc > 0 && <tr><td className="text-danger">Discount</td><td className="text-end text-danger">- ₹{totals.disc.toFixed(2)}</td></tr>}
                        <tr><td className="text-muted">Taxable Amount</td><td className="text-end">₹{totals.taxable.toFixed(2)}</td></tr>
                        {gstMode !== 'none' && isInterState && <tr><td className="text-muted">IGST</td><td className="text-end">₹{totals.igst.toFixed(2)}</td></tr>}
                        {gstMode !== 'none' && !isInterState && <>
                          <tr><td className="text-muted">CGST</td><td className="text-end">₹{totals.cgst.toFixed(2)}</td></tr>
                          <tr><td className="text-muted">SGST</td><td className="text-end">₹{totals.sgst.toFixed(2)}</td></tr>
                        </>}
                        <tr className="table-success">
                          <td className="fw-bold fs-5">Grand Total</td>
                          <td className="text-end fw-bold fs-5 text-success">₹{totals.total.toFixed(2)}</td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="d-flex flex-column gap-2">
                      <div className="d-flex gap-2">
                        <button className="btn btn-outline-secondary flex-fill" onClick={resetForm}>
                          <i className="bi bi-arrow-clockwise me-1"></i>New Bill
                        </button>
                        <button className="btn btn-primary flex-fill" onClick={() => setPreview(true)}>
                          <i className="bi bi-eye me-1"></i>Preview
                        </button>
                      </div>
                      <button className="btn btn-success w-100 btn-lg" onClick={saveBill}>
                        <i className="bi bi-save me-2"></i>{editingBillId ? 'Update Bill' : 'Save Bill'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ════════════ SAVED BILLS TAB ════════════ */}
          {activeTab === 'list' && (
            <div>
              <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
                <h4 className="fw-bold mb-0">Saved Bills ({bills.length})</h4>
                <div className="input-group" style={{ maxWidth: 300 }}>
                  <span className="input-group-text"><i className="bi bi-search"></i></span>
                  <input className="form-control" placeholder="Search by customer / bill no..." value={searchBill} onChange={e => setSearchBill(e.target.value)} />
                </div>
              </div>

              {filteredBills.length === 0 ? (
                <div className="text-center py-5">
                  <i className="bi bi-inbox display-1 text-muted d-block mb-3"></i>
                  <h5 className="text-muted">{searchBill ? 'No results found' : 'No bills yet'}</h5>
                  <button className="btn btn-primary mt-3" onClick={() => setActiveTab('new')}>
                    <i className="bi bi-plus-circle me-1"></i>Create First Bill
                  </button>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle">
                    <thead className="table-dark">
                      <tr>
                        <th>Bill No</th>
                        <th>Date</th>
                        <th>Company</th>
                        <th>Customer</th>
                        <th className="text-end">Taxable</th>
                        <th className="text-end">GST</th>
                        <th className="text-end">Total</th>
                        <th>GST Mode</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBills.map(bill => (
                        <tr key={bill.id}>
                          <td><span className="badge bg-primary">{bill.billNo}</span></td>
                          <td><small>{new Date(bill.billDate).toLocaleDateString('en-IN')}</small></td>
                          <td className="fw-semibold">{bill.company?.name || '—'}</td>
                          <td>{bill.customer?.name || '—'}</td>
                          <td className="text-end">₹{(bill.totals?.taxable || 0).toFixed(2)}</td>
                          <td className="text-end text-warning">₹{(bill.totals?.tax || 0).toFixed(2)}</td>
                          <td className="text-end fw-bold text-success">₹{(bill.totals?.total || 0).toFixed(2)}</td>
                          <td><span className={`badge ${bill.gstMode === 'none' ? 'bg-secondary' : 'bg-success'}`}>{bill.gstMode}</span></td>
                          <td>
                            <div className="btn-group btn-group-sm">
                              <button className="btn btn-outline-primary" onClick={() => editBill(bill)} title="Edit"><i className="bi bi-pencil"></i></button>
                              <button className="btn btn-outline-success" onClick={() => { editBill(bill); setTimeout(() => setPreview(true), 100); }} title="Print"><i className="bi bi-printer"></i></button>
                              <button className="btn btn-outline-danger" onClick={() => deleteBill(bill.id)} title="Delete"><i className="bi bi-trash"></i></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="table-secondary fw-bold">
                      <tr>
                        <td colSpan="4">Total ({filteredBills.length} bills)</td>
                        <td className="text-end">₹{filteredBills.reduce((s, b) => s + (b.totals?.taxable || 0), 0).toFixed(2)}</td>
                        <td className="text-end text-warning">₹{filteredBills.reduce((s, b) => s + (b.totals?.tax || 0), 0).toFixed(2)}</td>
                        <td className="text-end text-success">₹{filteredBills.reduce((s, b) => s + (b.totals?.total || 0), 0).toFixed(2)}</td>
                        <td colSpan="2"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default SaleInvoice;
