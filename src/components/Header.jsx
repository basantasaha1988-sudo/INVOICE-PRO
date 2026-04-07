import React, { useState, useEffect, useRef } from "react";
import { useTheme, useAuth } from "../App";

const Header = ({ onNavigate, currentPage }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const { currentTheme, themes, setTheme } = useTheme();
  const { user, logout } = useAuth();

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    console.log("Searching for:", searchQuery);
  };

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      logout();
    }
  };

  const allowedThemes = [
    "light", "dark", "red", "blue", "green", "yellow",
    "gold", "black", "neon-green", "black-lemon", "dark-yellow",
  ];

  const themeColors = {
    light: "#f8fafc",
    dark: "#1e293b",
    red: "#fee2e2",
    blue: "#eff6ff",
    green: "#f0fdf4",
    yellow: "#fef3c7",
    gold: "#fcf8e3",
    black: "#141414",
    "neon-green": "#0a0f0a",
    "black-lemon": "#0f0f0f",
    "dark-yellow": "#282514",
  };

  const getThemeDisplayName = (theme) => {
    return theme
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowThemeDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close mobile menu when navigating
  const handleNavigate = (page) => {
    onNavigate && onNavigate(page);
    setIsMenuOpen(false);
  };

  return (
    <header className="glass-card py-3 shadow-lg fade-in-up">
      <nav className="navbar navbar-expand-lg">
        <div className="container-fluid">

          {/* Brand */}
          <button
            className="navbar-brand fw-bold fs-3 text-primary d-flex align-items-center border-0 bg-transparent p-0"
            onClick={() => handleNavigate('home')}
          >
            <i className="bi bi-receipt me-2"></i>
            InvoicePro
          </button>

          {/* Mobile Toggle */}
          <button
            className="navbar-toggler border-0 shadow-none"
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle navigation"
          >
            <i
              className={`bi ${isMenuOpen ? "bi-x-lg" : "bi-list"}`}
              style={{ fontSize: "1.5rem" }}
            ></i>
          </button>

          {/* Navbar Content */}
          <div className={`navbar-collapse ${isMenuOpen ? "show" : ""}`}>

            {/* Left Navigation */}
            <ul className="navbar-nav me-auto mb-2 mb-lg-0">

              {/* ✅ RENAMED: Home → Sale Invoice Booking */}
              <li className="nav-item">
                <button
                  className={`nav-link fw-semibold border-0 bg-transparent ${currentPage === 'home' ? 'active' : ''}`}
                  onClick={() => handleNavigate('home')}
                >
                  <i className="bi bi-receipt-cutoff me-1"></i>
                  Sale Invoice Booking
                </button>
              </li>

              <li className="nav-item">
                <button
                  className={`nav-link fw-semibold border-0 bg-transparent ${currentPage === 'dashboard' ? 'active' : ''}`}
                  onClick={() => handleNavigate('dashboard')}
                >
                  <i className="bi bi-bar-chart me-1"></i>Dashboard
                </button>
              </li>

              {/* ✅ Inventory nav — uses onNavigate prop */}
              <li className="nav-item">
                <button
                  className={`nav-link fw-semibold border-0 bg-transparent ${currentPage === 'inventory' ? 'active' : ''}`}
                  onClick={() => handleNavigate('inventory')}
                >
                  <i className="bi bi-boxes me-1"></i>Inventory
                </button>
              </li>

            </ul>

            {/* Search */}
            <form className="d-flex me-3" onSubmit={handleSearch}>
              <div className="input-group" style={{ maxWidth: "320px" }}>
                <span className="input-group-text bg-transparent border-end-0">
                  <i className="bi bi-search text-muted"></i>
                </span>
                <input
                  className="form-control border-start-0 bg-transparent"
                  type="search"
                  placeholder="Search bills, items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search"
                />
              </div>
            </form>

            {/* Masters Buttons */}
            <div className="d-flex gap-2 me-3 flex-wrap">
              <button
                className="btn btn-outline-primary btn-sm"
                data-bs-toggle="modal"
                data-bs-target="#itemModal"
                title="Item Master"
              >
                <i className="bi bi-box-seam me-1"></i> Items
              </button>
              <button
                className="btn btn-outline-success btn-sm"
                data-bs-toggle="modal"
                data-bs-target="#companyModal"
                title="Company Master"
              >
                <i className="bi bi-building me-1"></i> Companies
              </button>
            </div>

            {/* User Section */}
            <div className="d-flex align-items-center gap-3 me-3">
              <div className="user-info text-end">
                <div className="fw-semibold small">{user?.username || "Guest"}</div>
                <small className="text-muted">Welcome</small>
              </div>
              <button
                className="btn btn-outline-danger btn-sm px-3"
                onClick={handleLogout}
                title="Logout"
              >
                <i className="bi bi-box-arrow-right"></i>
              </button>
            </div>

            {/* Theme Selector */}
            <div className="position-relative" ref={dropdownRef}>
              <button
                className="btn btn-sm p-2 theme-toggle border-0 d-flex align-items-center gap-2"
                type="button"
                onClick={() => setShowThemeDropdown(!showThemeDropdown)}
                title={`Current theme: ${getThemeDisplayName(currentTheme)}`}
              >
                <i className="bi bi-palette-fill" style={{ fontSize: "1.35rem" }}></i>
                <span className="d-none d-lg-inline small fw-medium">Theme</span>
                <i className={`bi ${showThemeDropdown ? 'bi-chevron-up' : 'bi-chevron-down'} ms-1 small`}></i>
              </button>

              {showThemeDropdown && (
                <div className="dropdown-menu-custom shadow-lg border-0 mt-1">
                  <div className="px-3 py-2 border-bottom" style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                    Choose Theme
                  </div>
                  {allowedThemes.map((theme) => (
                    <button
                      key={theme}
                      className={`w-100 text-start border-0 px-3 py-2 d-flex align-items-center gap-3 rounded-start ${
                        currentTheme === theme ? "bg-primary text-white" : "text-dark hover-primary"
                      }`}
                      style={{ margin: '1px 0', cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTheme(theme);
                        setShowThemeDropdown(false);
                      }}
                    >
                      <div
                        className="rounded-circle flex-shrink-0 border"
                        style={{
                          width: "32px",
                          height: "32px",
                          backgroundColor: themeColors[theme] || "#64748b",
                          border: `2px solid ${currentTheme === theme ? '#ffffff' : 'rgba(0,0,0,0.1)'}`,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}
                      />
                      <div className="flex-grow-1">
                        <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                          {getThemeDisplayName(theme)}
                        </div>
                      </div>
                      {currentTheme === theme && (
                        <i className="bi bi-check-circle-fill text-success"></i>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </nav>
    </header>
  );
};

export default Header;
