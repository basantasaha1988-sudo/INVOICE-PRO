/**
 * Consumption.jsx  —  Material Consumption (Issue) management page.
 *
 * Theme: matches the full software design system
 *   glass-card, shadow-xl, g-btn g-btn-*, form-control, table table-hover,
 *   text-primary, var(--text-dark), var(--text-muted)
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '/api';

/* ── helpers ──────────────────────────────────────────────────────────────── */
const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const genDocNo = () => {
  const d  = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `CON-${yy}${mm}${dd}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
};

const emptyRow = () => ({
  id: crypto.randomUUID(),
  itemCode: '', itemName: '', qty: '', remarks: '', stock: null,
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  PREVIEW MODAL                                                             */
/* ══════════════════════════════════════════════════════════════════════════ */
function PreviewModal({ record, onClose, onPrint }) {
  if (!record) return null;
  const items    = record.items || [];
  const totalQty = items.reduce((s, i) => s + Number(i.QtyConsumed || 0), 0);

  return (
    <div
      className="modal fade show d-block"
      tabIndex="-1"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content glass-card shadow-xl border-0" id="con-print-area">

          {/* header */}
          <div className="modal-header border-0 pb-0 px-4 pt-4">
            <h5 className="modal-title fw-bold" style={{ color: 'var(--text-dark,#1a1a2e)' }}>
              <i className="bi bi-fire text-primary me-2"></i>
              Material Consumption Voucher
              <span className="badge ms-2 fw-normal font-monospace"
                style={{ background: 'rgba(26,86,219,0.12)', color: '#1a56db', fontSize: '0.78rem' }}>
                {record.DocNo}
              </span>
            </h5>
            <button className="btn-close d-print-none" onClick={onClose} />
          </div>

          {/* meta */}
          <div className="modal-body px-4 py-3">
            <div className="row g-3 mb-4">
              {[
                ['Company',  record.CompanyName  || '—'],
                ['Project',  record.ProjectName  || '—'],
                ['Date',     fmt(record.ConsumptionDate)],
                ['Voucher#', record.DocNo],
              ].map(([label, val]) => (
                <div className="col-6 col-md-3" key={label}>
                  <div className="glass-card p-3 h-100">
                    <div className="small text-muted mb-1">{label}</div>
                    <div className="fw-semibold" style={{ color: 'var(--text-dark,#1a1a2e)' }}>{val}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* items table */}
            <div className="table-responsive rounded-3 mb-3">
              <table className="table table-hover mb-0 align-middle">
                <thead className="table-dark">
                  <tr>
                    <th>#</th>
                    <th>Item Name</th>
                    <th className="text-end">Qty Consumed</th>
                    <th className="text-end">Stock Before</th>
                    <th className="text-end">Stock After</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.ConsumptionItemID || idx}>
                      <td className="text-muted small">{idx + 1}</td>
                      <td className="fw-semibold">{it.ItemName}</td>
                      <td className="text-end">
                        <span className="badge bg-danger">
                          {Number(it.QtyConsumed).toLocaleString()} units
                        </span>
                      </td>
                      <td className="text-end text-muted small">{Number(it.StockBefore).toLocaleString()}</td>
                      <td className="text-end small fw-semibold"
                        style={{ color: it.StockAfter < 10 ? '#dc2626' : '#15803d' }}>
                        {Number(it.StockAfter).toLocaleString()}
                      </td>
                      <td className="small text-muted">{it.Remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="fw-bold">
                    <td colSpan={2} className="text-end pe-3">Total</td>
                    <td className="text-end">
                      <span className="badge bg-danger">{totalQty.toLocaleString()} units</span>
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {record.Remarks && (
              <div className="glass-card p-3">
                <strong className="small text-muted">Remarks:</strong>
                <p className="mb-0 mt-1 small">{record.Remarks}</p>
              </div>
            )}
          </div>

          <div className="modal-footer border-0 px-4 pb-4 d-print-none">
            <button className="g-btn g-btn-ghost" onClick={onClose}>Close</button>
            <button className="g-btn g-btn-primary" onClick={onPrint}>
              <i className="bi bi-printer me-1"></i>Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  EDIT MODAL  (header fields only)                                          */
/* ══════════════════════════════════════════════════════════════════════════ */
function EditModal({ record, onClose, onSaved }) {
  const [form, setForm] = useState({
    projectName:     record?.ProjectName || '',
    consumptionDate: record?.ConsumptionDate
      ? new Date(record.ConsumptionDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    remarks: record?.Remarks || '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const handle = (e) => { setForm(f => ({ ...f, [e.target.name]: e.target.value })); setError(''); };

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/consumption/${record.ConsumptionID}`, form);
      onSaved();
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally { setSaving(false); }
  };

  return (
    <div
      className="modal fade show d-block"
      tabIndex="-1"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content glass-card shadow-xl border-0">

          <div className="modal-header border-0 pb-0 px-4 pt-4">
            <h5 className="modal-title fw-bold" style={{ color: 'var(--text-dark,#1a1a2e)' }}>
              <i className="bi bi-pencil-square text-primary me-2"></i>
              Edit Consumption
              <span className="badge ms-2 fw-normal font-monospace"
                style={{ background: 'rgba(26,86,219,0.12)', color: '#1a56db', fontSize: '0.78rem' }}>
                {record.DocNo}
              </span>
            </h5>
            <button className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body px-4 py-3">
            {error && (
              <div className="alert alert-danger py-2 small">
                <i className="bi bi-exclamation-triangle me-1"></i>{error}
              </div>
            )}
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label small fw-semibold">Project</label>
                <input className="form-control" name="projectName"
                  value={form.projectName} onChange={handle} placeholder="Project name" />
              </div>
              <div className="col-12">
                <label className="form-label small fw-semibold">Consumption Date</label>
                <input className="form-control" type="date" name="consumptionDate"
                  value={form.consumptionDate} onChange={handle} />
              </div>
              <div className="col-12">
                <label className="form-label small fw-semibold">Remarks</label>
                <textarea className="form-control" name="remarks" rows={3}
                  value={form.remarks} onChange={handle} placeholder="Optional remarks…" />
              </div>
            </div>
          </div>

          <div className="modal-footer border-0 px-4 pb-4">
            <button className="g-btn g-btn-ghost" onClick={onClose}>Cancel</button>
            <button className="g-btn g-btn-primary" onClick={save} disabled={saving}>
              {saving
                ? <><span className="spinner-border spinner-border-sm me-1"></span>Saving…</>
                : <><i className="bi bi-check-lg me-1"></i>Save Changes</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  NEW CONSUMPTION FORM                                                      */
/* ══════════════════════════════════════════════════════════════════════════ */
function ConsumptionForm({ companies, allItems, onSaved, onCancel }) {
  const [form, setForm] = useState({
    docNo:           genDocNo(),
    companyId:       '',
    companyName:     '',
    projectName:     '',
    consumptionDate: new Date().toISOString().slice(0, 10),
    remarks:         '',
  });
  const [projects, setProjects] = useState([]);
  const [rows,     setRows]     = useState([emptyRow()]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  useEffect(() => {
    if (!form.companyId) { setProjects([]); return; }
    axios.get(`${API}/projects?company_id=${form.companyId}`)
      .then(r => setProjects(r.data)).catch(() => setProjects([]));
  }, [form.companyId]);

  const setField = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError(''); };
  const setRow   = (id, k, v) => setRows(rs => rs.map(r => r.id === id ? { ...r, [k]: v } : r));

  const pickItem = (rowId, itemCode) => {
    const item = allItems.find(i => String(i.ItemCode) === String(itemCode));
    if (!item) return;
    setRows(rs => rs.map(r =>
      r.id === rowId ? { ...r, itemCode: String(item.ItemCode), itemName: item.ItemName, stock: item.Stock } : r
    ));
  };

  const addRow    = () => setRows(rs => [...rs, emptyRow()]);
  const removeRow = (id) => setRows(rs => rs.length > 1 ? rs.filter(r => r.id !== id) : rs);
  const totalQty  = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);

  const submit = async () => {
    if (!form.companyId)    return setError('Please select a company');
    if (!form.docNo.trim()) return setError('Document number is required');
    const validRows = rows.filter(r => r.itemCode && Number(r.qty) > 0);
    if (!validRows.length)  return setError('Add at least one item with quantity > 0');

    setSaving(true); setError('');
    try {
      await axios.post(`${API}/consumption`, {
        docNo: form.docNo.trim(), companyId: form.companyId, companyName: form.companyName,
        projectName: form.projectName, consumptionDate: form.consumptionDate, remarks: form.remarks,
        items: validRows.map(r => ({ itemCode: r.itemCode, itemName: r.itemName, qty: Number(r.qty), remarks: r.remarks })),
      });
      setSuccess(`Voucher ${form.docNo} saved successfully!`);
      setTimeout(() => { onSaved(); }, 1200);
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="glass-card shadow-xl mb-4 overflow-hidden">

      {/* Form header */}
      <div className="modal-header border-0 pb-0 px-4 pt-4 d-flex align-items-center justify-content-between">
        <h5 className="fw-bold mb-0" style={{ color: 'var(--text-dark,#1a1a2e)' }}>
          <i className="bi bi-fire text-primary me-2"></i>
          New Consumption Voucher
        </h5>
        <button className="g-btn g-btn-ghost g-btn-sm" onClick={onCancel}>
          <i className="bi bi-x-lg me-1"></i>Cancel
        </button>
      </div>

      <div className="p-4">
        {error   && <div className="alert alert-danger py-2 small mb-3"><i className="bi bi-exclamation-triangle me-1"></i>{error}</div>}
        {success && <div className="alert alert-success py-2 small mb-3"><i className="bi bi-check-circle me-1"></i>{success}</div>}

        {/* Header fields */}
        <div className="row g-3 mb-4">
          <div className="col-12 col-md-4">
            <label className="form-label small fw-semibold">Company <span className="text-danger">*</span></label>
            <select className="form-control" value={form.companyId}
              onChange={e => {
                const sel = companies.find(c => String(c.id) === e.target.value);
                setField('companyId', e.target.value);
                setField('companyName', sel?.name || '');
                setField('projectName', '');
              }}>
              <option value="">— Select Company —</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="col-12 col-md-4">
            <label className="form-label small fw-semibold">Project</label>
            <select className="form-control" value={form.projectName}
              onChange={e => setField('projectName', e.target.value)} disabled={!form.companyId}>
              <option value="">
                {!form.companyId ? '— Select company first —' : projects.length ? '— Select Project —' : '— No projects —'}
              </option>
              {projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>

          <div className="col-12 col-md-4">
            <label className="form-label small fw-semibold">Date <span className="text-danger">*</span></label>
            <input type="date" className="form-control" value={form.consumptionDate}
              onChange={e => setField('consumptionDate', e.target.value)} />
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label small fw-semibold">Document Number <span className="text-danger">*</span></label>
            <div className="input-group">
              <input className="form-control font-monospace" value={form.docNo}
                onChange={e => setField('docNo', e.target.value)} placeholder="CON-YYMMDD-XXXX" />
              <button className="btn btn-outline-secondary" type="button"
                title="Generate new number" onClick={() => setField('docNo', genDocNo())}>
                <i className="bi bi-arrow-clockwise"></i>
              </button>
            </div>
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label small fw-semibold">Remarks</label>
            <input className="form-control" value={form.remarks}
              onChange={e => setField('remarks', e.target.value)}
              placeholder="Optional note about this consumption…" />
          </div>
        </div>

        {/* Item grid */}
        <div className="mb-3">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <h6 className="fw-bold mb-0" style={{ color: 'var(--text-dark,#1a1a2e)' }}>
              <i className="bi bi-table text-primary me-1"></i>Item Grid
            </h6>
            <span className="badge bg-primary">
              Total: {totalQty.toLocaleString()} units consumed
            </span>
          </div>

          <div className="table-responsive rounded-3">
            <table className="table table-hover mb-0 align-middle">
              <thead className="table-dark">
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th style={{ minWidth: 220 }}>Item</th>
                  <th style={{ width: 90 }}>Available</th>
                  <th style={{ width: 140 }}>Qty <span style={{ color: '#fca5a5' }}>*</span></th>
                  <th>Row Remarks</th>
                  <th style={{ width: 46 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id}>
                    <td className="text-muted small">{idx + 1}</td>

                    <td>
                      <select className="form-select form-select-sm" value={row.itemCode}
                        onChange={e => pickItem(row.id, e.target.value)}>
                        <option value="">— Select Item —</option>
                        {allItems.map(i => (
                          <option key={i.ItemCode} value={i.ItemCode}>{i.ItemName}</option>
                        ))}
                      </select>
                    </td>

                    <td>
                      {row.itemCode
                        ? <span className={`badge ${row.stock < 10 ? 'bg-danger' : 'bg-success'}`}>{row.stock ?? '—'}</span>
                        : <span className="text-muted small">—</span>}
                    </td>

                    <td>
                      <input type="number" className="form-control form-control-sm text-end"
                        min="0.001" step="any" value={row.qty}
                        onChange={e => setRow(row.id, 'qty', e.target.value)}
                        style={{ borderColor: row.qty && row.stock !== null && Number(row.qty) > row.stock ? '#dc2626' : undefined }} />
                      {row.qty && row.stock !== null && Number(row.qty) > row.stock && (
                        <div className="text-danger" style={{ fontSize: '0.7rem' }}>Exceeds stock!</div>
                      )}
                    </td>

                    <td>
                      <input type="text" className="form-control form-control-sm" placeholder="Optional"
                        value={row.remarks} onChange={e => setRow(row.id, 'remarks', e.target.value)} />
                    </td>

                    <td>
                      <button className="g-btn g-btn-danger g-btn-sm" onClick={() => removeRow(row.id)}
                        disabled={rows.length === 1} title="Remove row" style={{ padding: '5px 9px' }}>
                        <i className="bi bi-dash-lg"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="g-btn g-btn-ghost g-btn-sm mt-2" onClick={addRow}
            style={{ borderStyle: 'dashed' }}>
            <i className="bi bi-plus-lg me-1"></i>Add Item Row
          </button>
        </div>

        {/* Submit */}
        <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
          <button className="g-btn g-btn-ghost px-4" onClick={onCancel}>Cancel</button>
          <button className="g-btn g-btn-success px-5" onClick={submit} disabled={saving}>
            {saving
              ? <><span className="spinner-border spinner-border-sm me-2"></span>Saving…</>
              : <><i className="bi bi-fire me-2"></i>Save Consumption</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                            */
/* ══════════════════════════════════════════════════════════════════════════ */
export default function Consumption() {
  const [records,   setRecords]   = useState([]);
  const [companies, setCompanies] = useState([]);
  const [allItems,  setAllItems]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [search,    setSearch]    = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [preview,   setPreview]   = useState(null);
  const [editing,   setEditing]   = useState(null);

  const loadRecords = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await axios.get(`${API}/consumption`);
      setRecords(data);
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadRecords();
    axios.get(`${API}/companies`).then(r => setCompanies(r.data)).catch(() => {});
    axios.get(`${API}/itemmaster`).then(r => setAllItems(r.data)).catch(() => {});
  }, [loadRecords]);

  const openPreview = async (rec, printAfter = false) => {
    try {
      const { data } = await axios.get(`${API}/consumption/${rec.ConsumptionID}`);
      setPreview({ record: data, printAfter });
    } catch {
      setPreview({ record: rec, printAfter });
    }
  };

  const handlePrint = () => {
    const area = document.getElementById('con-print-area');
    if (!area) return;
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Consumption Voucher</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"/>
      <style>body{padding:24px;font-family:sans-serif}</style>
      </head><body>${area.outerHTML}</body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  useEffect(() => {
    if (preview?.printAfter) {
      const t = setTimeout(handlePrint, 400);
      return () => clearTimeout(t);
    }
  }, [preview]);

  const handleDelete = async (rec) => {
    if (!window.confirm(`Delete ${rec.DocNo}?\nThis will RESTORE ${rec.TotalQty} units back to stock.`)) return;
    try {
      await axios.delete(`${API}/consumption/${rec.ConsumptionID}`);
      loadRecords();
    } catch (err) {
      alert('Delete failed: ' + (err?.response?.data?.error || err.message));
    }
  };

  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    return !q || r.DocNo?.toLowerCase().includes(q) ||
      r.CompanyName?.toLowerCase().includes(q) || r.ProjectName?.toLowerCase().includes(q);
  });

  const grouped = filtered.reduce((acc, r) => {
    const co   = r.CompanyName || 'Unknown Company';
    const proj = r.ProjectName || '—';
    if (!acc[co])       acc[co] = {};
    if (!acc[co][proj]) acc[co][proj] = [];
    acc[co][proj].push(r);
    return acc;
  }, {});

  const companyTotal = (proj) => Object.values(proj).flat().reduce((s, r) => s + Number(r.TotalQty || 0), 0);
  const projectTotal = (rows) => rows.reduce((s, r) => s + Number(r.TotalQty || 0), 0);

  return (
    <>
      {/* ── Page Header ── */}
      <div className="glass-card shadow-xl mb-4 p-3 p-md-4 fade-in-up">
        <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-3">
          <div>
            <h3 className="fw-bold mb-1" style={{ color: 'var(--text-dark,#1a1a2e)' }}>
              <i className="bi bi-fire text-primary me-2"></i>
              Material Consumption
            </h3>
            <small className="text-muted">
              {filtered.length} voucher{filtered.length !== 1 ? 's' : ''}
              {search && ` matching "${search}"`}
            </small>
          </div>

          <div className="d-flex gap-2 flex-wrap align-items-center">
            <div className="input-group" style={{ maxWidth: 280 }}>
              <span className="input-group-text"><i className="bi bi-search"></i></span>
              <input className="form-control" placeholder="Search voucher, company…"
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && (
                <button className="btn btn-outline-secondary" onClick={() => setSearch('')}>
                  <i className="bi bi-x"></i>
                </button>
              )}
            </div>
            <button className="g-btn g-btn-ghost g-btn-sm" onClick={loadRecords}>
              <i className="bi bi-arrow-clockwise me-1"></i>Refresh
            </button>
            <button className="g-btn g-btn-success" onClick={() => setShowForm(true)}>
              <i className="bi bi-plus-lg me-1"></i>New Consumption
            </button>
          </div>
        </div>
      </div>

      {/* ── New Form ── */}
      {showForm && (
        <ConsumptionForm
          companies={companies} allItems={allItems}
          onSaved={() => { setShowForm(false); loadRecords(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* ── Error ── */}
      {error && (
        <div className="alert alert-danger d-flex align-items-center gap-2 mb-3">
          <i className="bi bi-exclamation-triangle-fill"></i>
          {error}
          <button className="btn btn-sm btn-outline-danger ms-auto" onClick={loadRecords}>Retry</button>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="text-center py-5">
          <div className="spinner-border text-primary"></div>
          <div className="mt-2 text-muted small">Loading consumption records…</div>
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && filtered.length === 0 && !showForm && (
        <div className="glass-card shadow-xl text-center p-5">
          <i className="bi bi-fire display-3 text-primary d-block mb-3 opacity-25"></i>
          <h5 className="text-muted">
            {search ? `No vouchers matching "${search}"` : 'No consumption records yet'}
          </h5>
          {!search && (
            <button className="g-btn g-btn-success mt-3" onClick={() => setShowForm(true)}>
              <i className="bi bi-plus-lg me-1"></i>Create First Consumption Voucher
            </button>
          )}
        </div>
      )}

      {/* ── Grouped Records ── */}
      {!loading && Object.entries(grouped).map(([company, projects]) => (
        <div key={company} className="glass-card shadow-xl mb-4 overflow-hidden">

          {/* Company header */}
          <div className="px-4 py-3 d-flex align-items-center justify-content-between border-bottom">
            <span className="fw-bold fs-6" style={{ color: 'var(--text-dark,#1a1a2e)' }}>
              <i className="bi bi-building text-primary me-2"></i>{company}
            </span>
            <span className="badge bg-primary rounded-pill">
              {companyTotal(projects).toLocaleString()} units consumed
            </span>
          </div>

          {/* Projects */}
          {Object.entries(projects).map(([proj, rows]) => (
            <div key={proj} className="px-3 pb-3 pt-2">
              <div className="d-flex align-items-center justify-content-between mb-2 mt-2">
                <span className="small fw-semibold text-muted ps-1">
                  <i className="bi bi-folder2-open me-1"></i>{proj}
                </span>
                <span className="badge bg-secondary rounded-pill">
                  {projectTotal(rows).toLocaleString()} units
                </span>
              </div>

              <div className="table-responsive rounded-3">
                <table className="table table-hover mb-0 align-middle">
                  <thead className="table-dark">
                    <tr>
                      <th style={{ width: 36 }}>#</th>
                      <th>Doc Number</th>
                      <th>Date</th>
                      <th className="text-center">Items</th>
                      <th className="text-end">Total Consumed</th>
                      <th>Remarks</th>
                      <th className="text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => (
                      <tr key={r.ConsumptionID}>
                        <td className="text-muted small">{idx + 1}</td>
                        <td>
                          <span className="badge fw-normal font-monospace"
                            style={{ background: 'rgba(26,86,219,0.12)', color: '#1a56db', fontSize: '0.82rem' }}>
                            {r.DocNo}
                          </span>
                        </td>
                        <td><small className="text-muted">{fmt(r.ConsumptionDate)}</small></td>
                        <td className="text-center">
                          <span className="badge bg-secondary">
                            {r.ItemCount} item{r.ItemCount !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td className="text-end">
                          <span className="badge bg-danger">
                            {Number(r.TotalQty).toLocaleString()} units
                          </span>
                        </td>
                        <td><small className="text-muted">{r.Remarks || '—'}</small></td>
                        <td className="text-center">
                          <div className="d-flex gap-1 justify-content-center flex-nowrap">
                            <button className="g-btn g-btn-primary g-btn-sm" title="Preview"
                              onClick={() => openPreview(r)} style={{ padding: '5px 10px' }}>
                              <i className="bi bi-eye"></i>
                            </button>
                            <button className="g-btn g-btn-ghost g-btn-sm" title="Print"
                              onClick={() => openPreview(r, true)} style={{ padding: '5px 10px' }}>
                              <i className="bi bi-printer"></i>
                            </button>
                            <button className="g-btn g-btn-warning g-btn-sm" title="Edit"
                              onClick={() => setEditing(r)} style={{ padding: '5px 10px' }}>
                              <i className="bi bi-pencil"></i>
                            </button>
                            <button className="g-btn g-btn-danger g-btn-sm" title="Delete"
                              onClick={() => handleDelete(r)} style={{ padding: '5px 10px' }}>
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
          ))}
        </div>
      ))}

      {/* ── Preview Modal ── */}
      {preview && (
        <PreviewModal record={preview.record} onClose={() => setPreview(null)} onPrint={handlePrint} />
      )}

      {/* ── Edit Modal ── */}
      {editing && (
        <EditModal record={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadRecords(); }} />
      )}
    </>
  );
}
