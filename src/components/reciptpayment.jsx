import React, { useState } from 'react';
import './ReceiptPayment.css'; // Create this file for styling

const ReceiptPayment = () => {
  const [formData, setFormData] = useState({
    companyName: '',
    paymentDocNumber: '',
    amount: '',
    receiptAmount: '',
    type: 'againstBill', // 'advance' or 'againstBill'
    remarks: '',
  });

  const [receipts, setReceipts] = useState([]);
  const [editingId, setEditingId] = useState(null);

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

    const newReceipt = {
      id: editingId || Date.now(),
      ...formData,
      date: new Date().toLocaleDateString('en-IN'),
    };

    if (editingId) {
      setReceipts(receipts.map(item => item.id === editingId ? newReceipt : item));
      setEditingId(null);
    } else {
      setReceipts([...receipts, newReceipt]);
    }

    // Reset form
    setFormData({
      companyName: '',
      paymentDocNumber: '',
      amount: '',
      receiptAmount: '',
      type: 'againstBill',
      remarks: '',
    });
  };

  const handleEdit = (receipt) => {
    setFormData(receipt);
    setEditingId(receipt.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this receipt?')) {
      setReceipts(receipts.filter(item => item.id !== id));
    }
  };

  const handlePrint = (receipt) => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head><title>Receipt Payment - ${receipt.paymentDocNumber}</title></head>
        <body style="font-family: Arial; padding: 40px;">
          <h2>Receipt Payment Voucher</h2>
          <p><strong>Date:</strong> ${receipt.date}</p>
          <p><strong>Company:</strong> ${receipt.companyName}</p>
          <p><strong>Doc Number:</strong> ${receipt.paymentDocNumber}</p>
          <p><strong>Type:</strong> ${receipt.type === 'advance' ? 'Advance Payment' : 'Against Bill'}</p>
          <p><strong>Amount:</strong> ₹${receipt.amount}</p>
          <p><strong>Receipt Amount:</strong> ₹${receipt.receiptAmount}</p>
          <p><strong>Remarks:</strong> ${receipt.remarks || 'N/A'}</p>
          <hr />
          <p style="margin-top: 50px;">Authorized Signature</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="receipt-container">
      <h2>{editingId ? 'Edit Receipt Payment' : 'New Receipt Payment'}</h2>

      {/* Form */}
      <form onSubmit={handleSubmit} className="receipt-form">
        <div className="form-grid">
          <div className="form-group">
            <label>Company Name <span className="required">*</span></label>
            <input
              type="text"
              name="companyName"
              value={formData.companyName}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Payment Doc Number <span className="required">*</span></label>
            <input
              type="text"
              name="paymentDocNumber"
              value={formData.paymentDocNumber}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Amount (₹)</label>
            <input
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Receipt Amount (₹) <span className="required">*</span></label>
            <input
              type="number"
              name="receiptAmount"
              value={formData.receiptAmount}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Type</label>
            <select name="type" value={formData.type} onChange={handleChange}>
              <option value="againstBill">Against Bill</option>
              <option value="advance">Advance Payment</option>
            </select>
          </div>

          <div className="form-group full-width">
            <label>Remarks</label>
            <textarea
              name="remarks"
              value={formData.remarks}
              onChange={handleChange}
              rows="3"
            />
          </div>
        </div>

        <button type="submit" className="submit-btn">
          {editingId ? 'Update Receipt' : 'Save Receipt'}
        </button>
      </form>

      {/* Receipts Table */}
      <h3>Receipt Payments List</h3>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Company Name</th>
              <th>Doc Number</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Receipt Amt</th>
              <th>Remarks</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((receipt) => (
              <tr key={receipt.id}>
                <td>{receipt.date}</td>
                <td>{receipt.companyName}</td>
                <td>{receipt.paymentDocNumber}</td>
                <td>{receipt.type === 'advance' ? 'Advance' : 'Against Bill'}</td>
                <td>₹{receipt.amount}</td>
                <td>₹{receipt.receiptAmount}</td>
                <td>{receipt.remarks}</td>
                <td>
                  <button onClick={() => handleEdit(receipt)} className="edit-btn">Edit</button>
                  <button onClick={() => handlePrint(receipt)} className="print-btn">Print</button>
                  <button onClick={() => handleDelete(receipt.id)} className="delete-btn">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReceiptPayment;