import React, { useState, useEffect } from 'react';
import { useCompanyMaster } from '../contexts/CompanyMasterContext';
import { companyApi } from '../services/companyApi';

const CompanyMaster = () => {
  const { companies, setCompanies } = useCompanyMaster();
  const [newCompany,  setNewCompany]  = useState({ name: '', address: '', logo: null });
  const [editingId,   setEditingId]   = useState(null);
  const [editCompany, setEditCompany] = useState({ name: '', address: '', logo: null });
  const [searchTerm,  setSearchTerm]  = useState('');
  const [nameError,   setNameError]   = useState('');
  const [loading,     setLoading]     = useState(false);
  const [apiError,    setApiError]    = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await companyApi.getAll();
        setCompanies(data);
      } catch (err) {
        setApiError('Failed to load companies: ' + err.message);
        const saved = localStorage.getItem('companyMaster');
        if (saved) setCompanies(JSON.parse(saved));
      } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    localStorage.setItem('companyMaster', JSON.stringify(companies));
  }, [companies]);

  const validateForm = () => {
    if (!newCompany.name.trim()) { setNameError('Company name is required'); return false; }
    setNameError(''); return true;
  };

  // Compress + resize image before base64 encoding so it fits in DB (varchar MAX)
  // Max output dimensions: 300x300px. Quality: 0.82 JPEG. Keeps aspect ratio.
  const handleLogoUpload = (file, setter) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Logo must be under 5MB'); return; }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 300;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width);  width = MAX; }
        else                { width  = Math.round(width  * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      // Use JPEG at 0.82 quality — keeps file small, still looks sharp for a logo
      const compressed = canvas.toDataURL('image/jpeg', 0.82);
      setter(prev => ({ ...prev, logo: compressed }));
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      alert('Could not read image file.');
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  };

  const addCompany = async () => {
    if (!validateForm()) return;
    setLoading(true); setApiError('');
    try {
      const created = await companyApi.add(newCompany);
      setCompanies(prev => [created, ...prev]);
      setNewCompany({ name: '', address: '', logo: null });
    } catch (err) { setApiError('Failed to add company: ' + err.message); }
    finally { setLoading(false); }
  };

  const saveEdit = async () => {
    if (!editCompany.name.trim()) return;
    setLoading(true); setApiError('');
    try {
      const updated = await companyApi.update(editingId, editCompany);
      setCompanies(prev => prev.map(c => c.id === editingId ? updated : c));
      setEditingId(null);
      setEditCompany({ name: '', address: '', logo: null });
    } catch (err) { setApiError('Failed to update company: ' + err.message); }
    finally { setLoading(false); }
  };

  const deleteCompanyFn = async (id) => {
    if (!window.confirm('Delete this company?')) return;
    setLoading(true); setApiError('');
    try {
      await companyApi.delete(id);
      setCompanies(prev => prev.filter(c => c.id !== id));
    } catch (err) { setApiError('Failed to delete company: ' + err.message); }
    finally { setLoading(false); }
  };

  const exportCSV = () => {
    if (!filteredCompanies.length) return;
    const csv = ['ID,Name,Address', ...filteredCompanies.map(r =>
      [r.id, r.name, `"${(r.address||'').replace(/"/g,'""')}"`].join(',')
    )].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `companies-${Date.now()}.csv`;
    a.click();
  };

  const filteredCompanies = companies.filter(c =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  /* ─── Shared inline styles ─────────────────────── */
  const thStyle = {
    background: 'linear-gradient(135deg, rgba(26,86,219,0.72) 0%, rgba(30,50,160,0.82) 100%)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 12,
    padding: '12px 14px',
    letterSpacing: '0.4px',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    borderBottom: 'none',
  };

  const tdStyle = {
    padding: '12px 14px',
    fontSize: 13,
    color: 'var(--text-mid, #445)',
    borderBottom: '1px solid rgba(200,200,240,0.22)',
    verticalAlign: 'middle',
  };

  return (
    <>
      <div className="modal fade" id="companyModal" tabIndex="-1" aria-labelledby="companyModalLabel" aria-hidden="true">
        <div className="modal-dialog modal-xl modal-fullscreen-md-down">
          <div className="modal-content glass-card shadow-xl border-0">

            {/* ── Header ── */}
            <div className="modal-header border-0 pb-0 px-4 pt-4">
              <h4 className="modal-title fw-bold" id="companyModalLabel" style={{ color: 'var(--text-dark,#1a1a2e)' }}>
                <i className="bi bi-building me-2 text-primary"></i>Company Master
              </h4>
              <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close" />
            </div>

            <div className="modal-body p-3 p-md-4">

              {/* ── Error Banner ── */}
              {apiError && (
                <div className="alert alert-danger d-flex align-items-center gap-2 mb-3 small">
                  <i className="bi bi-exclamation-triangle-fill flex-shrink-0"></i>
                  <span className="flex-grow-1">{apiError}</span>
                  <button className="btn-close btn-close-sm ms-auto" onClick={() => setApiError('')} />
                </div>
              )}

              {/* ── Loading ── */}
              {loading && (
                <div className="d-flex align-items-center gap-2 mb-3 small text-muted">
                  <div className="spinner-border spinner-border-sm text-primary"></div>
                  Syncing with database…
                </div>
              )}

              {/* ── Add Form ── */}
              <div className="glass-card p-3 p-md-4 mb-4">
                <h6 className="fw-bold mb-3" style={{ color: 'var(--text-dark,#1a1a2e)' }}>
                  <i className="bi bi-plus-circle text-success me-2"></i>Add New Company
                </h6>

                {/* Logo row */}
                <div className="mb-3">
                  <label className="form-label fw-semibold small">Company Logo</label>
                  <div className="d-flex align-items-center gap-3 flex-wrap">
                    {newCompany.logo
                      ? <img src={newCompany.logo} alt="preview" style={{ maxHeight: 56, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,.12)' }} />
                      : <div style={{ width: 90, height: 56, borderRadius: 8, border: '1.5px dashed rgba(200,200,240,0.6)', background: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#aab' }}>No Logo</div>
                    }
                    <label className="g-btn g-btn-ghost g-btn-sm" style={{ cursor: 'pointer' }}>
                      <i className="bi bi-upload me-1"></i>Upload
                      <input type="file" className="d-none" accept="image/*"
                        onChange={e => handleLogoUpload(e.target.files[0], setNewCompany)} />
                    </label>
                    {newCompany.logo && (
                      <button className="g-btn g-btn-danger g-btn-sm" onClick={() => setNewCompany(p => ({ ...p, logo: null }))}>
                        <i className="bi bi-trash"></i>
                      </button>
                    )}
                  </div>
                </div>

                {/* Fields row — responsive */}
                <div className="row g-3 align-items-end">
                  <div className="col-12 col-md-4">
                    <label className="form-label fw-semibold small">
                      Company Name <span className="text-danger">*</span>
                    </label>
                    <input className="form-control" placeholder="Enter company name"
                      value={newCompany.name}
                      onChange={e => { setNewCompany({ ...newCompany, name: e.target.value }); setNameError(''); }} />
                    {nameError && <div className="text-danger small mt-1"><i className="bi bi-exclamation-circle me-1"></i>{nameError}</div>}
                  </div>

                  <div className="col-12 col-md-5">
                    <label className="form-label fw-semibold small">Address</label>
                    <textarea className="form-control" placeholder="Enter full address" rows="2"
                      value={newCompany.address}
                      onChange={e => setNewCompany({ ...newCompany, address: e.target.value })} />
                  </div>

                  <div className="col-12 col-md-3">
                    <button className="g-btn g-btn-success g-btn-block" onClick={addCompany} disabled={loading}>
                      {loading
                        ? <span className="spinner-border spinner-border-sm me-2"></span>
                        : <i className="bi bi-plus-lg me-2"></i>
                      }
                      Add Company
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Search + Toolbar ── */}
              <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
                <div className="flex-grow-1" style={{ position: 'relative', minWidth: 180 }}>
                  <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#aab', fontSize: 13, zIndex: 1 }}></i>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search companies…"
                    style={{ paddingLeft: 34 }}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <span className="small text-muted fw-semibold text-nowrap">
                  {filteredCompanies.length} {filteredCompanies.length === 1 ? 'company' : 'companies'}
                </span>
                <button className="g-btn g-btn-success g-btn-sm text-nowrap" onClick={exportCSV}>
                  <i className="bi bi-download me-1"></i>Export CSV
                </button>
              </div>

              {/* ── Table ── */}
              <div className="glass-card" style={{ overflow: 'hidden', borderRadius: 14 }}>
                <div className="table-responsive">
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 480 }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, borderRadius: '14px 0 0 0', width: 90 }}>Logo</th>
                        <th style={thStyle}>Company Name</th>
                        <th style={thStyle}>Address</th>
                        <th style={{ ...thStyle, borderRadius: '0 14px 0 0', width: 110, textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCompanies.map((company, i) => (
                        <tr key={company.id}
                          style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.22)', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.68)'}
                          onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.22)'}
                        >
                          <td style={tdStyle}>
                            {company.logo
                              ? <img src={company.logo} alt="logo" style={{ maxHeight: 38, maxWidth: 70, borderRadius: 6, objectFit: 'contain' }} />
                              : <span style={{ fontSize: 11, color: '#aab', border: '1px dashed rgba(200,200,240,0.5)', borderRadius: 6, padding: '4px 8px' }}>No Logo</span>
                            }
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--text-dark,#1a1a2e)' }}>{company.name}</td>
                          <td style={{ ...tdStyle, color: '#667', maxWidth: 260 }}>
                            <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {company.address || '—'}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                              <button
                                className="g-btn g-btn-primary g-btn-sm"
                                title="Edit"
                                onClick={() => { setEditingId(company.id); setEditCompany({ ...company }); }}
                              >
                                <i className="bi bi-pencil me-1"></i>Edit
                              </button>
                              <button
                                className="g-btn g-btn-danger g-btn-sm"
                                title="Delete"
                                onClick={() => deleteCompanyFn(company.id)}
                                disabled={loading}
                              >
                                <i className="bi bi-trash me-1"></i>Del
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredCompanies.length === 0 && !loading && (
                        <tr>
                          <td colSpan="4" style={{ ...tdStyle, textAlign: 'center', padding: '40px 16px', color: '#aab' }}>
                            <i className="bi bi-building display-5 d-block mb-2 opacity-25"></i>
                            No companies found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Edit Form ── */}
              {editingId && (
                <div className="glass-card p-3 p-md-4 mt-4" style={{ border: '1.5px solid rgba(245,158,11,0.35)' }}>
                  <h6 className="fw-bold mb-3" style={{ color: '#b45309' }}>
                    <i className="bi bi-pencil-square me-2"></i>Edit Company
                  </h6>

                  <div className="mb-3">
                    <label className="form-label fw-semibold small">Company Logo</label>
                    <div className="d-flex align-items-center gap-3 flex-wrap">
                      {editCompany.logo
                        ? <img src={editCompany.logo} alt="preview" style={{ maxHeight: 56, borderRadius: 8 }} />
                        : <div style={{ width: 90, height: 56, borderRadius: 8, border: '1.5px dashed rgba(200,200,240,0.6)', background: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#aab' }}>No Logo</div>
                      }
                      <label className="g-btn g-btn-ghost g-btn-sm" style={{ cursor: 'pointer' }}>
                        <i className="bi bi-upload me-1"></i>Change
                        <input type="file" className="d-none" accept="image/*"
                          onChange={e => handleLogoUpload(e.target.files[0], setEditCompany)} />
                      </label>
                      {editCompany.logo && (
                        <button className="g-btn g-btn-danger g-btn-sm"
                          onClick={() => setEditCompany(p => ({ ...p, logo: null }))}>
                          <i className="bi bi-trash"></i>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="row g-3 align-items-end">
                    <div className="col-12 col-md-4">
                      <label className="form-label fw-semibold small">Company Name</label>
                      <input className="form-control" value={editCompany.name}
                        onChange={e => setEditCompany({ ...editCompany, name: e.target.value })} />
                    </div>
                    <div className="col-12 col-md-5">
                      <label className="form-label fw-semibold small">Address</label>
                      <textarea className="form-control" rows="2" value={editCompany.address}
                        onChange={e => setEditCompany({ ...editCompany, address: e.target.value })} />
                    </div>
                    <div className="col-12 col-md-3">
                      <div className="d-flex gap-2">
                        <button className="g-btn g-btn-success flex-fill" onClick={saveEdit} disabled={loading}>
                          {loading ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-check-lg me-1"></i>}
                          Save
                        </button>
                        <button className="g-btn g-btn-ghost" onClick={() => setEditingId(null)}>
                          <i className="bi bi-x-lg"></i>
                        </button>
                      </div>
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