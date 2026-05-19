import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useItemMaster } from '../contexts/ItemMasterContext';

const API_URL = '/api/itemmaster';

const EMPTY_ITEM = {
  name: '',
  defaultRate: 0,
  defaultTaxPercent: 9
};

const num = (val) => (val !== undefined && val !== null ? Number(val) : 0);

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return isNaN(d) ? '-' : d.toLocaleDateString('en-IN');
};

const ItemMaster = () => {
  const { items, refreshItems } = useItemMaster();

  const [newItem, setNewItem] = useState({ ...EMPTY_ITEM });
  const [editingId, setEditingId] = useState(null);
  const [editItem, setEditItem] = useState({ ...EMPTY_ITEM });
  const [searchTerm, setSearchTerm] = useState('');
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Load from DB on mount ──────────────────────────────────────────────────
  useEffect(() => {
    refreshItems();
  }, []);

  const validateForm = (item) => {
    if (!item.name.trim()) {
      setNameError('Item name is required');
      return false;
    }
    setNameError('');
    return true;
  };

  // ── ADD → POST to DB ───────────────────────────────────────────────────────
  const addItem = async () => {
    if (!validateForm(newItem)) return;
    setSaving(true);
    try {
      await axios.post(API_URL, {
        name: newItem.name.trim(),
        defaultRate: num(newItem.defaultRate),
        defaultTaxPercent: num(newItem.defaultTaxPercent)
      });
      await refreshItems();
      setNewItem({ ...EMPTY_ITEM });
      setNameError('');
    } catch (err) {
      console.error('Add item error:', err);
      alert('Error adding item: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

// ── EDIT — open form ───────────────────────────────────────────────────────
  const editItemFn = (item) => {
    setEditingId(item.id);
    setEditItem({
      name: item.name ?? '',
      defaultRate: num(item.defaultRate),
      defaultTaxPercent: num(item.defaultTaxPercent)
    });
  };

  // ── SAVE EDIT → PUT to DB ──────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!editItem.name.trim()) return;
    setSaving(true);
    try {
      await axios.put(`${API_URL}/${editingId}`, {
        name: editItem.name.trim(),
        defaultRate: num(editItem.defaultRate),
        defaultTaxPercent: num(editItem.defaultTaxPercent)
      });
      await refreshItems();
      setEditingId(null);
      setEditItem({ ...EMPTY_ITEM });
    } catch (err) {
      console.error('Update item error:', err);
      alert('Error updating item: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  // ── DELETE → DELETE from DB ────────────────────────────────────────────────
  const deleteItemFn = async (id) => {
    if (!window.confirm('Delete this item?')) return;
    try {
      await axios.delete(`${API_URL}/${id}`);
      await refreshItems();
    } catch (err) {
      console.error('Delete item error:', err);
      alert('Error deleting item: ' + (err.response?.data?.error || err.message));
    }
  };

const filteredItems = items.filter((item) =>
    (item.name ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportCSV = (data, filename) => {
    if (data.length === 0) return;
    const headers = ['ItemCode', 'ItemName', 'Rate', 'Tax', 'CreatedDate'];
    const csvContent = [
      headers.join(','),
      ...data.map((row) =>
[row.id, row.name, num(row.defaultRate), num(row.defaultTaxPercent), formatDate(row.createdDate)]
      )
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
      <div className="modal fade glass-card" id="itemModal" tabIndex="-1">
        <div className="modal-dialog modal-xl modal-fullscreen-sm-down">
          <div className="modal-content glass-card shadow-xl">

            <div className="modal-header border-0 pb-0">
              <h3 className="modal-title fw-bold text-primary">Item Master</h3>
              <button className="btn-close" data-bs-dismiss="modal"></button>
            </div>

            <div className="modal-body p-4">

              {/* Add Item */}
              <div className="glass-card p-4 mb-4">
                <h5 className="fw-semibold mb-3">Add New Item</h5>
                <div className="row g-3 align-items-end">

                  <div className="col-6 col-md-3 col-lg-2">
                    <label className="form-label small fw-semibold">Item Code</label>
                    <input className="form-control text-muted fst-italic" value="Auto" disabled />
                  </div>

                  <div className="col-6 col-md-3 col-lg-2">
                    <label className="form-label small fw-semibold">Created Date</label>
                    <input className="form-control text-muted fst-italic"
                      value={new Date().toLocaleDateString('en-IN')} disabled />
                  </div>

                  <div className="col-12 col-md-6 col-lg-3">
                    <label className="form-label small fw-semibold">Item Name *</label>
                    <input
                      className={`form-control ${nameError ? 'is-invalid' : ''}`}
                      value={newItem.name}
                      onChange={(e) => {
                        setNewItem({ ...newItem, name: e.target.value });
                        if (nameError) setNameError('');
                      }}
                      placeholder="e.g. Rice, Sugar..."
                    />
                    {nameError && <div className="invalid-feedback">{nameError}</div>}
                  </div>

                  <div className="col-6 col-md-3 col-lg-2">
                    <label className="form-label small fw-semibold">Rate (₹)</label>
                    <input type="number" min="0" step="0.01" className="form-control"
                      value={newItem.defaultRate}
                      onChange={(e) => setNewItem({ ...newItem, defaultRate: parseFloat(e.target.value) || 0 })} />
                  </div>

                  <div className="col-6 col-md-3 col-lg-1">
                    <label className="form-label small fw-semibold">Tax (%)</label>
                    <input type="number" min="0" step="0.01" className="form-control"
                      value={newItem.defaultTaxPercent}
                      onChange={(e) => setNewItem({
                        ...newItem,
                        defaultTaxPercent: isNaN(parseFloat(e.target.value)) ? 9 : parseFloat(e.target.value)
                      })} />
                  </div>

                  <div className="col-12 col-md-6 col-lg-2">
                    <button className="g-btn g-btn-success g-btn-block" onClick={addItem} disabled={saving}>
                      {saving
                        ? <span className="spinner-border spinner-border-sm me-1"></span>
                        : <i className="bi bi-plus-lg me-1"></i>
                      }
                      Add Item
                    </button>
                  </div>

                </div>
              </div>

              {/* Search & Export */}
              <div className="d-flex gap-2 mb-3">
                <input className="form-control" placeholder="Search items..."
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <button className="g-btn g-btn-success g-btn-sm"
                  onClick={() => exportCSV(filteredItems, 'items')}>
                  Export CSV
                </button>
              </div>

              <h6 className="mb-2">Items ({filteredItems.length})</h6>

              {/* Table */}
              <div className="table-responsive">
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th>Item Code</th>
                      <th>Item Name</th>
                      <th className="text-end">Rate (₹)</th>
                      <th className="text-center">Tax %</th>
                      <th>Created Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
<tbody>
                    {filteredItems.map((item) => (
                      <tr key={item.id}>
                        <td><span className="badge bg-secondary">{item.id}</span></td>
                        <td>{item.name}</td>
                        <td className="text-end">₹{num(item.defaultRate).toFixed(2)}</td>
                        <td className="text-center">
                          <span className="badge bg-success">{num(item.defaultTaxPercent)}%</span>
                        </td>
                        <td className="text-muted small">{formatDate(item.createdDate)}</td>
                        <td>
                          <div className="d-flex flex-wrap gap-1">
                            <button className="g-btn g-btn-primary g-btn-sm" onClick={() => editItemFn(item)}>Edit</button>
                            <button className="g-btn g-btn-danger g-btn-sm" onClick={() => deleteItemFn(item.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredItems.length === 0 && (
                      <tr>
                        <td colSpan="6" className="text-center text-muted py-4">
                          {items.length === 0 ? 'No items yet. Add your first item above.' : 'No items match your search.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Edit Section */}
              {editingId && (
                <div className="glass-card p-4 mt-4">
                  <h5 className="fw-semibold mb-3">
                    Edit Item <span className="badge bg-secondary ms-2 fs-6">#{editingId}</span>
                  </h5>
                  <div className="row g-3 align-items-end">

                    <div className="col-12 col-md-6 col-lg-4">
                      <label className="form-label small fw-semibold">Item Name</label>
                      <input className="form-control" value={editItem.name}
                        onChange={(e) => setEditItem({ ...editItem, name: e.target.value })} />
                    </div>

                    <div className="col-6 col-md-3 col-lg-2">
                      <label className="form-label small fw-semibold">Rate (₹)</label>
                      <input type="number" min="0" step="0.01" className="form-control"
                        value={editItem.defaultRate}
                        onChange={(e) => setEditItem({ ...editItem, defaultRate: parseFloat(e.target.value) || 0 })} />
                    </div>

                    <div className="col-6 col-md-3 col-lg-2">
                      <label className="form-label small fw-semibold">Tax (%)</label>
                      <input type="number" min="0" step="0.01" className="form-control"
                        value={editItem.defaultTaxPercent}
                        onChange={(e) => setEditItem({
                          ...editItem,
                          defaultTaxPercent: isNaN(parseFloat(e.target.value)) ? 9 : parseFloat(e.target.value)
                        })} />
                    </div>

                    <div className="col-12 col-md-6 col-lg-4">
                      <div className="d-flex gap-2">
                        <button className="g-btn g-btn-success" onClick={saveEdit} disabled={saving}>
                          {saving ? <span className="spinner-border spinner-border-sm me-1"></span> : null}
                          Save
                        </button>
                        <button className="g-btn g-btn-ghost"
                          onClick={() => { setEditingId(null); setEditItem({ ...EMPTY_ITEM }); }}>
                          Cancel
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

export default ItemMaster;