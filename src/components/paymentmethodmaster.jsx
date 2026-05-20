import React, { useState, useEffect } from 'react';
import { useDarkMode } from '../App';

const API = import.meta.env.VITE_API_URL || '/api';

const EMPTY = { methodName: '', description: '', isActive: true };

const PaymentMethodMaster = () => {
  const { isDark } = useDarkMode();

  const [methods, setMethods]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [searchTerm, setSearch]   = useState('');
  const [toast, setToast]         = useState(null);

  const [form, setForm]           = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm]   = useState({ ...EMPTY });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Fetch all payment methods (including inactive) ──────────────────────
  const fetchMethods = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/payment-methods/all`);
      const data = await res.json();
      setMethods(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast('Failed to load payment methods: ' + err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMethods(); }, []);

  // ── ADD ──────────────────────────────────────────────────────────────────
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.methodName.trim()) return showToast('Method name is required', 'danger');
    setSaving(true);
    try {
      const res = await fetch(`${API}/payment-methods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          MethodName:   form.methodName.trim(),
          Description:  form.description.trim() || null,
          IsActive:     form.isActive ? 1 : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      showToast(`✓ "${form.methodName}" added successfully`);
      setForm({ ...EMPTY });
      fetchMethods();
    } catch (err) {
      showToast('Save failed: ' + err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  // ── EDIT ──────────────────────────────────────────────────────────────────
  const startEdit = (m) => {
    setEditingId(m.PaymentMethodID);
    setEditForm({
      methodName:   m.MethodName   || '',
      description:  m.Description  || '',
      isActive:     m.IsActive === 1 || m.IsActive === true,
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({ ...EMPTY }); };

  const handleUpdate = async (id) => {
    if (!editForm.methodName.trim()) return showToast('Method name is required', 'danger');
    setSaving(true);
    try {
      const res = await fetch(`${API}/payment-methods/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          MethodName:   editForm.methodName.trim(),
          Description:  editForm.description.trim() || null,
          IsActive:     editForm.isActive ? 1 : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      showToast(`✓ "${editForm.methodName}" updated`);
      cancelEdit();
      fetchMethods();
    } catch (err) {
      showToast('Update failed: ' + err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  // ── DELETE ────────────────────────────────────────────────────────────────
  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete payment method "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API}/payment-methods/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      showToast(`"${name}" deleted`);
      fetchMethods();
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'danger');
    }
  };

  // ── TOGGLE ACTIVE ─────────────────────────────────────────────────────────
  const toggleActive = async (m) => {
    try {
      const res = await fetch(`${API}/payment-methods/${m.PaymentMethodID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          MethodName:   m.MethodName,
          Description:  m.Description || null,
          IsActive:     m.IsActive ? 0 : 1,
        }),
      });
      if (!res.ok) throw new Error('Toggle failed');
      fetchMethods();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  const filtered = methods.filter(m =>
    m.MethodName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.Description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeCount   = methods.filter(m => m.IsActive === 1 || m.IsActive === true).length;
  const inactiveCount = methods.length - activeCount;

  return (
    <div
      className="modal fade"
      id="paymentMethodModal"
      tabIndex="-1"
      aria-labelledby="paymentMethodModalLabel"
      aria-hidden="true"
    >
      <div className="modal-dialog modal-xl modal-dialog-scrollable">
        <div className={`modal-content ${isDark ? 'bg-dark text-light' : ''}`}>

          {/* Header */}
          <div className="modal-header border-0 pb-0">
            <div className="d-flex align-items-center gap-3 flex-grow-1">
              <span style={{
                width: 42, height: 42, borderRadius: 12,
                background: 'linear-gradient(135deg,#1a56db,#7e3af2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <i className="bi bi-credit-card-2-front text-white fs-5"></i>
              </span>
              <div>
                <h5 className="modal-title mb-0 fw-bold" id="paymentMethodModalLabel">
                  Payment Method Master
                </h5>
                <small className={isDark ? 'text-light opacity-60' : 'text-muted'}>
                  {activeCount} active &nbsp;·&nbsp; {inactiveCount} inactive
                </small>
              </div>
            </div>
            <button
              type="button"
              className="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close"
            />
          </div>

          <div className="modal-body pt-3">

            {/* Toast */}
            {toast && (
              <div
                className={`alert alert-${toast.type === 'danger' ? 'danger' : 'success'} alert-dismissible py-2 mb-3`}
                role="alert"
              >
                {toast.msg}
              </div>
            )}

            {/* ADD FORM */}
            <div className={`rounded-3 p-3 mb-4 ${isDark ? 'bg-secondary bg-opacity-25' : 'bg-light'}`}>
              <h6 className="fw-bold mb-3">
                <i className="bi bi-plus-circle me-2 text-primary"></i>
                Add New Payment Method
              </h6>
              <form onSubmit={handleAdd}>
                <div className="row g-2 align-items-end">
                  <div className="col-12 col-md-4">
                    <label className="form-label form-label-sm fw-semibold mb-1">
                      Method Name <span className="text-danger">*</span>
                    </label>
                    <input
                      className="form-control form-control-sm"
                      placeholder="e.g. Cash, UPI, NEFT…"
                      value={form.methodName}
                      onChange={e => setForm(p => ({ ...p, methodName: e.target.value }))}
                      maxLength={50}
                    />
                  </div>
                  <div className="col-12 col-md-5">
                    <label className="form-label form-label-sm fw-semibold mb-1">
                      Description <span className="text-muted fw-normal">(optional)</span>
                    </label>
                    <input
                      className="form-control form-control-sm"
                      placeholder="Short description…"
                      value={form.description}
                      onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                      maxLength={150}
                    />
                  </div>
                  <div className="col-6 col-md-2 d-flex align-items-center gap-2 pt-1">
                    <div className="form-check form-switch mb-0">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="newIsActive"
                        checked={form.isActive}
                        onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
                      />
                      <label className="form-check-label form-label-sm" htmlFor="newIsActive">
                        Active
                      </label>
                    </div>
                  </div>
                  <div className="col-6 col-md-1">
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm w-100"
                      disabled={saving}
                    >
                      {saving ? <span className="spinner-border spinner-border-sm" /> : (
                        <><i className="bi bi-plus-lg me-1"></i>Add</>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* SEARCH + TABLE */}
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="fw-bold mb-0">
                All Methods
                <span className="badge bg-primary ms-2">{methods.length}</span>
              </h6>
              <div className="d-flex gap-2">
                <div className="input-group input-group-sm" style={{ width: 220 }}>
                  <span className="input-group-text"><i className="bi bi-search"></i></span>
                  <input
                    className="form-control"
                    placeholder="Search…"
                    value={searchTerm}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={fetchMethods}
                  title="Refresh"
                >
                  <i className="bi bi-arrow-clockwise"></i>
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" />
                <p className="text-muted mt-2 mb-0">Loading…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-5">
                <i className="bi bi-inbox display-4 text-muted d-block mb-2"></i>
                <p className="text-muted mb-0">
                  {searchTerm ? 'No methods match your search.' : 'No payment methods yet. Add one above.'}
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className={`table table-hover align-middle mb-0 ${isDark ? 'table-dark' : ''}`}>
                  <thead className={isDark ? 'table-secondary' : 'table-dark'}>
                    <tr>
                      <th style={{ width: 50 }}>#</th>
                      <th>Method Name</th>
                      <th>Description</th>
                      <th style={{ width: 100 }} className="text-center">Status</th>
                      <th style={{ width: 140 }} className="text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((m, idx) => {
                      const isEdit  = editingId === m.PaymentMethodID;
                      const active  = m.IsActive === 1 || m.IsActive === true;

                      return (
                        <tr key={m.PaymentMethodID} className={active ? '' : 'opacity-50'}>
                          <td className="text-muted small">{idx + 1}</td>

                          {isEdit ? (
                            <>
                              <td>
                                <input
                                  className="form-control form-control-sm"
                                  value={editForm.methodName}
                                  onChange={e => setEditForm(p => ({ ...p, methodName: e.target.value }))}
                                  maxLength={50}
                                  autoFocus
                                />
                              </td>
                              <td>
                                <input
                                  className="form-control form-control-sm"
                                  value={editForm.description}
                                  onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                                  maxLength={150}
                                />
                              </td>
                              <td className="text-center">
                                <div className="form-check form-switch d-flex justify-content-center mb-0">
                                  <input
                                    className="form-check-input"
                                    type="checkbox"
                                    checked={editForm.isActive}
                                    onChange={e => setEditForm(p => ({ ...p, isActive: e.target.checked }))}
                                  />
                                </div>
                              </td>
                              <td className="text-center">
                                <div className="d-flex gap-1 justify-content-center">
                                  <button
                                    className="btn btn-success btn-sm px-2"
                                    onClick={() => handleUpdate(m.PaymentMethodID)}
                                    disabled={saving}
                                    title="Save"
                                  >
                                    <i className="bi bi-check-lg"></i>
                                  </button>
                                  <button
                                    className="btn btn-outline-secondary btn-sm px-2"
                                    onClick={cancelEdit}
                                    title="Cancel"
                                  >
                                    <i className="bi bi-x-lg"></i>
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="fw-semibold">
                                <i className="bi bi-credit-card me-2 text-primary opacity-75"></i>
                                {m.MethodName}
                              </td>
                              <td className="text-muted small">{m.Description || '—'}</td>
                              <td className="text-center">
                                <div
                                  className="form-check form-switch d-flex justify-content-center mb-0"
                                  title={active ? 'Click to deactivate' : 'Click to activate'}
                                >
                                  <input
                                    className="form-check-input"
                                    type="checkbox"
                                    checked={active}
                                    onChange={() => toggleActive(m)}
                                    style={{ cursor: 'pointer' }}
                                  />
                                </div>
                              </td>
                              <td className="text-center">
                                <div className="d-flex gap-1 justify-content-center">
                                  <button
                                    className="btn btn-outline-primary btn-sm px-2"
                                    onClick={() => startEdit(m)}
                                    title="Edit"
                                  >
                                    <i className="bi bi-pencil"></i>
                                  </button>
                                  <button
                                    className="btn btn-outline-danger btn-sm px-2"
                                    onClick={() => handleDelete(m.PaymentMethodID, m.MethodName)}
                                    title="Delete"
                                  >
                                    <i className="bi bi-trash"></i>
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="modal-footer border-0 pt-0">
            <small className="text-muted me-auto">
              <i className="bi bi-info-circle me-1"></i>
              Active methods appear in the Receipt Payment dropdown. Toggle the switch to revoke access.
            </small>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-bs-dismiss="modal"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentMethodMaster;