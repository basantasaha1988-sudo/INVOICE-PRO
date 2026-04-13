import React, { useState, useEffect } from 'react';
import './ReceiptPayment.css';
import { useDarkMode } from '../App';

const ReceiptPayment = ({
  invoice = {},
  onClose,
  onReceiptSaved
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

  const [isEditing, setIsEditing] = useState(false);

// Pre-fill data when invoice is passed
  useEffect(() => {
    if (invoice && Object.keys(invoice).length > 0) {
      setFormData({
        companyName: invoice.customerName || invoice.companyName || '',
        paymentDocNumber: invoice.invoiceNumber || invoice.billNo || '',
        amount: invoice.totalAmount || invoice.total || '',
        receiptAmount: invoice.totalAmount || invoice.total || '',
        type: 'againstBill',
        remarks: `Payment received against Invoice #${invoice.invoiceNumber || invoice.billNo || ''}`,
      });
    }
  }, [invoice]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
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
    onClose(); // Close modal
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

            {invoice.total > 0 && (
              <>
                <div className="form-group">
                  <label>Invoice Total (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="amount"
                    value={formData.amount}
                    onChange={handleChange}
                    readOnly
                    className="form-control-plaintext text-success fw-bold"
                  />
                </div>

                <div className="form-group">
                  <label>Current Balance (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.balance || formData.amount}
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
                max={invoice.balance || formData.amount || 999999}
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

          <button type="submit" className="submit-btn">
            <i className="bi bi-check-circle me-2"></i>
            Save Receipt & Print
          </button>
        </form>
      </div>
    </div>
  );
};

export default ReceiptPayment;
