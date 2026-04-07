import React, { useState } from "react";
import { useAuth } from "../App";

const Footer = () => {
  const { user } = useAuth();

  // ── Modal state ──
  const [showUserModal, setShowUserModal] = useState(false);
  const [modalTab, setModalTab] = useState("add"); // "add" | "change"

  // ── Add new user ──
  const [newUser, setNewUser] = useState({ username: "", password: "", confirmPassword: "" });
  const [addMsg, setAddMsg] = useState({ type: "", text: "" });

  // ── Change password ──
  const [pwdForm, setPwdForm] = useState({ username: "", oldPassword: "", newPassword: "", confirmNew: "" });
  const [pwdMsg, setPwdMsg] = useState({ type: "", text: "" });

  // ── Get all users from localStorage ──
  const getUsers = () => {
    try { return JSON.parse(localStorage.getItem("invoicepro_users") || "[]"); } catch { return []; }
  };
  const saveUsers = (users) => localStorage.setItem("invoicepro_users", JSON.stringify(users));

  // ── Add User ──
  const handleAddUser = () => {
    setAddMsg({ type: "", text: "" });
    const { username, password, confirmPassword } = newUser;
    if (!username.trim()) return setAddMsg({ type: "danger", text: "Username is required." });
    if (username.trim().length < 3) return setAddMsg({ type: "danger", text: "Username must be at least 3 characters." });
    if (!password) return setAddMsg({ type: "danger", text: "Password is required." });
    if (password.length < 4) return setAddMsg({ type: "danger", text: "Password must be at least 4 characters." });
    if (password !== confirmPassword) return setAddMsg({ type: "danger", text: "Passwords do not match." });

    const users = getUsers();
    if (users.find(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
      return setAddMsg({ type: "danger", text: "Username already exists." });
    }
    users.push({ username: username.trim(), password });
    saveUsers(users);
    setAddMsg({ type: "success", text: `✅ User "${username.trim()}" created successfully!` });
    setNewUser({ username: "", password: "", confirmPassword: "" });
  };

  // ── Change Password ──
  const handleChangePassword = () => {
    setPwdMsg({ type: "", text: "" });
    const { username, oldPassword, newPassword, confirmNew } = pwdForm;
    if (!username.trim()) return setPwdMsg({ type: "danger", text: "Username is required." });
    if (!oldPassword) return setPwdMsg({ type: "danger", text: "Current password is required." });
    if (!newPassword) return setPwdMsg({ type: "danger", text: "New password is required." });
    if (newPassword.length < 4) return setPwdMsg({ type: "danger", text: "New password must be at least 4 characters." });
    if (newPassword !== confirmNew) return setPwdMsg({ type: "danger", text: "New passwords do not match." });

    const users = getUsers();
    const idx = users.findIndex(
      u => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === oldPassword
    );
    if (idx === -1) return setPwdMsg({ type: "danger", text: "Username or current password is incorrect." });
    if (oldPassword === newPassword) return setPwdMsg({ type: "warning", text: "New password must be different from current password." });

    users[idx].password = newPassword;
    saveUsers(users);
    setPwdMsg({ type: "success", text: "✅ Password changed successfully!" });
    setPwdForm({ username: "", oldPassword: "", newPassword: "", confirmNew: "" });
  };

  const closeModal = () => {
    setShowUserModal(false);
    setAddMsg({ type: "", text: "" });
    setPwdMsg({ type: "", text: "" });
    setNewUser({ username: "", password: "", confirmPassword: "" });
    setPwdForm({ username: "", oldPassword: "", newPassword: "", confirmNew: "" });
  };

  return (
    <>
      <footer className="glass-card mt-auto py-4 fade-in-up">
        <div className="container-fluid">
          <div className="row g-4 align-items-start">

            {/* ── Brand & Copyright ── */}
            <div className="col-md-4 col-sm-12 text-center text-md-start">
              <h5 className="fw-bold text-primary mb-2">
                <i className="bi bi-receipt me-2"></i>InvoicePro
              </h5>
              <p className="text-muted mb-1 small">
                Modern billing solution for your business.
                Fast, responsive, and beautiful.
              </p>
              <p className="small text-muted mb-0">
                © {new Date().getFullYear()} InvoicePro. All rights reserved.
              </p>
              <p className="small fw-semibold mt-2 mb-0" style={{ color: 'var(--bs-primary, #1a56db)' }}>
                <i className="bi bi-code-slash me-1"></i>
                This app created by <strong>DIGICODE PRO</strong>
              </p>
            </div>

            {/* ── Address & Support ── */}
            <div className="col-md-4 col-sm-6 text-center">
              <h6 className="fw-semibold text-primary mb-3">
                <i className="bi bi-headset me-1"></i>Support
              </h6>
              <ul className="list-unstyled text-muted small mb-0">
                <li className="mb-2">
                  <i className="bi bi-geo-alt-fill text-primary me-2"></i>
                  MAHESHTALA, KOL — 700141
                </li>
                <li className="mb-2">
                  <i className="bi bi-telephone-fill text-success me-2"></i>
                  <a href="tel:+917980479921" className="text-muted text-decoration-none fw-semibold">
                    +91 79804 79921
                  </a>
                </li>
                <li>
                  <i className="bi bi-envelope-fill text-info me-2"></i>
                  <a href="mailto:hello@invoicepro.com" className="text-muted text-decoration-none">
                    hello@invoicepro.com
                  </a>
                </li>
              </ul>
            </div>

            {/* ── User Management & Social ── */}
            <div className="col-md-4 col-sm-6 text-center text-md-end">
              <h6 className="fw-semibold text-primary mb-3">
                <i className="bi bi-person-gear me-1"></i>Account
              </h6>

              {/* Logged-in user badge */}
              {user && (
                <div className="mb-3">
                  <span className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-3 py-2">
                    <i className="bi bi-person-check me-1"></i>
                    Logged in as <strong>{user.username}</strong>
                  </span>
                </div>
              )}

              {/* User management button */}
              <div className="mb-3">
                <button
                  className="btn btn-outline-primary btn-sm"
                  onClick={() => setShowUserModal(true)}
                >
                  <i className="bi bi-person-gear me-1"></i>
                  Manage Users
                </button>
              </div>

              {/* Social icons */}
              <div className="d-flex gap-2 justify-content-center justify-content-md-end">
                <a href="#" className="btn btn-outline-secondary btn-sm p-2 rounded-circle" aria-label="GitHub">
                  <i className="bi bi-github"></i>
                </a>
                <a href="#" className="btn btn-outline-info btn-sm p-2 rounded-circle" aria-label="LinkedIn">
                  <i className="bi bi-linkedin"></i>
                </a>
                <a href="https://wa.me/917980479921" target="_blank" rel="noreferrer"
                  className="btn btn-outline-success btn-sm p-2 rounded-circle" aria-label="WhatsApp">
                  <i className="bi bi-whatsapp"></i>
                </a>
              </div>
            </div>
          </div>

          {/* Divider */}
          <hr className="my-4 opacity-25 bg-gradient rounded-pill mx-auto" style={{ height: '4px', width: '120px' }} />

          <div className="text-center text-muted small">
            Made with <i className="bi bi-heart-fill text-danger"></i> using React + Bootstrap &nbsp;|&nbsp;
            Powered by <span className="fw-bold text-primary">DIGICODE PRO</span>
          </div>
        </div>
      </footer>

      {/* ════════════════════════════════════════════
          USER MANAGEMENT MODAL
      ════════════════════════════════════════════ */}
      {showUserModal && (
        <div
          className="modal fade show d-block"
          style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1055 }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content glass-card border-0 shadow-lg">

              {/* Header */}
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-person-gear text-primary me-2"></i>
                  User Management
                </h5>
                <button className="btn-close" onClick={closeModal}></button>
              </div>

              {/* Tabs */}
              <div className="px-3 pt-3">
                <ul className="nav nav-tabs border-0 gap-1">
                  <li className="nav-item">
                    <button
                      className={`nav-link border-0 ${modalTab === "add" ? "active" : ""}`}
                      onClick={() => { setModalTab("add"); setAddMsg({ type: "", text: "" }); }}
                    >
                      <i className="bi bi-person-plus me-1"></i>Add New User
                    </button>
                  </li>
                  <li className="nav-item">
                    <button
                      className={`nav-link border-0 ${modalTab === "change" ? "active" : ""}`}
                      onClick={() => { setModalTab("change"); setPwdMsg({ type: "", text: "" }); }}
                    >
                      <i className="bi bi-key me-1"></i>Change Password
                    </button>
                  </li>
                </ul>
              </div>

              {/* Body */}
              <div className="modal-body pt-3">

                {/* ── Add New User ── */}
                {modalTab === "add" && (
                  <div>
                    {addMsg.text && (
                      <div className={`alert alert-${addMsg.type} py-2 small`}>
                        {addMsg.text}
                      </div>
                    )}
                    <div className="mb-3">
                      <label className="form-label fw-semibold small">Username <span className="text-danger">*</span></label>
                      <div className="input-group">
                        <span className="input-group-text"><i className="bi bi-person"></i></span>
                        <input
                          className="form-control"
                          placeholder="Enter username (min 3 chars)"
                          value={newUser.username}
                          onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="form-label fw-semibold small">Password <span className="text-danger">*</span></label>
                      <div className="input-group">
                        <span className="input-group-text"><i className="bi bi-lock"></i></span>
                        <input
                          className="form-control"
                          type="password"
                          placeholder="Enter password (min 4 chars)"
                          value={newUser.password}
                          onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="form-label fw-semibold small">Confirm Password <span className="text-danger">*</span></label>
                      <div className="input-group">
                        <span className="input-group-text"><i className="bi bi-lock-fill"></i></span>
                        <input
                          className="form-control"
                          type="password"
                          placeholder="Re-enter password"
                          value={newUser.confirmPassword}
                          onChange={e => setNewUser(p => ({ ...p, confirmPassword: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleAddUser()}
                        />
                      </div>
                    </div>
                    <button className="btn btn-primary w-100" onClick={handleAddUser}>
                      <i className="bi bi-person-plus me-2"></i>Create User
                    </button>

                    {/* Existing users list */}
                    {getUsers().length > 0 && (
                      <div className="mt-3">
                        <small className="text-muted fw-semibold d-block mb-2">Existing Users:</small>
                        <div className="d-flex flex-wrap gap-2">
                          {getUsers().map((u, i) => (
                            <span key={i} className="badge bg-secondary bg-opacity-10 text-secondary border px-2 py-1">
                              <i className="bi bi-person me-1"></i>{u.username}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Change Password ── */}
                {modalTab === "change" && (
                  <div>
                    {pwdMsg.text && (
                      <div className={`alert alert-${pwdMsg.type} py-2 small`}>
                        {pwdMsg.text}
                      </div>
                    )}
                    <div className="mb-3">
                      <label className="form-label fw-semibold small">Username <span className="text-danger">*</span></label>
                      <div className="input-group">
                        <span className="input-group-text"><i className="bi bi-person"></i></span>
                        <input
                          className="form-control"
                          placeholder="Your username"
                          value={pwdForm.username}
                          onChange={e => setPwdForm(p => ({ ...p, username: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="form-label fw-semibold small">Current Password <span className="text-danger">*</span></label>
                      <div className="input-group">
                        <span className="input-group-text"><i className="bi bi-lock"></i></span>
                        <input
                          className="form-control"
                          type="password"
                          placeholder="Current password"
                          value={pwdForm.oldPassword}
                          onChange={e => setPwdForm(p => ({ ...p, oldPassword: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="form-label fw-semibold small">New Password <span className="text-danger">*</span></label>
                      <div className="input-group">
                        <span className="input-group-text"><i className="bi bi-lock-fill"></i></span>
                        <input
                          className="form-control"
                          type="password"
                          placeholder="New password (min 4 chars)"
                          value={pwdForm.newPassword}
                          onChange={e => setPwdForm(p => ({ ...p, newPassword: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="form-label fw-semibold small">Confirm New Password <span className="text-danger">*</span></label>
                      <div className="input-group">
                        <span className="input-group-text"><i className="bi bi-lock-fill"></i></span>
                        <input
                          className="form-control"
                          type="password"
                          placeholder="Re-enter new password"
                          value={pwdForm.confirmNew}
                          onChange={e => setPwdForm(p => ({ ...p, confirmNew: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                        />
                      </div>
                    </div>
                    <button className="btn btn-warning w-100 text-dark fw-semibold" onClick={handleChangePassword}>
                      <i className="bi bi-key me-2"></i>Change Password
                    </button>
                  </div>
                )}
              </div>

              {/* Footer note */}
              <div className="modal-footer border-0 pt-0 justify-content-center">
                <small className="text-muted">
                  <i className="bi bi-shield-lock me-1"></i>
                  User data is stored locally on this device.
                </small>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Footer;