import React, { useState, useEffect, useRef } from "react";
import { useTheme, useAuth } from "../App";

const Header = ({ onNavigate, currentPage }) => {
  const [showUserDropdown,  setShowUserDropdown]  = useState(false);
  const [isMenuOpen,        setIsMenuOpen]        = useState(false);
  const [searchQuery,       setSearchQuery]       = useState("");
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);

  const userDropdownRef  = useRef(null);
  const themeDropdownRef = useRef(null);
  const menuRef          = useRef(null);
  const toggleRef        = useRef(null);

  const { currentTheme, setTheme } = useTheme();
  const { user, logout }           = useAuth();

  const themes = [
    { id: "green",  label: "Green",  dot: "#22c55e" },
    { id: "black",  label: "Black",  dot: "#141414" },
    { id: "red",    label: "Red",    dot: "#ef4444" },
    { id: "orange", label: "Orange", dot: "#f97316" },
    { id: "yellow", label: "Yellow", dot: "#eab308" },
    { id: "purple", label: "Purple", dot: "#a855f7" },
  ];

  const navPages = [
    { page: "home",          label: "Sale Invoice",    icon: "bi-receipt" },
    { page: "dashboard",     label: "Dashboard",       icon: "bi-bar-chart-line" },
    { page: "inventory",     label: "Inventory",       icon: "bi-boxes" },
    { page: "reciptpayment", label: "Receipt Payment", icon: "bi-cash-coin" },
  ];

  const masterBtns = [
    { label: "Items",       cls: "g-btn-warning",  target: "#itemModal" },
    { label: "Companies",   cls: "g-btn-success",  target: "#companyModal" },
    { label: "Customers",   cls: "g-btn-cyan",     target: "#customerModal" },
    { label: "Pay Methods", cls: "g-btn-primary",  target: "#paymentMethodModal" },
  ];

  // Close mobile menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (
        menuRef.current   && !menuRef.current.contains(e.target) &&
        toggleRef.current && !toggleRef.current.contains(e.target)
      ) setIsMenuOpen(false);
      if (userDropdownRef.current  && !userDropdownRef.current.contains(e.target))  setShowUserDropdown(false);
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(e.target)) setShowThemeDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close mobile menu on page navigate
  const handleNavigate = (page) => {
    onNavigate?.(page);
    setIsMenuOpen(false);
  };

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      logout();
      onNavigate("login");
      setShowUserDropdown(false);
      setIsMenuOpen(false);
    }
  };

  // ── Shared dropdown style ──────────────────────────────
  const dropdownStyle = {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    zIndex: 200,
    minWidth: 180,
    background: "rgba(255,255,255,0.95)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1.5px solid rgba(200,200,240,0.55)",
    borderRadius: 14,
    boxShadow: "0 16px 48px rgba(100,100,200,0.22)",
    padding: "6px",
    listStyle: "none",
    margin: 0,
  };

  const dropdownItem = {
    display: "block", width: "100%",
    padding: "9px 14px", borderRadius: 9,
    border: "none", background: "transparent",
    cursor: "pointer", fontSize: 13, fontWeight: 600,
    fontFamily: "inherit", color: "#334",
    textAlign: "left", transition: "background 0.15s",
  };

  return (
    <>
      {/* ── Header bar ──────────────────────────────────── */}
      <header
        className="glass-card shadow-lg"
        style={{ position: "relative", zIndex: 100, borderRadius: '16px', marginBottom: 0 }}
      >
        <nav className="navbar px-3 py-2" style={{ minHeight: 60 }}>

          {/* Brand with Logo */}
          <button
            className="navbar-brand fw-bold fs-3 text-primary border-0 bg-transparent p-0 me-3 d-flex align-items-center gap-2"
            onClick={() => handleNavigate("home")}
            style={{ letterSpacing: '-0.5px' }}
          >
            <img 
              src="/invoice-pro-logo.png" 
              alt="InvoicePro Logo" 
              style={{ height: '45px', width: 'auto', objectFit: 'contain' }}
            />
            <span className="d-none d-sm-inline">InvoicePro</span>
          </button>

          {/* ── DESKTOP nav (hidden on mobile) ─────────── */}
          <div className="d-none d-lg-flex align-items-center flex-grow-1 gap-1">

            {/* Page links */}
            <ul className="navbar-nav flex-row me-auto gap-1">
              {navPages.map(({ page, label, icon }) => (
                <li key={page} className="nav-item">
                  <button
                    className={`nav-link border-0 bg-transparent px-3 py-2 rounded-3 fw-semibold ${currentPage === page ? "active" : ""}`}
                    style={{ fontSize: 13, whiteSpace: 'nowrap' }}
                    onClick={() => handleNavigate(page)}
                  >
                    <i className={`bi ${icon} me-1`}></i>{label}
                  </button>
                </li>
              ))}
            </ul>

            {/* Search */}
            <form className="d-flex me-2" onSubmit={e => e.preventDefault()} style={{ minWidth: 180 }}>
              <input
                className="form-control form-control-sm"
                placeholder="Search bills, items..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ borderRadius: 20 }}
              />
            </form>

            {/* Master buttons */}
            <div className="d-flex gap-1 me-2">
              {masterBtns.map(b => (
                <button key={b.label} className={`g-btn ${b.cls} g-btn-sm`}
                  data-bs-toggle="modal" data-bs-target={b.target}>
                  {b.label}
                </button>
              ))}
            </div>

            {/* User dropdown */}
            <div style={{ position: "relative" }} ref={userDropdownRef}>
              {user ? (
                <>
                  <button
                    className="g-btn g-btn-danger d-flex align-items-center gap-2"
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
                        <button style={{ ...dropdownItem, color: "#dc2626" }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(220,38,38,0.07)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          onClick={handleLogout}>
                          <i className="bi bi-box-arrow-right me-2"></i>Logout
                        </button>
                      </li>
                    </ul>
                  )}
                </>
              ) : (
                <button className="g-btn g-btn-primary g-btn-sm" onClick={() => handleNavigate("login")}>Login</button>
              )}
            </div>

            {/* Theme dropdown */}
            <div style={{ position: "relative", marginLeft: 6 }} ref={themeDropdownRef}>
              <button className="g-btn g-btn-info g-btn-sm" onClick={() => setShowThemeDropdown(v => !v)}>
                <i className="bi bi-palette me-1"></i>Theme
              </button>
              {showThemeDropdown && (
                <ul style={{ ...dropdownStyle, minWidth: 160 }}>
                  {themes.map(t => (
                    <li key={t.id}>
                      <button
                        style={{ ...dropdownItem, background: currentTheme === t.id ? "rgba(26,86,219,0.08)" : "transparent", fontWeight: currentTheme === t.id ? 700 : 600 }}
                        onMouseEnter={e => { if (currentTheme !== t.id) e.currentTarget.style.background = "rgba(100,100,200,0.07)"; }}
                        onMouseLeave={e => { if (currentTheme !== t.id) e.currentTarget.style.background = "transparent"; }}
                        onClick={() => { setTheme(t.id); setShowThemeDropdown(false); }}>
                        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: t.dot, marginRight: 8, verticalAlign: "middle", boxShadow: `0 0 6px ${t.dot}` }} />
                        {t.label}
                        {currentTheme === t.id && <i className="bi bi-check2 ms-2 text-primary"></i>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ── MOBILE: right side (current page badge + hamburger) ── */}
          <div className="d-flex d-lg-none align-items-center gap-2 ms-auto">
            {/* Active page label */}
            <span className="badge" style={{
              background: 'rgba(26,86,219,0.12)', color: '#1a56db',
              border: '1px solid rgba(26,86,219,0.25)',
              fontWeight: 700, fontSize: 11, padding: '5px 10px', borderRadius: 20
            }}>
              {navPages.find(p => p.page === currentPage)?.label || 'Menu'}
            </span>

            {/* Hamburger */}
            <button
              ref={toggleRef}
              onClick={() => setIsMenuOpen(v => !v)}
              style={{
                background: isMenuOpen ? 'rgba(26,86,219,0.12)' : 'rgba(255,255,255,0.3)',
                border: '1.5px solid rgba(200,200,240,0.5)',
                borderRadius: 10, width: 40, height: 40,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all 0.2s',
                color: isMenuOpen ? '#1a56db' : '#334',
              }}
              aria-label="Toggle menu"
            >
              <i className={`bi ${isMenuOpen ? "bi-x-lg" : "bi-list"}`} style={{ fontSize: 18 }}></i>
            </button>
          </div>

        </nav>
      </header>

      {/* ── MOBILE dropdown menu — floats OVER content ── */}
      {isMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setIsMenuOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 900,
              background: 'rgba(10,10,30,0.35)',
              backdropFilter: 'blur(2px)',
            }}
          />

          {/* Menu panel */}
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: 70, left: 12, right: 12,
              zIndex: 950,
              background: 'rgba(255,255,255,0.96)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              borderRadius: 18,
              border: '1.5px solid rgba(200,200,240,0.5)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
              padding: '12px 14px 16px',
              maxHeight: 'calc(100dvh - 90px)',
              overflowY: 'auto',
            }}
          >
            {/* Nav links */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#aab', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, paddingLeft: 4 }}>
                Navigation
              </div>
              {navPages.map(({ page, label, icon }) => (
                <button
                  key={page}
                  onClick={() => handleNavigate(page)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', padding: '11px 14px', borderRadius: 12,
                    border: 'none', cursor: 'pointer',
                    background: currentPage === page ? 'rgba(26,86,219,0.1)' : 'transparent',
                    color: currentPage === page ? '#1a56db' : '#334',
                    fontWeight: currentPage === page ? 700 : 600,
                    fontSize: 14, transition: 'background 0.15s', textAlign: 'left',
                    marginBottom: 2,
                  }}
                >
                  <span style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    background: currentPage === page ? 'rgba(26,86,219,0.15)' : 'rgba(100,100,150,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <i className={`bi ${icon}`} style={{ fontSize: 15 }}></i>
                  </span>
                  {label}
                  {currentPage === page && <i className="bi bi-check2 ms-auto" style={{ color: '#1a56db' }}></i>}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'rgba(200,200,240,0.4)', margin: '10px 0' }} />

            {/* Search */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#aab', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, paddingLeft: 4 }}>
                Search
              </div>
              <input
                className="form-control"
                placeholder="Search bills, items..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ borderRadius: 12 }}
              />
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'rgba(200,200,240,0.4)', margin: '10px 0' }} />

            {/* Masters */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#aab', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 4 }}>
                Masters
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {masterBtns.map(b => (
                  <button key={b.label}
                    className={`g-btn ${b.cls} g-btn-sm`}
                    data-bs-toggle="modal" data-bs-target={b.target}
                    onClick={() => setIsMenuOpen(false)}
                    style={{ width: '100%', justifyContent: 'center' }}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'rgba(200,200,240,0.4)', margin: '10px 0' }} />

            {/* User + Theme */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {user && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, padding: '8px 12px', background: 'rgba(26,86,219,0.06)', borderRadius: 12, border: '1px solid rgba(26,86,219,0.15)' }}>
                  <i className="bi bi-person-circle" style={{ color: '#1a56db', fontSize: 18 }}></i>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#1a56db' }}>{user.username}</span>
                  <button
                    onClick={handleLogout}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 8px', borderRadius: 8 }}>
                    <i className="bi bi-box-arrow-right me-1"></i>Logout
                  </button>
                </div>
              )}

              {/* Theme picker inline */}
              <div style={{ width: '100%' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#aab', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 4 }}>Theme</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {themes.map(t => (
                    <button key={t.id} onClick={() => { setTheme(t.id); setIsMenuOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '7px 12px', borderRadius: 20, cursor: 'pointer',
                        border: currentTheme === t.id ? `2px solid ${t.dot}` : '1.5px solid rgba(200,200,240,0.5)',
                        background: currentTheme === t.id ? `rgba(${t.dot.replace('#','').match(/../g).map(x=>parseInt(x,16)).join(',')},0.1)` : 'rgba(255,255,255,0.5)',
                        fontWeight: currentTheme === t.id ? 700 : 500,
                        fontSize: 12, color: '#334',
                      }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.dot, boxShadow: `0 0 6px ${t.dot}`, flexShrink: 0 }} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default Header;