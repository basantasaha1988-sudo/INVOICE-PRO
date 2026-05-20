import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../App';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { useItemMaster } from '../contexts/ItemMasterContext';
import { useCompanyMaster } from '../contexts/CompanyMasterContext';

// ─── GST rates as per Indian GST slabs ───────────────────────────────────────
const GST_SLABS = [0, 5, 12, 18, 28];

// ─── Snap any DB tax value to nearest valid GST slab ─────────────────────────
// DB stores raw values like 9, 2.5 etc. which are not in GST_SLABS.
// A value not in the list causes <select value={9}> to visually show 0%
// while the state stays 9 — so "0% selected" items still calculate tax.
const snapToSlab = (val) => {
  const n = Number(val) || 0;
  if (GST_SLABS.includes(n)) return n;
  return GST_SLABS.reduce((prev, curr) =>
    Math.abs(curr - n) < Math.abs(prev - n) ? curr : prev, 0);
};

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

const SaleInvoice = ({ onNavigateToInventory, onNavigateToCustomerMaster, selectInvoiceForPayment, receipts = [] }) => {
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
  const [billsLoading, setBillsLoading] = useState(false);
  const [stockWarnings, setStockWarnings] = useState([]);
  const [searchBill, setSearchBill] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'paid' | 'pending'
  const [viewBill, setViewBill] = useState(null);

  // ── Customers (autocomplete) ────────────────────────────────────────────────
  const [customerList, setCustomerList] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // ── Phone-first lookup (gate before invoice form) ───────────────────────────
  const [phoneStep, setPhoneStep] = useState(true);   // true = show phone gate
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneLookupStatus, setPhoneLookupStatus] = useState('idle'); // 'idle'|'found'|'new'
  const [phoneMatches, setPhoneMatches] = useState([]);  // matched customers

  useEffect(() => {
    axios.get('/api/customers')
      .then(res => setCustomerList(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  }, []);

  const filteredCustomers = customerList.filter(c =>
    customer.name && c.CustomerName.toLowerCase().includes(customer.name.toLowerCase())
  );

  const handleCustomerSelect = (c) => {
    setCustomer(p => ({
      ...p,
      name:    c.CustomerName || '',
      phone:   c.Phone        || '',
      address: c.Address      || '',
    }));
    setShowCustomerDropdown(false);
  };

  // ── Phone lookup handler ─────────────────────────────────────────────────────
  const handlePhoneLookup = () => {
    const trimmed = phoneInput.trim();
    if (!trimmed) return;
    const matches = customerList.filter(c =>
      (c.Phone || '').replace(/\D/g, '').includes(trimmed.replace(/\D/g, ''))
    );
    if (matches.length > 0) {
      setPhoneMatches(matches);
      setPhoneLookupStatus('found');
    } else {
      setPhoneMatches([]);
      setPhoneLookupStatus('new');
      // Stay on phone gate — user must register the customer in Customer Master first
    }
  };

  const handlePhoneCustomerSelect = (c) => {
    setCustomer(p => ({
      ...p,
      name:    c.CustomerName || '',
      phone:   c.Phone        || '',
      address: c.Address      || '',
    }));
    setPhoneStep(false);
    setPhoneLookupStatus('idle');
  };

  const handlePhoneNewCustomer = () => {
    setCustomer(p => ({ ...p, phone: phoneInput.trim() }));
    setPhoneStep(false);
    setPhoneLookupStatus('idle');
  };

  // ── Load bills from DB on mount ──────────────────────────────────────────────
  useEffect(() => {
    const loadBills = async () => {
      setBillsLoading(true);
      try {
        const res = await axios.get('/api/saleinvoice');
        setBills(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Failed to load bills from DB:', err.message);
        // Fallback to localStorage cache
        const cached = localStorage.getItem('sale_bills');
        try { const parsed = JSON.parse(cached); setBills(Array.isArray(parsed) ? parsed : []); } catch { setBills([]); }
      } finally {
        setBillsLoading(false);
      }
    };
    loadBills();
  }, []);

  // ── Keep localStorage as offline cache ───────────────────────────────────────
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
        gstPercent: snapToSlab(m.defaultTaxPercent), hsn: m.hsn || ''
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

  // ── Save bill (saves to DB + keeps localStorage cache) ──────────────────────
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [isBillSaved, setIsBillSaved] = useState(false); // true after Save Bill clicked // { msg, type: 'success'|'danger' }

  const saveBill = useCallback(async () => {
    if (!company.name.trim()) { alert('Please enter company name'); return; }
    if (!customer.name.trim()) { alert('Please enter customer name'); return; }
    if (items.every(i => !i.name)) { alert('Please add at least one item'); return; }

    if (stockWarnings.length > 0) {
      if (!window.confirm(`Stock warning:\n${stockWarnings.join('\n')}\n\nSave anyway?`)) return;
    }

    const billId = editingBillId || uuidv4();
    const bill = {
      id: billId,
      billNo, billDate, dueDate, notes,
      company, customer, items, totals, gstMode, isInterState,
      savedAt: new Date().toISOString()
    };

    setSaving(true);
    try {
      if (editingBillId) {
        // Update in DB
        await axios.put(`/api/saleinvoice/${editingBillId}`, bill);
        // Restore old stock then deduct new
        const old = bills.find(b => b.id === editingBillId);
        if (old) restoreStock(old.items);
        setBills(p => p.map(b => b.id === editingBillId ? bill : b));
      } else {
        // Create in DB
        await axios.post('/api/saleinvoice', bill);
        setBills(p => [bill, ...p]);
      }

      deductStock(items);

      // Auto-save customer to CUSTOMERS table
      if (customer.name?.trim()) {
        axios.post('/api/customers/upsert', {
          name:    customer.name,
          phone:   customer.phone,
          address: customer.address,
        }).then(res => {
          // Refresh customer list for autocomplete
          return axios.get('/api/customers');
        }).then(res => {
          setCustomerList(Array.isArray(res.data) ? res.data : []);
        }).catch(err => {
          console.warn('Customer save warning:', err.message);
        });
      }

      setIsBillSaved(true);
      resetForm();
      setActiveTab('list');
      showToast('✅ Bill saved and added to Saved Bills!');
    } catch (err) {
      console.error('Save bill error:', err);
      showToast('❌ Failed to save bill: ' + (err.response?.data?.error || err.message), 'danger');
    } finally {
      setSaving(false);
    }
  }, [company, customer, items, totals, billNo, billDate, dueDate, notes, gstMode, isInterState, editingBillId, bills, stockWarnings, deductStock, restoreStock, setActiveTab]);

  // ── Edit / Delete ────────────────────────────────────────────────────────────
  const editBill = (bill) => {
    setActiveTab('new');
    setPhoneStep(false);   // customer already known — skip gate
    setPhoneInput(bill.customer?.phone || '');
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

  const deleteBill = async (id) => {
    if (!window.confirm('Delete this bill?')) return;
    try {
      const res = await axios.delete(`/api/saleinvoice/${id}`);
      if (res.data && res.data.error) {
        showToast('❌ Failed to delete bill: ' + res.data.error, 'danger');
        return;
      }
      const bill = bills.find(b => b.id === id);
      if (bill) restoreStock(bill.items);
      setBills(p => p.filter(b => b.id !== id));
      showToast('🗑️ Bill deleted successfully.');
    } catch (err) {
      console.error('Delete bill error:', err);
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      showToast('❌ Failed to delete bill: ' + msg, 'danger');
    }
  };

  // ── Reset ────────────────────────────────────────────────────────────────────
  const resetForm = () => {
    setIsBillSaved(false);
    setPhoneStep(true);
    setPhoneInput('');
    setPhoneLookupStatus('idle');
    setPhoneMatches([]);
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


  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
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
  const getBillPaidAmount = (bill) =>
    receipts.filter(r => r.paymentDocNumber === bill.billNo)
      .reduce((sum, r) => sum + parseFloat(r.receiptAmount || 0), 0);

  const getBillStatus = (bill) =>
    getBillPaidAmount(bill) >= (bill.totals?.total || 0) ? 'paid' : 'pending';

  const filteredBills = bills.filter(b => {
    const matchesSearch =
      b.customer?.name?.toLowerCase().includes(searchBill.toLowerCase()) ||
      b.billNo?.toLowerCase().includes(searchBill.toLowerCase()) ||
      b.company?.name?.toLowerCase().includes(searchBill.toLowerCase());
    const matchesStatus = statusFilter === 'all' || getBillStatus(b) === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // ── Glass styles injected once ───────────────────────────────────────────────
  const glassStyles = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
    .si-wrap * { font-family: 'DM Sans', sans-serif; }
    .si-wrap { background: linear-gradient(135deg, var(--page-bg-1, rgba(230,230,245,0.97)) 0%, var(--page-bg-2, rgba(200,200,240,0.93)) 100%) fixed; min-height: 100vh; transition: background 0.4s ease; }

    .g-btn {
      position: relative; border-radius: 50px; cursor: pointer;
      transition: all 0.3s ease; overflow: hidden;
      border: 2px solid rgba(255,255,255,0.25);
      backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      font-size: 14px; font-weight: 600; letter-spacing: 0.4px;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 10px 22px; color: #fff; text-decoration: none; outline: none;
    }
    .g-btn::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 45%;
      background: linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.08) 100%);
      border-radius: 50px 50px 0 0; pointer-events: none;
    }
    .g-btn::after {
      content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
      pointer-events: none;
    }
    .g-btn:hover { transform: translateY(-2px) scale(1.02); border-color: rgba(255,255,255,0.4); }
    .g-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }

    .g-btn-dark {
      background: linear-gradient(135deg, rgba(25,25,50,0.7) 0%, rgba(10,10,25,0.85) 50%, rgba(50,20,100,0.65) 100%);
      box-shadow: 0 8px 32px rgba(0,0,0,0.5), inset 0 0 20px rgba(150,100,220,0.2), 0 0 40px rgba(150,100,220,0.25);
    }
    .g-btn-dark:hover { box-shadow: 0 15px 50px rgba(0,0,0,0.6), inset 0 0 30px rgba(150,100,220,0.3), 0 0 60px rgba(150,100,220,0.35); }

    .g-btn-primary {
      background: linear-gradient(135deg, rgba(26,86,219,0.6) 0%, rgba(30,64,175,0.75) 100%);
      box-shadow: 0 8px 32px rgba(26,86,219,0.4), inset 0 0 25px rgba(100,150,255,0.25), 0 0 40px rgba(26,86,219,0.3);
    }
    .g-btn-primary:hover { box-shadow: 0 14px 44px rgba(26,86,219,0.55), inset 0 0 35px rgba(100,150,255,0.35); }

    .g-btn-success {
      background: linear-gradient(135deg, rgba(0,180,80,0.5) 0%, rgba(0,150,100,0.65) 100%);
      box-shadow: 0 8px 32px rgba(0,200,100,0.35), inset 0 0 25px rgba(0,200,100,0.25), 0 0 40px rgba(0,200,100,0.25);
      border-color: rgba(0,200,100,0.4);
    }
    .g-btn-success:hover { box-shadow: 0 14px 44px rgba(0,200,100,0.5), inset 0 0 35px rgba(0,220,120,0.35); }

    .g-btn-warning {
      background: linear-gradient(135deg, rgba(245,158,11,0.55) 0%, rgba(217,119,6,0.7) 100%);
      box-shadow: 0 8px 32px rgba(245,158,11,0.35), inset 0 0 20px rgba(255,200,50,0.3), 0 0 40px rgba(245,158,11,0.25);
      color: #1a0a00;
    }
    .g-btn-warning:hover { box-shadow: 0 14px 44px rgba(245,158,11,0.5), inset 0 0 30px rgba(255,200,50,0.4); }

    .g-btn-danger {
      background: linear-gradient(135deg, rgba(220,38,38,0.5) 0%, rgba(185,28,28,0.65) 100%);
      box-shadow: 0 8px 32px rgba(220,38,38,0.35), inset 0 0 20px rgba(255,100,100,0.2), 0 0 35px rgba(220,38,38,0.25);
    }
    .g-btn-danger:hover { box-shadow: 0 14px 44px rgba(220,38,38,0.5); }

    .g-btn-cyan {
      background: linear-gradient(135deg, rgba(0,200,255,0.35) 0%, rgba(0,150,200,0.5) 100%);
      box-shadow: 0 8px 32px rgba(0,200,255,0.3), inset 0 0 25px rgba(0,200,255,0.2), 0 0 40px rgba(0,200,255,0.3);
      border-color: rgba(0,200,255,0.4);
    }

    .g-btn-silver {
      background: linear-gradient(135deg, rgba(240,240,250,0.75) 0%, rgba(200,200,220,0.65) 100%);
      box-shadow: 0 8px 32px rgba(0,0,0,0.15), inset 0 0 20px rgba(255,255,255,0.6);
      border-color: rgba(255,255,255,0.6); color: #334;
    }

    .g-btn-ghost {
      background: rgba(255,255,255,0.12);
      box-shadow: 0 4px 16px rgba(0,0,0,0.1), inset 0 0 12px rgba(255,255,255,0.15);
      border-color: rgba(255,255,255,0.3); color: #334;
    }
    .g-btn-ghost:hover { background: rgba(255,255,255,0.22); }

    .g-btn-sm { padding: 6px 14px; font-size: 12px; border-radius: 40px; }
    .g-btn-lg { padding: 14px 28px; font-size: 15px; border-radius: 50px; }
    .g-btn-block { width: 100%; }

    /* Glass card */
    .g-card {
      background: var(--glass-bg, rgba(255,255,255,0.45));
      backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
      border-radius: 18px; border: 1.5px solid rgba(255,255,255,0.55);
      box-shadow: 0 8px 32px rgba(100,100,200,0.1), inset 0 1px 0 rgba(255,255,255,0.7);
      position: relative; overflow: hidden;
    }
    .g-card::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 40%;
      background: linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.0) 100%);
      border-radius: 18px 18px 0 0; pointer-events: none;
    }

    /* Glass input */
    .g-input {
      background: rgba(255,255,255,0.55) !important;
      backdrop-filter: blur(12px); border-radius: 12px !important;
      border: 1.5px solid rgba(200,200,240,0.5) !important;
      box-shadow: inset 0 2px 8px rgba(100,100,200,0.08) !important;
      font-family: 'DM Sans', sans-serif !important; font-size: 13px !important;
      transition: all 0.2s; color: #1a1a2e !important;
    }
    .g-input:focus {
      background: rgba(255,255,255,0.75) !important;
      border-color: rgba(26,86,219,0.45) !important;
      box-shadow: 0 0 0 3px rgba(26,86,219,0.12), inset 0 2px 8px rgba(100,100,200,0.08) !important;
      outline: none !important;
    }
    .g-input::placeholder { color: #999 !important; }

    /* Tabs */
    .g-tabs { display: flex; gap: 4px; padding: 12px 16px 0; border-bottom: 1.5px solid rgba(200,200,240,0.4); }
    .g-tab {
      padding: 10px 20px; border-radius: 12px 12px 0 0; font-weight: 600; font-size: 13px;
      cursor: pointer; border: none; background: rgba(255,255,255,0.2);
      color: #556; transition: all 0.2s; display: flex; align-items: center; gap: 6px;
    }
    .g-tab.active {
      background: rgba(255,255,255,0.65); color: #1a56db;
      box-shadow: 0 -2px 12px rgba(26,86,219,0.12);
      border-bottom: 2px solid #1a56db;
    }

    /* Stats cards */
    .g-stat { text-align: center; padding: 16px; }
    .g-stat-value { font-size: 1.4rem; font-weight: 700; }
    .g-stat-label { font-size: 11px; color: #778; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }

    /* Table */
    .g-table { width: 100%; border-collapse: separate; border-spacing: 0 4px; }
    .g-table thead th {
      background: linear-gradient(135deg, rgba(25,25,50,0.7), rgba(50,20,100,0.6));
      color: rgba(255,255,255,0.95); font-weight: 600; font-size: 12px;
      padding: 10px 12px; letter-spacing: 0.3px;
    }
    .g-table thead th:first-child { border-radius: 10px 0 0 10px; }
    .g-table thead th:last-child { border-radius: 0 10px 10px 0; }
    .g-table tbody tr { background: rgba(255,255,255,0.45); transition: background 0.15s; }
    .g-table tbody tr:hover { background: rgba(255,255,255,0.7); }
    .g-table tbody td { padding: 9px 12px; font-size: 13px; color: #223; border-bottom: 1px solid rgba(200,200,240,0.25); }
    .g-table tfoot td { padding: 10px 12px; font-size: 13px; font-weight: 700; background: rgba(26,86,219,0.08); }

    /* Badge */
    .g-badge {
      display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;
      letter-spacing: 0.3px;
    }
    .g-badge-blue { background: rgba(26,86,219,0.15); color: #1a56db; border: 1px solid rgba(26,86,219,0.3); }
    .g-badge-green { background: rgba(0,180,80,0.15); color: #006830; border: 1px solid rgba(0,180,80,0.3); }
    .g-badge-yellow { background: rgba(245,158,11,0.15); color: #7a4800; border: 1px solid rgba(245,158,11,0.3); }
    .g-badge-red { background: rgba(220,38,38,0.12); color: #991b1b; border: 1px solid rgba(220,38,38,0.25); }
    .g-badge-gray { background: rgba(100,100,120,0.12); color: #445; border: 1px solid rgba(100,100,120,0.2); }

    /* Toast */
    .g-toast {
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      min-width: 300px; max-width: 460px;
      background: rgba(255,255,255,0.75); backdrop-filter: blur(24px);
      border-radius: 16px; padding: 14px 20px;
      border: 1.5px solid rgba(255,255,255,0.6);
      box-shadow: 0 12px 40px rgba(0,0,0,0.15);
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      font-weight: 600; font-size: 14px;
    }
    .g-toast-success { border-left: 4px solid #00b450; color: #004d22; }
    .g-toast-danger  { border-left: 4px solid #dc2626; color: #7f1d1d; }

    /* Switch */
    .g-switch { position: relative; display: inline-flex; align-items: center; gap: 10px; cursor: pointer; }
    .g-switch input { display: none; }
    .g-switch-track {
      width: 48px; height: 26px; border-radius: 13px;
      background: rgba(200,200,220,0.5);
      border: 1.5px solid rgba(200,200,220,0.6);
      transition: all 0.3s; position: relative;
    }
    .g-switch-dot {
      position: absolute; top: 2px; left: 2px;
      width: 18px; height: 18px; border-radius: 50%;
      background: linear-gradient(135deg, rgba(255,255,255,0.95), rgba(240,240,255,0.85));
      box-shadow: 0 2px 8px rgba(100,100,200,0.3);
      transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
    }
    .g-switch input:checked ~ .g-switch-track { background: rgba(26,86,219,0.45); border-color: rgba(26,86,219,0.4); }
    .g-switch input:checked ~ .g-switch-track .g-switch-dot { transform: translateX(22px); }

    /* Section header */
    .g-section-title { font-size: 15px; font-weight: 700; color: #1a1a2e; display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }

    /* Phone gate icon ring */
    .g-phone-ring {
      width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 16px;
      background: linear-gradient(135deg, rgba(26,86,219,0.12), rgba(100,50,200,0.18));
      border: 2px solid rgba(26,86,219,0.25);
      display: flex; align-items: center; justify-content: center; font-size: 34px;
      box-shadow: 0 8px 32px rgba(26,86,219,0.15);
    }

    /* Customer list item */
    .g-cust-item {
      background: rgba(255,255,255,0.5); border-radius: 12px; border: 1.5px solid rgba(200,200,240,0.4);
      padding: 12px 16px; cursor: pointer; transition: all 0.2s;
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;
    }
    .g-cust-item:hover { background: rgba(255,255,255,0.8); border-color: rgba(26,86,219,0.3); transform: translateX(3px); }

    /* Divider */
    .g-divider { border: none; border-top: 1.5px solid rgba(200,200,240,0.4); margin: 16px 0; }

    /* Header */
    .g-page-header { padding: 20px 24px; }
    .g-page-title { font-size: 22px; font-weight: 700; color: #1a1a2e; margin: 0; }
    .g-page-sub { font-size: 12px; color: #889; margin-top: 2px; }

    /* Alert bar */
    .g-alert {
      border-radius: 12px; padding: 10px 16px; font-size: 13px; font-weight: 500;
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      border: 1.5px solid; backdrop-filter: blur(8px);
    }
    .g-alert-blue { background: rgba(26,86,219,0.08); border-color: rgba(26,86,219,0.25); color: #1a3080; }
    .g-alert-warning { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.35); color: #7a4000; }
    .g-alert-info { background: rgba(0,200,255,0.08); border-color: rgba(0,200,255,0.3); color: #005f80; }
    .g-alert-success { background: rgba(0,180,80,0.08); border-color: rgba(0,180,80,0.3); color: #004d22; }

    /* Grand total row */
    .g-total-row {
      background: linear-gradient(135deg, rgba(26,86,219,0.18), rgba(100,50,200,0.15));
      border-radius: 12px; padding: 14px 16px;
      display: flex; justify-content: space-between; align-items: center;
      border: 1.5px solid rgba(26,86,219,0.25); margin-top: 8px;
    }

    @media print { .no-print { display: none !important; } }
  `;

  // ════════════════════════════════════════════════════════════════════════════
  // PREVIEW / PRINT VIEW
  // ════════════════════════════════════════════════════════════════════════════
  if (preview) {
    return (
      <div className="si-wrap" style={{ padding: '24px' }}>
        <style>{glassStyles}</style>
        <div className="d-flex gap-2 mb-4 no-print" style={{ flexWrap: 'wrap' }}>
          <button className="g-btn g-btn-dark" onClick={() => setPreview(false)}>
            <i className="bi bi-arrow-left"></i>Back to Edit
          </button>
          <button className="g-btn g-btn-success" onClick={generatePDF}>
            <i className="bi bi-file-earmark-pdf"></i>Download PDF
          </button>
          <button className="g-btn g-btn-primary" onClick={() => window.print()}>
            <i className="bi bi-printer"></i>Print
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
    <div className={`si-wrap theme-${currentTheme}`} style={{ padding: '20px 16px' }}>
      <style>{glassStyles}</style>

      {/* ── Page Header ── */}
      <div className="g-card mb-4 g-page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 className="g-page-title">
              <i className="bi bi-receipt-cutoff" style={{ color: '#1a56db', marginRight: 8 }}></i>
              Sale Invoice Booking
            </h2>
            <div className="g-page-sub">Create GST invoices, manage bills and track sales</div>
          </div>
          <button className="g-btn g-btn-primary" onClick={() => onNavigateToInventory && onNavigateToInventory()}>
            <i className="bi bi-boxes"></i>Inventory
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Bills', value: bills.length, color: '#1a56db' },
          { label: 'Total Revenue', value: '₹' + bills.reduce((s, b) => s + (b.totals?.total || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }), color: '#00b450' },
          { label: 'GST Collected', value: '₹' + bills.reduce((s, b) => s + (b.totals?.tax || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }), color: '#f59e0b' },
          { label: 'Avg Bill Value', value: '₹' + (bills.length ? bills.reduce((s, b) => s + (b.totals?.total || 0), 0) / bills.length : 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }), color: '#0099cc' },
        ].map((s, i) => (
          <div key={i} className="g-card g-stat">
            <div className="g-stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="g-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Main Card with Tabs ── */}
      <div className="g-card" style={{ overflow: 'hidden' }}>

        {/* Tabs */}
        <div className="g-tabs">
          <button className={`g-tab ${activeTab === 'new' ? 'active' : ''}`} onClick={() => setActiveTab('new')}>
            <i className="bi bi-file-earmark-plus"></i>
            {editingBillId ? 'Edit Invoice' : 'New Invoice'}
          </button>
          <button className={`g-tab ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>
            <i className="bi bi-list-ul"></i>
            Saved Bills&nbsp;
            <span className="g-badge g-badge-blue">{bills.length}</span>
            {billsLoading && <span className="spinner-border spinner-border-sm ms-1" style={{ width: 12, height: 12, borderWidth: 2 }}></span>}
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`g-toast g-toast-${toast.type}`}>
            <span>{toast.msg}</span>
            <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', lineHeight: 1, color: 'inherit', opacity: 0.7 }}>×</button>
          </div>
        )}

        <div style={{ padding: '20px 20px 24px' }}>

          {/* ════════════ NEW INVOICE TAB ════════════ */}
          {activeTab === 'new' && (
            <div>

              {/* ── Phone Gate ── */}
              {phoneStep ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px 0' }}>
                  <div className="g-card" style={{ maxWidth: 460, width: '100%', padding: '36px 32px', textAlign: 'center' }}>
                    <div className="g-phone-ring" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img
                        src="/invoice-pro-logo.png"
                        alt="InvoicePro"
                        style={{
                          width: 64,
                          height: 64,
                          objectFit: 'cover',
                          borderRadius: 16,
                          boxShadow: '0 4px 14px rgba(26,86,219,0.2)',
                        }}
                      />
                    </div>
                    <h4 style={{ fontWeight: 700, marginBottom: 6, color: '#1a1a2e' }}>Customer Phone Lookup</h4>
                    <p style={{ color: '#889', fontSize: 13, marginBottom: 24 }}>
                      Enter the customer's mobile number to find their details or create a new record.
                    </p>

                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#1a56db', fontSize: 16 }}>
                          <i className="bi bi-phone"></i>
                        </span>
                        <input
                          className="g-input"
                          style={{ paddingLeft: 40, height: 48, width: '100%', fontSize: '16px !important', letterSpacing: 1 }}
                          placeholder="e.g. 9876543210"
                          value={phoneInput}
                          autoFocus
                          inputMode="tel"
                          onChange={e => { setPhoneInput(e.target.value); setPhoneLookupStatus('idle'); setPhoneMatches([]); }}
                          onKeyDown={e => e.key === 'Enter' && handlePhoneLookup()}
                        />
                      </div>
                      <button className="g-btn g-btn-primary" style={{ borderRadius: 14, padding: '0 20px', height: 48, flexShrink: 0 }}
                        onClick={handlePhoneLookup} disabled={!phoneInput.trim()}>
                        <i className="bi bi-search"></i>Search
                      </button>
                    </div>

                    {phoneLookupStatus === 'found' && phoneMatches.length > 0 && (
                      <div style={{ textAlign: 'left', marginTop: 8 }}>
                        <div className="g-alert g-alert-success" style={{ marginBottom: 12 }}>
                          <span><i className="bi bi-check-circle-fill me-2"></i><strong>{phoneMatches.length}</strong> customer{phoneMatches.length > 1 ? 's' : ''} found</span>
                        </div>
                        {phoneMatches.map(c => (
                          <div key={c.CustomerID} className="g-cust-item" onClick={() => handlePhoneCustomerSelect(c)}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a2e' }}>{c.CustomerName}</div>
                              <div style={{ fontSize: 12, color: '#778', marginTop: 3 }}>
                                <i className="bi bi-telephone me-1"></i>{c.Phone}
                                {c.Address && <span style={{ marginLeft: 10 }}><i className="bi bi-geo-alt me-1"></i>{c.Address}</span>}
                              </div>
                            </div>
                            <i className="bi bi-arrow-right-circle-fill" style={{ color: '#1a56db', fontSize: 20 }}></i>
                          </div>
                        ))}
                        <button className="g-btn g-btn-ghost g-btn-block" style={{ marginTop: 4 }} onClick={handlePhoneNewCustomer}>
                          <i className="bi bi-person-plus"></i>Not listed? Create new customer
                        </button>
                      </div>
                    )}

                    {phoneLookupStatus === 'new' && (
                      <div style={{ marginTop: 12, textAlign: 'left' }}>
                        <div className="g-alert g-alert-warning" style={{ marginBottom: 14, alignItems: 'flex-start' }}>
                          <span>
                            <i className="bi bi-exclamation-triangle-fill me-2" style={{ color: '#d97706' }}></i>
                            <strong>New customer — number not registered.</strong>
                            <br />
                            <span style={{ fontSize: 13, color: '#666', marginTop: 4, display: 'block' }}>
                              No record found for <strong>{phoneInput}</strong>. Please add this customer in
                              <strong> Customer Master</strong> before creating an invoice.
                            </span>
                          </span>
                        </div>
                        <button
                          className="g-btn g-btn-primary g-btn-block"
                          style={{ marginBottom: 8 }}
                          onClick={() => {
                            if (typeof onNavigateToCustomerMaster === 'function') {
                              onNavigateToCustomerMaster();
                            }
                          }}
                        >
                          <i className="bi bi-person-plus me-2"></i>Register New Customer
                        </button>
                        <button
                          className="g-btn g-btn-ghost g-btn-block"
                          onClick={() => { setPhoneLookupStatus('idle'); setPhoneInput(''); }}
                        >
                          <i className="bi bi-arrow-left me-2"></i>Search a different number
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
              <div>
                {/* Customer chip */}
                <div className="g-alert g-alert-blue" style={{ marginBottom: 16 }}>
                  <span>
                    <i className="bi bi-telephone-fill me-2"></i>
                    <strong>Customer:</strong>{' '}
                    {customer.name ? <><strong>{customer.name}</strong>&nbsp;·&nbsp;</> : ''}
                    <span style={{ opacity: 0.7 }}>{customer.phone}</span>
                  </span>
                  <button className="g-btn g-btn-ghost g-btn-sm" onClick={() => resetForm()}>
                    <i className="bi bi-arrow-left"></i>Change
                  </button>
                </div>

                {stockWarnings.length > 0 && (
                  <div className="g-alert g-alert-warning" style={{ marginBottom: 16 }}>
                    <span><i className="bi bi-exclamation-triangle-fill me-2"></i><strong>Low Stock:</strong> {stockWarnings.join(' | ')}</span>
                  </div>
                )}

                {/* ── Section 1: GST Settings ── */}
                <div className="g-card" style={{ padding: '20px 20px 16px', marginBottom: 16 }}>
                  <div className="g-section-title"><i className="bi bi-percent" style={{ color: '#f59e0b' }}></i>GST Settings</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 220 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#556', display: 'block', marginBottom: 6 }}>GST Mode</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[['exclusive', 'Exclusive'], ['inclusive', 'Inclusive'], ['none', 'No GST']].map(([val, label]) => (
                          <button key={val} type="button"
                            className={`g-btn g-btn-sm ${gstMode === val ? 'g-btn-warning' : 'g-btn-ghost'}`}
                            style={{ borderRadius: 10, flex: 1, padding: '6px 8px' }}
                            onClick={() => setGstMode(val)}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: '#889', marginTop: 5 }}>
                        {gstMode === 'exclusive' ? 'GST added on top of rate' : gstMode === 'inclusive' ? 'GST included in rate' : 'Bill without GST'}
                      </div>
                    </div>

                    {gstMode !== 'none' && (
                      <div style={{ minWidth: 180 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#556', display: 'block', marginBottom: 8 }}>Transaction Type</label>
                        <label className="g-switch">
                          <input type="checkbox" checked={isInterState} onChange={e => setIsInterState(e.target.checked)} />
                          <div className="g-switch-track"><div className="g-switch-dot"></div></div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: isInterState ? '#dc2626' : '#00843d' }}>
                            {isInterState ? 'Inter-State (IGST)' : 'Intra-State (CGST+SGST)'}
                          </span>
                        </label>
                      </div>
                    )}

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#556', display: 'block', marginBottom: 4 }}>Invoice No</label>
                      <input className="g-input" style={{ width: 140 }} value={billNo} onChange={e => setBillNo(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#556', display: 'block', marginBottom: 4 }}>Invoice Date</label>
                      <input type="date" className="g-input" style={{ width: 150 }} value={billDate} onChange={e => setBillDate(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#556', display: 'block', marginBottom: 4 }}>Due Date</label>
                      <input type="date" className="g-input" style={{ width: 150 }} value={dueDate} onChange={e => setDueDate(e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* ── Section 2: Company + Customer ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>

                  {/* Company */}
                  <div className="g-card" style={{ padding: '20px' }}>
                    <div className="g-section-title"><i className="bi bi-building" style={{ color: '#1a56db' }}></i>Your Company</div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      {company.logo
                        ? <img src={company.logo} alt="logo" style={{ maxHeight: 44, borderRadius: 8, border: '1.5px solid rgba(200,200,240,0.4)' }} />
                        : <div style={{ width: 72, height: 44, borderRadius: 8, background: 'rgba(200,200,240,0.2)', border: '1.5px dashed rgba(200,200,240,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#889' }}>No Logo</div>
                      }
                      <div style={{ display: 'flex', gap: 6 }}>
                        <label className="g-btn g-btn-ghost g-btn-sm" style={{ cursor: 'pointer' }}>
                          <i className="bi bi-upload"></i>Upload
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogo} />
                        </label>
                        {company.logo && <button className="g-btn g-btn-danger g-btn-sm" onClick={() => setCompany(p => ({ ...p, logo: null }))}>Remove</button>}
                      </div>
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#778', display: 'block', marginBottom: 4 }}>Select from Master</label>
                      <select className="g-input" style={{ width: '100%' }} value={company.name} onChange={e => handleCompanySelect(e.target.value)}>
                        <option value="">-- Select Company --</option>
                        {companyMaster.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#778', display: 'block', marginBottom: 3 }}>Company Name *</label>
                        <input className="g-input" style={{ width: '100%' }} placeholder="Company Name" value={company.name} onChange={e => setCompany(p => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#778', display: 'block', marginBottom: 3 }}>Address</label>
                        <textarea className="g-input" rows="2" style={{ width: '100%', resize: 'vertical' }} placeholder="Street / Area" value={company.address} onChange={e => setCompany(p => ({ ...p, address: e.target.value }))} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 6 }}>
                        <input className="g-input" placeholder="City" value={company.city} onChange={e => setCompany(p => ({ ...p, city: e.target.value }))} />
                        <input className="g-input" placeholder="State" value={company.state} onChange={e => setCompany(p => ({ ...p, state: e.target.value }))} />
                        <input className="g-input" placeholder="PIN" value={company.pincode} onChange={e => setCompany(p => ({ ...p, pincode: e.target.value }))} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#778', display: 'block', marginBottom: 3 }}>GSTIN</label>
                          <input className="g-input" placeholder="22AAAAA0000A1Z5" value={company.gstin} onChange={e => setCompany(p => ({ ...p, gstin: e.target.value.toUpperCase() }))} style={{ width: '100%' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#778', display: 'block', marginBottom: 3 }}>Phone</label>
                          <input className="g-input" placeholder="Phone" value={company.phone} onChange={e => setCompany(p => ({ ...p, phone: e.target.value }))} style={{ width: '100%' }} />
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#778', display: 'block', marginBottom: 3 }}>Email</label>
                        <input className="g-input" type="email" placeholder="Email" value={company.email} onChange={e => setCompany(p => ({ ...p, email: e.target.value }))} style={{ width: '100%' }} />
                      </div>
                    </div>
                  </div>

                  {/* Customer */}
                  <div className="g-card" style={{ padding: '20px' }}>
                    <div className="g-section-title"><i className="bi bi-person-lines-fill" style={{ color: '#00b450' }}></i>Bill To (Customer)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ position: 'relative' }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#778', display: 'block', marginBottom: 3 }}>Customer Name *</label>
                        <input
                          className="g-input" style={{ width: '100%' }}
                          placeholder="Customer / Party Name"
                          value={customer.name} autoComplete="off"
                          onChange={e => { setCustomer(p => ({ ...p, name: e.target.value })); setShowCustomerDropdown(true); }}
                          onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                          onFocus={() => customer.name && setShowCustomerDropdown(true)}
                        />
                        {showCustomerDropdown && filteredCustomers.length > 0 && (
                          <ul style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
                            maxHeight: 200, overflowY: 'auto',
                            background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(16px)',
                            borderRadius: '0 0 12px 12px', border: '1.5px solid rgba(200,200,240,0.5)',
                            boxShadow: '0 8px 24px rgba(100,100,200,0.15)', margin: 0, padding: 0, listStyle: 'none'
                          }}>
                            {filteredCustomers.map(c => (
                              <li key={c.CustomerID} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid rgba(200,200,240,0.3)', transition: 'background 0.15s' }}
                                onMouseDown={() => handleCustomerSelect(c)}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(26,86,219,0.06)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <strong>{c.CustomerName}</strong>
                                {c.Phone && <span style={{ color: '#889', marginLeft: 8, fontSize: 12 }}>· {c.Phone}</span>}
                                {c.Address && <span style={{ color: '#889', marginLeft: 8, fontSize: 12 }}>· {c.Address}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#778', display: 'block', marginBottom: 3 }}>Address</label>
                        <textarea className="g-input" rows="2" style={{ width: '100%', resize: 'vertical' }} placeholder="Street / Area" value={customer.address} onChange={e => setCustomer(p => ({ ...p, address: e.target.value }))} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 6 }}>
                        <input className="g-input" placeholder="City" value={customer.city} onChange={e => setCustomer(p => ({ ...p, city: e.target.value }))} />
                        <input className="g-input" placeholder="State" value={customer.state} onChange={e => setCustomer(p => ({ ...p, state: e.target.value }))} />
                        <input className="g-input" placeholder="PIN" value={customer.pincode} onChange={e => setCustomer(p => ({ ...p, pincode: e.target.value }))} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#778', display: 'block', marginBottom: 3 }}>Customer GSTIN</label>
                          <input className="g-input" placeholder="GSTIN" value={customer.gstin} onChange={e => setCustomer(p => ({ ...p, gstin: e.target.value.toUpperCase() }))} style={{ width: '100%' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#778', display: 'block', marginBottom: 3 }}>Phone</label>
                          <input className="g-input" placeholder="Phone" value={customer.phone} onChange={e => setCustomer(p => ({ ...p, phone: e.target.value }))} style={{ width: '100%' }} />
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#778', display: 'block', marginBottom: 3 }}>Notes / Terms</label>
                        <textarea className="g-input" rows="3" style={{ width: '100%', resize: 'vertical' }} placeholder="Payment terms, delivery notes..." value={notes} onChange={e => setNotes(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Section 3: Items Table ── */}
                <div className="g-card" style={{ padding: '20px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div className="g-section-title" style={{ marginBottom: 0 }}><i className="bi bi-cart3" style={{ color: '#0099cc' }}></i>Items</div>
                    <button className="g-btn g-btn-primary g-btn-sm" onClick={addItem}>
                      <i className="bi bi-plus-circle"></i>Add Item
                    </button>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table className="g-table">
                      <thead>
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
                            <tr key={item.id} style={{ background: overStock ? 'rgba(245,158,11,0.12)' : undefined }}>
                              <td>
                                <select className="g-input" style={{ width: '100%' }} value={item.name} onChange={e => handleItemSelect(item.id, e.target.value)}>
                                  <option value="">Select item...</option>
                                  {itemMaster.map(m => (
                                    <option key={m.id} value={m.name}>{m.name} (Stk:{m.stock || 0})</option>
                                  ))}
                                </select>
                              </td>
                              <td><input className="g-input" style={{ width: '100%' }} placeholder="HSN" value={item.hsn} onChange={e => updateItem(item.id, 'hsn', e.target.value)} /></td>
                              <td><input className="g-input" style={{ width: '100%', textAlign: 'right' }} type="number" min="0" value={item.qty} onChange={e => updateItem(item.id, 'qty', parseFloat(e.target.value) || 0)} /></td>
                              <td>
                                <select className="g-input" style={{ width: '100%' }} value={item.unit} onChange={e => updateItem(item.id, 'unit', e.target.value)}>
                                  {['Nos', 'Kg', 'Gm', 'Ltr', 'Mtr', 'Box', 'Pcs', 'Set', 'Pair'].map(u => <option key={u}>{u}</option>)}
                                </select>
                              </td>
                              <td><input className="g-input" style={{ width: '100%', textAlign: 'right' }} type="number" min="0" step="0.01" value={item.rate} onChange={e => updateItem(item.id, 'rate', parseFloat(e.target.value) || 0)} /></td>
                              <td><input className="g-input" style={{ width: '100%', textAlign: 'right' }} type="number" min="0" max="100" step="0.01" value={item.disc} onChange={e => updateItem(item.id, 'disc', parseFloat(e.target.value) || 0)} /></td>
                              {gstMode !== 'none' && (
                                <td>
                                  <select className="g-input" style={{ width: '100%' }} value={item.gstPercent} onChange={e => updateItem(item.id, 'gstPercent', parseFloat(e.target.value))}>
                                    {GST_SLABS.map(s => <option key={s} value={s}>{s}%</option>)}
                                  </select>
                                </td>
                              )}
                              <td style={{ textAlign: 'center' }}>
                                {stock !== null
                                  ? <span className={`g-badge ${stock === 0 ? 'g-badge-red' : stock < 10 ? 'g-badge-yellow' : 'g-badge-green'}`}>{stock}</span>
                                  : <span style={{ color: '#aaa' }}>—</span>}
                              </td>
                              {gstMode !== 'none' && <td style={{ textAlign: 'right', color: '#778', fontSize: 12 }}>₹{c.taxAmt.toFixed(2)}</td>}
                              <td style={{ textAlign: 'right', fontWeight: 700, color: '#00843d' }}>₹{c.total.toFixed(2)}</td>
                              <td>
                                <button className="g-btn g-btn-danger g-btn-sm" style={{ borderRadius: 10, padding: '5px 10px' }} onClick={() => removeItem(item.id)}>
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>

                  {/* GST Breakup */}
                  {gstMode !== 'none' && (
                    <div className="g-card" style={{ padding: '18px' }}>
                      <div className="g-section-title"><i className="bi bi-table" style={{ color: '#f59e0b' }}></i>GST Breakup</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: '1.5px solid rgba(200,200,240,0.4)' }}>
                            <th style={{ padding: '6px 8px', fontWeight: 600, color: '#556', textAlign: 'left' }}>GST%</th>
                            <th style={{ padding: '6px 8px', fontWeight: 600, color: '#556', textAlign: 'right' }}>Taxable</th>
                            {isInterState ? <th style={{ padding: '6px 8px', fontWeight: 600, color: '#556', textAlign: 'right' }}>IGST</th> : <>
                              <th style={{ padding: '6px 8px', fontWeight: 600, color: '#556', textAlign: 'right' }}>CGST</th>
                              <th style={{ padding: '6px 8px', fontWeight: 600, color: '#556', textAlign: 'right' }}>SGST</th>
                            </>}
                            <th style={{ padding: '6px 8px', fontWeight: 600, color: '#556', textAlign: 'right' }}>Tax</th>
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
                              <tr key={slab} style={{ borderBottom: '1px solid rgba(200,200,240,0.25)' }}>
                                <td style={{ padding: '7px 8px' }}><span className="g-badge g-badge-gray">{slab}%</span></td>
                                <td style={{ padding: '7px 8px', textAlign: 'right' }}>₹{slabTaxable.toFixed(2)}</td>
                                {isInterState ? <td style={{ padding: '7px 8px', textAlign: 'right' }}>₹{slabTax.toFixed(2)}</td> : <>
                                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>₹{slabCgst.toFixed(2)}</td>
                                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>₹{slabSgst.toFixed(2)}</td>
                                </>}
                                <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700 }}>₹{slabTax.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Totals + Actions */}
                  <div className="g-card" style={{ padding: '18px' }}>
                    <div style={{ marginBottom: 12 }}>
                      {[
                        ['Gross Amount', totals.gross, '#556'],
                        ...(totals.disc > 0 ? [['Discount', -totals.disc, '#dc2626']] : []),
                        ['Taxable Amount', totals.taxable, '#556'],
                        ...(gstMode !== 'none' && isInterState ? [['IGST', totals.igst, '#778']] : []),
                        ...(gstMode !== 'none' && !isInterState ? [['CGST', totals.cgst, '#778'], ['SGST', totals.sgst, '#778']] : []),
                      ].map(([label, val, color]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: '1px solid rgba(200,200,240,0.2)' }}>
                          <span style={{ color }}>{label}</span>
                          <span style={{ color, fontWeight: 500 }}>{val < 0 ? '- ' : ''}₹{Math.abs(val).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="g-total-row">
                      <span style={{ fontWeight: 700, fontSize: 15 }}>Grand Total</span>
                      <span style={{ fontWeight: 800, fontSize: 17, color: '#1a56db' }}>₹{totals.total.toFixed(2)}</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="g-btn g-btn-ghost" style={{ flex: 1, borderRadius: 14 }} onClick={resetForm}>
                          <i className="bi bi-arrow-clockwise"></i>New Bill
                        </button>
                        <button className="g-btn g-btn-warning" style={{ flex: 1, borderRadius: 14 }} onClick={() => setPreview(true)}>
                          <i className="bi bi-eye"></i>Preview
                        </button>
                      </div>
                      <button className="g-btn g-btn-success g-btn-lg g-btn-block" style={{ borderRadius: 14 }} onClick={saveBill} disabled={saving}>
                        {saving
                          ? <><span className="spinner-border spinner-border-sm" style={{ width: 16, height: 16, borderWidth: 2 }}></span>&nbsp;Saving...</>
                          : <><i className="bi bi-save"></i>{editingBillId ? 'Update Bill' : 'Save Bill'}</>
                        }
                      </button>
                      <button
                        className="g-btn g-btn-cyan g-btn-lg g-btn-block"
                        style={{
                          borderRadius: 14,
                          opacity: isBillSaved ? 1 : 0.5,
                          cursor: (() => {
                            if (!isBillSaved) return 'not-allowed';
                            const paid = receipts.filter(r => r.paymentDocNumber === billNo).reduce((sum, r) => sum + parseFloat(r.receiptAmount || 0), 0);
                            return paid >= totals.total ? 'not-allowed' : 'pointer';
                          })(),
                        }}
                        disabled={!isBillSaved || (() => {
                          const paid = receipts.filter(r => r.paymentDocNumber === billNo).reduce((sum, r) => sum + parseFloat(r.receiptAmount || 0), 0);
                          return paid >= totals.total;
                        })()}
                        title={!isBillSaved ? 'Save the bill first to enable payment' : (() => {
                          const paid = receipts.filter(r => r.paymentDocNumber === billNo).reduce((sum, r) => sum + parseFloat(r.receiptAmount || 0), 0);
                          return paid >= totals.total ? 'Invoice fully paid — no further payment allowed' : '';
                        })()}
                        onClick={() => {
                          if (!isBillSaved) return;
                          const paid = receipts.filter(r => r.paymentDocNumber === billNo).reduce((sum, r) => sum + parseFloat(r.receiptAmount || 0), 0);
                          if (paid >= totals.total) return;
                          selectInvoiceForPayment({ total: totals.total, customer: customer.name, billNo, companyName: company.name || '', balance: Math.max(0, totals.total - paid) });
                        }}
                      >
                        <i className={`bi ${isBillSaved ? 'bi-receipt' : 'bi-lock'}`}></i>
                        {!isBillSaved
                          ? 'Receipt Payment (Save First)'
                          : (() => {
                              const paid = receipts.filter(r => r.paymentDocNumber === billNo).reduce((sum, r) => sum + parseFloat(r.receiptAmount || 0), 0);
                              return paid >= totals.total
                                ? '✓ Fully Paid'
                                : `Receipt Payment (₹${Math.max(0, totals.total - paid).toLocaleString()})`;
                            })()
                        }
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              )} {/* end phoneStep else */}
            </div>
          )}

          {/* ════════════ SAVED BILLS TAB ════════════ */}
          {activeTab === 'list' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <h4 style={{ fontWeight: 700, margin: 0, color: '#1a1a2e' }}>Saved Bills ({bills.length})</h4>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[['all', 'All', bills.length, 'g-btn-dark'],
                      ['pending', 'Pending', bills.filter(b => getBillStatus(b) === 'pending').length, 'g-btn-warning'],
                      ['paid', 'Paid', bills.filter(b => getBillStatus(b) === 'paid').length, 'g-btn-success']
                    ].map(([val, label, count, cls]) => (
                      <button key={val} className={`g-btn g-btn-sm ${statusFilter === val ? cls : 'g-btn-ghost'}`}
                        style={{ borderRadius: 10 }} onClick={() => setStatusFilter(val)}>
                        {label} <span className="g-badge g-badge-gray" style={{ marginLeft: 4 }}>{count}</span>
                      </button>
                    ))}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#889', fontSize: 13 }}></i>
                    <input className="g-input" style={{ paddingLeft: 34, width: 240 }}
                      placeholder="Search customer / bill no..." value={searchBill} onChange={e => setSearchBill(e.target.value)} />
                  </div>
                </div>
              </div>

              {filteredBills.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                  <i className="bi bi-inbox" style={{ fontSize: 56, color: '#bbc', display: 'block', marginBottom: 12 }}></i>
                  <h5 style={{ color: '#889' }}>{searchBill ? 'No results found' : 'No bills yet'}</h5>
                  <button className="g-btn g-btn-primary" style={{ marginTop: 16 }} onClick={() => setActiveTab('new')}>
                    <i className="bi bi-plus-circle"></i>Create First Bill
                  </button>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="g-table">
                    <thead>
                      <tr>
                        <th>Bill No</th>
                        <th>Date</th>
                        <th>Company</th>
                        <th>Customer</th>
                        <th style={{ textAlign: 'right' }}>Taxable</th>
                        <th style={{ textAlign: 'right' }}>GST</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th>GST Mode</th>
                        <th style={{ textAlign: 'center' }}>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBills.map(bill => (
                        <tr key={bill.id}>
                          <td><span className="g-badge g-badge-blue">{bill.billNo}</span></td>
                          <td><span style={{ fontSize: 12, color: '#667' }}>{new Date(bill.billDate).toLocaleDateString('en-IN')}</span></td>
                          <td style={{ fontWeight: 600 }}>{bill.company?.name || '—'}</td>
                          <td>{bill.customer?.name || '—'}</td>
                          <td style={{ textAlign: 'right' }}>₹{(bill.totals?.taxable || 0).toFixed(2)}</td>
                          <td style={{ textAlign: 'right', color: '#b45309' }}>₹{(bill.totals?.tax || 0).toFixed(2)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, color: '#00843d' }}>₹{(bill.totals?.total || 0).toFixed(2)}</div>
                            <div style={{ fontSize: 11, color: '#889' }}>Bal: ₹{Math.max(0, (bill.totals?.total || 0) - receipts.filter(r => r.paymentDocNumber === bill.billNo).reduce((sum, r) => sum + (r.receiptAmount || 0), 0)).toLocaleString()}</div>
                          </td>
                          <td><span className={`g-badge ${bill.gstMode === 'none' ? 'g-badge-gray' : 'g-badge-green'}`}>{bill.gstMode}</span></td>
                          <td style={{ textAlign: 'center' }}>
                            {getBillStatus(bill) === 'paid'
                              ? <span className="g-badge g-badge-green"><i className="bi bi-check-circle-fill me-1"></i>PAID</span>
                              : <span className="g-badge g-badge-yellow"><i className="bi bi-clock-fill me-1"></i>PENDING</span>
                            }
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="g-btn g-btn-sm" style={{ borderRadius: 10, padding: '5px 10px', background: '#ede9fe', color: '#7c3aed', border: '1px solid #ddd6fe' }} onClick={() => setViewBill(bill)} title="View"><i className="bi bi-eye"></i></button>
                              <button className="g-btn g-btn-primary g-btn-sm" style={{ borderRadius: 10, padding: '5px 10px' }} onClick={() => editBill(bill)} title="Edit"><i className="bi bi-pencil"></i></button>
                              <button className="g-btn g-btn-success g-btn-sm" style={{ borderRadius: 10, padding: '5px 10px' }} onClick={() => { editBill(bill); setTimeout(() => setPreview(true), 100); }} title="Print"><i className="bi bi-printer"></i></button>
                              {getBillStatus(bill) === 'paid' ? (
                                <button
                                  className="g-btn g-btn-sm"
                                  style={{ borderRadius: 10, padding: '5px 10px', background: '#d1fae5', color: '#16a34a', border: '1px solid #bbf7d0', cursor: 'not-allowed', opacity: 0.7 }}
                                  title="Invoice fully paid — no further payment allowed"
                                  disabled
                                >
                                  <i className="bi bi-check-circle-fill"></i>
                                </button>
                              ) : (
                                <button className="g-btn g-btn-cyan g-btn-sm" style={{ borderRadius: 10, padding: '5px 10px' }} title="Payment" onClick={() => selectInvoiceForPayment({
                                  billNo: bill.billNo, customer: bill.customer.name, total: bill.totals.total,
                                  companyName: bill.company.name, invoiceDate: bill.billDate,
                                  balance: bill.totals.total - receipts.filter(r => r.paymentDocNumber === bill.billNo).reduce((sum, r) => sum + parseFloat(r.receiptAmount), 0)
                                })}><i className="bi bi-receipt"></i></button>
                              )}
                              <button className="g-btn g-btn-danger g-btn-sm" style={{ borderRadius: 10, padding: '5px 10px' }} onClick={() => deleteBill(bill.id)} title="Delete"><i className="bi bi-trash"></i></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="4">Total ({filteredBills.length} bills)</td>
                        <td style={{ textAlign: 'right' }}>₹{filteredBills.reduce((s, b) => s + (b.totals?.taxable || 0), 0).toFixed(2)}</td>
                        <td style={{ textAlign: 'right', color: '#b45309' }}>₹{filteredBills.reduce((s, b) => s + (b.totals?.tax || 0), 0).toFixed(2)}</td>
                        <td style={{ textAlign: 'right', color: '#00843d' }}>₹{filteredBills.reduce((s, b) => s + (b.totals?.total || 0), 0).toFixed(2)}</td>
                        <td colSpan="3"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Bill View Modal ──────────────────────────────── */}
      {viewBill && (() => {
        const b = viewBill;
        const paid = receipts.filter(r => r.paymentDocNumber === b.billNo).reduce((sum, r) => sum + parseFloat(r.receiptAmount || 0), 0);
        const balance = Math.max(0, (b.totals?.total || 0) - paid);
        const isPaid = getBillStatus(b) === 'paid';
        const items = b.items || [];

        const handlePrint = () => {
          const win = window.open('', '_blank', 'width=680,height=800');
          win.document.write(`<!DOCTYPE html><html><head><title>Invoice - ${b.billNo}</title><style>
            *{box-sizing:border-box;margin:0;padding:0}
            body{font-family:'Segoe UI',sans-serif;background:#fff;color:#1e293b;padding:32px;font-size:13px}
            .header{background:linear-gradient(135deg,#4f3cc9,#7e3af2);color:#fff;border-radius:12px;padding:20px 24px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center}
            .header h2{font-size:18px;font-weight:700}.header p{font-size:12px;opacity:.8;margin-top:4px}
            .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}
            .paid{background:#d1fae5;color:#065f46}.pending{background:#fef3c7;color:#92400e}
            .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:20px}
            .meta-item label{font-size:11px;color:#64748b;display:block;margin-bottom:2px}.meta-item span{font-weight:600}
            table{width:100%;border-collapse:collapse;margin-bottom:16px}
            th{background:#f8fafc;padding:8px 10px;text-align:left;font-size:12px;color:#64748b;border-bottom:2px solid #e2e8f0}
            td{padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:13px}
            .totals{margin-left:auto;width:260px}.totals .row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9}
            .totals .total-row{font-weight:700;font-size:15px;color:#00843d;border-top:2px solid #e2e8f0;padding-top:8px}
            .footer{margin-top:28px;text-align:center;font-size:11px;color:#94a3b8}
            @media print{body{padding:16px}}
          </style></head><body>
            <div class="header">
              <div><h2>${b.billNo}</h2><p>${new Date(b.billDate).toLocaleDateString('en-IN')} &nbsp;·&nbsp; ${b.company?.name || '—'}</p></div>
              <span class="badge ${isPaid ? 'paid' : 'pending'}">${isPaid ? '✓ PAID' : '⏳ PENDING'}</span>
            </div>
            <div class="meta">
              <div class="meta-item"><label>Customer</label><span>${b.customer?.name || '—'}</span></div>
              <div class="meta-item"><label>Phone</label><span>${b.customer?.phone || '—'}</span></div>
              <div class="meta-item"><label>GST Mode</label><span>${b.gstMode || '—'}</span></div>
              <div class="meta-item"><label>Balance Due</label><span style="color:${balance > 0 ? '#dc2626' : '#16a34a'}">₹${balance.toLocaleString('en-IN', {minimumFractionDigits:2})}</span></div>
            </div>
            <table>
              <thead><tr><th>#</th><th>Item</th><th>HSN</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">GST%</th><th style="text-align:right">Amount</th></tr></thead>
              <tbody>${items.map((it, i) => `<tr>
                <td>${i + 1}</td><td>${it.name || it.itemName || '—'}</td><td>${it.hsn || '—'}</td>
                <td style="text-align:right">${it.qty || it.quantity || 0}</td>
                <td style="text-align:right">₹${parseFloat(it.rate || it.price || 0).toFixed(2)}</td>
                <td style="text-align:right">${it.gst || it.gstRate || 0}%</td>
                <td style="text-align:right">₹${parseFloat(it.total || it.amount || 0).toFixed(2)}</td>
              </tr>`).join('')}</tbody>
            </table>
            <div class="totals">
              <div class="row"><span>Taxable</span><span>₹${(b.totals?.taxable || 0).toFixed(2)}</span></div>
              <div class="row"><span>GST</span><span style="color:#b45309">₹${(b.totals?.tax || 0).toFixed(2)}</span></div>
              <div class="row total-row"><span>Total</span><span>₹${(b.totals?.total || 0).toFixed(2)}</span></div>
              <div class="row"><span>Paid</span><span style="color:#16a34a">₹${paid.toFixed(2)}</span></div>
              <div class="row"><span>Balance</span><span style="color:${balance>0?'#dc2626':'#16a34a'}">₹${balance.toFixed(2)}</span></div>
            </div>
            <div class="footer">Secured by <strong>DIGICODE PRO</strong> · InvoicePro</div>
          </body></html>`);
          win.document.close();
          win.focus();
          setTimeout(() => { win.print(); win.close(); }, 400);
        };

        return (
          <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
            onClick={() => setViewBill(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, boxShadow:'0 24px 64px rgba(0,0,0,0.3)', width:'100%', maxWidth:580, maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column' }}>

              {/* Header */}
              <div style={{ background:'linear-gradient(135deg,#4f3cc9,#7e3af2)', padding:'18px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <i className="bi bi-file-earmark-text" style={{ color:'#fff', fontSize:22 }}></i>
                  <div>
                    <div style={{ color:'#fff', fontWeight:700, fontSize:17 }}>{b.billNo}</div>
                    <div style={{ color:'rgba(255,255,255,0.75)', fontSize:12 }}>{new Date(b.billDate).toLocaleDateString('en-IN')} · {b.company?.name || '—'}</div>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ background: isPaid ? '#d1fae5' : '#fef3c7', color: isPaid ? '#065f46' : '#92400e', borderRadius:20, padding:'3px 12px', fontSize:12, fontWeight:700 }}>
                    {isPaid ? '✓ PAID' : '⏳ PENDING'}
                  </span>
                  <button onClick={() => setViewBill(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, color:'#fff', width:32, height:32, cursor:'pointer', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
                </div>
              </div>

              {/* Body */}
              <div style={{ padding:'20px 24px', overflowY:'auto', flex:1 }}>

                {/* Meta grid */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 24px', marginBottom:20 }}>
                  {[
                    { label:'Customer',  value: b.customer?.name || '—' },
                    { label:'Phone',     value: b.customer?.phone || '—' },
                    { label:'GST Mode',  value: b.gstMode || '—' },
                    { label:'Balance',   value: `₹${balance.toLocaleString('en-IN', {minimumFractionDigits:2})}`, color: balance > 0 ? '#dc2626' : '#16a34a' },
                  ].map(row => (
                    <div key={row.label}>
                      <div style={{ fontSize:11, color:'#64748b', marginBottom:2 }}>{row.label}</div>
                      <div style={{ fontWeight:600, color: row.color || '#1e293b' }}>{row.value}</div>
                    </div>
                  ))}
                </div>

                {/* Items table */}
                {items.length > 0 && (
                  <div style={{ overflowX:'auto', marginBottom:16 }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                      <thead>
                        <tr style={{ background:'#f8fafc' }}>
                          {['#','Item','Qty','Rate','GST%','Amount'].map(h => (
                            <th key={h} style={{ padding:'8px 10px', textAlign: ['Qty','Rate','GST%','Amount'].includes(h) ? 'right' : 'left', fontSize:11, color:'#64748b', borderBottom:'2px solid #e2e8f0', fontWeight:600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it, i) => (
                          <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                            <td style={{ padding:'7px 10px', color:'#94a3b8', fontSize:12 }}>{i+1}</td>
                            <td style={{ padding:'7px 10px', fontWeight:500 }}>{it.name || it.itemName || '—'}</td>
                            <td style={{ padding:'7px 10px', textAlign:'right' }}>{it.qty || it.quantity || 0}</td>
                            <td style={{ padding:'7px 10px', textAlign:'right' }}>₹{parseFloat(it.rate || it.price || 0).toFixed(2)}</td>
                            <td style={{ padding:'7px 10px', textAlign:'right' }}>{it.gst || it.gstRate || 0}%</td>
                            <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:600 }}>₹{parseFloat(it.total || it.amount || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Totals */}
                <div style={{ marginLeft:'auto', width:240 }}>
                  {[
                    { label:'Taxable', value:`₹${(b.totals?.taxable||0).toFixed(2)}` },
                    { label:'GST',     value:`₹${(b.totals?.tax||0).toFixed(2)}`, color:'#b45309' },
                    { label:'Total',   value:`₹${(b.totals?.total||0).toFixed(2)}`, color:'#00843d', bold:true, big:true },
                    { label:'Paid',    value:`₹${paid.toFixed(2)}`, color:'#16a34a' },
                    { label:'Balance', value:`₹${balance.toFixed(2)}`, color: balance>0 ? '#dc2626' : '#16a34a', bold:true },
                  ].map(row => (
                    <div key={row.label} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9' }}>
                      <span style={{ color:'#64748b', fontSize:13 }}>{row.label}</span>
                      <span style={{ fontWeight: row.bold ? 700 : 600, fontSize: row.big ? 15 : 13, color: row.color || '#1e293b' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, flexShrink:0, borderTop:'1px solid #f1f5f9' }}>
                <button onClick={handlePrint} style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:10, padding:'9px 22px', fontWeight:600, cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', gap:7 }}>
                  <i className="bi bi-printer"></i> Print
                </button>
                <button onClick={() => setViewBill(null)} style={{ background:'linear-gradient(135deg,#4f3cc9,#7e3af2)', color:'#fff', border:'none', borderRadius:10, padding:'9px 24px', fontWeight:600, cursor:'pointer', fontSize:14 }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default SaleInvoice;