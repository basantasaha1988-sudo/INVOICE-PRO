/**
 * ReceiveRecords.jsx
 *
 * Displays stock receive (GRN) records grouped by Company → Project/Supplier.
 *
 * RULES:
 * - Every individual receive entry appears as its own row (never merged).
 * - Each row shows its own GRN document number.
 * - Each row has: Preview, Print, Edit, Delete.
 * - The summary badges show total units per company / per project.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";

/* ─── helpers ────────────────────────────────────────────────────────────── */

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

/* ─── GRN Preview Modal ───────────────────────────────────────────────────── */

function GRNPreviewModal({ receipt, onClose, onPrint }) {
  if (!receipt) return null;
  return (
    <div
      className="modal fade show d-block"
      tabIndex="-1"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content border-0 shadow-lg" id="grn-print-area">
          {/* Header */}
          <div className="modal-header border-0 pb-0 px-4 pt-4">
            <div>
              <h4 className="fw-bold mb-0 text-primary">Goods Received Note</h4>
              <span className="badge bg-primary fs-6 mt-1">{receipt.GRNDocNo}</span>
            </div>
            <button className="btn-close d-print-none" onClick={onClose} />
          </div>

          {/* Body */}
          <div className="modal-body px-4 py-3">
            {/* Meta grid */}
            <div className="row g-3 mb-3">
              {[
                ["Company", receipt.CompanyName || "—"],
                ["Project", receipt.ProjectName || "—"],
                ["Receipt Date", fmt(receipt.ReceiptDate)],
                ["Created At", receipt.ReceivedAt ? fmt(receipt.ReceivedAt) : "—"],
              ].map(([label, val]) => (
                <div className="col-6 col-md-3" key={label}>
                  <div className="bg-light rounded p-2 h-100">
                    <div className="text-muted small">{label}</div>
                    <div className="fw-semibold">{val}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Item table */}
            <table className="table table-bordered table-sm mb-3">
              <thead className="table-dark">
                <tr>
                  <th>#</th>
                  <th>Item Name</th>
                  <th className="text-end">Qty Received</th>
                  <th className="text-end">Stock Before</th>
                  <th className="text-end">Stock After</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1</td>
                  <td className="fw-semibold">{receipt.ItemName}</td>
                  <td className="text-end fw-bold text-success">{receipt.QtyReceived} units</td>
                  <td className="text-end text-muted">{receipt.StockBefore}</td>
                  <td className="text-end">{receipt.StockAfter}</td>
                </tr>
              </tbody>
            </table>

            {receipt.Note && (
              <div className="alert alert-light border mb-0">
                <strong>Note:</strong> {receipt.Note}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="modal-footer border-0 px-4 pb-4 d-print-none">
            <button className="btn btn-outline-secondary" onClick={onClose}>Close</button>
            <button className="btn btn-primary" onClick={onPrint}>
              <i className="bi bi-printer me-1" /> Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Edit Modal ──────────────────────────────────────────────────────────── */

function EditReceiptModal({ receipt, onClose, onSaved }) {
  const [form, setForm] = useState({
    grnDocNo: receipt?.GRNDocNo || "",
    itemName: receipt?.ItemName || "",
    qty: receipt?.QtyReceived || "",
    note: receipt?.Note || "",
    receiptDate: receipt?.ReceiptDate
      ? new Date(receipt.ReceiptDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handle = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError("");
  };

  const save = async () => {
    if (!form.qty || Number(form.qty) <= 0) {
      setError("Quantity must be greater than 0");
      return;
    }
    setSaving(true);
    try {
      await axios.put(`/api/stock-receipts/${receipt.ReceiptID}`, {
        grnDocNo: form.grnDocNo,
        itemName: form.itemName,
        qty: Number(form.qty),
        note: form.note,
        receiptDate: form.receiptDate,
      });
      onSaved();
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal fade show d-block"
      tabIndex="-1"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content border-0 shadow-lg">
          <div className="modal-header border-0">
            <h5 className="modal-title fw-bold">
              <i className="bi bi-pencil-square text-warning me-2" />
              Edit Receive Entry
            </h5>
            <button className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body px-4">
            {error && (
              <div className="alert alert-danger py-2 small">{error}</div>
            )}
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label fw-semibold small">GRN Doc No</label>
                <input className="form-control" name="grnDocNo" value={form.grnDocNo} onChange={handle} />
              </div>
              <div className="col-12">
                <label className="form-label fw-semibold small">Item Name</label>
                <input className="form-control" name="itemName" value={form.itemName} onChange={handle} />
              </div>
              <div className="col-6">
                <label className="form-label fw-semibold small">Qty Received <span className="text-danger">*</span></label>
                <input className="form-control" type="number" min="1" name="qty" value={form.qty} onChange={handle} />
              </div>
              <div className="col-6">
                <label className="form-label fw-semibold small">Receipt Date</label>
                <input className="form-control" type="date" name="receiptDate" value={form.receiptDate} onChange={handle} />
              </div>
              <div className="col-12">
                <label className="form-label fw-semibold small">Note</label>
                <textarea className="form-control" name="note" rows={2} value={form.note} onChange={handle} />
              </div>
            </div>
          </div>
          <div className="modal-footer border-0 px-4 pb-4">
            <button className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-warning fw-semibold" onClick={save} disabled={saving}>
              {saving ? <><span className="spinner-border spinner-border-sm me-1" />Saving…</> : <><i className="bi bi-check-lg me-1" />Save Changes</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Row Actions ─────────────────────────────────────────────────────────── */

function RowActions({ receipt, onPreview, onEdit, onDelete }) {
  return (
    <div className="d-flex gap-1 flex-nowrap">
      <button
        className="btn btn-outline-primary btn-sm"
        title="Preview"
        onClick={() => onPreview(receipt)}
      >
        <i className="bi bi-eye" />
      </button>
      <button
        className="btn btn-outline-secondary btn-sm"
        title="Print"
        onClick={() => onPreview(receipt, true)}
      >
        <i className="bi bi-printer" />
      </button>
      <button
        className="btn btn-outline-warning btn-sm"
        title="Edit"
        onClick={() => onEdit(receipt)}
      >
        <i className="bi bi-pencil" />
      </button>
      <button
        className="btn btn-outline-danger btn-sm"
        title="Delete"
        onClick={() => onDelete(receipt)}
      >
        <i className="bi bi-trash" />
      </button>
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────────────── */

export default function ReceiveRecords() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Modal state
  const [preview, setPreview] = useState(null);   // { receipt, printOnOpen }
  const [editing, setEditing] = useState(null);   // receipt

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get("/api/stock-receipts");
      // Sort by GRNDocNo ascending (document number-wise) as primary sort,
      // then by ReceiptDate DESC as secondary, then by ReceivedAt DESC for stability.
      data.sort((a, b) => {
        const gnCmp = (a.GRNDocNo || '').localeCompare(b.GRNDocNo || '', undefined, { numeric: true, sensitivity: 'base' });
        if (gnCmp !== 0) return gnCmp;
        const d = new Date(b.ReceiptDate) - new Date(a.ReceiptDate);
        if (d !== 0) return d;
        return new Date(b.ReceivedAt || 0) - new Date(a.ReceivedAt || 0);
      });
      setRecords(data);
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── print helper ── */
  const printRef = useRef();
  const handlePrint = () => {
    const area = document.getElementById("grn-print-area");
    if (!area) return;
    const win = window.open("", "_blank");
    win.document.write(`
      <html><head>
        <title>GRN Print</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"/>
        <style>body{padding:24px;font-family:sans-serif}</style>
      </head><body>
        ${area.outerHTML}
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  /* ── delete ── */
  const handleDelete = async (receipt) => {
    if (!window.confirm(`Delete GRN ${receipt.GRNDocNo} — ${receipt.ItemName} (${receipt.QtyReceived} units)?`)) return;
    try {
      await axios.delete(`/api/stock-receipts/${receipt.ReceiptID}`);
      load();
    } catch (err) {
      alert("Delete failed: " + (err?.response?.data?.error || err.message));
    }
  };

  /* ── preview open (optionally print right away) ── */
  const handlePreview = (receipt, printOnOpen = false) => {
    setPreview({ receipt, printOnOpen });
  };

  useEffect(() => {
    if (preview?.printOnOpen) {
      // Give DOM a tick to render modal, then print
      const t = setTimeout(handlePrint, 400);
      return () => clearTimeout(t);
    }
  }, [preview]);

  /* ── filter ── */
  const filtered = records.filter((r) => {
    const q = search.toLowerCase();
    return (
      !q ||
      r.GRNDocNo?.toLowerCase().includes(q) ||
      r.ItemName?.toLowerCase().includes(q) ||
      r.CompanyName?.toLowerCase().includes(q) ||
      r.ProjectName?.toLowerCase().includes(q)
    );
  });

  /* ── group: Company → Project ── */
  const grouped = filtered.reduce((acc, r) => {
    const co = r.CompanyName || "Unknown Company";
    const proj = r.ProjectName || "—";
    if (!acc[co]) acc[co] = {};
    if (!acc[co][proj]) acc[co][proj] = [];
    acc[co][proj].push(r);
    return acc;
  }, {});

  /* ── summary totals ── */
  const companyTotal = (proj) =>
    Object.values(proj)
      .flat()
      .reduce((s, r) => s + Number(r.QtyReceived || 0), 0);

  const projectTotal = (rows) =>
    rows.reduce((s, r) => s + Number(r.QtyReceived || 0), 0);

  /* ─────────────────────────────────────────────────────────────────────── */

  return (
    <>
      {/* ── Header ── */}
      <div
        className="rounded-4 shadow-sm p-4 mb-4"
        style={{ background: "linear-gradient(135deg,#f3e8ff 0%,#ede9fe 100%)" }}
      >
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div>
            <h3 className="fw-bold mb-1" style={{ color: "#4c1d95" }}>
              <i className="bi bi-box-arrow-in-down me-2" />
              Receive Records
            </h3>
            <small className="text-muted">
              {filtered.length} individual receive entries
              {search && ` matching "${search}"`}
            </small>
          </div>

          {/* Search */}
          <div className="input-group shadow-sm" style={{ maxWidth: 320 }}>
            <span className="input-group-text bg-white border-end-0">
              <i className="bi bi-search text-muted" />
            </span>
            <input
              className="form-control border-start-0"
              placeholder="Search GRN, item, company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="btn btn-outline-secondary" onClick={() => setSearch("")}>
                <i className="bi bi-x" />
              </button>
            )}
          </div>

          <button className="btn btn-outline-primary btn-sm" onClick={load}>
            <i className="bi bi-arrow-clockwise me-1" /> Refresh
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="alert alert-danger d-flex align-items-center gap-2 mb-3">
          <i className="bi bi-exclamation-triangle-fill" />
          {error}
          <button className="btn btn-sm btn-outline-danger ms-auto" onClick={load}>Retry</button>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" />
          <div className="mt-2 text-muted small">Loading receive records…</div>
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-5 text-muted">
          <i className="bi bi-inbox display-3 d-block mb-3 opacity-25" />
          <h5>{search ? `No records matching "${search}"` : "No receive records found"}</h5>
        </div>
      )}

      {/* ── Groups ── */}
      {!loading && Object.entries(grouped).map(([company, projects]) => (
        <div
          key={company}
          className="card border-0 shadow-sm mb-4 rounded-4 overflow-hidden"
          style={{ background: "#f8f7ff" }}
        >
          {/* Company header */}
          <div
            className="px-4 py-3 d-flex align-items-center justify-content-between"
            style={{ background: "linear-gradient(90deg,#ede9fe,#ddd6fe)" }}
          >
            <span className="fw-bold fs-6" style={{ color: "#3730a3" }}>
              <i className="bi bi-building me-2" />
              {company}
            </span>
            <span
              className="badge rounded-pill px-3 py-2 fs-6"
              style={{ background: "#4f46e5", color: "#fff" }}
            >
              {companyTotal(projects).toLocaleString()} units total
            </span>
          </div>

          {/* Projects */}
          {Object.entries(projects).map(([proj, rows]) => (
            <div key={proj} className="px-3 pb-3 pt-2">
              {/* Project sub-header */}
              <div className="d-flex align-items-center justify-content-between mb-2 mt-2">
                <span className="text-muted small fw-semibold ps-1">
                  <i className="bi bi-folder2-open me-1" />
                  {proj}
                </span>
                <span
                  className="badge rounded-pill"
                  style={{ background: "#374151", color: "#fff", fontSize: "0.78rem" }}
                >
                  {projectTotal(rows).toLocaleString()} units
                </span>
              </div>

              {/* Table — one row per GRN entry, NEVER merged */}
              <div className="table-responsive rounded-3 shadow-sm">
                <table className="table table-hover mb-0 align-middle" style={{ background: "#fff" }}>
                  <thead>
                    <tr style={{ background: "#6d28d9", color: "#fff" }}>
                      <th style={{ color: "#fff", fontWeight: 600, fontSize: "0.82rem", width: 40 }}>#</th>
                      <th style={{ color: "#fff", fontWeight: 600, fontSize: "0.82rem" }}>GRN Number</th>
                      <th style={{ color: "#fff", fontWeight: 600, fontSize: "0.82rem" }}>Item</th>
                      <th className="text-end" style={{ color: "#fff", fontWeight: 600, fontSize: "0.82rem" }}>Qty Received</th>
                      <th className="text-center" style={{ color: "#fff", fontWeight: 600, fontSize: "0.82rem" }}>Receipt Date</th>
                      <th className="text-center" style={{ color: "#fff", fontWeight: 600, fontSize: "0.82rem" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => (
                      <tr key={r.ReceiptID}>
                        {/* Entry index */}
                        <td className="text-muted small">{idx + 1}</td>

                        {/* GRN Doc No — each entry's own number, shown first */}
                        <td>
                          <code
                            className="px-2 py-1 rounded"
                            style={{ background: "#f3e8ff", color: "#6d28d9", fontSize: "0.82rem" }}
                          >
                            {r.GRNDocNo}
                          </code>
                        </td>

                        {/* Item */}
                        <td className="fw-semibold">{r.ItemName}</td>

                        {/* Qty — this row's own quantity */}
                        <td className="text-end">
                          <span className="badge bg-light text-dark border fw-bold">
                            {Number(r.QtyReceived).toLocaleString()} units
                          </span>
                        </td>

                        {/* Date — this entry's own date */}
                        <td className="text-center">
                          <small className="text-muted">{fmt(r.ReceiptDate)}</small>
                        </td>

                        {/* Actions */}
                        <td className="text-center">
                          <RowActions
                            receipt={r}
                            onPreview={handlePreview}
                            onEdit={setEditing}
                            onDelete={handleDelete}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* ── Preview / Print Modal ── */}
      {preview && (
        <GRNPreviewModal
          receipt={preview.receipt}
          onClose={() => setPreview(null)}
          onPrint={handlePrint}
        />
      )}

      {/* ── Edit Modal ── */}
      {editing && (
        <EditReceiptModal
          receipt={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </>
  );
}