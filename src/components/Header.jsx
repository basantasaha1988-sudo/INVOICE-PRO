import React, { useState, useEffect, useRef } from "react";
import { Modal } from "bootstrap";
import { useTheme, useAuth } from "../App";
import { PackageSearch, Landmark, Dessert, Pyramid, User, CreditCard, ReceiptText, ClipboardMinus, CirclePile, ArchiveRestore, ClipboardPenLine, ReceiptIndianRupee, Receipt } from "lucide-react";

const Header = ({ onNavigate, currentPage }) => {
  const [showUserDropdown,       setShowUserDropdown]       = useState(false);
  const [isMenuOpen,             setIsMenuOpen]             = useState(false);
  const [searchQuery,            setSearchQuery]            = useState("");
  const [showThemeDropdown,      setShowThemeDropdown]      = useState(false);
  const [showMasterDropdown,     setShowMasterDropdown]     = useState(false);
  const [showTransactionDropdown,setShowTransactionDropdown]= useState(false);

  const userDropdownRef        = useRef(null);
  const themeDropdownRef       = useRef(null);
  const menuRef                = useRef(null);
  const toggleRef              = useRef(null);
  const masterDropdownRef      = useRef(null);
  const transactionDropdownRef = useRef(null);

  const { currentTheme, setTheme } = useTheme();
  const { user, logout }           = useAuth();

  const themes = [
    { id: "green",  label: "Green",  dot: "#22c55e" },
    { id: "gray",   label: "Gray",   dot: "#8a8d9e" },
    { id: "red",    label: "Red",    dot: "#ef4444" },
    { id: "orange", label: "Orange", dot: "#f97316" },
    { id: "yellow", label: "Yellow", dot: "#eab308" },
    { id: "purple", label: "Purple", dot: "#a855f7" },
  ];

  // All pages now live inside the Transactions dropdown
  const transactionPages = [
    { page: "home",          label: "Sale Invoice",    icon: null, lucideIcon: ReceiptText,            color: "#1a56db", colorBg: "rgba(26,86,219,0.12)",  desc: "Create & manage sale bills" },
    { page: "dashboard",     label: "Dashboard",       icon: null, lucideIcon: ClipboardMinus,     color: "#7e3af2", colorBg: "rgba(126,58,242,0.12)", desc: "Analytics & overview" },
    { page: "inventory",     label: "Inventory",       icon: null, lucideIcon: CirclePile,              color: "#0891b2", colorBg: "rgba(8,145,178,0.12)",  desc: "Stock levels & transfers" },
    { page: "consumption",   label: "Consumption",     icon: null, lucideIcon: ArchiveRestore,               color: "#f97316", colorBg: "rgba(249,115,22,0.12)", desc: "Material consumption log" },
    { page: "vendorinvoice", label: "Vendor Invoice",  icon: null, lucideIcon: ClipboardPenLine,  color: "#d97706", colorBg: "rgba(217,119,6,0.12)",  desc: "Purchase invoices from suppliers" },
    { page: "vendorpayment", label: "Vendor Payment",  icon: null, lucideIcon: ReceiptIndianRupee,         color: "#16a34a", colorBg: "rgba(22,163,74,0.12)",  desc: "Outgoing supplier payments" },
    { page: "reciptpayment", label: "Receipt Payment", icon: null, lucideIcon: Receipt,          color: "#dc2626", colorBg: "rgba(220,38,38,0.12)",  desc: "Customer receipts & collection" },
  ];

  const masterItems = [
    { label: "Items",       icon: null, lucideIcon: PackageSearch,          description: "Manage product items",        cls: "g-btn-warning",   target: "#itemModal",          color: "#f97316", colorBg: "rgba(249,115,22,0.12)" },
    { label: "Companies",   icon: null, lucideIcon: Landmark,     description: "Configure companies",          cls: "g-btn-success",   target: "#companyModal",       color: "#16a34a", colorBg: "rgba(22,163,74,0.12)" },
    { label: "Projects",    icon: null, lucideIcon: Pyramid,    description: "Manage projects",              cls: "g-btn-info",      target: "#projectModal",       color: "#0891b2", colorBg: "rgba(8,145,178,0.12)" },
    { label: "Customers",   icon: null, lucideIcon: Dessert, description: "Maintain customers",           cls: "g-btn-cyan",      target: "#customerModal",      color: "#7c3aed", colorBg: "rgba(124,58,237,0.12)" },
    { label: "Suppliers",   icon: null, lucideIcon: User,        description: "Manage suppliers",             cls: "g-btn-secondary", target: "#supplierModal",      color: "#dc2626", colorBg: "rgba(220,38,38,0.12)" },
    { label: "Pay Methods", icon: null, lucideIcon: CreditCard, rotate: 45,  description: "Configure payment methods",    cls: "g-btn-primary",   target: "#paymentMethodModal", color: "#1a56db", colorBg: "rgba(26,86,219,0.12)" },
  ];

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current   && !menuRef.current.contains(e.target) &&
          toggleRef.current && !toggleRef.current.contains(e.target)) setIsMenuOpen(false);
      if (userDropdownRef.current        && !userDropdownRef.current.contains(e.target))        setShowUserDropdown(false);
      if (themeDropdownRef.current       && !themeDropdownRef.current.contains(e.target))       setShowThemeDropdown(false);
      if (masterDropdownRef.current      && !masterDropdownRef.current.contains(e.target))      setShowMasterDropdown(false);
      if (transactionDropdownRef.current && !transactionDropdownRef.current.contains(e.target)) setShowTransactionDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleNavigate = (page) => {
    onNavigate?.(page);
    setIsMenuOpen(false);
    setShowTransactionDropdown(false);
  };

  const handleMasterClick = (target) => {
    setShowMasterDropdown(false);
    setTimeout(() => {
      const element = document.querySelector(target);
      if (element) {
        // Clean up any stale backdrops from previous modal instances
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
        const bsModal = Modal.getOrCreateInstance(element);
        bsModal.show();
      }
    }, 0);
  };

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      logout();
      onNavigate("login");
      setShowUserDropdown(false);
      setIsMenuOpen(false);
    }
  };

  // Is any transaction page currently active?
  const isTransactionActive = transactionPages.some(p => p.page === currentPage);
  const activeTransactionLabel = transactionPages.find(p => p.page === currentPage)?.label || "Transactions";

  const dropdownStyle = {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    zIndex: 200,
    minWidth: 300,
    background: "rgba(255,255,255,0.97)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1.5px solid rgba(200,200,240,0.55)",
    borderRadius: 16,
    boxShadow: "0 20px 56px rgba(100,100,200,0.22)",
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
      <header
        className="glass-card shadow-lg"
        style={{ position: "relative", zIndex: 100, borderRadius: '16px', marginBottom: 0 }}
      >
        <nav className="navbar px-3 py-2" style={{ minHeight: 60 }}>

          {/* ── Logo ─────────────────────────────────────────────────────── */}
          <button
            className="navbar-brand fw-bold fs-3 text-primary border-0 bg-transparent p-0 me-3 d-flex align-items-center gap-2"
            onClick={() => handleNavigate("home")}
            style={{ letterSpacing: '-0.5px' }}
          >
            <img src="/invoice-pro-logo.png" alt="InvoicePro Logo"
              style={{ height: '45px', width: 'auto', objectFit: 'contain' }} />
            <span className="d-none d-sm-inline">InvoicePro</span>
          </button>

          {/* ── Desktop nav ───────────────────────────────────────────────── */}
          <div className="d-none d-lg-flex align-items-center flex-grow-1 gap-2">

            {/* ── TRANSACTIONS dropdown ──────────────────────────────────── */}
            <div style={{ position: "relative" }} ref={transactionDropdownRef}>
              <button
                className="g-btn g-btn-primary d-flex align-items-center gap-2"
                onClick={() => setShowTransactionDropdown(v => !v)}
                style={{ whiteSpace: 'nowrap' }}
              >
                <i className="bi bi-grid-3x3-gap-fill"></i>
                <span>Transactions</span>
                {isTransactionActive && (
                  <span style={{
                    background: 'rgba(255,255,255,0.25)', borderRadius: 20,
                    padding: '1px 8px', fontSize: 11, fontWeight: 600,
                  }}>
                    {activeTransactionLabel}
                  </span>
                )}
                <i className={`bi ${showTransactionDropdown ? "bi-chevron-up" : "bi-chevron-down"} small`}></i>
              </button>

              {showTransactionDropdown && (
                <ul style={{ ...dropdownStyle, minWidth: 320 }}>
                  {/* Header */}
                  <li style={{ padding: '10px 14px 8px', borderBottom: '1.5px solid rgba(200,200,240,0.35)', marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#667', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      <i className="bi bi-grid-3x3-gap-fill me-2" style={{ color: '#1a56db' }}></i>Transaction Modules
                    </div>
                  </li>

                  {transactionPages.map(item => (
                    <li key={item.page} style={{ marginBottom: 3 }}>
                      <button
                        onClick={() => handleNavigate(item.page)}
                        style={{
                          ...dropdownItem,
                          padding: '11px 14px',
                          display: 'flex', alignItems: 'center', gap: 12,
                          borderRadius: 10,
                          background: currentPage === item.page ? item.colorBg : 'transparent',
                          justifyContent: 'space-between',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = item.colorBg}
                        onMouseLeave={e => e.currentTarget.style.background = currentPage === item.page ? item.colorBg : 'transparent'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                          <span style={{
                            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                            background: item.colorBg, color: item.color, fontSize: 17,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {item.lucideIcon ? <item.lucideIcon size={17} /> : <i className={`bi ${item.icon}`}></i>}
                          </span>
                          <div style={{ textAlign: 'left', flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 13.5, color: currentPage === item.page ? item.color : '#1e293b', marginBottom: 1 }}>
                              {item.label}
                            </div>
                            <div style={{ fontSize: 11, color: '#999' }}>{item.desc}</div>
                          </div>
                        </div>
                        {currentPage === item.page
                          ? <i className="bi bi-check-circle-fill" style={{ color: item.color, fontSize: 15, flexShrink: 0 }}></i>
                          : <i className="bi bi-chevron-right" style={{ color: '#ccc', fontSize: 11, flexShrink: 0 }}></i>
                        }
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* spacer */}
            <div style={{ flex: 1 }} />

            {/* ── Search ───────────────────────────────────────────────── */}
            <form className="d-flex me-1" onSubmit={e => e.preventDefault()} style={{ minWidth: 180 }}>
              <input
                className="form-control form-control-sm"
                placeholder="Search bills, items..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ borderRadius: 20 }}
              />
            </form>

            {/* ── Masters dropdown ─────────────────────────────────────── */}
            <div style={{ position: "relative" }} ref={masterDropdownRef}>
              <button
                className="g-btn g-btn-info d-flex align-items-center gap-2"
                onClick={() => setShowMasterDropdown(v => !v)}
                style={{ whiteSpace: 'nowrap' }}
              >
                <i className="bi bi-sliders2"></i>
                <span>Masters</span>
                <i className={`bi ${showMasterDropdown ? "bi-chevron-up" : "bi-chevron-down"} small`}></i>
              </button>

              {showMasterDropdown && (
                <ul style={{ ...dropdownStyle, left: 'auto', right: 0, minWidth: 320, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
                  <li style={{ padding: '10px 14px 8px', borderBottom: "1.5px solid rgba(200,200,240,0.35)", marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#667', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      <i className="bi bi-gear-fill me-2"></i>Master Data Management
                    </div>
                  </li>
                  {masterItems.map(item => (
                    <li key={item.label} style={{ marginBottom: 4 }}>
                      <button
                        style={{ ...dropdownItem, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between', borderRadius: 10 }}
                        onMouseEnter={e => e.currentTarget.style.background = item.colorBg}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        onClick={() => handleMasterClick(item.target)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 10, background: item.colorBg, color: item.color, fontSize: 18, flexShrink: 0 }}>
                            {item.lucideIcon ? <item.lucideIcon size={18} style={item.rotate ? { transform: `rotate(${item.rotate}deg)` } : {}} /> : <i className={`bi ${item.icon}`}></i>}
                          </span>
                          <div style={{ textAlign: 'left', flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 13.5, color: item.color, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {item.lucideIcon ? <item.lucideIcon size={14} style={item.rotate ? { transform: `rotate(${item.rotate}deg)` } : {}} /> : <i className={`bi ${item.icon}`} style={{ fontSize: 14 }}></i>}
                              {item.label}
                            </div>
                            <div style={{ fontSize: 11, color: '#999' }}>{item.description}</div>
                          </div>
                        </div>
                        <i className="bi bi-chevron-right small" style={{ color: item.color, opacity: 0.4, flexShrink: 0, marginLeft: 8 }}></i>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ── User dropdown ─────────────────────────────────────────── */}
            <div style={{ position: "relative" }} ref={userDropdownRef}>
              {user && (
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
                    <ul style={{ ...dropdownStyle, left: 'auto', right: 0 }}>
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
              )}
            </div>

            {/* ── Theme dropdown ────────────────────────────────────────── */}
            <div style={{ position: "relative" }} ref={themeDropdownRef}>
              <button
                className="g-btn g-btn-success d-flex align-items-center gap-2"
                onClick={() => setShowThemeDropdown(v => !v)}
                style={{ whiteSpace: 'nowrap' }}
              >
                <i className="bi bi-palette"></i>
                <span>Theme</span>
                <i className={`bi ${showThemeDropdown ? "bi-chevron-up" : "bi-chevron-down"} small`}></i>
              </button>
              {showThemeDropdown && (
                <ul style={{ ...dropdownStyle, left: 'auto', right: 0, minWidth: 200 }}>
                  <li style={{ padding: '10px 14px 8px', borderBottom: "1.5px solid rgba(200,200,240,0.35)", marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#667', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      <i className="bi bi-palette-fill me-2"></i>Select Theme
                    </div>
                  </li>
                  {themes.map(t => (
                    <li key={t.id} style={{ marginBottom: 4 }}>
                      <button style={{
                        ...dropdownItem,
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10,
                        background: currentTheme === t.id ? "rgba(34,197,94,0.1)" : "transparent",
                        fontWeight: currentTheme === t.id ? 700 : 600,
                        color: currentTheme === t.id ? "#22c55e" : "#334",
                        width: '100%', justifyContent: 'space-between',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(34,197,94,0.08)"}
                        onMouseLeave={e => e.currentTarget.style.background = currentTheme === t.id ? "rgba(34,197,94,0.1)" : "transparent"}
                        onClick={() => { setTheme(t.id); setShowThemeDropdown(false); }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                          <span style={{ width: 12, height: 12, borderRadius: "50%", background: t.dot, boxShadow: `0 0 8px ${t.dot}` }} />
                          {t.label}
                        </div>
                        {currentTheme === t.id && <i className="bi bi-check2-circle" style={{ color: '#22c55e', fontSize: 14 }}></i>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

          </div>

          {/* ── Mobile: current page badge + hamburger ────────────────────── */}
          <div className="d-flex d-lg-none align-items-center gap-2 ms-auto">
            <span className="badge" style={{
              background: 'rgba(26,86,219,0.12)', color: '#1a56db',
              border: '1px solid rgba(26,86,219,0.25)',
              fontWeight: 700, fontSize: 11, padding: '5px 10px', borderRadius: 20
            }}>
              {transactionPages.find(p => p.page === currentPage)?.label || 'Menu'}
            </span>
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

      {/* ── Mobile slide-down menu ──────────────────────────────────────────── */}
      {isMenuOpen && (
        <>
          <div onClick={() => setIsMenuOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(10,10,30,0.35)', backdropFilter: 'blur(2px)' }}
          />
          <div ref={menuRef} style={{
            position: 'fixed', top: 70, left: 12, right: 12, zIndex: 950,
            background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)', borderRadius: 18,
            border: '1.5px solid rgba(200,200,240,0.5)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            padding: '12px 14px 16px',
            maxHeight: 'calc(100dvh - 90px)', overflowY: 'auto',
          }}>

            {/* Transactions section */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#aab', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, paddingLeft: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="bi bi-grid-3x3-gap-fill" style={{ color: '#1a56db' }}></i> Transactions
              </div>
              {transactionPages.map(({ page, label, icon, lucideIcon, color, colorBg }) => (
                <button key={page} onClick={() => handleNavigate(page)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', padding: '11px 14px', borderRadius: 12,
                    border: 'none', cursor: 'pointer',
                    background: currentPage === page ? colorBg : 'transparent',
                    color: currentPage === page ? color : '#334',
                    fontWeight: currentPage === page ? 700 : 600,
                    fontSize: 14, transition: 'background 0.15s', textAlign: 'left', marginBottom: 2,
                  }}
                >
                  <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: colorBg, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {lucideIcon ? <lucideIcon size={15} /> : <i className={`bi ${icon}`} style={{ fontSize: 15 }}></i>}
                  </span>
                  {label}
                  {currentPage === page && <i className="bi bi-check2 ms-auto" style={{ color }}></i>}
                </button>
              ))}
            </div>

            <div style={{ height: 1, background: 'rgba(200,200,240,0.4)', margin: '10px 0' }} />

            {/* Search */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#aab', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, paddingLeft: 4 }}>Search</div>
              <input className="form-control" placeholder="Search bills, items..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                style={{ borderRadius: 12 }} />
            </div>

            <div style={{ height: 1, background: 'rgba(200,200,240,0.4)', margin: '10px 0' }} />

            {/* Master Data */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#aab', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 4 }}>
                <i className="bi bi-gear-fill me-2"></i>Master Data
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {masterItems.map(item => (
                  <button key={item.label} className={`g-btn ${item.cls} g-btn-sm`}
                    onClick={() => { handleMasterClick(item.target); setIsMenuOpen(false); }}
                    style={{ width: '100%', justifyContent: 'flex-start', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', fontWeight: 600, fontSize: 13 }}>
                    {item.lucideIcon ? <item.lucideIcon size={16} style={item.rotate ? { transform: `rotate(${item.rotate}deg)` } : {}} /> : <i className={`bi ${item.icon}`} style={{ fontSize: 16 }}></i>}
                    <span>{item.label}</span>
                    <small style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>{item.description}</small>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: 'rgba(200,200,240,0.4)', margin: '10px 0' }} />

            {/* User + Theme */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {user && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, padding: '8px 12px', background: 'rgba(26,86,219,0.06)', borderRadius: 12, border: '1px solid rgba(26,86,219,0.15)' }}>
                  <i className="bi bi-person-circle" style={{ color: '#1a56db', fontSize: 18 }}></i>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#1a56db' }}>{user.username}</span>
                  <button onClick={handleLogout}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 8px', borderRadius: 8 }}>
                    <i className="bi bi-box-arrow-right me-1"></i>Logout
                  </button>
                </div>
              )}
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
                        fontWeight: currentTheme === t.id ? 700 : 500, fontSize: 12, color: '#334',
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