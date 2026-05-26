// src/components/ProjectMaster.jsx
// Project Master  –  parent: Company  |  child: Project
// Opens as a Bootstrap modal (#projectModal)
// Trigger: <button data-bs-toggle="modal" data-bs-target="#projectModal">

import React, { useState, useEffect, useCallback } from 'react';
import { useCompanyMaster } from '../contexts/CompanyMasterContext';

const API = import.meta.env.VITE_API_URL || '/api';

/* ─── tiny shared styles (mirrors CompanyMaster palette) ──────────── */
const thStyle = {
  background: 'linear-gradient(135deg, rgba(26,86,219,0.72) 0%, rgba(30,50,160,0.82) 100%)',
  color: '#fff', fontWeight: 700, fontSize: 12,
  padding: '12px 14px', letterSpacing: '0.4px',
  textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: 'none',
};
const tdStyle = {
  padding: '12px 14px', fontSize: 13,
  color: 'var(--text-mid, #445)',
  borderBottom: '1px solid rgba(200,200,240,0.22)',
  verticalAlign: 'middle',
};

/* ─── empty form shape ──────────────────────────────────────────────── */
const EMPTY = { name: '', description: '' };

const ProjectMaster = () => {
  const { companies } = useCompanyMaster();

  // ── selected company (the "parent") ─────────────────────────────────
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const selectedCompany = companies.find(c => String(c.id) === String(selectedCompanyId));

  // ── project list for the selected company ───────────────────────────
  const [projects, setProjects]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [apiError, setApiError]   = useState('');

  // ── add-form state ───────────────────────────────────────────────────
  const [newProject, setNewProject] = useState(EMPTY);
  const [nameError, setNameError]   = useState('');

  // ── edit state ───────────────────────────────────────────────────────
  const [editingId, setEditingId]     = useState(null);
  const [editProject, setEditProject] = useState(EMPTY);

  // ── search ───────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');

  // ── Load projects whenever the selected company changes ─────────────
  const loadProjects = useCallback(async (companyId) => {
    if (!companyId) { setProjects([]); return; }
    setLoading(true); setApiError('');
    try {
      const res = await fetch(`${API}/projects?company_id=${companyId}`);
      if (!res.ok) throw new Error(await res.text());
      setProjects(await res.json());
    } catch (err) {
      setApiError('Failed to load projects: ' + err.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadProjects(selectedCompanyId);
    setEditingId(null);
    setNewProject(EMPTY);
    setSearchTerm('');
    setNameError('');
  }, [selectedCompanyId, loadProjects]);

  // ── Add ──────────────────────────────────────────────────────────────
  const addProject = async () => {
    if (!selectedCompanyId) { setApiError('Please select a company first.'); return; }
    if (!newProject.name.trim()) { setNameError('Project name is required'); return; }
    setNameError(''); setLoading(true); setApiError('');
    try {
      const res = await fetch(`${API}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: selectedCompanyId, ...newProject }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const created = await res.json();
      setProjects(prev => [created, ...prev]);
      setNewProject(EMPTY);
    } catch (err) { setApiError('Failed to add project: ' + err.message); }
    finally { setLoading(false); }
  };

  // ── Save edit ────────────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!editProject.name.trim()) return;
    setLoading(true); setApiError('');
    try {
      const res = await fetch(`${API}/projects/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: selectedCompanyId, ...editProject }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const updated = await res.json();
      setProjects(prev => prev.map(p => p.id === editingId ? updated : p));
      setEditingId(null); setEditProject(EMPTY);
    } catch (err) { setApiError('Failed to update project: ' + err.message); }
    finally { setLoading(false); }
  };

  // ── Delete ───────────────────────────────────────────────────────────
  const deleteProject = async (id) => {
    if (!window.confirm('Delete this project?')) return;
    setLoading(true); setApiError('');
    try {
      const res = await fetch(`${API}/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (err) { setApiError('Failed to delete project: ' + err.message); }
    finally { setLoading(false); }
  };

  // ── Export CSV ───────────────────────────────────────────────────────
  const exportCSV = () => {
    if (!filtered.length) return;
    const csv = [
      'ID,Project Name,Description,Company',
      ...filtered.map(p =>
        [p.id, `"${p.name.replace(/"/g, '""')}"`,
         `"${(p.description || '').replace(/"/g, '""')}"`,
         `"${(p.company_name || '').replace(/"/g, '""')}"`].join(',')
      )
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `projects-${Date.now()}.csv`;
    a.click();
  };

  const filtered = projects.filter(p =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="modal fade" id="projectModal" tabIndex="-1"
      aria-labelledby="projectModalLabel" aria-hidden="true">
      <div className="modal-dialog modal-xl modal-fullscreen-md-down">
        <div className="modal-content glass-card shadow-xl border-0">

          {/* ── Modal Header ── */}
          <div className="modal-header border-0 pb-0 px-4 pt-4">
            <h4 className="modal-title fw-bold" id="projectModalLabel"
              style={{ color: 'var(--text-dark,#1a1a2e)' }}>
              <i className="bi bi-diagram-3 me-2 text-primary"></i>Project Master
            </h4>
            <button type="button" className="btn-close"
              data-bs-dismiss="modal" aria-label="Close" />
          </div>

          <div className="modal-body p-3 p-md-4">

            {/* ── Error Banner ── */}
            {apiError && (
              <div className="alert alert-danger d-flex align-items-center gap-2 mb-3 small">
                <i className="bi bi-exclamation-triangle-fill flex-shrink-0"></i>
                <span className="flex-grow-1">{apiError}</span>
                <button className="btn-close btn-close-sm ms-auto"
                  onClick={() => setApiError('')} />
              </div>
            )}

            {/* ── Loading indicator ── */}
            {loading && (
              <div className="d-flex align-items-center gap-2 mb-3 small text-muted">
                <div className="spinner-border spinner-border-sm text-primary"></div>
                Syncing with database…
              </div>
            )}

            {/* ════════════════════════════════════════════════════
                STEP 1 – Company selector  (the "parent")
                ════════════════════════════════════════════════════ */}
            <div className="glass-card p-3 p-md-4 mb-4"
              style={{ border: selectedCompanyId
                ? '1.5px solid rgba(26,86,219,0.35)'
                : '1.5px solid rgba(245,158,11,0.40)' }}>

              <h6 className="fw-bold mb-3" style={{ color: 'var(--text-dark,#1a1a2e)' }}>
                <span className="badge bg-primary rounded-pill me-2"
                  style={{ fontSize: 11 }}>1</span>
                Select Company <span className="text-danger">*</span>
              </h6>

              {companies.length === 0 ? (
                <div className="text-muted small">
                  <i className="bi bi-info-circle me-1"></i>
                  No companies found. Please add a company in{' '}
                  <button className="btn btn-link btn-sm p-0"
                    data-bs-dismiss="modal"
                    data-bs-toggle="modal"
                    data-bs-target="#companyModal">
                    Company Master
                  </button>{' '}first.
                </div>
              ) : (
                <div className="row g-3 align-items-end">
                  <div className="col-12 col-md-6">
                    <label className="form-label fw-semibold small">Company</label>
                    <select
                      className="form-select"
                      value={selectedCompanyId}
                      onChange={e => setSelectedCompanyId(e.target.value)}
                    >
                      <option value="">— Select a company —</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Company badge once selected */}
                  {selectedCompany && (
                    <div className="col-12 col-md-6">
                      <div className="d-flex align-items-center gap-3 p-2 rounded-3"
                        style={{ background: 'rgba(26,86,219,0.08)', border: '1px solid rgba(26,86,219,0.18)' }}>
                        {selectedCompany.logo
                          ? <img src={selectedCompany.logo} alt="logo"
                              style={{ maxHeight: 40, maxWidth: 70, borderRadius: 6, objectFit: 'contain' }} />
                          : <div className="rounded-3 d-flex align-items-center justify-content-center"
                              style={{ width: 44, height: 44, background: 'rgba(26,86,219,0.12)' }}>
                              <i className="bi bi-building text-primary"></i>
                            </div>
                        }
                        <div>
                          <div className="fw-bold small" style={{ color: '#1a1a2e' }}>{selectedCompany.name}</div>
                          {selectedCompany.address && (
                            <div className="text-muted" style={{ fontSize: 11 }}>{selectedCompany.address}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ════════════════════════════════════════════════════
                STEP 2 – Add Project  (the "child") — only when company is picked
                ════════════════════════════════════════════════════ */}
            {selectedCompanyId && (
              <>
                <div className="glass-card p-3 p-md-4 mb-4">
                  <h6 className="fw-bold mb-3" style={{ color: 'var(--text-dark,#1a1a2e)' }}>
                    <span className="badge bg-success rounded-pill me-2"
                      style={{ fontSize: 11 }}>2</span>
                    Add New Project under{' '}
                    <span className="text-primary">{selectedCompany?.name}</span>
                  </h6>

                  <div className="row g-3 align-items-end">
                    <div className="col-12 col-md-4">
                      <label className="form-label fw-semibold small">
                        Project Name <span className="text-danger">*</span>
                      </label>
                      <input
                        className="form-control"
                        placeholder="Enter project name"
                        value={newProject.name}
                        onChange={e => {
                          setNewProject(p => ({ ...p, name: e.target.value }));
                          setNameError('');
                        }}
                        onKeyDown={e => e.key === 'Enter' && addProject()}
                      />
                      {nameError && (
                        <div className="text-danger small mt-1">
                          <i className="bi bi-exclamation-circle me-1"></i>{nameError}
                        </div>
                      )}
                    </div>

                    <div className="col-12 col-md-5">
                      <label className="form-label fw-semibold small">Description</label>
                      <textarea
                        className="form-control"
                        placeholder="Optional project description"
                        rows="2"
                        value={newProject.description}
                        onChange={e => setNewProject(p => ({ ...p, description: e.target.value }))}
                      />
                    </div>

                    <div className="col-12 col-md-3">
                      <button
                        className="g-btn g-btn-success g-btn-block"
                        onClick={addProject}
                        disabled={loading}
                      >
                        {loading
                          ? <span className="spinner-border spinner-border-sm me-2"></span>
                          : <i className="bi bi-plus-lg me-2"></i>
                        }
                        Add Project
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Search + toolbar ── */}
                <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
                  <div className="flex-grow-1" style={{ position: 'relative', minWidth: 180 }}>
                    <i className="bi bi-search" style={{
                      position: 'absolute', left: 12, top: '50%',
                      transform: 'translateY(-50%)', color: '#aab', fontSize: 13, zIndex: 1,
                    }}></i>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Search projects…"
                      style={{ paddingLeft: 34 }}
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <span className="small text-muted fw-semibold text-nowrap">
                    {filtered.length} {filtered.length === 1 ? 'project' : 'projects'}
                  </span>
                  <button
                    className="g-btn g-btn-success g-btn-sm text-nowrap"
                    onClick={exportCSV}
                    disabled={!filtered.length}
                  >
                    <i className="bi bi-download me-1"></i>Export CSV
                  </button>
                </div>

                {/* ── Projects Table ── */}
                <div className="glass-card" style={{ overflow: 'hidden', borderRadius: 14 }}>
                  <div className="table-responsive">
                    <table style={{
                      width: '100%', borderCollapse: 'separate',
                      borderSpacing: 0, minWidth: 480,
                    }}>
                      <thead>
                        <tr>
                          <th style={{ ...thStyle, borderRadius: '14px 0 0 0', width: 60 }}>#</th>
                          <th style={thStyle}>Project Name</th>
                          <th style={thStyle}>Description</th>
                          <th style={{ ...thStyle, borderRadius: '0 14px 0 0', width: 110, textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((proj, i) => (
                          <tr key={proj.id}
                            style={{
                              background: i % 2 === 0
                                ? 'rgba(255,255,255,0.38)'
                                : 'rgba(255,255,255,0.22)',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.68)'}
                            onMouseLeave={e => e.currentTarget.style.background =
                              i % 2 === 0 ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.22)'}
                          >
                            <td style={{ ...tdStyle, color: '#aab', fontSize: 11 }}>{proj.id}</td>
                            <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--text-dark,#1a1a2e)' }}>
                              <i className="bi bi-folder2 me-2 text-primary opacity-75"></i>
                              {proj.name}
                            </td>
                            <td style={{ ...tdStyle, color: '#667', maxWidth: 280 }}>
                              <span style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}>
                                {proj.description || '—'}
                              </span>
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                                <button
                                  className="g-btn g-btn-primary g-btn-sm"
                                  title="Edit"
                                  onClick={() => {
                                    setEditingId(proj.id);
                                    setEditProject({ name: proj.name, description: proj.description || '' });
                                  }}
                                >
                                  <i className="bi bi-pencil me-1"></i>Edit
                                </button>
                                <button
                                  className="g-btn g-btn-danger g-btn-sm"
                                  title="Delete"
                                  onClick={() => deleteProject(proj.id)}
                                  disabled={loading}
                                >
                                  <i className="bi bi-trash me-1"></i>Del
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}

                        {filtered.length === 0 && !loading && (
                          <tr>
                            <td colSpan="4" style={{
                              ...tdStyle, textAlign: 'center',
                              padding: '40px 16px', color: '#aab',
                            }}>
                              <i className="bi bi-folder-x display-5 d-block mb-2 opacity-25"></i>
                              No projects found for{' '}
                              <strong>{selectedCompany?.name}</strong>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ── Edit Form ── */}
                {editingId && (
                  <div className="glass-card p-3 p-md-4 mt-4"
                    style={{ border: '1.5px solid rgba(245,158,11,0.35)' }}>
                    <h6 className="fw-bold mb-3" style={{ color: '#b45309' }}>
                      <i className="bi bi-pencil-square me-2"></i>Edit Project
                    </h6>

                    <div className="row g-3 align-items-end">
                      <div className="col-12 col-md-4">
                        <label className="form-label fw-semibold small">Project Name</label>
                        <input
                          className="form-control"
                          value={editProject.name}
                          onChange={e => setEditProject(p => ({ ...p, name: e.target.value }))}
                        />
                      </div>
                      <div className="col-12 col-md-5">
                        <label className="form-label fw-semibold small">Description</label>
                        <textarea
                          className="form-control"
                          rows="2"
                          value={editProject.description}
                          onChange={e => setEditProject(p => ({ ...p, description: e.target.value }))}
                        />
                      </div>
                      <div className="col-12 col-md-3">
                        <div className="d-flex gap-2">
                          <button
                            className="g-btn g-btn-success flex-fill"
                            onClick={saveEdit}
                            disabled={loading}
                          >
                            {loading
                              ? <span className="spinner-border spinner-border-sm me-1"></span>
                              : <i className="bi bi-check-lg me-1"></i>
                            }
                            Save
                          </button>
                          <button
                            className="g-btn g-btn-ghost"
                            onClick={() => { setEditingId(null); setEditProject(EMPTY); }}
                          >
                            <i className="bi bi-x-lg"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectMaster;