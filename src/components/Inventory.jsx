import React, { useState, useCallback, useEffect } from 'react';
import { useTheme } from '../App';
import { useItemMaster } from '../contexts/ItemMasterContext';
import { useCompanyMaster } from '../contexts/CompanyMasterContext';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import ReceiveRecords from './ReceiveRecords';

// DB returns: ItemCode, ItemName, Rate, Tax, Stock, CreatedDate


// ── POTab component ───────────────────────────────────────────────────────────
const STATUS_COLORS = {
  Draft:     'bg-secondary',
  Confirmed: 'bg-primary',
  Received:  'bg-success',
  Cancelled: 'bg-danger',
};

const POTab = ({ pos, poLoading, poError, onRefresh, onNew, onView, onStatusChange, onDelete, onReceiveFromPO }) => {
  const [filterStatus, setFilterStatus] = React.useState('');
  const [search, setSearch] = React.useState('');

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—';
  const fmtMoney = (n) => n != null ? `Rs.${Number(n).toLocaleString('en-IN', {minimumFractionDigits:2})}` : '—';

  const filtered = pos.filter(p => {
    if (filterStatus && p.Status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      return (p.PODocNo||'').toLowerCase().includes(s) ||
             (p.SupplierName||'').toLowerCase().includes(s) ||
             (p.CompanyName||'').toLowerCase().includes(s) ||
             (p.ProjectName||'').toLowerCase().includes(s);
    }
    return true;
  });

  if (poLoading) return (
    <div className="text-center py-5">
      <span className="spinner-border text-primary me-2"></span>Loading purchase orders...
    </div>
  );

  if (poError) return (
    <div className="alert alert-danger">
      <i className="bi bi-exclamation-triangle me-2"></i>{poError}
      <button className="btn btn-sm btn-outline-danger ms-3" onClick={onRefresh}>Retry</button>
    </div>
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="glass-card p-3 mb-4">
        <div className="row g-2 align-items-end">
          <div className="col-12 col-md-4">
            <div className="input-group input-group-sm">
              <span className="input-group-text"><i className="bi bi-search"></i></span>
              <input type="text" className="form-control" placeholder="Search PO, supplier, company..."
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="btn btn-outline-secondary" onClick={() => setSearch('')}><i className="bi bi-x"></i></button>}
            </div>
          </div>
          <div className="col-12 col-md-3">
            <select className="form-select form-select-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {['Draft','Confirmed','Received','Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-5 d-flex gap-2 justify-content-md-end">
            <button className="g-btn g-btn-ghost g-btn-sm" onClick={onRefresh}>
              <i className="bi bi-arrow-clockwise me-1"></i>Refresh
            </button>
            <button className="g-btn g-btn-success g-btn-sm" onClick={onNew}>
              <i className="bi bi-plus-circle me-1"></i>New PO
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card text-center p-5">
          <i className="bi bi-clipboard2-x display-3 text-muted d-block mb-3"></i>
          <p className="text-muted mb-3">{pos.length === 0 ? 'No purchase orders yet.' : 'No POs match your filter.'}</p>
          <button className="g-btn g-btn-success" onClick={onNew}>
            <i className="bi bi-plus-circle me-1"></i>Create First PO
          </button>
        </div>
      ) : (
        <div className="glass-card shadow-lg overflow-hidden">
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle">
              <thead className="table-dark">
                <tr>
                  <th>PO Doc No</th>
                  <th>Company</th>
                  <th>Project</th>
                  <th>Supplier</th>
                  <th>Order Date</th>
                  <th>Delivery Date</th>
                  <th className="text-center">Items</th>
                  <th className="text-end">Total Value</th>
                  <th className="text-center">Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(po => (
                  <tr key={po.POID}>
                    <td>
                      <button className="btn btn-link btn-sm p-0 fw-bold text-primary" onClick={() => onView(po)}>
                        {po.PODocNo}
                      </button>
                    </td>
                    <td className="small">{po.CompanyName || <span className="text-muted">—</span>}</td>
                    <td className="small">{po.ProjectName || <span className="text-muted">—</span>}</td>
                    <td className="fw-semibold small">{po.SupplierName}</td>
                    <td className="small">{fmtDate(po.OrderDate)}</td>
                    <td className="small">{fmtDate(po.DeliveryDate)}</td>
                    <td className="text-center"><span className="badge bg-secondary">{po.ItemCount || 0}</span></td>
                    <td className="text-end small fw-semibold">{fmtMoney(po.TotalValue)}</td>
                    <td className="text-center">
                      {po.Status === 'Received' ? (
                        <span className="badge bg-success d-inline-flex align-items-center gap-1">
                          <i className="bi bi-check-circle-fill"></i> Received
                        </span>
                      ) : po.Status === 'Cancelled' ? (
                        <span className="badge bg-danger d-inline-flex align-items-center gap-1">
                          <i className="bi bi-x-circle-fill"></i> Cancelled
                        </span>
                      ) : (
                        <select
                          className={`badge border-0 ${STATUS_COLORS[po.Status] || 'bg-secondary'} small`}
                          style={{ cursor: 'pointer', fontSize: '0.75rem' }}
                          value={po.Status}
                          onChange={e => onStatusChange(po.POID, e.target.value)}
                        >
                          {['Draft', 'Confirmed', 'Received', 'Cancelled'].map(s => (
                            <option key={s} value={s} style={{ color: '#000', background: '#fff' }}>{s}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      <div className="d-flex gap-1">
                        <button className="g-btn g-btn-ghost g-btn-sm" onClick={() => onView(po)} title="View">
                          <i className="bi bi-eye"></i>
                        </button>
                        {po.Status === 'Received' ? (
                          <span className="g-btn g-btn-ghost g-btn-sm text-muted d-inline-flex align-items-center gap-1"
                            style={{ opacity: 0.5, cursor: 'not-allowed', fontSize: '0.75rem', padding: '4px 8px' }}
                            title="Already received">
                            <i className="bi bi-check2-all"></i> Received
                          </span>
                        ) : po.Status === 'Cancelled' ? (
                          <span className="g-btn g-btn-ghost g-btn-sm text-muted d-inline-flex align-items-center gap-1"
                            style={{ opacity: 0.4, cursor: 'not-allowed', fontSize: '0.75rem', padding: '4px 8px' }}
                            title="PO is cancelled">
                            <i className="bi bi-slash-circle"></i> Cancelled
                          </span>
                        ) : (
                          (po.Status === 'Confirmed' || po.Status === 'Draft') && onReceiveFromPO && (
                            <button
                              className="g-btn g-btn-success g-btn-sm"
                              onClick={() => onReceiveFromPO(po)}
                              title="Receive Items against this PO"
                            >
                              <i className="bi bi-arrow-down-circle me-1"></i>Receive
                            </button>
                          )
                        )}
                        <button className="g-btn g-btn-ghost g-btn-sm text-danger" onClick={() => onDelete(po)} title="Delete">
                          <i className="bi bi-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ── BreakdownTab component ────────────────────────────────────────────────────
const BreakdownTab = ({ breakdown, breakdownLoading, breakdownError, bkFilter, setBkFilter, onRefresh }) => {
  // Build cascading filter options
  const companies = [...new Set(breakdown.map(r => r.CompanyName).filter(Boolean))].sort();
  const projects  = [...new Set(
    breakdown
      .filter(r => !bkFilter.company || r.CompanyName === bkFilter.company)
      .map(r => r.ProjectName || '(No Project)')
  )].sort();
  const itemNames = [...new Set(
    breakdown
      .filter(r => !bkFilter.company || r.CompanyName === bkFilter.company)
      .filter(r => !bkFilter.project || (r.ProjectName || '(No Project)') === bkFilter.project)
      .map(r => r.ItemName)
      .filter(Boolean)
  )].sort();

  // Apply filters
  const filtered = breakdown.filter(r => {
    if (bkFilter.company && r.CompanyName !== bkFilter.company) return false;
    if (bkFilter.project && (r.ProjectName || '(No Project)') !== bkFilter.project) return false;
    if (bkFilter.item    && r.ItemName !== bkFilter.item) return false;
    return true;
  });

  // Group: company → project → items
  const grouped = {};
  for (const row of filtered) {
    const co  = row.CompanyName || '(Unknown Company)';
    const pr  = row.ProjectName || '(No Project)';
    const key = `${co}|||${pr}`;
    if (!grouped[co]) grouped[co] = {};
    if (!grouped[co][pr]) grouped[co][pr] = [];
    grouped[co][pr].push(row);
  }

  // Aggregate items within a group
  const aggregateItems = (rows) => {
    const map = {};
    for (const r of rows) {
      const k = r.ItemCode;
      if (!map[k]) map[k] = { ItemCode: r.ItemCode, ItemName: r.ItemName, totalQty: 0, receipts: 0, lastDate: null, lastGRN: r.GRNDocNo };
      map[k].totalQty  += Number(r.QtyReceived) || 0;
      map[k].receipts  += 1;
      const d = new Date(r.ReceiptDate || r.ReceivedAt);
      if (!map[k].lastDate || d > map[k].lastDate) { map[k].lastDate = d; map[k].lastGRN = r.GRNDocNo; }
    }
    return Object.values(map);
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—';

  if (breakdownLoading) return (
    <div className="text-center py-5">
      <span className="spinner-border text-primary me-2"></span>Loading breakdown...
    </div>
  );

  if (breakdownError) return (
    <div className="alert alert-danger">
      <i className="bi bi-exclamation-triangle me-2"></i>{breakdownError}
      <button className="btn btn-sm btn-outline-danger ms-3" onClick={onRefresh}>Retry</button>
    </div>
  );

  return (
    <div>
      {/* Filters */}
      <div className="glass-card p-3 mb-4">
        <div className="row g-2 align-items-end">
          <div className="col-12 col-md-3">
            <label className="form-label small fw-semibold mb-1">Company</label>
            <select className="form-select form-select-sm" value={bkFilter.company}
              onChange={e => setBkFilter(f => ({ ...f, company: e.target.value, project: '', item: '' }))}>
              <option value="">All Companies</option>
              {companies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label small fw-semibold mb-1">Project</label>
            <select className="form-select form-select-sm" value={bkFilter.project}
              onChange={e => setBkFilter(f => ({ ...f, project: e.target.value, item: '' }))}>
              <option value="">All Projects</option>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label small fw-semibold mb-1">Item</label>
            <select className="form-select form-select-sm" value={bkFilter.item}
              onChange={e => setBkFilter(f => ({ ...f, item: e.target.value }))}>
              <option value="">All Items</option>
              {itemNames.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-3 d-flex gap-2">
            <button className="g-btn g-btn-ghost g-btn-sm" onClick={() => setBkFilter({ company: '', project: '', item: '' })}>
              <i className="bi bi-x-circle me-1"></i>Clear
            </button>
            <button className="g-btn g-btn-success g-btn-sm" onClick={onRefresh}>
              <i className="bi bi-arrow-clockwise me-1"></i>Refresh
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card text-center p-5">
          <i className="bi bi-inbox display-3 text-muted d-block mb-3"></i>
          <p className="text-muted">No stock receipt records found{bkFilter.company || bkFilter.project || bkFilter.item ? ' for selected filters' : '. Receive items to see the breakdown.'}.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([company, projectMap]) => {
          const coTotal = Object.values(projectMap).flat().reduce((s, r) => s + (Number(r.QtyReceived) || 0), 0);
          return (
            <div key={company} className="glass-card shadow-lg mb-4 overflow-hidden">
              {/* Company header */}
              <div className="p-3 d-flex justify-content-between align-items-center" style={{ background: 'rgba(var(--bs-primary-rgb),0.08)', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                <h6 className="mb-0 fw-bold">
                  <i className="bi bi-building me-2 text-primary"></i>{company}
                </h6>
                <span className="badge bg-primary">{coTotal.toLocaleString()} units total</span>
              </div>

              {Object.entries(projectMap).map(([project, rows]) => {
                const prTotal = rows.reduce((s, r) => s + (Number(r.QtyReceived) || 0), 0);
                const aggItems = aggregateItems(rows);
                return (
                  <div key={project} className="px-3 pb-3 pt-2">
                    {/* Project sub-header */}
                    <div className="d-flex justify-content-between align-items-center mb-2 mt-2">
                      <span className="fw-semibold text-secondary small">
                        <i className="bi bi-folder2-open me-1"></i>{project}
                      </span>
                      <span className="badge bg-secondary">{prTotal.toLocaleString()} units</span>
                    </div>
                    {/* Items table */}
                    <div className="table-responsive">
                      <table className="table table-sm table-hover mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Item</th>
                            <th className="text-end">Total Received</th>
                            <th className="text-end">Receipts</th>
                            <th>Last Received</th>
                            <th>Last GRN</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aggItems.map(item => (
                            <tr key={item.ItemCode}>
                              <td className="fw-semibold">{item.ItemName}</td>
                              <td className="text-end">{item.totalQty.toLocaleString()} units</td>
                              <td className="text-end"><span className="badge bg-light text-dark">{item.receipts}</span></td>
                              <td><small className="text-muted">{fmtDate(item.lastDate)}</small></td>
                              <td><small className="text-muted font-monospace">{item.lastGRN}</small></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
};
const getName  = (item) => item.ItemName ?? item.name ?? '';
const getRate  = (item) => Number(item.Rate  ?? item.defaultRate  ?? 0);
const getTax   = (item) => Number(item.Tax   ?? item.defaultTaxPercent ?? 0);
const getStock = (item) => Number(item.Stock ?? item.stock ?? 0);
const getId    = (item) => item.ItemCode ?? item.id ?? null;

const Inventory = ({ onNavigateToHome }) => {
  const { currentTheme } = useTheme();
  const { items: items_list, refreshItems } = useItemMaster();
  const [searchTerm, setSearchTerm]   = useState('');
  const [editingId, setEditingId]     = useState(null);
  const [editStock, setEditStock]     = useState(0);
  const [stockError, setStockError]   = useState('');
  const [savingStock, setSavingStock] = useState(false);

  const { companies } = useCompanyMaster();

  // GRN doc number generator
  const generateGRN = () => {
    const d = new Date();
    const datePart = d.getFullYear().toString() +
      String(d.getMonth()+1).padStart(2,'0') +
      String(d.getDate()).padStart(2,'0');
    const rand = String(Math.floor(Math.random()*9000)+1000);
    return `GRN-${datePart}-${rand}`;
  };

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const [receiveForm, setReceiveForm] = useState({ itemId: '', qty: '', note: '', date: '' });
  const [grnDocNo,       setGrnDocNo]       = useState('');
  const [grnCompanyId,   setGrnCompanyId]   = useState('');
  const [grnProjects,    setGrnProjects]    = useState([]);
  const [grnProjectName, setGrnProjectName] = useState('');
  const [receiveSuccess, setReceiveSuccess] = useState('');
  const [receiveError, setReceiveError]     = useState('');
  const [receiveSaving, setReceiveSaving]   = useState(false);
  const [linkedPO,       setLinkedPO]       = useState(null);  // { POID, PODocNo, items[] }
  const [grnSelectedPOId, setGrnSelectedPOId] = useState(''); // manual PO picker in receive modal
  const [transactions,    setTransactions]    = useState([]);
  const [txnLoading,      setTxnLoading]      = useState(false);

  // ── Stock Breakdown tab ────────────────────────────────────────────────────
  const [activeTab,        setActiveTab]        = useState('stock');   // 'stock' | 'breakdown' | 'po' | 'grn'
  const [breakdown,        setBreakdown]        = useState([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownError,   setBreakdownError]   = useState('');
  const [bkFilter,         setBkFilter]         = useState({ company: '', project: '', item: '' });

  // ── Purchase Orders state ─────────────────────────────────────────────────
  const [pos,        setPos]        = useState([]);
  const [poLoading,  setPoLoading]  = useState(false);
  const [poError,    setPoError]    = useState('');
  const [viewPO,     setViewPO]     = useState(null);   // PO being viewed in detail modal
  const [showPOForm, setShowPOForm] = useState(false);  // create modal open

  // PO form state
  const generatePONo = () => {
    const d = new Date();
    const dp = d.getFullYear().toString() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
    return `PO-${dp}-${String(Math.floor(Math.random()*9000)+1000)}`;
  };
  const emptyPOForm = () => ({
    poDocNo:      generatePONo(),
    companyId:    '',
    companyName:  '',
    projectName:  '',
    supplierId:   '',
    supplierName: '',
    orderDate:    new Date().toISOString().slice(0,10),
    deliveryDate: '',
    note:         '',
    items:        [{ itemCode: '', itemName: '', qty: '', unitPrice: '' }],
  });
  const [poForm,      setPoForm]      = useState(emptyPOForm);
  const [poProjects,  setPoProjects]  = useState([]);
  const [poSaving,    setPoSaving]    = useState(false);
  const [poFormError, setPoFormError] = useState('');
  const [suppliers,   setSuppliers]   = useState([]);  // from SUPPLIER_MASTER

  const fetchBreakdown = useCallback(async () => {
    setBreakdownLoading(true);
    setBreakdownError('');
    try {
      const API = import.meta.env.VITE_API_URL || '/api';
      const res = await axios.get(`${API}/stock-receipts`);
      const rows = Array.isArray(res.data) ? res.data : [];
      setBreakdown(rows);
    } catch (err) {
      setBreakdownError('Failed to load breakdown: ' + (err.response?.data?.error || err.message));
    } finally {
      setBreakdownLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'breakdown') fetchBreakdown();
  }, [activeTab, fetchBreakdown]);

  // ── Purchase Orders fetch + handlers ────────────────────────────────────────
  const fetchPOs = useCallback(async () => {
    setPoLoading(true);
    setPoError('');
    try {
      const API = import.meta.env.VITE_API_URL || '/api';
      const res = await axios.get(`${API}/po`);
      setPos(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setPoError('Failed to load POs: ' + (err.response?.data?.error || err.message));
    } finally {
      setPoLoading(false);
    }
  }, []);

  // ── Suppliers fetch (for PO dropdown) ────────────────────────────────────
  const fetchSuppliers = useCallback(async () => {
    try {
      const API = import.meta.env.VITE_API_URL || '/api';
      const res = await axios.get(`${API}/suppliers`);
      setSuppliers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load suppliers:', err.message);
    }
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  useEffect(() => { if (activeTab === 'po') fetchPOs(); }, [activeTab, fetchPOs]);

  const handlePoCompanySelect = async (companyId) => {
    setPoForm(f => ({ ...f, companyId, companyName: '', projectName: '' }));
    setPoProjects([]);
    if (!companyId) return;
    const API = import.meta.env.VITE_API_URL || '/api';
    try {
      const res = await fetch(`${API}/projects?company_id=${companyId}`);
      const data = await res.json();
      setPoProjects(Array.isArray(data) ? data : []);
      const co = companies.find(c => String(c.id) === String(companyId));
      setPoForm(f => ({ ...f, companyId, companyName: co?.name || '' }));
    } catch { /* ignore */ }
  };

  const addPoItem = () =>
    setPoForm(f => ({ ...f, items: [...f.items, { itemCode: '', itemName: '', qty: '', unitPrice: '' }] }));

  const removePoItem = (idx) =>
    setPoForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const updatePoItem = (idx, field, value) =>
    setPoForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: value };
      // Auto-fill itemName from item master when itemCode selected
      if (field === 'itemCode' && value) {
        const found = items_list.find(it => String(getId(it)) === String(value));
        if (found) items[idx].itemName = getName(found);
      }
      return { ...f, items };
    });

  const submitPO = async () => {
    setPoFormError('');
    if (!poForm.supplierId) { setPoFormError('Please select a supplier'); return; }
    const validItems = poForm.items.filter(i => i.itemName.trim() && Number(i.qty) > 0);
    if (!validItems.length) { setPoFormError('Add at least one item with name and quantity > 0'); return; }

    setPoSaving(true);
    try {
      const API = import.meta.env.VITE_API_URL || '/api';
      await axios.post(`${API}/po`, {
        poDocNo:      poForm.poDocNo,
        companyId:    poForm.companyId   || null,
        companyName:  poForm.companyName || '',
        projectName:  poForm.projectName || '',
        supplierId:   poForm.supplierId  || null,
        supplierName: poForm.supplierName,
        orderDate:    poForm.orderDate,
        deliveryDate: poForm.deliveryDate || null,
        note:         poForm.note,
        items:        validItems,
      });
      setShowPOForm(false);
      setPoForm(emptyPOForm());
      setPoProjects([]);
      await fetchPOs();
    } catch (err) {
      setPoFormError('Failed to save PO: ' + (err.response?.data?.error || err.message));
    } finally {
      setPoSaving(false);
    }
  };

  const handlePoStatusChange = async (poid, status) => {
    try {
      const API = import.meta.env.VITE_API_URL || '/api';
      await axios.patch(`${API}/po/${poid}/status`, { status });
      setPos(prev => prev.map(p => p.POID === poid ? { ...p, Status: status } : p));
    } catch (err) {
      alert('Failed to update status: ' + (err.response?.data?.error || err.message));
    }
  };

  const handlePoDelete = async (po) => {
    if (!window.confirm(`Delete PO ${po.PODocNo}? This cannot be undone.`)) return;
    try {
      const API = import.meta.env.VITE_API_URL || '/api';
      await axios.delete(`${API}/po/${po.POID}`);
      setPos(prev => prev.filter(p => p.POID !== po.POID));
      if (viewPO?.POID === po.POID) setViewPO(null);
    } catch (err) {
      alert('Failed to delete PO: ' + (err.response?.data?.error || err.message));
    }
  };

  // ── Load transactions from DB on mount ─────────────────────────────────────
  const fetchTransactions = useCallback(async () => {
    setTxnLoading(true);
    try {
      const API = import.meta.env.VITE_API_URL || '/api';
      const res = await axios.get(`${API}/transactions?limit=50`);
      const rows = Array.isArray(res.data) ? res.data : [];
      setTransactions(rows.map(r => ({
        id:          r.TransactionID,
        type:        r.TxnType,
        itemName:    r.ItemName  || '',
        qty:         r.Qty       || 0,
        note:        r.Note      || '',
        description: r.Description || '',
        date:        new Date(r.CreatedAt).toLocaleString(),
      })));
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setTxnLoading(false);
    }
  }, []);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const filteredItems = items_list.filter(item =>
    getName(item).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStockStatus = (stock) => {
    const n = Number(stock) || 0;
    if (n === 0) return 'danger';
    if (n < 10)  return 'warning';
    return 'success';
  };

  const addTransaction = async (description, type, itemName, qty, note) => {
    try {
      const API = import.meta.env.VITE_API_URL || '/api';
      await axios.post(`${API}/transactions`, { type, itemName, qty, note, description });
      await fetchTransactions();   // reload from DB so list stays accurate
    } catch (err) {
      console.error('Failed to save transaction:', err);
      // Fallback: still show in local state even if DB save failed
      const txn = { id: uuidv4(), type, description, itemName, qty, note, date: new Date().toLocaleString() };
      setTransactions(prev => [txn, ...prev.slice(0, 49)]);
    }
  };

  const updateStock = async (id) => {
    if (stockError) return;
    const newStock = parseInt(editStock) || 0;
    if (newStock < 0) { setStockError('Stock cannot be negative'); return; }

setSavingStock(true);
    try {
      await axios.patch(`/api/itemmaster/${id}/stock/set`, { stock: newStock });
      const found = items_list.find(item => String(getId(item)) === String(id));
      addTransaction(`${getName(found || {})} stock set to ${newStock}`, 'edit', getName(found || {}), newStock, '');
      await refreshItems();
      setEditingId(null);
      setEditStock(0);
      setStockError('');
    } catch (err) {
      console.error('Stock update error:', err);
      alert('Failed to update stock: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingStock(false);
    }
  };

  const handleReceiveChange = (field, value) => {
    setReceiveForm(prev => ({ ...prev, [field]: value }));
    if (field === 'qty' && receiveError) setReceiveError('');
  };

  const handleGrnCompanySelect = async (companyId) => {
    setGrnCompanyId(companyId);
    setGrnProjectName('');
    setGrnProjects([]);
    setGrnSelectedPOId('');
    setLinkedPO(null);
    setReceiveForm(f => ({ ...f, itemId: '', qty: '', note: '' }));
    if (!companyId) return;
    const API = import.meta.env.VITE_API_URL || '/api';
    try {
      const res = await fetch(`${API}/projects?company_id=${companyId}`);
      const data = await res.json();
      setGrnProjects(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  };

  const handleGrnProjectSelect = (projectName) => {
    setGrnProjectName(projectName);
    setGrnSelectedPOId('');
    setLinkedPO(null);
    setReceiveForm(f => ({ ...f, itemId: '', qty: '', note: '' }));
  };

  const openReceiveModal = () => {
    setLinkedPO(null);
    setGrnSelectedPOId('');
    setGrnCompanyId('');
    setGrnProjects([]);
    setGrnProjectName('');
    setGrnDocNo(generateGRN());
    setReceiveForm({ itemId: '', qty: '', note: '', date: new Date().toISOString().slice(0, 10) });
    setReceiveError('');
  };

  // Open receive modal pre-filled from a PO
  const openReceiveFromPO = async (po) => {
    setLinkedPO(po);
    setGrnSelectedPOId(String(po.POID));
    setGrnDocNo(generateGRN());
    setReceiveError('');
    // Pre-fill company
    const matchedCompany = companies.find(c =>
      c.name === po.CompanyName || String(c.id) === String(po.CompanyID)
    );
    const companyId = matchedCompany ? String(matchedCompany.id) : '';
    setGrnCompanyId(companyId);
    setGrnProjectName(po.ProjectName || '');
    setGrnProjects([]);
    // Pre-fill first item from PO if available
    const firstItem = po.items?.[0];
    const matchedItem = firstItem
      ? items_list.find(i => getName(i) === firstItem.ItemName || String(getId(i)) === String(firstItem.ItemCode))
      : null;
    setReceiveForm({
      itemId: matchedItem ? String(getId(matchedItem)) : '',
      qty: firstItem ? String(firstItem.Qty || '') : '',
      note: `Against PO: ${po.PODocNo}`,
      date: new Date().toISOString().slice(0, 10),
    });
    if (companyId) {
      const API = import.meta.env.VITE_API_URL || '/api';
      try {
        const res = await fetch(`${API}/projects?company_id=${companyId}`);
        const data = await res.json();
        setGrnProjects(Array.isArray(data) ? data : []);
      } catch { setGrnProjects([]); }
    }
    // Open the bootstrap modal
    const modalEl = document.getElementById('receiveModal');
    if (modalEl && window.bootstrap) {
      const modal = new window.bootstrap.Modal(modalEl);
      modal.show();
    }
  };

  // Handle PO selection inside receive modal — fetches full PO+items from DB
  const handleGrnPOSelect = async (poId) => {
    setGrnSelectedPOId(poId);
    setReceiveForm(f => ({ ...f, itemId: '', qty: '', note: '' }));
    if (!poId) { setLinkedPO(null); return; }
    try {
      const API = import.meta.env.VITE_API_URL || '/api';
      const res = await axios.get(`${API}/po/${poId}`);
      const po  = res.data;
      setLinkedPO(po);
      setReceiveForm(f => ({ ...f, note: `Against PO: ${po.PODocNo}` }));
    } catch (err) {
      console.error('Failed to fetch PO details:', err.message);
      setLinkedPO(null);
    }
  };

  const submitReceive = async () => {
    const qty = parseInt(receiveForm.qty);
    if (!grnCompanyId)         { setReceiveError('Please select a company'); return; }
    if (!receiveForm.itemId)   { setReceiveError('Please select an item'); return; }
    if (!qty || qty <= 0)      { setReceiveError('Quantity must be greater than 0'); return; }

    const selectedItem = items_list.find(item => String(getId(item)) === String(receiveForm.itemId));
    if (!selectedItem) { setReceiveError('Item not found'); return; }

    const itemName = getName(selectedItem);
    const selectedCompany = companies.find(c => String(c.id) === String(grnCompanyId));
    const API = import.meta.env.VITE_API_URL || '/api';

setReceiveSaving(true);
    try {
      // Save GRN record + update stock atomically via new endpoint
      await axios.post(`${API}/stock-receipts`, {
        grnDocNo:    grnDocNo,
        companyId:   grnCompanyId,
        companyName: selectedCompany?.name || '',
        projectName: grnProjectName || '',
        itemCode:    receiveForm.itemId,
        itemName:    itemName,
        qty:         qty,
        note:        receiveForm.note,
        receiptDate: receiveForm.date || new Date().toISOString().slice(0, 10),
        linkedPODocNo: linkedPO?.PODocNo || '',
        linkedPOID:    linkedPO?.POID    || '',
      });

      addTransaction('', 'receive', itemName, qty, receiveForm.note);
      await refreshItems();

      // ── Auto-mark linked PO as Received ──────────────────────────────────
      if (linkedPO?.POID) {
        try {
          await axios.patch(`${API}/po/${linkedPO.POID}/status`, { status: 'Received' });
          // Update PO in local state immediately so table reflects change
          setPos(prev => prev.map(p =>
            p.POID === linkedPO.POID ? { ...p, Status: 'Received' } : p
          ));
        } catch (err) {
          console.warn('Could not auto-update PO status:', err.message);
        }
      }

      setReceiveSuccess(`GRN ${grnDocNo} — Received ${qty} x ${itemName}${receiveForm.note ? ` (${receiveForm.note})` : ''}`);
      setTimeout(() => setReceiveSuccess(''), 5000);
      setReceiveForm({ itemId: '', qty: '', note: '', date: new Date().toISOString().slice(0, 10) });
      setReceiveError('');
      setGrnCompanyId('');
      setGrnProjectName('');
      setGrnProjects([]);
      setLinkedPO(null);

      const modalEl = document.getElementById('receiveModal');
      if (modalEl && window.bootstrap) {
        const modal = window.bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }
    } catch (err) {
      console.error('Receive stock error:', err);
      setReceiveError('Failed to update stock: ' + (err.response?.data?.error || err.message));
    } finally {
      setReceiveSaving(false);
    }
  };

  const exportCSV = useCallback(() => {
    const headers = ['Item Code', 'Item Name', 'Rate (Rs)', 'Tax %', 'Stock', 'Total Value (Rs)'];
    const rows = filteredItems.map(item => [
      getId(item),
      getName(item),
      getRate(item).toFixed(2),
      getTax(item),
      getStock(item),
      (getStock(item) * getRate(item)).toFixed(2)
    ]);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredItems]);

  const formatStockValue = (stock) => {
    const n = Number(stock) || 0;
    return n === 0 ? 'Out of Stock' : n.toLocaleString();
  };

  const totalItems = items_list.length;
  const outOfStock = items_list.filter(i => getStock(i) === 0).length;
  const lowStock   = items_list.filter(i => getStock(i) > 0 && getStock(i) < 10).length;
  const totalValue = items_list.reduce((sum, i) => sum + getStock(i) * getRate(i), 0);

  return (
    <div className={`container-fluid py-4 theme-${currentTheme}`} id="inventory">
      <div className="row justify-content-center">
        <div className="col-12 col-lg-11">

          {/* Header */}
          <div className="glass-card shadow-xl p-4 mb-4 fade-in-up">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
              <div>
                <h2 className="fw-bold mb-1">
                  <i className="bi bi-boxes me-2 text-primary"></i>Stock Management
                </h2>
                <small className="text-muted">
                  {filteredItems.length} items{searchTerm ? ` matching "${searchTerm}"` : ' total'}
                </small>
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <button className="g-btn g-btn-ghost" onClick={() => onNavigateToHome?.()}>
                  <i className="bi bi-arrow-left me-1"></i>Back to Invoice
                </button>
                <button className="g-btn g-btn-success" data-bs-toggle="modal" data-bs-target="#receiveModal" onClick={openReceiveModal}>
                  <i className="bi bi-arrow-down-circle me-1"></i>Receive Items
                </button>
                <button className="g-btn g-btn-success" onClick={exportCSV}>
                  <i className="bi bi-download me-1"></i>Export CSV
                </button>
                <button className="g-btn g-btn-primary" style={{background:'#6f42c1',borderColor:'#6f42c1'}}
                  onClick={() => { setActiveTab('po'); setShowPOForm(true); setPoForm(emptyPOForm()); setPoProjects([]); setPoFormError(''); }}>
                  <i className="bi bi-file-earmark-text me-1"></i>PO
                </button>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="row g-3 mb-4">
            {[
              { label: 'Total Items',      value: totalItems,                             color: '' },
              { label: 'Out of Stock',     value: outOfStock,                             color: 'text-danger' },
              { label: 'Low Stock (<10)',  value: lowStock,                               color: 'text-warning' },
              { label: 'Inventory Value', value: `Rs.${totalValue.toLocaleString('en-IN')}`, color: 'text-success' },
            ].map(({ label, value, color }) => (
              <div key={label} className="col-6 col-md-3">
                <div className="glass-card p-3 text-center">
                  <div className={`fs-4 fw-bold ${color}`}>{value}</div>
                  <small className="text-muted">{label}</small>
                </div>
              </div>
            ))}
          </div>

          {/* Success alert */}
          {receiveSuccess && (
            <div className="alert alert-success alert-dismissible fade show mb-4">
              <i className="bi bi-check-circle-fill me-2"></i>{receiveSuccess}
              <button type="button" className="btn-close" onClick={() => setReceiveSuccess('')}></button>
            </div>
          )}

          {/* ── PO → GRN Flow Guide ── */}
          <div className="d-flex align-items-center gap-2 mb-3 p-3 rounded-3" style={{ background: 'rgba(26,86,219,0.05)', border: '1.5px solid rgba(26,86,219,0.15)', fontSize: 13 }}>
            <span className="fw-bold" style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>Procurement Flow:</span>
            <div className="d-flex align-items-center gap-1 flex-wrap">
              <span
                className="badge d-flex align-items-center gap-1 px-3 py-2"
                style={{ background: activeTab === 'po' ? 'rgba(124,58,237,0.15)' : 'rgba(124,58,237,0.07)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 20, cursor: 'pointer', fontWeight: 700 }}
                onClick={() => { setActiveTab('po'); if (!pos.length) fetchPOs(); }}
              >
                <span style={{ background: '#7c3aed', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>1</span>
                <i className="bi bi-file-earmark-text me-1"></i>Create Purchase Order
              </span>
              <i className="bi bi-arrow-right text-muted"></i>
              {/* GRN badge — click to view all GRN records */}
              <span
                className="badge d-flex align-items-center gap-1 px-3 py-2"
                style={{ background: activeTab === 'grn' ? 'rgba(22,163,74,0.18)' : 'rgba(22,163,74,0.07)', color: '#15803d', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 20, cursor: 'pointer', fontWeight: 700 }}
                onClick={() => setActiveTab('grn')}
                title="View all GRN receive records"
              >
                <span style={{ background: '#16a34a', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>2</span>
                <i className="bi bi-arrow-down-circle me-1"></i>Receive Items (GRN)
                <i className="bi bi-list-ul ms-1" style={{ fontSize: 11, opacity: 0.8 }}></i>
              </span>
              {/* Separate button to open new receive form */}
              <span
                className="badge d-flex align-items-center gap-1 px-2 py-2"
                style={{ background: 'rgba(22,163,74,0.12)', color: '#15803d', border: '1px dashed rgba(22,163,74,0.4)', borderRadius: 20, cursor: 'pointer', fontWeight: 700, fontSize: 11 }}
                onClick={openReceiveModal}
                data-bs-toggle="modal" data-bs-target="#receiveModal"
                title="New receive entry"
              >
                <i className="bi bi-plus-circle"></i> New GRN
              </span>
            </div>
          </div>

          {/* ── Tab Nav ── */}
          <ul className="nav nav-tabs mb-4" style={{ borderBottom: '2px solid #dee2e6' }}>
            <li className="nav-item">
              <button
                className={`nav-link fw-semibold ${activeTab === 'stock' ? 'active' : ''}`}
                onClick={() => setActiveTab('stock')}
              >
                <i className="bi bi-boxes me-2"></i>Stock Overview
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link fw-semibold ${activeTab === 'breakdown' ? 'active' : ''}`}
                onClick={() => setActiveTab('breakdown')}
              >
                <i className="bi bi-diagram-3 me-2"></i>Company / Project Breakdown
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link fw-semibold ${activeTab === 'po' ? 'active' : ''}`}
                onClick={() => { setActiveTab('po'); if (!pos.length) fetchPOs(); }}
              >
                <i className="bi bi-file-earmark-text me-2"></i>Purchase Orders
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link fw-semibold ${activeTab === 'grn' ? 'active' : ''}`}
                onClick={() => setActiveTab('grn')}
              >
                <i className="bi bi-box-arrow-in-down me-2"></i>Receive Records
              </button>
            </li>
          </ul>
          {/* ══ TAB: STOCK OVERVIEW ══════════════════════════════════════ */}
          {activeTab === 'stock' && (<>

          {/* ── Search ── */}
          <div className="glass-card p-3 mb-4">
            <div className="input-group">
              <span className="input-group-text bg-transparent border-0"><i className="bi bi-search"></i></span>
              <input
                type="text"
                className="form-control border-0 bg-transparent"
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button className="g-btn g-btn-ghost g-btn-sm" onClick={() => setSearchTerm('')}>
                  <i className="bi bi-x"></i>
                </button>
              )}
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="glass-card text-center p-5 fade-in-up">
              <i className="bi bi-boxes display-1 text-muted mb-4 d-block"></i>
              <h3 className="text-muted mb-3">
                {searchTerm ? `No items matching "${searchTerm}"` : 'No items in inventory'}
              </h3>
              <p className="text-muted mb-4">Add items through Item Master to manage stock</p>
            </div>
          ) : (
            <div className="glass-card shadow-xl p-0 overflow-hidden">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-dark">
                    <tr>
                      <th>Code</th>
                      <th>Item Name</th>
                      <th className="text-end">Rate (Rs)</th>
                      <th className="text-end">Tax %</th>
                      <th className="text-end">Stock</th>
                      <th className="text-end">Total Value</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(item => {
                      const id     = getId(item);
                      const name   = getName(item);
                      const rate   = getRate(item);
                      const tax    = getTax(item);
                      const stock  = getStock(item);
                      const status = getStockStatus(stock);
                      const value  = stock * rate;

                      return (
                        <tr key={id} className={`align-middle ${
                          status === 'danger'  ? 'table-danger'  :
                          status === 'warning' ? 'table-warning' : ''
                        }`}>
                          <td><span className="badge bg-secondary">{id}</span></td>
                          <td className="fw-semibold">
                            {name}
                            {status === 'danger'  && <span className="badge bg-danger ms-2">Out of Stock</span>}
                            {status === 'warning' && <span className="badge bg-warning text-dark ms-2">Low</span>}
                          </td>
                          <td className="text-end">Rs.{rate.toFixed(2)}</td>
                          <td className="text-end"><span className="badge bg-secondary">{tax}%</span></td>
                          <td className="text-end">
                            {editingId === id ? (
                              <div className="d-flex align-items-center justify-content-end gap-1">
                                <input
                                  className="form-control form-control-sm text-end"
                                  type="number" min="0"
                                  value={editStock}
                                  style={{ maxWidth: '80px' }}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    setEditStock(val);
                                    setStockError(val < 0 ? 'Stock cannot be negative' : '');
                                  }}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter')  updateStock(id);
                                    if (e.key === 'Escape') { setEditingId(null); setStockError(''); }
                                  }}
                                />
                                <button className="g-btn g-btn-success g-btn-sm" onClick={() => updateStock(id)} disabled={savingStock} title="Save">
                                  {savingStock
                                    ? <span className="spinner-border spinner-border-sm"></span>
                                    : <i className="bi bi-check-lg"></i>}
                                </button>
                                <button className="g-btn g-btn-ghost g-btn-sm" onClick={() => { setEditingId(null); setStockError(''); }} title="Cancel">
                                  <i className="bi bi-x"></i>
                                </button>
                              </div>
                            ) : (
                              <span className={`fw-bold text-${status}`}>{formatStockValue(stock)}</span>
                            )}
                            {stockError && editingId === id && (
                              <small className="text-danger d-block">{stockError}</small>
                            )}
                          </td>
                          <td className="text-end fw-bold">Rs.{value.toLocaleString('en-IN')}</td>
                          <td>
                            <button
                              className="g-btn g-btn-ghost g-btn-sm"
                              onClick={() => { setEditingId(id); setEditStock(stock); }}
                              title="Edit Stock"
                            >
                              <i className="bi bi-pencil me-1"></i>Edit Stock
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="table-secondary">
                    <tr>
                      <td className="fw-bold" colSpan="4">Total ({filteredItems.length} items)</td>
                      <td className="text-end fw-bold">{filteredItems.reduce((s, i) => s + getStock(i), 0).toLocaleString()} units</td>
                      <td className="text-end fw-bold text-success">
                        Rs.{filteredItems.reduce((s, i) => s + getStock(i) * getRate(i), 0).toLocaleString('en-IN')}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Transactions Log */}
          {(transactions.length > 0 || txnLoading) && (
            <div className="glass-card shadow-lg mt-4 p-4">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="fw-bold mb-0">
                  <i className="bi bi-list-ul text-info me-2"></i>
                  Recent Transactions ({transactions.length})
                </h5>
                <button className="g-btn g-btn-ghost g-btn-sm" onClick={fetchTransactions} disabled={txnLoading}>
                  {txnLoading
                    ? <span className="spinner-border spinner-border-sm"></span>
                    : <i className="bi bi-arrow-clockwise"></i>}
                </button>
              </div>
              <div className="table-responsive">
                <table className="table table-sm">
                  <thead><tr><th>Date</th><th>Type</th><th>Details</th></tr></thead>
                  <tbody>
                    {transactions.map(txn => (
                      <tr key={txn.id}>
                        <td className="small">{txn.date}</td>
                        <td>
                          <span className={`badge ${txn.type === 'receive' ? 'bg-success' : txn.type === 'edit' ? 'bg-info' : 'bg-secondary'}`}>
                            {txn.type}
                          </span>
                        </td>
                        <td className="small">
                          {txn.itemName
                            ? `+${txn.qty} ${txn.itemName}${txn.note ? ` (${txn.note})` : ''}`
                            : txn.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          </>)} {/* end activeTab === 'stock' */}

          {/* ══ TAB: COMPANY / PROJECT BREAKDOWN ════════════════════════════ */}
          {activeTab === 'breakdown' && (
            <BreakdownTab
              breakdown={breakdown}
              breakdownLoading={breakdownLoading}
              breakdownError={breakdownError}
              bkFilter={bkFilter}
              setBkFilter={setBkFilter}
              onRefresh={fetchBreakdown}
            />
          )}

          {/* ══ TAB: PURCHASE ORDERS ══════════════════════════════════════ */}
          {activeTab === 'po' && (
            <POTab
              pos={pos}
              poLoading={poLoading}
              poError={poError}
              onRefresh={fetchPOs}
              onNew={() => { setPoForm(emptyPOForm()); setPoProjects([]); setPoFormError(''); setShowPOForm(true); }}
              onView={async (po) => {
                try {
                  const API = import.meta.env.VITE_API_URL || '/api';
                  const res = await axios.get(`${API}/po/${po.POID}`);
                  setViewPO(res.data);
                } catch { setViewPO(po); }
              }}
              onStatusChange={handlePoStatusChange}
              onDelete={handlePoDelete}
              onReceiveFromPO={openReceiveFromPO}
            />
          )}

          {/* ══ TAB: RECEIVE RECORDS (GRN) ═══════════════════════════════ */}
          {activeTab === 'grn' && (
            <ReceiveRecords />
          )}

        </div>
      </div>

      {/* ══ PO CREATE MODAL ══════════════════════════════════════════════════ */}
      {showPOForm && (
        <div className="modal fade show d-block" style={{background:'rgba(0,0,0,0.5)'}} tabIndex="-1">
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content glass-card">
              <div className="modal-header">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-file-earmark-plus me-2" style={{color:'#6f42c1'}}></i>New Purchase Order
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowPOForm(false)}></button>
              </div>
              <div className="modal-body">
                {poFormError && (
                  <div className="alert alert-danger py-2">
                    <i className="bi bi-exclamation-triangle me-2"></i>{poFormError}
                  </div>
                )}

                {/* PO Doc No */}
                <div className="row g-3 mb-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold small text-muted">PO Doc No</label>
                    <input type="text" className="form-control form-control-sm bg-light" value={poForm.poDocNo} readOnly />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Supplier Name <span className="text-danger">*</span></label>
                    <select className="form-select"
                      value={poForm.supplierId}
                      onChange={e => {
                        const selected = suppliers.find(s => String(s.SupplierID) === String(e.target.value));
                        setPoForm(f => ({
                          ...f,
                          supplierId:   e.target.value,
                          supplierName: selected ? selected.SupplierName : '',
                        }));
                      }}>
                      <option value="">Select supplier...</option>
                      {suppliers.map(s => (
                        <option key={s.SupplierID} value={s.SupplierID}>
                          {s.SupplierCode ? `[${s.SupplierCode}] ` : ''}{s.SupplierName}
                        </option>
                      ))}
                    </select>
                    {suppliers.length === 0 && (
                      <div className="form-text text-warning">
                        <i className="bi bi-exclamation-triangle me-1"></i>
                        No active suppliers found. Add suppliers in Supplier Master first.
                      </div>
                    )}
                  </div>
                </div>

                {/* Company + Project */}
                <div className="row g-3 mb-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Company</label>
                    <select className="form-select" value={poForm.companyId} onChange={e => handlePoCompanySelect(e.target.value)}>
                      <option value="">Select company...</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Project <span className="text-muted fw-normal">(optional)</span></label>
                    <select className="form-select" value={poForm.projectName}
                      onChange={e => setPoForm(f => ({...f, projectName: e.target.value}))}
                      disabled={!poForm.companyId}>
                      <option value="">{poForm.companyId ? (poProjects.length ? 'Select project...' : 'No projects') : 'Select company first'}</option>
                      {poProjects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* Dates */}
                <div className="row g-3 mb-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Order Date <span className="text-danger">*</span></label>
                    <input type="date" className="form-control" value={poForm.orderDate}
                      onChange={e => setPoForm(f => ({...f, orderDate: e.target.value}))} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Expected Delivery Date <span className="text-muted fw-normal">(optional)</span></label>
                    <input type="date" className="form-control" value={poForm.deliveryDate}
                      onChange={e => setPoForm(f => ({...f, deliveryDate: e.target.value}))} />
                  </div>
                </div>

                {/* Items */}
                <div className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <label className="form-label fw-semibold mb-0">Order Items <span className="text-danger">*</span></label>
                    <button className="g-btn g-btn-ghost g-btn-sm" onClick={addPoItem}>
                      <i className="bi bi-plus-circle me-1"></i>Add Row
                    </button>
                  </div>
                  <div className="table-responsive">
                    <table className="table table-sm table-bordered mb-0">
                      <thead className="table-light">
                        <tr>
                          <th style={{width:'35%'}}>Item</th>
                          <th style={{width:'20%'}}>From Master</th>
                          <th style={{width:'15%'}}>Qty *</th>
                          <th style={{width:'20%'}}>Unit Price</th>
                          <th style={{width:'10%'}}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {poForm.items.map((item, idx) => (
                          <tr key={idx}>
                            <td>
                              <input type="text" className="form-control form-control-sm" placeholder="Item name..."
                                value={item.itemName}
                                onChange={e => updatePoItem(idx, 'itemName', e.target.value)} />
                            </td>
                            <td>
                              <select className="form-select form-select-sm" value={item.itemCode}
                                onChange={e => updatePoItem(idx, 'itemCode', e.target.value)}>
                                <option value="">Pick from master</option>
                                {items_list.map(it => (
                                  <option key={getId(it)} value={getId(it)}>{getName(it)}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input type="number" className="form-control form-control-sm" min="0.001" step="0.001" placeholder="0"
                                value={item.qty}
                                onChange={e => updatePoItem(idx, 'qty', e.target.value)} />
                            </td>
                            <td>
                              <input type="number" className="form-control form-control-sm" min="0" step="0.01" placeholder="0.00"
                                value={item.unitPrice}
                                onChange={e => updatePoItem(idx, 'unitPrice', e.target.value)} />
                            </td>
                            <td className="text-center">
                              {poForm.items.length > 1 && (
                                <button className="btn btn-sm btn-outline-danger" onClick={() => removePoItem(idx)}>
                                  <i className="bi bi-trash"></i>
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="table-light">
                        <tr>
                          <td colSpan="3" className="text-end fw-semibold small">Total Value:</td>
                          <td className="fw-bold text-success">
                            Rs.{poForm.items.reduce((s,i) => s + (Number(i.qty)||0)*(Number(i.unitPrice)||0), 0).toLocaleString('en-IN', {minimumFractionDigits:2})}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Note */}
                <div className="mb-2">
                  <label className="form-label">Note <span className="text-muted">(optional)</span></label>
                  <textarea className="form-control" rows="2" placeholder="Terms, delivery instructions..."
                    value={poForm.note}
                    onChange={e => setPoForm(f => ({...f, note: e.target.value}))} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="g-btn g-btn-ghost" onClick={() => setShowPOForm(false)}>Cancel</button>
                <button className="g-btn g-btn-success" onClick={submitPO} disabled={poSaving}>
                  {poSaving
                    ? <><span className="spinner-border spinner-border-sm me-1"></span>Saving...</>
                    : <><i className="bi bi-check-circle me-1"></i>Save Purchase Order</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ PO VIEW MODAL ════════════════════════════════════════════════════ */}
      {viewPO && (
        <div className="modal fade show d-block" style={{background:'rgba(0,0,0,0.5)'}} tabIndex="-1">
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content glass-card">
              <div className="modal-header">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-file-earmark-text me-2" style={{color:'#6f42c1'}}></i>
                  {viewPO.PODocNo}
                  <span className={`badge ms-2 ${STATUS_COLORS[viewPO.Status]||'bg-secondary'}`}>{viewPO.Status}</span>
                </h5>
                <button className="btn-close" onClick={() => setViewPO(null)}></button>
              </div>
              <div className="modal-body">
                <div className="row g-3 mb-3">
                  {[
                    ['Company',   viewPO.CompanyName  || '—'],
                    ['Project',   viewPO.ProjectName  || '—'],
                    ['Supplier',  viewPO.SupplierName],
                    ['Order Date',    new Date(viewPO.OrderDate).toLocaleDateString('en-IN')],
                    ['Delivery Date', viewPO.DeliveryDate ? new Date(viewPO.DeliveryDate).toLocaleDateString('en-IN') : '—'],
                    ['Created At',    new Date(viewPO.CreatedAt).toLocaleString('en-IN')],
                  ].map(([label, val]) => (
                    <div key={label} className="col-6 col-md-4">
                      <small className="text-muted d-block">{label}</small>
                      <span className="fw-semibold">{val}</span>
                    </div>
                  ))}
                </div>
                {viewPO.Note && (
                  <div className="alert alert-light py-2 mb-3">
                    <small className="text-muted">Note: </small>{viewPO.Note}
                  </div>
                )}
                {viewPO.items && viewPO.items.length > 0 && (
                  <div className="table-responsive">
                    <table className="table table-sm table-hover">
                      <thead className="table-dark">
                        <tr>
                          <th>#</th>
                          <th>Item Name</th>
                          <th className="text-end">Qty</th>
                          <th className="text-end">Unit Price</th>
                          <th className="text-end">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewPO.items.map((it, i) => (
                          <tr key={it.POItemID}>
                            <td>{i+1}</td>
                            <td className="fw-semibold">{it.ItemName}</td>
                            <td className="text-end">{Number(it.Qty).toLocaleString()}</td>
                            <td className="text-end">Rs.{Number(it.UnitPrice||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                            <td className="text-end fw-bold">Rs.{Number(it.TotalPrice||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="table-secondary">
                        <tr>
                          <td colSpan="4" className="text-end fw-bold">Grand Total</td>
                          <td className="text-end fw-bold text-success">
                            Rs.{viewPO.items.reduce((s,i) => s+Number(i.TotalPrice||0), 0).toLocaleString('en-IN',{minimumFractionDigits:2})}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                {(viewPO.Status === 'Confirmed' || viewPO.Status === 'Draft') && (
                  <button
                    className="g-btn g-btn-success"
                    onClick={() => { setViewPO(null); openReceiveFromPO(viewPO); }}
                  >
                    <i className="bi bi-arrow-down-circle me-2"></i>Receive Items Against This PO
                  </button>
                )}
                <button className="g-btn g-btn-ghost" onClick={() => setViewPO(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receive Items Modal */}
      <div className="modal fade" id="receiveModal" tabIndex="-1">
        <div className="modal-dialog">
          <div className="modal-content glass-card">
            <div className="modal-header">
              <h5 className="modal-title fw-bold">
                <i className="bi bi-arrow-down-circle text-success me-2"></i>Receive Stock
                {linkedPO && (
                  <span className="badge ms-2" style={{ background: 'rgba(22,163,74,0.15)', color: '#15803d', fontSize: 11, fontWeight: 600, borderRadius: 8, padding: '4px 10px', border: '1px solid rgba(22,163,74,0.3)' }}>
                    <i className="bi bi-file-earmark-text me-1"></i>PO: {linkedPO.PODocNo}
                  </span>
                )}
              </h5>
              <button type="button" className="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div className="modal-body">

              {receiveError && (
                <div className="alert alert-danger py-2">
                  <i className="bi bi-exclamation-triangle me-2"></i>{receiveError}
                </div>
              )}

              {/* GRN Doc No */}
              <div className="mb-3">
                <label className="form-label fw-semibold small text-muted">GRN Doc No</label>
                <input type="text" className="form-control form-control-sm bg-light" value={grnDocNo} readOnly />
              </div>

              {/* STEP 1 — Company */}
              <div className="mb-3">
                <label className="form-label fw-semibold">
                  Company <span className="text-danger">*</span>
                </label>
                <select
                  className="form-select"
                  value={grnCompanyId}
                  onChange={e => handleGrnCompanySelect(e.target.value)}
                >
                  <option value="">Select company...</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* STEP 2 — Project */}
              <div className="mb-3">
                <label className="form-label fw-semibold">
                  Project <span className="text-muted fw-normal">(optional)</span>
                </label>
                <select
                  className="form-select"
                  value={grnProjectName}
                  onChange={e => handleGrnProjectSelect(e.target.value)}
                  disabled={!grnCompanyId}
                >
                  <option value="">
                    {!grnCompanyId ? 'Select company first' : grnProjects.length ? 'Select project...' : 'No projects for this company'}
                  </option>
                  {grnProjects.map(p => (
                    <option key={p.ProjectID ?? p.id} value={p.ProjectName ?? p.name ?? ''}>
                      {p.ProjectName ?? p.name ?? ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* STEP 3 — PO (filtered by company + project from DB) */}
              <div className="mb-3">
                <label className="form-label fw-semibold">
                  Purchase Order <span className="text-muted fw-normal">(optional)</span>
                </label>
                <select
                  className="form-select"
                  value={grnSelectedPOId}
                  onChange={e => handleGrnPOSelect(e.target.value)}
                  disabled={!grnCompanyId}
                >
                  <option value="">— {!grnCompanyId ? 'Select company first' : 'Select PO to link'} —</option>
                  {pos
                    .filter(p => {
                      const companyMatch = !grnCompanyId || String(p.CompanyID) === String(grnCompanyId);
                      const projectMatch = !grnProjectName || (p.ProjectName || '') === grnProjectName;
                      const statusMatch  = p.Status === 'Draft' || p.Status === 'Confirmed';
                      return companyMatch && projectMatch && statusMatch;
                    })
                    .map(p => (
                      <option key={p.POID} value={p.POID}>
                        {p.PODocNo} — {p.SupplierName} [{p.Status}]
                      </option>
                    ))
                  }
                </select>
                {grnCompanyId && pos.filter(p => String(p.CompanyID) === String(grnCompanyId) && (p.Status === 'Draft' || p.Status === 'Confirmed')).length === 0 && (
                  <div className="form-text text-muted">
                    <i className="bi bi-info-circle me-1"></i>No open POs for this company. You can still receive without a PO.
                  </div>
                )}
                {linkedPO && (
                  <div className="mt-2 p-2 rounded-2 d-flex align-items-start gap-2" style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)' }}>
                    <i className="bi bi-check2-circle text-success mt-1"></i>
                    <div style={{ fontSize: 12 }}>
                      <div className="fw-semibold text-success">{linkedPO.PODocNo}</div>
                      <div className="text-muted">Supplier: {linkedPO.SupplierName} · {linkedPO.items?.length || 0} item(s) ordered</div>
                    </div>
                    <button className="btn btn-sm ms-auto p-0 px-1 text-muted" style={{ fontSize: 11 }}
                      onClick={() => { setLinkedPO(null); setGrnSelectedPOId(''); setReceiveForm(f => ({ ...f, itemId: '', qty: '', note: '' })); }}>
                      <i className="bi bi-x-circle"></i> Unlink
                    </button>
                  </div>
                )}
              </div>

              {/* STEP 4 — Item (PO items first if linked, else full list) */}
              <div className="mb-3">
                <label className="form-label fw-semibold">
                  Select Item <span className="text-danger">*</span>
                </label>
                <select
                  className="form-select"
                  value={receiveForm.itemId}
                  onChange={e => {
                    const val = e.target.value;
                    handleReceiveChange('itemId', val);
                    // Auto-fill qty from PO line item
                    if (linkedPO?.items?.length && val) {
                      const masterItem = items_list.find(it => String(getId(it)) === val);
                      if (masterItem) {
                        const poLine = linkedPO.items.find(pi =>
                          getName(masterItem) === pi.ItemName || String(getId(masterItem)) === String(pi.ItemCode)
                        );
                        if (poLine) handleReceiveChange('qty', String(poLine.QtyPending || poLine.Qty || ''));
                      }
                    }
                  }}
                >
                  <option value="">Choose item...</option>
                  {linkedPO?.items?.length ? (
                    <>
                      <optgroup label={`📦 PO Items — ${linkedPO.PODocNo}`}>
                        {linkedPO.items.map((pi, idx) => {
                          const matched = items_list.find(it =>
                            getName(it) === pi.ItemName || String(getId(it)) === String(pi.ItemCode)
                          );
                          const id = matched ? String(getId(matched)) : '';
                          const pending = pi.QtyPending ?? pi.Qty;
                          return (
                            <option key={idx} value={id} disabled={!id}>
                              {pi.ItemName} — Ordered: {pi.Qty} | Pending: {pending}
                              {!id ? ' ⚠ not in item master' : ''}
                            </option>
                          );
                        })}
                      </optgroup>
                      <optgroup label="── All Items ──">
                        {items_list.map(item => (
                          <option key={getId(item)} value={getId(item)}>
                            {getName(item)} (Stock: {getStock(item)})
                          </option>
                        ))}
                      </optgroup>
                    </>
                  ) : (
                    items_list.map(item => (
                      <option key={getId(item)} value={getId(item)}>
                        {getName(item)} — Stock: {getStock(item)}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* STEP 5 — Quantity */}
              <div className="mb-3">
                <label className="form-label fw-semibold">Quantity <span className="text-danger">*</span></label>
                <input
                  type="number" className="form-control" min="1"
                  placeholder="Enter quantity..."
                  value={receiveForm.qty}
                  onChange={e => handleReceiveChange('qty', e.target.value)}
                />
                {receiveForm.itemId && receiveForm.qty && (() => {
                  const sel = items_list.find(i => String(getId(i)) === String(receiveForm.itemId));
                  return sel ? (
                    <small className="text-muted mt-1 d-block">
                      New stock will be: <strong>{getStock(sel) + (parseInt(receiveForm.qty) || 0)}</strong>
                    </small>
                  ) : null;
                })()}
              </div>

              {/* Receipt Date */}
              <div className="mb-3">
                <label className="form-label fw-semibold">Receipt Date <span className="text-danger">*</span></label>
                <input
                  type="date" className="form-control"
                  value={receiveForm.date}
                  onChange={e => handleReceiveChange('date', e.target.value)}
                />
              </div>

              {/* Note */}
              <div className="mb-3">
                <label className="form-label">Note <span className="text-muted">(optional)</span></label>
                <textarea
                  className="form-control" rows="2"
                  placeholder="Supplier, PO#, batch..."
                  value={receiveForm.note}
                  onChange={e => handleReceiveChange('note', e.target.value)}
                />
              </div>

            </div>
            <div className="modal-footer">
              <button type="button" className="g-btn g-btn-ghost" data-bs-dismiss="modal">Cancel</button>
              <button type="button" className="g-btn g-btn-success" onClick={submitReceive} disabled={receiveSaving}>
                {receiveSaving
                  ? <><span className="spinner-border spinner-border-sm me-1"></span>Saving...</>
                  : <><i className="bi bi-check-circle me-1"></i>Receive Stock</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Inventory;