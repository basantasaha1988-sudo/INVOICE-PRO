import React, { useState, useEffect } from 'react';
import './ReceiptPayment.css';
import { useDarkMode } from '../App';

const ReceiptPayment = ({
  invoice = {},
  receipts = [],
  onClose,
  onReceiptSaved,
  onDeleteReceipt
}) => {

  const [formData, setFormData] = useState({
    companyName: '',
    paymentDocNumber: '',
    amount: '',
    receiptAmount: '',
    mode: 'Cash',
    type: 'againstBill',
    remarks: '',
  });

  // Pre-fill data when invoice is passed
  useEffect(() => {
    if (invoice && Object.keys(invoice).length > 0) {
      setFormData({
        companyName: invoice.customerName || invoice.companyName || '',
        paymentDocNumber: invoice.invoiceNumber || invoice.billNo || '',
        amount: invoice.totalAmount || invoice.total || '',
        receiptAmount: invoice.balance || invoice.totalAmount || invoice.total || '',
        mode: 'Cash',
        type: 'againstBill',
        remarks: `Payment received against Invoice #${invoice.invoiceNumber || invoice.billNo || ''}`,
      });
    }
  }, [invoice]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      companyName: '',
      paymentDocNumber: '',
      amount: '',
      receiptAmount: '',
      mode: 'Cash',
      type: 'againstBill',
      remarks: '',
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.companyName || !formData.paymentDocNumber || !formData.receiptAmount) {
      alert("Please fill all required fields");
      return;
    }

    const receipt = {
      id: Date.now(),
      date: new Date().toLocaleDateString('en-IN'),
      paymentDocNumber: formData.paymentDocNumber,
      companyName: formData.companyName,
      invoiceTotal: parseFloat(formData.amount) || 0,
      receiptAmount: parseFloat(formData.receiptAmount) || 0,
      balance: (parseFloat(formData.amount) || 0) - parseFloat(formData.receiptAmount || 0),
      mode: formData.mode,
      type: formData.type,
      remarks: formData.remarks,
    };

    // Callback to parent (save receipt globally)
    if (onReceiptSaved) onReceiptSaved(receipt);

    alert("Receipt Saved Successfully!");
  };

  const handleDelete = (id) => {
    if (!window.confirm('Delete this receipt?')) return;
    if (onDeleteReceipt) onDeleteReceipt(id);
  };

  const { isDark } = useDarkMode();

  return (
    <div className={`receipt-container ${isDark ? 'dark-mode' : ''}`}>
      <div className="d-flex align-items-center mb-4 gap-3">
        <button 
          className="btn btn-outline-secondary rounded-circle p-2" 
          onClick={onClose}
          style={{ minWidth: '50px', height: '50px' }}
        >
          ← Back
        </button>
        <h2 className="mb-0 fw-bold">
          <i className="bi bi-receipt me-2 text-success"></i>
          Receipt Payment
        </h2>
      </div>

      <div className="receipt-form">
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label>Company / Customer Name <span className="text-danger">*</span></label>
              <input
                type="text"
                name="companyName"
                value={formData.companyName}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Payment Doc / Invoice No <span className="text-danger">*</span></label>
              <input
                type="text"
                name="paymentDocNumber"
                value={formData.paymentDocNumber}
                onChange={handleChange}
                required
              />
            </div>

            {(invoice?.total > 0 || formData.amount) && (
              <>
                <div className="form-group">
                  <label>Invoice Total (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="amount"
                    value={formData.amount}
                    onChange={handleChange}
                    readOnly={invoice?.total > 0}
                    className="form-control-plaintext text-success fw-bold"
                  />
                </div>

                <div className="form-group">
                  <label>Current Balance (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice?.balance || formData.amount}
                    readOnly
                    className="form-control-plaintext text-warning fw-bold"
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label>Receipt Amount (₹) <span className="text-danger">*</span></label>
              <input
                type="number"
                step="0.01"
                name="receiptAmount"
                value={formData.receiptAmount}
                onChange={handleChange}
                required
                max={invoice?.balance || formData.amount || 999999}
              />
            </div>

            <div className="form-group">
              <label>Payment Mode</label>
              <select name="mode" value={formData.mode || 'Cash'} onChange={handleChange}>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
              </select>
            </div>

            <div className="form-group">
              <label>Payment Type</label>
              <select name="type" value={formData.type} onChange={handleChange}>
                <option value="againstBill">Against Bill</option>
                <option value="advance">Advance</option>
                <option value="fullSettlement">Full Settlement</option>
              </select>
            </div>

            <div className="form-group full-width">
              <label>Remarks</label>
              <textarea
                rows="3"
                name="remarks"
                value={formData.remarks}
                onChange={handleChange}
                placeholder="Payment reference, cheque no, etc..."
              />
            </div>
          </div>

          <div className="d-flex gap-3 flex-wrap">
            <button type="submit" className="submit-btn">
              <i className="bi bi-check-circle me-2"></i>
              Save Receipt
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={resetForm}>
              <i className="bi bi-arrow-clockwise me-2"></i>
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* Receipts Grid */}
      <div className="table-container mt-5">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h4 className="fw-bold mb-0">
            <i className="bi bi-list-ul me-2 text-primary"></i>
            Saved Receipts <span className="badge bg-primary">{receipts.length}</span>
          </h4>
        </div>

        {receipts.length === 0 ? (
          <div className="text-center py-5">
            <i className="bi bi-inbox display-1 text-muted d-block mb-3"></i>
            <h5 className="text-muted">No receipts saved yet</h5>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle">
              <thead className="table-dark">
                <tr>
                  <th>Date</th>
                  <th>Doc No</th>
                  <th>Company / Customer</th>
                  <th className="text-end">Invoice Total</th>
                  <th className="text-end">Receipt Amount</th>
                  <th className="text-end">Balance</th>
                  <th>Mode</th>
                  <th>Type</th>
                  <th>Remarks</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map(r => (
                  <tr key={r.id}>
                    <td><small>{r.date}</small></td>
                    <td><span className="badge bg-primary">{r.paymentDocNumber}</span></td>
                    <td className="fw-semibold">{r.companyName}</td>
                    <td className="text-end">₹{(r.invoiceTotal || 0).toFixed(2)}</td>
                    <td className="text-end text-success fw-bold">₹{(r.receiptAmount || 0).toFixed(2)}</td>
                    <td className="text-end text-warning">₹{(r.balance || 0).toFixed(2)}</td>
                    <td><span className="badge bg-info text-dark">{r.mode}</span></td>
                    <td><span className="badge bg-secondary">{r.type}</span></td>
                    <td><small className="text-muted">{r.remarks}</small></td>
                    <td>
                      <button className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(r.id)} title="Delete">
                        <i className="bi bi-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="table-secondary fw-bold">
                <tr>
                  <td colSpan="3">Total ({receipts.length} receipts)</td>
                  <td className="text-end">₹{receipts.reduce((s, r) => s + (r.invoiceTotal || 0), 0).toFixed(2)}</td>
                  <td className="text-end text-success">₹{receipts.reduce((s, r) => s + (r.receiptAmount || 0), 0).toFixed(2)}</td>
                  <td className="text-end text-warning">₹{receipts.reduce((s, r) => s + (r.balance || 0), 0).toFixed(2)}</td>
                  <td colSpan="4"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReceiptPayment;

