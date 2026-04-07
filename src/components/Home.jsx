import React, { useState, useEffect } from 'react';
import { useTheme } from '../App';
import { useItemMaster } from '../contexts/ItemMasterContext';
import { v4 as uuidv4 } from 'uuid';

const Inventory = () => {
  const { currentTheme } = useTheme();
  const { items, setItems } = useItemMaster();
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId ] = useState(null);
  const [editStock, setEditStock] = useState(0);
  const [stockError, setStockError] = useState('');

  // New states for Receive Items
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receiveForm, setReceiveForm] = useState({ itemId: '', qty: '', note: '' });
  const [receiveSuccess, setReceiveSuccess] = useState('');
  const [receiveError, setReceiveError] = useState('');

  // Transactions log (local, could persist later)
  const [transactions, setTransactions] = useState([]);

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStockStatus = (stock) => {
    const num = parseInt(stock) || 0;
    if (num === 0) return 'danger';
    if (num < 10) return 'warning';
    return 'success';
  };

  const updateStock = (id) => {
    if (stockError) return;
    const newStock = parseInt(editStock) || 0;
    if (newStock < 0) {
      setStockError('Stock cannot be negative');
      return;
    }
    setItems(items.map(item => 
      item.id === id ? { ...item, stock: newStock } : item
    ));
    const itemName = items.find(item => item.id === id)?.name || 'Item';
    addTransaction(`${itemName} stock set to ${newStock}`, 'edit');
    setEditingId(null);
    setEditStock(0);
    setStockError('');
  };

  const handleReceiveChange = (field, value) => {
    setReceiveForm(prev => ({ ...prev, [field]: value }));
    if (field === 'qty' && receiveError) setReceiveError('');
  };

  const submitReceive = () => {
    const qty = parseInt(receiveForm.qty);
    if (!receiveForm.itemId) {
      setReceiveError('Please select an item');
      return;
    }
    if (!qty || qty <= 0) {
      setReceiveError('Quantity must be greater than 0');
      return;
    }

    // Update stock
    setItems(prevItems => prevItems.map(item => 
      item.id === receiveForm.itemId 
        ? { ...item, stock: (item.stock || 0) + qty } 
        : item
    ));

    // Log transaction
    const itemName = items.find(item => item.id === receiveForm.itemId)?.name || 'Item';
    const txn = {
      id: uuidv4(),
      type: 'receive',
      itemName,
      qty,
      note: receiveForm.note,
      date: new Date().toLocaleString()
    };
    setTransactions(prev => [txn, ...prev.slice(0, 9)]); // Keep last 10

    // Feedback
    setReceiveSuccess(`Received ${qty} x ${itemName} (${receiveForm.note || 'no note'})`);
    setTimeout(() => setReceiveSuccess(''), 3000);

    // Reset form
    setReceiveForm({ itemId: '', qty: '', note: '' });
    setReceiveError('');
    const modal = document.getElementById('receiveModal');
    if (modal) modal.querySelectorAll('input, select, textarea').forEach(el => el.value = '');
    setShowReceiveModal(false);
  };

  const addTransaction = (description, type) => {
    const txn = {
      id: uuidv4(),
      type,
      description,
      date: new Date().toLocaleString()
    };
    setTransactions(prev => [txn, ...prev.slice(0, 9)]);
  };

  const formatStockValue = (stock) => {
    const num = parseInt(stock) || 0;
    return num === 0 ? 'Out of Stock' : num.toLocaleString();
  };

  if (filteredItems.length === 0) {
    return (
      <div className="container py-5">
        <div className="glass-card text-center p-5 fade-in-up">
          <i className="bi bi-boxes display-1 text-muted mb-4 d-block"></i>
          <h3 className="text-muted mb-3">No items in inventory</h3>
          <p className="text-muted mb-4">Add items through Item Master to manage stock</p>
          <button 
            className="btn btn-primary btn-lg" 
            data-bs-toggle="modal" 
            data-bs-target="#itemModal"
          >
            <i className="bi bi-plus-circle me-2"></i>Add Items
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`container-fluid py-5 theme-${currentTheme}`} id="inventory">
      <div className="row justify-content-center">
        <div className="col-12 col-lg-11">
          {/* Header */}
          <div className="glass-card shadow-xl p-0 overflow-hidden mb-4">
            <div className="p-4 border-bottom">
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                <div>
                  <h2 className="fw-bold mb-1">
                    <i className="bi bi-boxes me-2 text-primary"></i>
                    Stock Management
                  </h2>
                  <small className="text-muted">
                    {filteredItems.length} items | Showing {searchTerm ? `"${searchTerm}"` : 'all'}
                  </small>
                </div>
                <div className="d-flex gap-2">
                  <button 
                    className="btn btn-success" 
                    data-bs-toggle="modal" 
                    data-bs-target="#receiveModal"
                    title="Receive new stock"
                  >
                    <i className="bi bi-arrow-down-circle me-1"></i>Receive Items
                  </button>

                </div>
              </div>
              <div className="table-search mb-0">
                <i className="bi bi-search"></i>
                <input 
                  type="text" 
                  className="form-control ps-5" 
                  placeholder="Search items..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="glass-card shadow-xl p-0 overflow-hidden">
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-dark">
                  <tr>
                    <th>Item Name</th>
                    <th className="text-end">Rate</th>
                    <th className="text-end">Tax %</th>
                    <th className="text-end">Stock</th>
                    <th className="text-end">Total Value</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map(item => {
                    const stock = item.stock || 0;
                    const status = getStockStatus(stock);
                    const totalValue = stock * item.defaultRate;
                    return (
                      <tr key={item.id} className="align-middle">
                        <td className="fw-semibold">{item.name}</td>
                        <td className="text-end">₹{item.defaultRate.toFixed(2)}</td>
                        <td className="text-end">
                          <span className={`badge bg-${status === 'success' ? 'success' : status === 'warning' ? 'warning' : 'danger'}`}>
                            {item.defaultTaxPercent}%
                          </span>
                        </td>
                        <td className="text-end">
                          {editingId === item.id ? (
                            <div className="input-group input-group-sm" style={{maxWidth: '140px'}}>
                              <input 
                                className="form-control form-control-sm text-end" 
                                type="number" 
                                min="0"
                                value={editStock}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setEditStock(val);
                                  setStockError(val < 0 ? 'Stock cannot be negative' : '');
                                }}
                              />
                              <button 
                                className="btn btn-outline-success btn-sm" 
                                onClick={() => updateStock(item.id)}
                              >
                                <i className="bi bi-check-lg"></i>
                              </button>
                              <button 
                                className="btn btn-outline-secondary btn-sm" 
                                onClick={() => {
                                  setEditingId(null);
                                  setEditStock(0);
                                  setStockError('');
                                }}
                              >
                                <i className="bi bi-x"></i>
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className={`fw-bold text-${status}`}>
                                {formatStockValue(stock)}
                              </span>
                              {stockError && <small className="text-danger d-block">{stockError}</small>}
                            </>
                          )}
                        </td>
                        <td className="text-end fw-bold">₹{totalValue.toLocaleString('en-IN')}</td>
                        <td>
                          <div className="btn-group btn-group-sm" role="group">
                            <button 
                              className="btn btn-outline-primary" 
                              onClick={() => {
                                setEditingId(item.id);
                                setEditStock(item.stock || 0);
                              }}
                              title="Edit Stock"
                            >
                              <i className="bi bi-pencil"></i>
                            </button>
                            <button 
                              className="btn btn-outline-secondary" 
                              data-bs-toggle="modal" 
                              data-bs-target="#itemModal"
                              title="Edit Item"
                            >
                              <i className="bi bi-box-seam"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Transactions Log */}
          {transactions.length > 0 && (
            <div className="glass-card shadow-lg mt-4 p-4">
              <h5 className="fw-bold mb-3">
                <i className="bi bi-list-ul text-info me-2"></i>
                Recent Transactions ({transactions.length})
              </h5>
              <div className="table-responsive">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(txn => (
                      <tr key={txn.id}>
                        <td className="small">{new Date(txn.date).toLocaleString()}</td>
                        <td>
                          <span className={`badge ${
                            txn.type === 'receive' ? 'bg-success' : 
                            txn.type === 'edit' ? 'bg-info' : 'bg-secondary'
                          }`}>
                            {txn.type}
                          </span>
                        </td>
                        <td className="small">
                          {txn.itemName ? 
                            `+${txn.qty || ''} ${txn.itemName}${txn.note ? ` (${txn.note})` : ''}` :
                            txn.description
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Receive Items Modal */}
      <div className="modal fade" id="receiveModal" tabIndex="-1">
        <div className="modal-dialog modal-lg">
          <div className="modal-content glass-card">
            <div className="modal-header">
              <h5 className="modal-title fw-bold">
                <i className="bi bi-arrow-down-circle text-success me-2"></i>
                Receive Items
              </h5>
              <button type="button" className="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div className="modal-body">
              {receiveError && (
                <div className="alert alert-danger alert-dismissible fade show" role="alert">
                  {receiveError}
                  <button type="button" className="btn-close" onClick={() => setReceiveError('')}></button>
                </div>
              )}
              {receiveSuccess && (
                <div className="alert alert-success alert-dismissible fade show" role="alert">
                  {receiveSuccess}
                  <button type="button" className="btn-close" onClick={() => setReceiveSuccess('')}></button>
                </div>
              )}
              <form>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Select Item *</label>
                  <select 
                    className="form-select" 
                    value={receiveForm.itemId}
                    onChange={(e) => handleReceiveChange('itemId', e.target.value)}
                  >
                    <option value="">Choose item...</option>
                    {items.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name} (Current stock: {item.stock || 0})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Quantity to Receive *</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    min="1"
                    placeholder="Enter quantity..."
                    value={receiveForm.qty}
                    onChange={(e) => handleReceiveChange('qty', e.target.value)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Note (optional)</label>
                  <textarea 
                    className="form-control" 
                    rows="2"
                    placeholder="Supplier, batch #, etc..."
                    value={receiveForm.note}
                    onChange={(e) => handleReceiveChange('note', e.target.value)}
                  />
                </div>
              </form>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button 
                type="button" 
                className="btn btn-success" 
                onClick={submitReceive}
              >
                <i className="bi bi-check-circle me-1"></i>Receive Items
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Inventory;
