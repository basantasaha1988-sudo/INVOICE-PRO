// src/components/SupplierMaster.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = (import.meta.env.VITE_API_URL || '/api') + '/suppliers';

const EMPTY_FORM = {
  supplierCode:  '',
  supplierName:  '',
  contactPerson: '',
  phone:         '',
  email:         '',
  address:       '',
  gstNo:         '',
  notes:         '',
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }) : '—';

// ── Shared field renderer ──────────────────────────────────────────────────────
const Field = ({ label, name, form, setForm, required, placeholder, type = 'text', readOnly = false }) => (
  <div className="mb-2">
    <label className="form-label small fw-semibold mb-1">
      {label}{required && <span className="text-danger ms-1">*</span>}
    </label>
    {type === 'textarea' ? (
      <textarea
        className="form-control form-control-sm"
        rows={2}
        placeholder={placeholder}
        value={form[name]}
        readOnly={readOnly}
        onChange={e => !readOnly && setForm(f => ({ ...f, [name]: e.target.value }))}
      />
    ) : (
      <input
        type={type}
        className={`form-control form-control-sm${readOnly ? ' bg-body-secondary text-muted font-monospace' : ''}`}
        placeholder={placeholder}
        value={form[name]}
        readOnly={readOnly}
        onChange={e => !readOnly && setForm(f => ({ ...f, [name]: e.target.value }))}
      />
    )}
  </div>
);

// ── Supplier form block ────────────────────────────────────────────────────────
const SupplierForm = ({ form, setForm, onSubmit, onCancel, isEdit = false, saving, formError }) => (
  <div className="border rounded-3 p-3 bg-body-tertiary mb-3">
    <h6 className="fw-bold mb-3">
      <i className={`bi ${isEdit ? 'bi-pencil-square' : 'bi-plus-circle'} me-2 text-primary`}></i>
      {isEdit ? 'Edit Supplier' : 'Add New Supplier'}
      {isEdit && form.supplierCode && (
        <span className="badge ms-2 fw-normal font-monospace"
          style={{ background: '#6f42c1', fontSize: '0.78rem', letterSpacing: '0.04em' }}>
          <i className="bi bi-tag me-1"></i>{form.supplierCode}
        </span>
      )}
    </h6>

    {formError && (
      <div className="alert alert-danger py-2 small">
        <i className="bi bi-exclamation-triangle me-2"></i>{formError}
      </div>
    )}

    <div className="row g-2">
      {/* Row 1: SupplierCode · SupplierName · ContactPerson */}
      <div className="col-12 col-sm-6 col-md-3">
        <Field label="Supplier Code" name="supplierCode" form={form} setForm={setForm}
          required placeholder="e.g. SUP-001" readOnly={isEdit} />
      </div>
      <div className="col-12 col-sm-6 col-md-5">
        <Field label="Supplier Name" name="supplierName" form={form} setForm={setForm}
          required placeholder="e.g. ABC Trading Co." />
      </div>
      <div className="col-12 col-sm-6 col-md-4">
        <Field label="Contact Person" name="contactPerson" form={form} setForm={setForm}
          placeholder="e.g. Raj Kumar" />
      </div>

      {/* Row 2: Phone · Email · GSTNo */}
      <div className="col-12 col-sm-6 col-md-4">
        <Field label="Phone" name="phone" form={form} setForm={setForm}
          placeholder="+91 98xxx" type="tel" />
      </div>
      <div className="col-12 col-sm-6 col-md-4">
        <Field label="Email" name="email" form={form} setForm={setForm}
          placeholder="supplier@email.com" type="email" />
      </div>
      <div className="col-12 col-sm-6 col-md-4">
        <Field label="GST No." name="gstNo" form={form} setForm={setForm}
          placeholder="22AAAAA0000A1Z5" />
      </div>

      {/* Row 3: Address · Notes */}
      <div className="col-12 col-md-8">
        <Field label="Address" name="address" form={form} setForm={setForm}
          placeholder="Street, City, State" type="textarea" />
      </div>
      <div className="col-12 col-md-4">
        <Field label="Notes" name="notes" form={form} setForm={setForm}
          placeholder="Internal notes..." type="textarea" />
      </div>

      {/* Row 4: CreatedAt · UpdatedAt — read-only, edit mode only */}
      {isEdit && (
        <>
          <div className="col-12 col-sm-6">
            <div className="mb-2">
              <label className="form-label small fw-semibold mb-1">Created At</label>
              <input type="text"
                className="form-control form-control-sm bg-body-secondary text-muted"
                value={fmtDateTime(form.createdAt)}
                readOnly tabIndex={-1} />
            </div>
          </div>
          <div className="col-12 col-sm-6">
            <div className="mb-2">
              <label className="form-label small fw-semibold mb-1">Last Updated At</label>
              <input type="text"
                className="form-control form-control-sm bg-body-secondary text-muted"
                value={fmtDateTime(form.updatedAt)}
                readOnly tabIndex={-1} />
            </div>
          </div>
        </>
      )}
    </div>

    <div className="d-flex gap-2 mt-3 justify-content-end flex-wrap">
      {onCancel && (
        <button className="g-btn g-btn-ghost g-btn-sm" onClick={onCancel}>Cancel</button>
      )}
      <button className="g-btn g-btn-primary g-btn-sm" onClick={onSubmit} disabled={saving}>
        {saving
          ? <span className="spinner-border spinner-border-sm me-1"></span>
          : <i className={`bi ${isEdit ? 'bi-check-lg' : 'bi-plus-lg'} me-1`}></i>
        }
        {isEdit ? 'Save Changes' : 'Add Supplier'}
      </button>
    </div>
  </div>
);

