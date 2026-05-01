import React, { useState, useCallback } from 'react';
import { useTheme } from '../App';
import { useItemMaster } from '../contexts/ItemMasterContext';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

// DB returns: ItemCode, ItemName, Rate, Tax, Stock, CreatedDate
const getName  = (item) => item.ItemName ?? item.name ?? '';
const getRate  = (item) => Number(item.Rate  ?? item.defaultRate  ?? 0);
const getTax   = (item) => Number(item.Tax   ?? item.defaultTaxPercent ?? 0);
const getStock = (item) => Number(item.Stock ?? item.stock ?? 0);
const getId    = (item) => item.ItemCode ?? item.id ?? null;

const Inventory = ({ onNavigateToHome }) => {
  const { currentTheme } = useTheme();
  const { items, refreshItems } = useItemMaster();
  const [searchTerm, setSearchTerm]   = useState('');
  const [editingId, setEditingId]     = useState(null);
  const [editStock, setEditStock]     = useState(0);
  const [stockError, setStockError]   = useState('');
  const [savingStock, setSavingStock] = useState(false);

  const [receiveForm, setReceiveForm]       = useState({ itemId: '', qty: '', note: '' });
  const [receiveSuccess, setReceiveSuccess] = useState('');
  const [receiveError, setReceiveError]     = useState('');
  const [receiveSaving, setReceiveSaving]   = useState(false);
  const [transactions, setTransactions]     = useState([]);

  const filteredItems = items.filter(item =>
    getName(item).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStockStatus = (stock) => {
    const n = Number(stock) || 0;
    if (n === 0) return 'danger';
    if (n < 10)  return 'warning';
    return 'success';
  };

  const addTransaction = (description, type, itemName, qty, note) => {
    const txn = { id: uuidv4(), type, description, itemName, qty, note, date: new Date().toLocaleString() };
    setTransactions(prev => [txn, ...prev.slice(0, 9)]);
  };

  const updateStock = async (id) => {
    if (stockError) return;
    const newStock = parseInt(editStock) || 0;
    if (newStock < 0) { setStockError('Stock cannot be negative'); return; }

setSavingStock(true);
    try {
      await axios.patch(`/api/itemmaster/${id}/stock/set`, { stock: newStock });
      const found = items.find(item => String(getId(item)) === String(id));
      addTransaction(`${getName(found || {})} stock set to ${newStock}`, 'edit', getName(found || {}), newStock, '');
      await refreshItems();
      setEditingId(null);
      setEditStock(0);
      setStockError('');
    } catch (err) {
      console.error('Stock update error:', err);
      alert('Failed to update stock: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingStock(false);
    }
  };

  const handleReceiveChange = (field, value) => {
    setReceiveForm(prev => ({ ...prev, [field]: value }));
    if (field === 'qty' && receiveError) setReceiveError('');
  };

  const submitReceive = async () => {
    const qty = parseInt(receiveForm.qty);
    if (!receiveForm.itemId)   { setReceiveError('Please select an item'); return; }
    if (!qty || qty <= 0)      { setReceiveError('Quantity must be greater than 0'); return; }

    const selectedItem = items.find(item => String(getId(item)) === String(receiveForm.itemId));
    if (!selectedItem) { setReceiveError('Item not found'); return; }

    const newStock = getStock(selectedItem) + qty;
    const itemName = getName(selectedItem);

setReceiveSaving(true);
    try {
      await axios.patch(`/api/itemmaster/${receiveForm.itemId}/stock/set`, { stock: newStock });
      addTransaction('', 'receive', itemName, qty, receiveForm.note);
      await refreshItems();

      setReceiveSuccess(`Received ${qty} x ${itemName}${receiveForm.note ? ` - ${receiveForm.note}` : ''}`);
      setTimeout(() => setReceiveSuccess(''), 4000);
      setReceiveForm({ itemId: '', qty: '', note: '' });
      setReceiveError('');

      const modalEl = document.getElementById('receiveModal');
      if (modalEl && window.bootstrap) {
        const modal = window.bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }
    } catch (err) {
      console.error('Receive stock error:', err);
      setReceiveError('Failed to update stock: ' + (err.response?.data?.error || err.message));
    } finally {
      setReceiveSaving(false);
    }
  };

  const exportCSV = useCallback(() => {
    const headers = ['Item Code', 'Item Name', 'Rate (Rs)', 'Tax %', 'Stock', 'Total Value (Rs)'];
    const rows = filteredItems.map(item => [
      getId(item),
      getName(item),
      getRate(item).toFixed(2),
      getTax(item),
      getStock(item),
      (getStock(item) * getRate(item)).toFixed(2)
    ]);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredItems]);

  const formatStockValue = (stock) => {
    const n = Number(stock) || 0;
    return n === 0 ? 'Out of Stock' : n.toLocaleString();
  };

  const totalItems = items.length;
  const outOfStock = items.filter(i => getStock(i) === 0).length;
  const lowStock   = items.filter(i => getStock(i) > 0 && getStock(i) < 10).length;
  const totalValue = items.reduce((sum, i) => sum + getStock(i) * getRate(i), 0);

  return (
    <div className={`container-fluid py-4 theme-${currentTheme}`} id="inventory">
      <div className="row justify-content-center">
        <div className="col-12 col-lg-11">

          {/* Header */}
          <div className="glass-card shadow-xl p-4 mb-4 fade-in-up">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
              <div>
                <h2 className="fw-bold mb-1">
                  <i className="bi bi-boxes me-2 text-primary"></i>Stock Management
                </h2>
                <small className="text-muted">
                  {filteredItems.length} items{searchTerm ? ` matching "${searchTerm}"` : ' total'}
                </small>
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <button className="btn btn-outline-secondary" onClick={() => onNavigateToHome?.()}>
                  <i className="bi bi-arrow-left me-1"></i>Back to Invoice
                </button>
                <button className="btn btn-success" data-bs-toggle="modal" data-bs-target="#receiveModal">
                  <i className="bi bi-arrow-down-circle me-1"></i>Receive Items
                </button>
                <button className="btn btn-outline-success" onClick={exportCSV}>
                  <i className="bi bi-download me-1"></i>Export CSV
                </button>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="row g-3 mb-4">
            {[
              { label: 'Total Items',      value: totalItems,                             color: '' },
              { label: 'Out of Stock',     value: outOfStock,                             color: 'text-danger' },
              { label: 'Low Stock (<10)',  value: lowStock,                               color: 'text-warning' },
              { label: 'Inventory Value', value: `Rs.${totalValue.toLocaleString('en-IN')}`, color: 'text-success' },
            ].map(({ label, value, color }) => (
              <div key={label} className="col-6 col-md-3">
                <div className="glass-card p-3 text-center">
                  <div className={`fs-4 fw-bold ${color}`}>{value}</div>
                  <small className="text-muted">{label}</small>
                </div>
              </div>
            ))}
          </div>

          {/* Success alert */}
          {receiveSuccess && (
            <div className="alert alert-success alert-dismissible fade show mb-4">
              <i className="bi bi-check-circle-fill me-2"></i>{receiveSuccess}
              <button type="button" className="btn-close" onClick={() => setReceiveSuccess('')}></button>
            </div>
          )}

          {/* Search */}
          <div className="glass-card p-3 mb-4">
            <div className="input-group">
              <span className="input-group-text bg-transparent border-0"><i className="bi bi-search"></i></span>
              <input
                type="text"
                className="form-control border-0 bg-transparent"
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button className="btn btn-outline-secondary btn-sm" onClick={() => setSearchTerm('')}>
                  <i className="bi bi-x"></i>
                </button>
              )}
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="glass-card text-center p-5 fade-in-up">
              <i className="bi bi-boxes display-1 text-muted mb-4 d-block"></i>
              <h3 className="text-muted mb-3">
                {searchTerm ? `No items matching "${searchTerm}"` : 'No items in inventory'}
              </h3>
              <p className="text-muted mb-4">Add items through Item Master to manage stock</p>
            </div>
          ) : (
            <div className="glass-card shadow-xl p-0 overflow-hidden">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-dark">
                    <tr>
                      <th>Code</th>
                      <th>Item Name</th>
                      <th className="text-end">Rate (Rs)</th>
                      <th className="text-end">Tax %</th>
                      <th className="text-end">Stock</th>
                      <th className="text-end">Total Value</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(item => {
                      const id     = getId(item);
                      const name   = getName(item);
                      const rate   = getRate(item);
                      const tax    = getTax(item);
                      const stock  = getStock(item);
                      const status = getStockStatus(stock);
                      const value  = stock * rate;

                      return (
                        <tr key={id} className={`align-middle ${
                          status === 'danger'  ? 'table-danger'  :
                          status === 'warning' ? 'table-warning' : ''
                        }`}>
                          <td><span className="badge bg-secondary">{id}</span></td>
                          <td className="fw-semibold">
                            {name}
                            {status === 'danger'  && <span className="badge bg-danger ms-2">Out of Stock</span>}
                            {status === 'warning' && <span className="badge bg-warning text-dark ms-2">Low</span>}
                          </td>
                          <td className="text-end">Rs.{rate.toFixed(2)}</td>
                          <td className="text-end"><span className="badge bg-secondary">{tax}%</span></td>
                          <td className="text-end">
                            {editingId === id ? (
                              <div className="d-flex align-items-center justify-content-end gap-1">
                                <input
                                  className="form-control form-control-sm text-end"
                                  type="number" min="0"
                                  value={editStock}
                                  style={{ maxWidth: '80px' }}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    setEditStock(val);
                                    setStockError(val < 0 ? 'Stock cannot be negative' : '');
                                  }}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter')  updateStock(id);
                                    if (e.key === 'Escape') { setEditingId(null); setStockError(''); }
                                  }}
                                />
                                <button className="btn btn-success btn-sm" onClick={() => updateStock(id)} disabled={savingStock} title="Save">
                                  {savingStock
                                    ? <span className="spinner-border spinner-border-sm"></span>
                                    : <i className="bi bi-check-lg"></i>}
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={() => { setEditingId(null); setStockError(''); }} title="Cancel">
                                  <i className="bi bi-x"></i>
                                </button>
                              </div>
                            ) : (
                              <span className={`fw-bold text-${status}`}>{formatStockValue(stock)}</span>
                            )}
                            {stockError && editingId === id && (
                              <small className="text-danger d-block">{stockError}</small>
                            )}
                          </td>
                          <td className="text-end fw-bold">Rs.{value.toLocaleString('en-IN')}</td>
                          <td>
                            <button
                              className="btn btn-outline-primary btn-sm"
                              onClick={() => { setEditingId(id); setEditStock(stock); }}
                              title="Edit Stock"
                            >
                              <i className="bi bi-pencil me-1"></i>Edit Stock
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="table-secondary">
                    <tr>
                      <td className="fw-bold" colSpan="4">Total ({filteredItems.length} items)</td>
                      <td className="text-end fw-bold">{filteredItems.reduce((s, i) => s + getStock(i), 0).toLocaleString()} units</td>
                      <td className="text-end fw-bold text-success">
                        Rs.{filteredItems.reduce((s, i) => s + getStock(i) * getRate(i), 0).toLocaleString('en-IN')}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Transactions Log */}
          {transactions.length > 0 && (
            <div className="glass-card shadow-lg mt-4 p-4">
              <h5 className="fw-bold mb-3">
                <i className="bi bi-list-ul text-info me-2"></i>
                Recent Transactions ({transactions.length})
              </h5>
              <div className="table-responsive">
                <table className="table table-sm">
                  <thead><tr><th>Date</th><th>Type</th><th>Details</th></tr></thead>
                  <tbody>
                    {transactions.map(txn => (
                      <tr key={txn.id}>
                        <td className="small">{txn.date}</td>
                        <td>
                          <span className={`badge ${txn.type === 'receive' ? 'bg-success' : txn.type === 'edit' ? 'bg-info' : 'bg-secondary'}`}>
                            {txn.type}
                          </span>
                        </td>
                        <td className="small">
                          {txn.itemName
                            ? `+${txn.qty} ${txn.itemName}${txn.note ? ` (${txn.note})` : ''}`
                            : txn.description}
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
        <div className="modal-dialog">
          <div className="modal-content glass-card">
            <div className="modal-header">
              <h5 className="modal-title fw-bold">
                <i className="bi bi-arrow-down-circle text-success me-2"></i>Receive Stock
              </h5>
              <button type="button" className="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div className="modal-body">
              {receiveError && (
                <div className="alert alert-danger">
                  <i className="bi bi-exclamation-triangle me-2"></i>{receiveError}
                </div>
              )}
              <div className="mb-3">
                <label className="form-label fw-semibold">Select Item <span className="text-danger">*</span></label>
                <select
                  className="form-select"
                  value={receiveForm.itemId}
                  onChange={(e) => handleReceiveChange('itemId', e.target.value)}
                >
                  <option value="">Choose item...</option>
                  {items.map(item => {
                    const id = getId(item);
                    return (
                      <option key={id} value={id}>
                        {getName(item)} — Stock: {getStock(item)}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label fw-semibold">Quantity <span className="text-danger">*</span></label>
                <input
                  type="number" className="form-control" min="1"
                  placeholder="Enter quantity..."
                  value={receiveForm.qty}
                  onChange={(e) => handleReceiveChange('qty', e.target.value)}
                />
                {receiveForm.itemId && receiveForm.qty && (() => {
                  const sel = items.find(i => String(getId(i)) === String(receiveForm.itemId));
                  return sel ? (
                    <small className="text-muted mt-1 d-block">
                      New stock will be: {getStock(sel) + (parseInt(receiveForm.qty) || 0)}
                    </small>
                  ) : null;
                })()}
              </div>
              <div className="mb-3">
                <label className="form-label">Note <span className="text-muted">(optional)</span></label>
                <textarea
                  className="form-control" rows="2"
                  placeholder="Supplier, PO#, batch..."
                  value={receiveForm.note}
                  onChange={(e) => handleReceiveChange('note', e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" className="btn btn-success" onClick={submitReceive} disabled={receiveSaving}>
                {receiveSaving
                  ? <><span className="spinner-border spinner-border-sm me-1"></span>Saving...</>
                  : <><i className="bi bi-check-circle me-1"></i>Receive Stock</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Inventory;