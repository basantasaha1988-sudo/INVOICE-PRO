import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useItemMaster } from '../contexts/ItemMasterContext';

const ItemMaster = () => {
  const { items, setItems } = useItemMaster();
const [newItem, setNewItem] = useState({ name: '', defaultRate: 0, defaultTaxPercent: 9, stock: 0 });
  const [editingId, setEditingId] = useState(null);
const [editItem, setEditItem] = useState({ name: '', defaultRate: 0, defaultTaxPercent: 9, stock: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [nameError, setNameError] = useState('');

  const addItem = () => {
    if (newItem.name.trim()) {
      setItems([...items, { id: uuidv4(), ...newItem, name: newItem.name.trim() }]);
setNewItem({ name: '', defaultRate: 0, defaultTaxPercent: 9, stock: 0 });
    }
  };

  const editItemFn = (item) => {
    setEditingId(item.id);
    setEditItem(item);
  };

  const saveEdit = () => {
    if (editItem.name.trim()) {
      setItems(items.map(item => item.id === editingId ? editItem : item));
      setEditingId(null);
setEditItem({ name: '', defaultRate: 0, defaultTaxPercent: 9, stock: 0 });
    }
  };

  const deleteItemFn = (id) => {
    if (confirm('Delete this item?')) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const validateForm = () => {
    if (!newItem.name.trim()) {
      setNameError('Item name is required');
      return false;
    }
    setNameError('');
    return true;
  };

  const exportCSV = (data, filename) => {
    if (data.length === 0) return;
    const headers = ['Name', 'Rate', 'TaxPercent'];
    const csvContent = [
      headers.join(','),
      ...data.map(row => [row.name, row.defaultRate, row.defaultTaxPercent].join(','))
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
      {/* Premium Glassmorphism Modal */}
      <div className="modal fade glass-card" id="itemModal" tabIndex="-1" aria-labelledby="itemModalLabel" aria-hidden="true">
        <div className="modal-dialog modal-xl">
          <div className="modal-content glass-card shadow-xl">
            <div className="modal-header border-0 pb-0">
              <h3 className="modal-title fw-bold text-primary" id="itemModalLabel">
                <i className="bi bi-box-seam me-2"></i>
                Item Master
              </h3>
              <button type="button" className="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body p-4">
              {/* Add Form */}
              <div className="glass-card p-4 mb-4 fade-in-up">
                <h5 className="fw-semibold mb-3">
                  <i className="bi bi-plus-circle text-success me-2"></i>
                  Add New Item
                </h5>
                <div className="row g-3">
                  <div className="col-lg-4">
                    <label className="form-label fw-semibold">Item Name <span className="text-danger">*</span></label>
                    <input 
                      className="form-control" 
                      placeholder="Enter item name" 
                      value={newItem.name} 
                      onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                    />
                    {nameError && <div className="text-danger small mt-1">{nameError}</div>}
                  </div>
                  <div className="col-lg-3">
                    <label className="form-label fw-semibold">Default Rate (₹)</label>
                    <input 
                      className="form-control" 
                      type="number" 
                      step="0.01"
                      placeholder="0.00" 
                      value={newItem.defaultRate} 
                      onChange={(e) => setNewItem({...newItem, defaultRate: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                  <div className="col-lg-2">
                    <label className="form-label fw-semibold">Tax (%)</label>
                    <input 
                      className="form-control" 
                      type="number" 
                      step="0.01"
                      placeholder="9" 
                      value={newItem.defaultTaxPercent} 
                      onChange={(e) => setNewItem({...newItem, defaultTaxPercent: parseFloat(e.target.value) || 9})}
                    />
                  </div>
                  <div className="col-lg-3 d-flex align-items-end">
                    <button className="btn btn-success w-100" onClick={() => {
                      if (validateForm()) addItem();
                    }}>
                      <i className="bi bi-plus-lg me-1"></i>Add Item
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
                  placeholder="Search items..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Bulk Actions */}
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h6 className="fw-bold mb-0">
                  Items ({filteredItems.length})
                </h6>
                <button className="btn btn-outline-success btn-sm" onClick={() => exportCSV(filteredItems, 'items')}>
                  <i className="bi bi-download me-1"></i>Export CSV
                </button>
              </div>

              {/* Items Table */}
              <div className="table-responsive glass-card">
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th className="fw-bold text-primary">Item Name</th>
                      <th className="fw-bold text-primary text-end">Rate</th>
                      <th className="fw-bold text-primary text-end">Tax %</th>
                      <th className="fw-bold text-primary">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(item => (
                      <tr key={item.id} className="fade-in-up">
                        <td className="fw-semibold">{item.name}</td>
                        <td className="text-end">₹{item.defaultRate.toFixed(2)}</td>
                        <td className="text-end badge bg-success">{item.defaultTaxPercent}%</td>
                        <td>
                          <div className="btn-group btn-group-sm" role="group">
                            <button 
                              className="btn btn-outline-primary" 
                              onClick={() => editItemFn(item)}
                              title="Edit"
                            >
                              <i className="bi bi-pencil"></i>
                            </button>
                            <button 
                              className="btn btn-outline-danger" 
                              onClick={() => deleteItemFn(item.id)}
                              title="Delete"
                            >
                              <i className="bi bi-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredItems.length === 0 && (
                      <tr>
                        <td colSpan="4" className="text-center text-muted py-4">
                          <i className="bi bi-search display-4 mb-3 d-block opacity-50"></i>
                          <div>No items found</div>
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
                    Edit Item
                  </h5>
                  <div className="row g-3">
                    <div className="col-lg-4">
                      <label className="form-label fw-semibold">Item Name</label>
                      <input 
                        className="form-control" 
                        value={editItem.name} 
                        onChange={(e) => setEditItem({...editItem, name: e.target.value})}
                      />
                    </div>
                    <div className="col-lg-3">
                      <label className="form-label fw-semibold">Default Rate (₹)</label>
                      <input 
                        className="form-control" 
                        type="number" 
                        step="0.01"
                        value={editItem.defaultRate} 
                        onChange={(e) => setEditItem({...editItem, defaultRate: parseFloat(e.target.value) || 0})}
                      />
                    </div>
                    <div className="col-lg-2">
                      <label className="form-label fw-semibold">Tax (%)</label>
                      <input 
                        className="form-control" 
                        type="number" 
                        step="0.01"
                        value={editItem.defaultTaxPercent} 
                        onChange={(e) => setEditItem({...editItem, defaultTaxPercent: parseFloat(e.target.value) || 9})}
                      />
                    </div>
                    <div className="col-lg-3 d-flex align-items-end gap-2">
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

export default ItemMaster;

