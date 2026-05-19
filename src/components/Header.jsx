import React, { useState, useEffect, useRef } from "react";
import { useTheme, useAuth } from "../App";

const Header = ({ onNavigate, currentPage }) => {
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [isMenuOpen, setIsMenuOpen]             = useState(false);
  const [searchQuery, setSearchQuery]           = useState("");
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const userDropdownRef  = useRef(null);
  const themeDropdownRef = useRef(null);

  const { currentTheme, setTheme } = useTheme();
  const { user, logout }           = useAuth();

  // ── 6 themes only ──────────────────────────────
  const themes = [
    { id: "green",  label: "🟢 Green",  dot: "#22c55e" },
    { id: "black",  label: "⚫ Black",  dot: "#141414" },
    { id: "red",    label: "🔴 Red",    dot: "#ef4444" },
    { id: "orange", label: "🟠 Orange", dot: "#f97316" },
    { id: "yellow", label: "🟡 Yellow", dot: "#eab308" },
    { id: "purple", label: "🟣 Purple", dot: "#a855f7" },
  ];

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
  };

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      logout();
      onNavigate("login");
      setShowUserDropdown(false);
    }
  };

  const handleNavigate = (page) => {
    onNavigate && onNavigate(page);
    setIsMenuOpen(false);
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (userDropdownRef.current  && !userDropdownRef.current.contains(e.target))  setShowUserDropdown(false);
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(e.target)) setShowThemeDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const dropdownStyle = {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    zIndex: 99999,
    minWidth: 180,
    background: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1.5px solid rgba(200,200,240,0.55)",
    borderRadius: 14,
    boxShadow: "0 16px 48px rgba(100,100,200,0.18)",
    padding: "6px",
    listStyle: "none",
    margin: 0,
  };

  const dropdownItemStyle = {
    display: "block",
    width: "100%",
    padding: "9px 14px",
    borderRadius: 9,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "inherit",
    color: "#334",
    textAlign: "left",
    transition: "background 0.15s",
  };

  return (
    <header style={{ position: "relative", zIndex: 1000 }} className="glass-card py-3 shadow-lg">
      <nav className="navbar navbar-expand-lg">
        <div className="container-fluid">

          {/* Brand */}
          <button
            className="navbar-brand fw-bold fs-3 text-primary border-0 bg-transparent"
            onClick={() => handleNavigate("home")}
          >
            InvoicePro
          </button>

          {/* Mobile Toggle */}
          <button className="navbar-toggler border-0" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            <i className={`bi ${isMenuOpen ? "bi-x-lg" : "bi-list"}`}></i>
          </button>

          <div className={`navbar-collapse ${isMenuOpen ? "show" : ""}`}>

            {/* Navigation Links */}
            <ul className="navbar-nav me-auto">
              {[
                { page: "home",          label: "Sale Invoice" },
                { page: "dashboard",     label: "Dashboard" },
                { page: "inventory",     label: "Inventory" },
                { page: "reciptpayment", label: "Receipt Payment" },
              ].map(({ page, label }) => (
                <li key={page} className="nav-item">
                  <button
                    className={`nav-link border-0 bg-transparent ${currentPage === page ? "active" : ""}`}
                    onClick={() => handleNavigate(page)}
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>

            {/* Search */}
            <form className="d-flex me-3" onSubmit={handleSearch}>
              <input
                className="form-control"
                placeholder="Search bills, items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>

            {/* Masters */}
            <div className="d-flex gap-2 me-3">
              <button className="g-btn g-btn-ghost g-btn-sm"   data-bs-toggle="modal" data-bs-target="#itemModal">Items</button>
              <button className="g-btn g-btn-success g-btn-sm" data-bs-toggle="modal" data-bs-target="#companyModal">Companies</button>
              <button className="g-btn g-btn-cyan g-btn-sm"    data-bs-toggle="modal" data-bs-target="#customerModal">Customers</button>
            </div>

            {/* User Dropdown */}
            <div className="me-3" style={{ position: "relative" }} ref={userDropdownRef}>
              {user ? (
                <>
                  <button
                    className="g-btn g-btn-silver d-flex align-items-center gap-2"
                    onClick={() => setShowUserDropdown(v => !v)}
                  >
                    <i className="bi bi-person-circle"></i>
                    <span>{user.username}</span>
                    <i className={`bi ${showUserDropdown ? "bi-chevron-up" : "bi-chevron-down"} small`}></i>
                  </button>

                  {showUserDropdown && (
                    <ul style={dropdownStyle}>
                      <li style={{ padding: "8px 14px 10px", borderBottom: "1px solid rgba(200,200,240,0.4)", marginBottom: 4 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{user.username}</div>
                        <small style={{ color: "#889", fontSize: 11 }}>Logged in</small>
                      </li>
                      <li>
                        <button
                          style={{ ...dropdownItemStyle, color: "#dc2626" }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(220,38,38,0.07)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          onClick={handleLogout}
                        >
                          <i className="bi bi-box-arrow-right me-2"></i>Logout
                        </button>
                      </li>
                    </ul>
                  )}
                </>
              ) : (
                <button className="g-btn g-btn-primary" onClick={() => handleNavigate("login")}>Login</button>
              )}
            </div>

            {/* Theme Dropdown */}
            <div style={{ position: "relative" }} ref={themeDropdownRef}>
              <button
                className="g-btn g-btn-ghost g-btn-sm"
                onClick={() => setShowThemeDropdown(v => !v)}
              >
                <i className="bi bi-palette me-1"></i>Theme
              </button>

              {showThemeDropdown && (
                <ul style={{ ...dropdownStyle, minWidth: 160 }}>
                  {themes.map(t => (
                    <li key={t.id}>
                      <button
                        style={{
                          ...dropdownItemStyle,
                          background: currentTheme === t.id ? "rgba(26,86,219,0.08)" : "transparent",
                          fontWeight: currentTheme === t.id ? 700 : 600,
                        }}
                        onMouseEnter={e => { if (currentTheme !== t.id) e.currentTarget.style.background = "rgba(100,100,200,0.07)"; }}
                        onMouseLeave={e => { if (currentTheme !== t.id) e.currentTarget.style.background = "transparent"; }}
                        onClick={() => { setTheme(t.id); setShowThemeDropdown(false); }}
                      >
                        <span style={{
                          display: "inline-block", width: 10, height: 10,
                          borderRadius: "50%", background: t.dot,
                          marginRight: 8, verticalAlign: "middle",
                          boxShadow: `0 0 6px ${t.dot}`,
                        }} />
                        {t.label.slice(3)}
                        {currentTheme === t.id && <i className="bi bi-check2 ms-2 text-primary"></i>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

          </div>
        </div>
      </nav>
    </header>
  );
};

export default Header;
