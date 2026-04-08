import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useCompanyMaster } from '../contexts/CompanyMasterContext';

const CompanyMaster = () => {
  const { companies, setCompanies } = useCompanyMaster();
const [newCompany, setNewCompany] = useState({ name: '', address: '', logo: null });
  const [editingId, setEditingId] = useState(null);
  const [editCompany, setEditCompany] = useState({ name: '', address: '', logo: null });
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('companyMaster');
    if (saved) setCompanies(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('companyMaster', JSON.stringify(companies));
  }, [companies]);

const validateForm = () => {
    if (!newCompany.name.trim()) {
      setNameError('Company name is required');
      return false;
    }
    setNameError('');
    return true;
  };

  const handleLogoUpload = (file, setter) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo must be under 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setter(prev => ({ ...prev, logo: ev.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const addCompany = () => {
    if (validateForm()) {
      setCompanies([...companies, { id: uuidv4(), ...newCompany, name: newCompany.name.trim() }]);
      setNewCompany({ name: '', address: '' });
    }
  };

  const editCompanyFn = (company) => {
    setEditingId(company.id);
    setEditCompany(company);
  };

  const saveEdit = () => {
    if (editCompany.name.trim()) {
      setCompanies(companies.map(company => company.id === editingId ? editCompany : company));
      setEditingId(null);
      setEditCompany({ name: '', address: '' });
    }
  };

  const deleteCompanyFn = (id) => {
    if (confirm('Delete this company?')) {
      setCompanies(companies.filter(company => company.id !== id));
    }
  };

  const filteredCompanies = companies.filter(company =>
    company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    company.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportCSV = (data, filename) => {
    if (data.length === 0) return;
    const headers = ['Name', 'Address'];
    const csvContent = [
      headers.join(','),
      ...data.map(row => [row.name, `"${row.address.replace(/"/g, '""')}"`].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Trigger Button in Header will use data-bs-toggle="modal" data-bs-target="#companyModal" */}
      
      {/* Premium Glassmorphism Modal */}
      <div className="modal fade glass-card" id="companyModal" tabIndex="-1" aria-labelledby="companyModalLabel" aria-hidden="true">
        <div className="modal-dialog modal-xl">
          <div className="modal-content glass-card shadow-xl">
            <div className="modal-header border-0 pb-0">
              <h3 className="modal-title fw-bold text-primary" id="companyModalLabel">
                <i className="bi bi-building me-2"></i>
                Company Master
              </h3>
              <button type="button" className="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body p-4">
              {/* Add Form */}
              <div className="glass-card p-4 mb-4 fade-in-up">
                <h5 className="fw-semibold mb-3">
                  <i className="bi bi-plus-circle text-success me-2"></i>
                  Add New Company
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
                          <input 
                            type="file" 
                            className="d-none" 
                            accept="image/*" 
                            onChange={(e) => handleLogoUpload(e.target.files[0], setNewCompany)}
                          />
                        </label>
                        {newCompany.logo && (
                          <button 
                            className="btn btn-outline-danger btn-sm ms-1" 
                            onClick={() => setNewCompany(p => ({ ...p, logo: null }))}
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="col-lg-4">
                    <label className="form-label fw-semibold">Company Name <span className="text-danger">*</span></label>
                    <input 
                      className="form-control" 
                      placeholder="Enter company name" 
                      value={newCompany.name} 
                      onChange={(e) => setNewCompany({...newCompany, name: e.target.value})}
                    />
                    {nameError && <div className="text-danger small mt-1">{nameError}</div>}
                  </div>
                  <div className="col-lg-6">
                    <label className="form-label fw-semibold">Address</label>
                    <textarea 
                      className="form-control" 
                      placeholder="Enter full address" 
                      value={newCompany.address} 
                      onChange={(e) => setNewCompany({...newCompany, address: e.target.value})}
                      rows="2"
                    />
                  </div>
                  <div className="col-lg-2 d-flex align-items-end">
                    <button className="btn btn-success w-100" onClick={addCompany}>
                      <i className="bi bi-plus-lg me-1"></i>Add Company
                    </button>
                  </div>
                </div>
              </div>

              {/* Search */}
              <div className="table-search mb-4">
                <i className="bi bi-search"></i>
                <input 
                  type="text" 
                  className="form-control ps-5" 
                  placeholder="Search companies..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Bulk Actions */}
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h6 className="fw-bold mb-0">
                  Companies ({filteredCompanies.length})
                </h6>
                <button className="btn btn-outline-success btn-sm" onClick={() => exportCSV(filteredCompanies, 'companies')}>
                  <i className="bi bi-download me-1"></i>Export CSV
                </button>
              </div>

              {/* Companies Table */}
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
                            : <div className="text-muted small text-center p-2" style={{ minWidth: 50, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #dee2e6' }}>
                                No Logo
                              </div>
                          }
                        </td>
                        <td className="fw-semibold">{company.name}</td>
                        <td>{company.address}</td>
                        <td>
                          <div className="btn-group btn-group-sm" role="group">
                            <button 
                              className="btn btn-outline-primary" 
                              onClick={() => editCompanyFn(company)}
                              title="Edit"
                            >
                              <i className="bi bi-pencil"></i>
                            </button>
                            <button 
                              className="btn btn-outline-danger" 
                              onClick={() => deleteCompanyFn(company.id)}
                              title="Delete"
                            >
                              <i className="bi bi-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredCompanies.length === 0 && (
                      <tr>
                        <td colSpan="3" className="text-center text-muted py-4">
                          <i className="bi bi-search display-4 mb-3 d-block opacity-50"></i>
                          <div>No companies found</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Edit Form */}
              {editingId && (
                <div className="glass-card p-4 mt-4 fade-in-up">
                  <h5 className="fw-semibold mb-3 text-warning">
                    <i className="bi bi-pencil-square me-2"></i>
                    Edit Company
                  </h5>
                  <div className="row g-3">
                    <div className="col-lg-4">
                      <label className="form-label fw-semibold">Company Name</label>
                      <input 
                        className="form-control" 
                        value={editCompany.name} 
                        onChange={(e) => setEditCompany({...editCompany, name: e.target.value})}
                      />
                    </div>
                    <div className="col-lg-6">
                      <label className="form-label fw-semibold">Address</label>
                      <textarea 
                        className="form-control" 
                        value={editCompany.address} 
                        onChange={(e) => setEditCompany({...editCompany, address: e.target.value})}
                        rows="2"
                      />
                    </div>
                    <div className="col-lg-2 d-flex align-items-end gap-2">
                      <button className="btn btn-success flex-fill" onClick={saveEdit}>
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

