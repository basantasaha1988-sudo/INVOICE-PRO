import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = '/api/customers';

const EMPTY = { name: '', phone: '', email: '', address: '' };

const formatDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? '—' : dt.toLocaleDateString('en-IN');
};

const CustomerMaster = () => {
  const [customers, setCustomers]   = useState([]);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [nameError, setNameError]   = useState('');
  const [toast, setToast]           = useState(null);

  const [newCustomer, setNewCustomer] = useState({ ...EMPTY });
  const [editingId, setEditingId]     = useState(null);
  const [editCustomer, setEditCustomer] = useState({ ...EMPTY });

  // ── Load from DB on mount ──────────────────────────────────────────────────
  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await axios.get(API_URL);
      setCustomers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      showToast('Failed to load customers: ' + (err.response?.data?.error || err.message), 'danger');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const validate = (c) => {
    if (!c.name.trim()) { setNameError('Customer name is required'); return false; }
    setNameError('');
    return true;
  };

  // ── ADD ────────────────────────────────────────────────────────────────────
  const addCustomer = async () => {
    if (!validate(newCustomer)) return;
    setSaving(true);
    try {
      await axios.post(`${API_URL}/upsert`, {
        name:    newCustomer.name.trim(),
        phone:   newCustomer.phone.trim(),
        address: newCustomer.address.trim(),
      });
      await fetchCustomers();
      setNewCustomer({ ...EMPTY });
      showToast('✅ Customer added successfully!');
    } catch (err) {
      showToast('❌ Error: ' + (err.response?.data?.error || err.message), 'danger');
    } finally {
      setSaving(false);
    }
  };

  // ── EDIT ───────────────────────────────────────────────────────────────────
  const startEdit = (c) => {
    setEditingId(c.CustomerID);
    setEditCustomer({
      name:    c.CustomerName || '',
      phone:   c.Phone        || '',
      email:   c.Email        || '',
      address: c.Address      || '',
    });
  };

  const saveEdit = async () => {
    if (!editCustomer.name.trim()) return;
    setSaving(true);
    try {
      await axios.put(`${API_URL}/${editingId}`, {
        name:    editCustomer.name.trim(),
        phone:   editCustomer.phone.trim(),
        address: editCustomer.address.trim(),
      });
      await fetchCustomers();
      setEditingId(null);
      setEditCustomer({ ...EMPTY });
      showToast('✅ Customer updated successfully!');
    } catch (err) {
      showToast('❌ Error: ' + (err.response?.data?.error || err.message), 'danger');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditCustomer({ ...EMPTY });
  };

  // ── DELETE ─────────────────────────────────────────────────────────────────
  const deleteCustomer = async (id) => {
    if (!window.confirm('Delete this customer?')) return;
    try {
      await axios.delete(`${API_URL}/${id}`);
      await fetchCustomers();
      showToast('🗑️ Customer deleted.');
    } catch (err) {
      showToast('❌ Error: ' + (err.response?.data?.error || err.message), 'danger');
    }
  };

  // ── CSV Export ─────────────────────────────────────────────────────────────
  const exportCSV = () => {
    if (filtered.length === 0) return;
    const headers = ['CustomerID', 'CustomerName', 'Phone', 'Email', 'Address', 'CreatedAt'];
    const rows = filtered.map(c => [
      c.CustomerID, c.CustomerName, c.Phone || '', c.Email || '',
      (c.Address || '').replace(/,/g, ' '), formatDate(c.CreatedAt)
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `customers-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = customers.filter(c =>
    (c.CustomerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.Phone        || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.Address      || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      <div className="modal fade" id="customerModal" tabIndex="-1">
        <div className="modal-dialog modal-xl modal-fullscreen-sm-down">
          <div className="modal-content glass-card shadow-xl">

            {/* Header */}
            <div className="modal-header border-0 pb-0">
              <div>
                <h3 className="modal-title fw-bold text-primary mb-0">
                  <i className="bi bi-people-fill me-2"></i>Customer Master
                </h3>
                <small className="text-muted">Manage your customer database</small>
              </div>
              <button className="btn-close" data-bs-dismiss="modal"></button>
            </div>

            {/* Toast */}
            {toast && (
              <div
                className={`alert alert-${toast.type} alert-dismissible mx-4 mt-3 mb-0`}
                style={{ fontSize: '0.9rem' }}
              >
                <strong>{toast.msg}</strong>
                <button className="btn-close btn-sm" onClick={() => setToast(null)}></button>
              </div>
            )}

            <div className="modal-body p-4">

              {/* ── Stats Row ── */}
              <div className="row g-3 mb-4">
                {[
                  { label: 'Total Customers', value: customers.length, color: 'primary', icon: 'bi-people' },
                  { label: 'With Phone',      value: customers.filter(c => c.Phone).length,   color: 'success', icon: 'bi-telephone' },
                  { label: 'With Email',      value: customers.filter(c => c.Email).length,   color: 'info',    icon: 'bi-envelope' },
                  { label: 'With Address',    value: customers.filter(c => c.Address).length, color: 'warning', icon: 'bi-geo-alt' },
                ].map((s, i) => (
                  <div key={i} className="col-6 col-md-3">
                    <div className="glass-card p-3 text-center">
                      <i className={`bi ${s.icon} text-${s.color} fs-4 d-block mb-1`}></i>
                      <div className={`fw-bold fs-5 text-${s.color}`}>{s.value}</div>
                      <div className="text-muted small">{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Add New Customer ── */}
              <div className="glass-card p-4 mb-4">
                <h5 className="fw-semibold mb-3">
                  <i className="bi bi-person-plus text-success me-2"></i>Add New Customer
                </h5>
                <div className="row g-3 align-items-end">

                  <div className="col-12 col-md-4">
                    <label className="form-label small fw-semibold">Customer Name *</label>
                    <input
                      className={`form-control ${nameError ? 'is-invalid' : ''}`}
                      placeholder="Full name or company name"
                      value={newCustomer.name}
                      onChange={e => { setNewCustomer(p => ({ ...p, name: e.target.value })); setNameError(''); }}
                      onKeyDown={e => e.key === 'Enter' && addCustomer()}
                    />
                    {nameError && <div className="invalid-feedback">{nameError}</div>}
                  </div>

                  <div className="col-12 col-md-2">
                    <label className="form-label small fw-semibold">Phone</label>
                    <input
                      className="form-control"
                      placeholder="Phone number"
                      value={newCustomer.phone}
                      onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))}
                    />
                  </div>

                  <div className="col-12 col-md-4">
                    <label className="form-label small fw-semibold">Address</label>
                    <input
                      className="form-control"
                      placeholder="Street / Area / City"
                      value={newCustomer.address}
                      onChange={e => setNewCustomer(p => ({ ...p, address: e.target.value }))}
                    />
                  </div>

                  <div className="col-12 col-md-2">
                    <button
                      className="g-btn g-btn-success g-btn-block"
                      onClick={addCustomer}
                      disabled={saving}
                    >
                      {saving
                        ? <span className="spinner-border spinner-border-sm me-1"></span>
                        : <i className="bi bi-plus-lg me-1"></i>
                      }
                      Add Customer
                    </button>
                  </div>

                </div>
              </div>

              {/* ── Search & Export ── */}
              <div className="d-flex gap-2 mb-3 align-items-center flex-wrap">
                <div className="input-group flex-grow-1" style={{ maxWidth: 360 }}>
                  <span className="input-group-text"><i className="bi bi-search"></i></span>
                  <input
                    className="form-control"
                    placeholder="Search by name, phone, address..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button className="g-btn g-btn-ghost" onClick={() => setSearchTerm('')}>
                      <i className="bi bi-x"></i>
                    </button>
                  )}
                </div>
                <span className="text-muted small">
                  Showing {filtered.length} of {customers.length}
                </span>
                <button
                  className="g-btn g-btn-success g-btn-sm ms-auto"
                  onClick={exportCSV}
                  disabled={filtered.length === 0}
                >
                  <i className="bi bi-file-earmark-spreadsheet me-1"></i>Export CSV
                </button>
              </div>

              {/* ── Table ── */}
              {loading ? (
                <div className="text-center py-5">
                  <span className="spinner-border text-primary"></span>
                  <p className="text-muted mt-2">Loading customers...</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle">
                    <thead className="table-dark">
                      <tr>
                        <th style={{ width: 60 }}>#ID</th>
                        <th>Customer Name</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Address</th>
                        <th>Created</th>
                        <th style={{ width: 110 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(c => (
                        <React.Fragment key={c.CustomerID}>
                          <tr>
                            <td><span className="badge bg-secondary">{c.CustomerID}</span></td>
                            <td className="fw-semibold">
                              <i className="bi bi-person-circle text-primary me-2"></i>
                              {c.CustomerName}
                            </td>
                            <td>
                              {c.Phone
                                ? <><i className="bi bi-telephone text-success me-1"></i>{c.Phone}</>
                                : <span className="text-muted">—</span>}
                            </td>
                            <td>
                              {c.Email
                                ? <><i className="bi bi-envelope text-info me-1"></i>{c.Email}</>
                                : <span className="text-muted">—</span>}
                            </td>
                            <td className="text-muted small">
                              {c.Address || '—'}
                            </td>
                            <td className="text-muted small">{formatDate(c.CreatedAt)}</td>
                            <td>
                              <div className="btn-group btn-group-sm">
                                <button
                                  className="g-btn g-btn-ghost g-btn-sm"
                                  title="Edit"
                                  onClick={() => startEdit(c)}
                                >
                                  <i className="bi bi-pencil"></i>
                                </button>
                                <button
                                  className="g-btn g-btn-danger g-btn-sm"
                                  title="Delete"
                                  onClick={() => deleteCustomer(c.CustomerID)}
                                >
                                  <i className="bi bi-trash"></i>
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Inline edit row */}
                          {editingId === c.CustomerID && (
                            <tr className="table-warning">
                              <td colSpan={7}>
                                <div className="glass-card p-3">
                                  <h6 className="fw-semibold mb-3">
                                    <i className="bi bi-pencil-square text-warning me-2"></i>
                                    Editing: <strong>{c.CustomerName}</strong>
                                  </h6>
                                  <div className="row g-3 align-items-end">
                                    <div className="col-12 col-md-4">
                                      <label className="form-label small fw-semibold">Customer Name</label>
                                      <input
                                        className="form-control"
                                        value={editCustomer.name}
                                        onChange={e => setEditCustomer(p => ({ ...p, name: e.target.value }))}
                                      />
                                    </div>
                                    <div className="col-12 col-md-2">
                                      <label className="form-label small fw-semibold">Phone</label>
                                      <input
                                        className="form-control"
                                        value={editCustomer.phone}
                                        onChange={e => setEditCustomer(p => ({ ...p, phone: e.target.value }))}
                                      />
                                    </div>
                                    <div className="col-12 col-md-4">
                                      <label className="form-label small fw-semibold">Address</label>
                                      <input
                                        className="form-control"
                                        value={editCustomer.address}
                                        onChange={e => setEditCustomer(p => ({ ...p, address: e.target.value }))}
                                      />
                                    </div>
                                    <div className="col-12 col-md-2">
                                      <div className="d-flex gap-2">
                                        <button
                                          className="g-btn g-btn-success"
                                          onClick={saveEdit}
                                          disabled={saving}
                                        >
                                          {saving
                                            ? <span className="spinner-border spinner-border-sm"></span>
                                            : <><i className="bi bi-check-lg me-1"></i>Save</>
                                          }
                                        </button>
                                        <button className="g-btn g-btn-ghost" onClick={cancelEdit}>
                                          <i className="bi bi-x-lg"></i>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}

                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-5 text-muted">
                            <i className="bi bi-people display-4 d-block mb-3 opacity-25"></i>
                            {customers.length === 0
                              ? 'No customers yet. Add your first customer above.'
                              : 'No customers match your search.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

            </div>{/* modal-body */}
          </div>
        </div>
      </div>
    </>
  );
};

export default CustomerMaster;