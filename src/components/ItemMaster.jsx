import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useItemMaster } from '../contexts/ItemMasterContext';

const ItemMaster = () => {
  const { items, setItems } = useItemMaster();

  const [newItem, setNewItem] = useState({
    name: '',
    defaultRate: 0,
    defaultTaxPercent: 9,
    stock: 0
  });

  const [editingId, setEditingId] = useState(null);
  const [editItem, setEditItem] = useState({
    name: '',
    defaultRate: 0,
    defaultTaxPercent: 9,
    stock: 0
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [nameError, setNameError] = useState('');

  // Add Item
  const addItem = () => {
    if (newItem.name.trim()) {
      setItems([
        ...items,
        { id: uuidv4(), ...newItem, name: newItem.name.trim() }
      ]);
      setNewItem({
        name: '',
        defaultRate: 0,
        defaultTaxPercent: 9,
        stock: 0
      });
    }
  };

  // Edit
  const editItemFn = (item) => {
    setEditingId(item.id);
    setEditItem(item);
  };

  // Save Edit
  const saveEdit = () => {
    if (editItem.name.trim()) {
      setItems(
        items.map((item) =>
          item.id === editingId ? editItem : item
        )
      );
      setEditingId(null);
      setEditItem({
        name: '',
        defaultRate: 0,
        defaultTaxPercent: 9,
        stock: 0
      });
    }
  };

  // Delete
  const deleteItemFn = (id) => {
    if (window.confirm('Delete this item?')) {
      setItems(items.filter((item) => item.id !== id));
    }
  };

  // Filter
  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Validation
  const validateForm = () => {
    if (!newItem.name.trim()) {
      setNameError('Item name is required');
      return false;
    }
    setNameError('');
    return true;
  };

  // Export CSV
  const exportCSV = (data, filename) => {
    if (data.length === 0) return;

    const headers = ['Name', 'Rate', 'TaxPercent'];

    const csvContent = [
      headers.join(','),
      ...data.map((row) =>
        [row.name, row.defaultRate, row.defaultTaxPercent].join(',')
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
        <div className="modal-dialog modal-xl">
          <div className="modal-content glass-card shadow-xl">

            <div className="modal-header border-0 pb-0">
              <h3 className="modal-title fw-bold text-primary">
                Item Master
              </h3>
              <button className="btn-close" data-bs-dismiss="modal"></button>
            </div>

            <div className="modal-body p-4">

              {/* Add Item */}
              <div className="glass-card p-4 mb-4">
                <h5 className="fw-semibold mb-3">Add New Item</h5>

                <div className="row g-3">
                  <div className="col-lg-4">
                    <label>Item Name *</label>
                    <input
                      className="form-control"
                      value={newItem.name}
                      onChange={(e) =>
                        setNewItem({ ...newItem, name: e.target.value })
                      }
                    />
                    {nameError && (
                      <div className="text-danger small">
                        {nameError}
                      </div>
                    )}
                  </div>

                  <div className="col-lg-3">
                    <label>Rate (₹)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={newItem.defaultRate}
                      onChange={(e) =>
                        setNewItem({
                          ...newItem,
                          defaultRate: parseFloat(e.target.value) || 0
                        })
                      }
                    />
                  </div>

                  <div className="col-lg-2">
                    <label>Tax (%)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={newItem.defaultTaxPercent}
                      onChange={(e) =>
                        setNewItem({
                          ...newItem,
                          defaultTaxPercent:
                            parseFloat(e.target.value) || 9
                        })
                      }
                    />
                  </div>

                  <div className="col-lg-3 d-flex align-items-end">
                    <button
                      className="btn btn-success w-100"
                      onClick={() => {
                        if (validateForm()) addItem();
                      }}
                    >
                      Add Item
                    </button>
                  </div>
                </div>
              </div>

              {/* Search */}
              <input
                className="form-control mb-3"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />

              {/* Header */}
              <div className="d-flex justify-content-between mb-2">
                <h6>Items ({filteredItems.length})</h6>
                <button
                  className="btn btn-outline-success btn-sm"
                  onClick={() => exportCSV(filteredItems, 'items')}
                >
                  Export CSV
                </button>
              </div>

              {/* Table */}
              <div className="table-responsive">
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th>Item Name</th>
                      <th className="text-end">Rate</th>
                      <th className="text-center">Tax %</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>

                        <td className="text-end">
                          ₹{item.defaultRate.toFixed(2)}
                        </td>

                        {/* ✅ FIXED TAX ALIGNMENT */}
                        <td className="text-center">
                          <span className="badge bg-success">
                            {item.defaultTaxPercent}%
                          </span>
                        </td>

                        <td>
                          <button
                            className="btn btn-sm btn-primary me-1"
                            onClick={() => editItemFn(item)}
                          >
                            Edit
                          </button>

                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => deleteItemFn(item.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}

                    {filteredItems.length === 0 && (
                      <tr>
                        <td colSpan="4" className="text-center">
                          No items found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Edit Section */}
              {editingId && (
                <div className="mt-4">
                  <h5>Edit Item</h5>

                  <input
                    className="form-control mb-2"
                    value={editItem.name}
                    onChange={(e) =>
                      setEditItem({ ...editItem, name: e.target.value })
                    }
                  />

                  <input
                    type="number"
                    className="form-control mb-2"
                    value={editItem.defaultRate}
                    onChange={(e) =>
                      setEditItem({
                        ...editItem,
                        defaultRate: parseFloat(e.target.value) || 0
                      })
                    }
                  />

                  <input
                    type="number"
                    className="form-control mb-2"
                    value={editItem.defaultTaxPercent}
                    onChange={(e) =>
                      setEditItem({
                        ...editItem,
                        defaultTaxPercent:
                          parseFloat(e.target.value) || 9
                      })
                    }
                  />

                  <button
                    className="btn btn-success me-2"
                    onClick={saveEdit}
                  >
                    Save
                  </button>

                  <button
                    className="btn btn-secondary"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
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