// ── Mobile card for a single supplier row ─────────────────────────────────────
const SupplierCard = ({ s, onEdit, onToggle, onDelete }) => (
  <div className={`border rounded-3 p-3 mb-2 ${!s.IsActive ? 'opacity-50' : ''}`}
    style={{ background: 'var(--bs-body-bg)' }}>
    <div className="d-flex justify-content-between align-items-start mb-1">
      <div>
        <span className="badge fw-normal font-monospace me-2"
          style={{ background: '#6f42c1', fontSize: '0.78rem' }}>
          {s.SupplierCode || '—'}
        </span>
        <span className={`badge ${s.IsActive ? 'bg-success' : 'bg-secondary'}`}>
          {s.IsActive ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div className="d-flex gap-1">
        <button className="g-btn g-btn-ghost g-btn-sm" title="Edit" onClick={onEdit}>
          <i className="bi bi-pencil"></i>
        </button>
        <button className="g-btn g-btn-ghost g-btn-sm" title={s.IsActive ? 'Deactivate' : 'Activate'}
          onClick={onToggle}>
          <i className={`bi ${s.IsActive ? 'bi-toggle-on text-success' : 'bi-toggle-off text-muted'}`}></i>
        </button>
        <button className="g-btn g-btn-ghost g-btn-sm text-danger" title="Delete" onClick={onDelete}>
          <i className="bi bi-trash"></i>
        </button>
      </div>
    </div>
    <div className="fw-semibold">{s.SupplierName}</div>
    {s.ContactPerson && <div className="small text-muted"><i className="bi bi-person me-1"></i>{s.ContactPerson}</div>}
    {s.Phone         && <div className="small text-muted"><i className="bi bi-telephone me-1"></i>{s.Phone}</div>}
    {s.Email         && <div className="small text-muted"><i className="bi bi-envelope me-1"></i>{s.Email}</div>}
    {s.GSTNo         && <div className="small text-muted font-monospace"><i className="bi bi-file-text me-1"></i>{s.GSTNo}</div>}
    {s.Address       && <div className="small text-muted"><i className="bi bi-geo-alt me-1"></i>{s.Address}</div>}
    {s.Notes         && <div className="small text-muted fst-italic"><i className="bi bi-sticky me-1"></i>{s.Notes}</div>}
    <div className="d-flex gap-3 mt-1" style={{ fontSize: '0.7rem', color: 'var(--bs-secondary-color)' }}>
      <span><i className="bi bi-calendar-plus me-1"></i>{fmtDate(s.CreatedAt)}</span>
      {s.UpdatedAt && <span><i className="bi bi-calendar-check me-1"></i>{fmtDate(s.UpdatedAt)}</span>}
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
const SupplierMaster = () => {
  const [suppliers,    setSuppliers]    = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [search,       setSearch]       = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [toast,        setToast]        = useState(null);
  const [formError,    setFormError]    = useState('');

  const [newForm,   setNewForm]   = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState(null);
  const [editForm,  setEditForm]  = useState({ ...EMPTY_FORM });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/all`);
      setSuppliers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      showToast('Failed to load suppliers: ' + (err.response?.data?.error || err.message), 'danger');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const validate = (form) => {
    if (!form.supplierCode.trim()) { setFormError('Supplier code is required'); return false; }
    if (!form.supplierName.trim()) { setFormError('Supplier name is required'); return false; }
    setFormError('');
    return true;
  };

  // ── ADD ────────────────────────────────────────────────────────────────────
  const addSupplier = async () => {
    if (!validate(newForm)) return;
    setSaving(true);
    try {
      const res = await axios.post(API_URL, newForm);
      await fetchSuppliers();
      setNewForm({ ...EMPTY_FORM });
      showToast(`✅ Supplier added! Code: ${res.data?.SupplierCode || ''}`);
    } catch (err) {
      showToast('❌ ' + (err.response?.data?.error || err.message), 'danger');
    } finally {
      setSaving(false);
    }
  };

  // ── EDIT ───────────────────────────────────────────────────────────────────
  const startEdit = (s) => {
    setEditingId(s.SupplierID);
    setEditForm({
      supplierCode:  s.SupplierCode  || '',
      supplierName:  s.SupplierName  || '',
      contactPerson: s.ContactPerson || '',
      phone:         s.Phone         || '',
      email:         s.Email         || '',
      address:       s.Address       || '',
      gstNo:         s.GSTNo         || '',
      notes:         s.Notes         || '',
      createdAt:     s.CreatedAt     || '',
      updatedAt:     s.UpdatedAt     || '',
    });
    setFormError('');
  };

  const saveEdit = async () => {
    if (!validate(editForm)) return;
    setSaving(true);
    try {
      await axios.put(`${API_URL}/${editingId}`, editForm);
      await fetchSuppliers();
      setEditingId(null);
      setEditForm({ ...EMPTY_FORM });
      showToast('✅ Supplier updated!');
    } catch (err) {
      showToast('❌ ' + (err.response?.data?.error || err.message), 'danger');
    } finally {
      setSaving(false);
    }
  };

  // ── TOGGLE ACTIVE ─────────────────────────────────────────────────────────
  const toggleActive = async (s) => {
    try {
      await axios.patch(`${API_URL}/${s.SupplierID}/toggle`);
      await fetchSuppliers();
      showToast(`${s.IsActive ? '⛔ Deactivated' : '✅ Activated'}: ${s.SupplierName}`);
    } catch (err) {
      showToast('❌ ' + (err.response?.data?.error || err.message), 'danger');
    }
  };

  // ── DELETE ────────────────────────────────────────────────────────────────
  const deleteSupplier = async (s) => {
    if (!window.confirm(`Delete supplier "${s.SupplierName}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API_URL}/${s.SupplierID}`);
      await fetchSuppliers();
      showToast(`🗑️ Supplier deleted.`);
    } catch (err) {
      showToast('❌ ' + (err.response?.data?.error || err.message), 'danger');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ ...EMPTY_FORM });
    setFormError('');
  };

  const filtered = suppliers.filter(s => {
    if (!showInactive && !s.IsActive) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.SupplierName   || '').toLowerCase().includes(q) ||
      (s.SupplierCode   || '').toLowerCase().includes(q) ||
      (s.ContactPerson  || '').toLowerCase().includes(q) ||
      (s.Phone          || '').toLowerCase().includes(q) ||
      (s.Email          || '').toLowerCase().includes(q) ||
      (s.Address        || '').toLowerCase().includes(q) ||
      (s.GSTNo          || '').toLowerCase().includes(q) ||
      (s.Notes          || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="modal fade" id="supplierModal" tabIndex="-1"
      aria-labelledby="supplierModalLabel" aria-hidden="true">
      <div className="modal-dialog modal-xl modal-dialog-scrollable">
        <div className="modal-content glass-card">

          {/* ── Header ── */}
          <div className="modal-header">
            <h5 className="modal-title fw-bold" id="supplierModalLabel">
              <i className="bi bi-truck me-2" style={{ color: '#6f42c1' }}></i>
              Supplier Master
              <span className="badge bg-secondary ms-2 fw-normal" style={{ fontSize: '0.75rem' }}>
                {suppliers.filter(s => s.IsActive).length} active
              </span>
            </h5>
            <button type="button" className="btn-close" data-bs-dismiss="modal"></button>
          </div>

          {/* ── Body ── */}
          <div className="modal-body px-3 px-md-4">

            {/* Toast */}
            {toast && (
              <div className={`alert alert-${toast.type} py-2 small`} role="alert">
                {toast.msg}
              </div>
            )}

            {/* Add form */}
            {editingId === null && (
              <SupplierForm
                form={newForm}
                setForm={setNewForm}
                onSubmit={addSupplier}
                saving={saving}
                formError={formError}
              />
            )}

            {/* Edit form */}
            {editingId !== null && (
              <SupplierForm
                form={editForm}
                setForm={setEditForm}
                onSubmit={saveEdit}
                onCancel={cancelEdit}
                isEdit
                saving={saving}
                formError={formError}
              />
            )}

            {/* Toolbar */}
            <div className="d-flex gap-2 align-items-center mb-3 flex-wrap">
              <div className="input-group input-group-sm" style={{ maxWidth: 340 }}>
                <span className="input-group-text"><i className="bi bi-search"></i></span>
                <input type="text" className="form-control"
                  placeholder="Search name, code, phone, GST..."
                  value={search} onChange={e => setSearch(e.target.value)} />
                {search && (
                  <button className="btn btn-outline-secondary" onClick={() => setSearch('')}>
                    <i className="bi bi-x"></i>
                  </button>
                )}
              </div>
              <div className="form-check form-switch mb-0">
                <input className="form-check-input" type="checkbox" id="showInactiveToggle"
                  checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
                <label className="form-check-label small" htmlFor="showInactiveToggle">
                  Show inactive
                </label>
              </div>
              <button className="g-btn g-btn-ghost g-btn-sm" onClick={fetchSuppliers} disabled={loading}>
                {loading
                  ? <span className="spinner-border spinner-border-sm"></span>
                  : <i className="bi bi-arrow-clockwise"></i>}
              </button>
              <span className="text-muted small ms-auto">
                {filtered.length} supplier{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* ── Content ── */}
            {loading ? (
              <div className="text-center py-4">
                <span className="spinner-border text-primary"></span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-5 text-muted">
                <i className="bi bi-truck display-4 d-block mb-3"></i>
                {suppliers.length === 0
                  ? 'No suppliers yet. Add your first supplier above.'
                  : 'No suppliers match your search.'}
              </div>
            ) : (
              <>
                {/* ── Mobile cards (xs–md) ── */}
                <div className="d-md-none">
                  {filtered.map(s => (
                    <SupplierCard
                      key={s.SupplierID}
                      s={s}
                      onEdit={() => { startEdit(s); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      onToggle={() => toggleActive(s)}
                      onDelete={() => deleteSupplier(s)}
                    />
                  ))}
                </div>

                {/* ── Desktop table (md+) ── */}
                <div className="d-none d-md-block table-responsive">
                  <table className="table table-hover table-sm align-middle mb-0"
                    style={{ fontSize: '0.82rem' }}>
                    <thead className="table-dark">
                      <tr>
                        <th style={{ whiteSpace: 'nowrap' }}>ID</th>
                        <th style={{ whiteSpace: 'nowrap' }}>Code</th>
                        <th style={{ whiteSpace: 'nowrap' }}>Supplier Name</th>
                        <th style={{ whiteSpace: 'nowrap' }}>Contact Person</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Address</th>
                        <th style={{ whiteSpace: 'nowrap' }}>GST No.</th>
                        <th style={{ whiteSpace: 'nowrap' }}>Is Active</th>
                        <th>Notes</th>
                        <th style={{ whiteSpace: 'nowrap' }}>Created At</th>
                        <th style={{ whiteSpace: 'nowrap' }}>Updated At</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(s => (
                        <tr key={s.SupplierID} className={!s.IsActive ? 'opacity-50' : ''}>

                          <td className="text-muted font-monospace">{s.SupplierID}</td>

                          <td>
                            {s.SupplierCode
                              ? <span className="badge fw-normal font-monospace"
                                  style={{ background: '#6f42c1', fontSize: '0.78rem', letterSpacing: '0.03em' }}>
                                  {s.SupplierCode}
                                </span>
                              : <span className="text-muted">—</span>}
                          </td>

                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div className="fw-semibold">{s.SupplierName}</div>
                          </td>

                          <td style={{ whiteSpace: 'nowrap' }}>
                            {s.ContactPerson || <span className="text-muted">—</span>}
                          </td>

                          <td style={{ whiteSpace: 'nowrap' }}>
                            {s.Phone || <span className="text-muted">—</span>}
                          </td>

                          <td>
                            {s.Email
                              ? <a href={`mailto:${s.Email}`} className="text-decoration-none small">{s.Email}</a>
                              : <span className="text-muted">—</span>}
                          </td>

                          <td style={{ maxWidth: 160 }}>
                            {s.Address
                              ? <span title={s.Address}
                                  style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
                                           whiteSpace: 'nowrap', maxWidth: 150 }}>
                                  {s.Address}
                                </span>
                              : <span className="text-muted">—</span>}
                          </td>

                          <td className="font-monospace" style={{ whiteSpace: 'nowrap' }}>
                            {s.GSTNo || <span className="text-muted">—</span>}
                          </td>

                          <td className="text-center">
                            <span className={`badge ${s.IsActive ? 'bg-success' : 'bg-secondary'}`}>
                              {s.IsActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>

                          <td style={{ maxWidth: 140 }}>
                            {s.Notes
                              ? <span title={s.Notes}
                                  style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
                                           whiteSpace: 'nowrap', maxWidth: 130 }}>
                                  {s.Notes}
                                </span>
                              : <span className="text-muted">—</span>}
                          </td>

                          <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                            {fmtDate(s.CreatedAt)}
                          </td>

                          <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                            {fmtDate(s.UpdatedAt)}
                          </td>

                          <td>
                            <div className="d-flex gap-1">
                              <button className="g-btn g-btn-ghost g-btn-sm" title="Edit"
                                onClick={() => { startEdit(s); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                                <i className="bi bi-pencil"></i>
                              </button>
                              <button className="g-btn g-btn-ghost g-btn-sm"
                                title={s.IsActive ? 'Deactivate' : 'Activate'}
                                onClick={() => toggleActive(s)}>
                                <i className={`bi ${s.IsActive ? 'bi-toggle-on text-success' : 'bi-toggle-off text-muted'}`}></i>
                              </button>
                              <button className="g-btn g-btn-ghost g-btn-sm text-danger" title="Delete"
                                onClick={() => deleteSupplier(s)}>
                                <i className="bi bi-trash"></i>
                              </button>
                            </div>
                          </td>

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="modal-footer">
            <span className="text-muted small me-auto">
              {suppliers.filter(s => s.IsActive).length} active / {suppliers.length} total suppliers
            </span>
            <button type="button" className="g-btn g-btn-ghost" data-bs-dismiss="modal">Close</button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SupplierMaster;