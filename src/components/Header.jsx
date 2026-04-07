import React, { useState, useEffect, useRef } from "react";
import { useTheme, useAuth } from "../App";

const Header = ({ onNavigate, currentPage }) => {
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const userDropdownRef = useRef(null);
  const themeDropdownRef = useRef(null);

  const { currentTheme, setTheme } = useTheme();
  const { user, logout } = useAuth();

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    console.log("Searching for:", searchQuery);
  };

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      logout();
      onNavigate("login");
      setShowUserDropdown(false);
    }
  };

  const toggleUserDropdown = () => setShowUserDropdown(!showUserDropdown);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const allowedThemes = [
    "light", "dark", "red", "blue", "green", "yellow",
    "gold", "black", "neon-green", "black-lemon", "dark-yellow",
  ];

  const themeColors = {
    light: "#497cae",
    dark: "#181a1e",
    red: "#fb0303",
    blue: "#0968e5",
    green: "#82e229",
    yellow: "#e6f607",
    gold: "#fcf8e3",
    black: "#141414",
    "neon-green": "#20cc20",
    "black-lemon": "#df0f0f",
    "dark-yellow": "#f1ce07",
  };

  const getThemeDisplayName = (theme) => {
    return theme
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(event.target)) {
        setShowThemeDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNavigate = (page) => {
    onNavigate && onNavigate(page);
    setIsMenuOpen(false);
  };

  return (
    <header className="glass-card py-3 shadow-lg">
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
          <button
            className="navbar-toggler border-0"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <i className={`bi ${isMenuOpen ? "bi-x-lg" : "bi-list"}`}></i>
          </button>

          <div className={`navbar-collapse ${isMenuOpen ? "show" : ""}`}>

            {/* Navigation */}
            <ul className="navbar-nav me-auto">

              <li className="nav-item">
                <button
                  className={`nav-link border-0 bg-transparent ${currentPage === "home" ? "active" : ""}`}
                  onClick={() => handleNavigate("home")}
                >
                  Sale Invoice Booking
                </button>
              </li>

              <li className="nav-item">
                <button
                  className={`nav-link border-0 bg-transparent ${currentPage === "dashboard" ? "active" : ""}`}
                  onClick={() => handleNavigate("dashboard")}
                >
                  Dashboard
                </button>
              </li>

              <li className="nav-item">
                <button
                  className={`nav-link border-0 bg-transparent ${currentPage === "inventory" ? "active" : ""}`}
                  onClick={() => handleNavigate("inventory")}
                >
                  Inventory
                </button>
              </li>

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
              <button
                className="btn btn-outline-primary btn-sm"
                data-bs-toggle="modal"
                data-bs-target="#itemModal"
              >
                Items
              </button>

              <button
                className="btn btn-outline-success btn-sm"
                data-bs-toggle="modal"
                data-bs-target="#companyModal"
              >
                Companies
              </button>
            </div>

            {/* ✅ NEW USER SECTION */}
            <div className="me-3">
              {user ? (
                <div className="dropdown" ref={userDropdownRef}>
                  <button
                    className="btn btn-light border d-flex align-items-center gap-2 px-3"
                    onClick={toggleUserDropdown}
                  >
                    <i className="bi bi-person-circle"></i>
                    <span>{user.username}</span>
                    <i className={`bi ${showUserDropdown ? 'bi-chevron-up' : 'bi-chevron-down'} small`}></i>
                  </button>

                  {showUserDropdown && (
                    <ul className="dropdown-menu dropdown-menu-end shadow show">
                      <li className="px-3 py-2 border-bottom">
                        <div className="fw-semibold">{user.username}</div>
                        <small className="text-muted">Logged in</small>
                      </li>

                      <li>
                        <button
                          className="dropdown-item text-danger"
                          onClick={handleLogout}
                        >
                          Logout
                        </button>
                      </li>
                    </ul>
                  )}
                </div>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={() => handleNavigate("login")}
                >
                  Login
                </button>
              )}
            </div>

            {/* Theme */}
            <div className="position-relative" ref={themeDropdownRef}>
              <button
                className="btn btn-sm"
                onClick={() => setShowThemeDropdown(!showThemeDropdown)}
              >
                Theme
              </button>

              {showThemeDropdown && (
                <div className="dropdown-menu show p-2">
                  {allowedThemes.map((theme) => (
                    <button
                      key={theme}
                      className="dropdown-item"
                      onClick={() => {
                        setTheme(theme);
                        setShowThemeDropdown(false);
                      }}
                    >
                      {getThemeDisplayName(theme)}
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