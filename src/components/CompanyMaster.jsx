import React, { useState, useEffect, useCallback } from 'react';
import { useCompanyMaster } from '../contexts/CompanyMasterContext';
import { companyApi } from '../services/companyApi';

const CompanyMaster = () => {
  const { companies, setCompanies } = useCompanyMaster();
  const [newCompany, setNewCompany] = useState({ name: '', address: '', logo: null });
  const [editingId, setEditingId] = useState(null);
  const [editCompany, setEditCompany] = useState({ name: '', address: '', logo: null });
  const [searchTerm, setSearchTerm] = useState('');
  const [nameError, setNameError] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // ─── Load from SQL Server on mount ────────────────────────────────────────
  useEffect(() => {
    const fetchCompanies = async () => {
      setLoading(true);
      setApiError('');
      try {
        const data = await companyApi.getAll();
        setCompanies(data);
      } catch (err) {
        setApiError('Failed to load companies: ' + err.message);
        // Fallback to localStorage if API is down
        const saved = localStorage.getItem('companyMaster');
        if (saved) setCompanies(JSON.parse(saved));
      } finally {
        setLoading(false);
      }
    };
    fetchCompanies();
  }, []);

  // ─── Keep localStorage in sync as cache ───────────────────────────────────
  useEffect(() => {
    localStorage.setItem('companyMaster', JSON.stringify(companies));
  }, [companies]);

  // ─── Validation ───────────────────────────────────────────────────────────
  const validateForm = () => {
    if (!newCompany.name.trim()) {
      setNameError('Company name is required');
      return false;
    }
    setNameError('');
    return true;
  };

  // ─── Logo Upload (converts to base64) ─────────────────────────────────────
  const handleLogoUpload = (file, setter) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo must be under 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setter(prev => ({ ...prev, logo: ev.target.result }));
    reader.readAsDataURL(file);
  };

  // ─── ADD company → POST to DB ──────────────────────────────────────────────
  const addCompany = async () => {
    if (!validateForm()) return;
    setLoading(true);
    setApiError('');
    try {
      const created = await companyApi.add(newCompany);
      setCompanies(prev => [created, ...prev]);
      setNewCompany({ name: '', address: '', logo: null });
    } catch (err) {
      setApiError('Failed to add company: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── EDIT — open form ──────────────────────────────────────────────────────
  const editCompanyFn = (company) => {
    setEditingId(company.id);
    setEditCompany({ ...company });
  };

  // ─── SAVE EDIT → PUT to DB ────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!editCompany.name.trim()) return;
    setLoading(true);
    setApiError('');
    try {
      const updated = await companyApi.update(editingId, editCompany);
      setCompanies(prev => prev.map(c => c.id === editingId ? updated : c));
      setEditingId(null);
      setEditCompany({ name: '', address: '', logo: null });
    } catch (err) {
      setApiError('Failed to update company: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── DELETE → DELETE from DB ──────────────────────────────────────────────
  const deleteCompanyFn = async (id) => {
    if (!window.confirm('Delete this company?')) return;
    setLoading(true);
    setApiError('');
    try {
      await companyApi.delete(id);
      setCompanies(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setApiError('Failed to delete company: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Search (client-side filter) ──────────────────────────────────────────
  const filteredCompanies = companies.filter(c =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ─── Export CSV ───────────────────────────────────────────────────────────
  const exportCSV = () => {
    if (filteredCompanies.length === 0) return;
    const headers = ['ID', 'Name', 'Address'];
    const rows = filteredCompanies.map(r =>
      [r.id, r.name, `"${(r.address || '').replace(/"/g, '""')}"`].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `companies-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="modal fade glass-card" id="companyModal" tabIndex="-1" aria-labelledby="companyModalLabel" aria-hidden="true">
        <div className="modal-dialog modal-xl">
          <div className="modal-content glass-card shadow-xl">

            <div className="modal-header border-0 pb-0">
              <h3 className="modal-title fw-bold text-primary" id="companyModalLabel">
                <i className="bi bi-building me-2"></i>Company Master
              </h3>
              <button type="button" className="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close" />
            </div>

            <div className="modal-body p-4">

              {/* ── API Error Banner ── */}
              {apiError && (
                <div className="alert alert-danger d-flex align-items-center gap-2 mb-3" role="alert">
                  <i className="bi bi-exclamation-triangle-fill"></i>
                  <span>{apiError}</span>
                  <button className="btn-close ms-auto" onClick={() => setApiError('')} />
                </div>
              )}

              {/* ── Loading Spinner ── */}
              {loading && (
                <div className="d-flex justify-content-center my-2">
                  <div className="spinner-border spinner-border-sm text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <span className="ms-2 small text-muted">Syncing with database...</span>
                </div>
              )}

              {/* ── Add Form ── */}
              <div className="glass-card p-4 mb-4 fade-in-up">
                <h5 className="fw-semibold mb-3">
                  <i className="bi bi-plus-circle text-success me-2"></i>Add New Company
                </h5>
                <div className="row g-3">
                  {/* Logo Upload */}
                  <div className="col-lg-12 mb-3">
                    <label className="form-label fw-semibold">Company Logo</label>
                    <div className="d-flex align-items-center gap-3">
                      {newCompany.logo
                        ? <img src={newCompany.logo} alt="preview" style={{ maxHeight: 60, borderRadius: 8 }} className="shadow-sm" />
                        : <div className="border rounded p-3 text-muted text-center" style={{ minWidth: 100, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            No Logo
                          </div>
                      }
                      <div>
                        <label className="btn btn-outline-primary btn-sm">
                          <i className="bi bi-upload me-1"></i>Upload
                          <input type="file" className="d-none" accept="image/*"
                            onChange={(e) => handleLogoUpload(e.target.files[0], setNewCompany)} />
                        </label>
                        {newCompany.logo && (
                          <button className="btn btn-outline-danger btn-sm ms-1"
                            onClick={() => setNewCompany(p => ({ ...p, logo: null }))}>
                            <i className="bi bi-trash"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="col-lg-4">
                    <label className="form-label fw-semibold">
                      Company Name <span className="text-danger">*</span>
                    </label>
                    <input className="form-control" placeholder="Enter company name"
                      value={newCompany.name}
                      onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} />
                    {nameError && <div className="text-danger small mt-1">{nameError}</div>}
                  </div>

                  <div className="col-lg-6">
                    <label className="form-label fw-semibold">Address</label>
                    <textarea className="form-control" placeholder="Enter full address" rows="2"
                      value={newCompany.address}
                      onChange={(e) => setNewCompany({ ...newCompany, address: e.target.value })} />
                  </div>

                  <div className="col-lg-2 d-flex align-items-end">
                    <button className="btn btn-success w-100" onClick={addCompany} disabled={loading}>
                      <i className="bi bi-plus-lg me-1"></i>Add Company
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Search ── */}
              <div className="table-search mb-4">
                <i className="bi bi-search"></i>
                <input type="text" className="form-control ps-5" placeholder="Search companies..."
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>

              {/* ── Toolbar ── */}
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h6 className="fw-bold mb-0">Companies ({filteredCompanies.length})</h6>
                <button className="btn btn-outline-success btn-sm" onClick={exportCSV}>
                  <i className="bi bi-download me-1"></i>Export CSV
                </button>
              </div>

              {/* ── Table ── */}
              <div className="table-responsive glass-card">
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th className="fw-bold text-primary">Logo</th>
                      <th className="fw-bold text-primary">Company Name</th>
                      <th className="fw-bold text-primary">Address</th>
                      <th className="fw-bold text-primary">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompanies.map(company => (
                      <tr key={company.id} className="fade-in-up">
                        <td>
                          {company.logo
                            ? <img src={company.logo} alt="logo" style={{ maxHeight: 40, borderRadius: 4 }} className="shadow-sm" />
                            : <div className="text-muted small text-center p-2"
                                style={{ minWidth: 50, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #dee2e6' }}>
                                No Logo
                              </div>
                          }
                        </td>
                        <td className="fw-semibold">{company.name}</td>
                        <td>{company.address}</td>
                        <td>
                          <div className="btn-group btn-group-sm" role="group">
                            <button className="btn btn-outline-primary" title="Edit"
                              onClick={() => editCompanyFn(company)}>
                              <i className="bi bi-pencil"></i>
                            </button>
                            <button className="btn btn-outline-danger" title="Delete"
                              onClick={() => deleteCompanyFn(company.id)} disabled={loading}>
                              <i className="bi bi-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredCompanies.length === 0 && !loading && (
                      <tr>
                        <td colSpan="4" className="text-center text-muted py-4">
                          <i className="bi bi-search display-4 mb-3 d-block opacity-50"></i>
                          <div>No companies found</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* ── Edit Form ── */}
              {editingId && (
                <div className="glass-card p-4 mt-4 fade-in-up">
                  <h5 className="fw-semibold mb-3 text-warning">
                    <i className="bi bi-pencil-square me-2"></i>Edit Company
                  </h5>
                  <div className="row g-3">
                    {/* Edit Logo */}
                    <div className="col-lg-12 mb-2">
                      <label className="form-label fw-semibold">Company Logo</label>
                      <div className="d-flex align-items-center gap-3">
                        {editCompany.logo
                          ? <img src={editCompany.logo} alt="preview" style={{ maxHeight: 60, borderRadius: 8 }} className="shadow-sm" />
                          : <div className="border rounded p-3 text-muted text-center"
                              style={{ minWidth: 100, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              No Logo
                            </div>
                        }
                        <label className="btn btn-outline-primary btn-sm">
                          <i className="bi bi-upload me-1"></i>Change
                          <input type="file" className="d-none" accept="image/*"
                            onChange={(e) => handleLogoUpload(e.target.files[0], setEditCompany)} />
                        </label>
                        {editCompany.logo && (
                          <button className="btn btn-outline-danger btn-sm"
                            onClick={() => setEditCompany(p => ({ ...p, logo: null }))}>
                            <i className="bi bi-trash"></i>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="col-lg-4">
                      <label className="form-label fw-semibold">Company Name</label>
                      <input className="form-control" value={editCompany.name}
                        onChange={(e) => setEditCompany({ ...editCompany, name: e.target.value })} />
                    </div>

                    <div className="col-lg-6">
                      <label className="form-label fw-semibold">Address</label>
                      <textarea className="form-control" rows="2" value={editCompany.address}
                        onChange={(e) => setEditCompany({ ...editCompany, address: e.target.value })} />
                    </div>

                    <div className="col-lg-2 d-flex align-items-end gap-2">
                      <button className="btn btn-success flex-fill" onClick={saveEdit} disabled={loading}>
                        <i className="bi bi-check-lg me-1"></i>Save
                      </button>
                      <button className="btn btn-outline-secondary" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default CompanyMaster;