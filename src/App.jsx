import React, { useState, createContext, useContext, useEffect, useCallback } from "react";
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

import Header from "./components/Header";
import SaleInvoice from "./components/SaleInvoice";
import Inventory from "./components/Inventory";
import Footer from "./components/Footer";
import ItemMaster from "./components/ItemMaster";
import CompanyMaster from "./components/CompanyMaster";
import Login from "./components/Login";
import { ItemMasterProvider } from "./contexts/ItemMasterContext";
import { CompanyMasterProvider } from "./contexts/CompanyMasterContext";
import Dashboard from "./components/Dashboard";
import ReceiptPayment from "./components/reciptpayment";
import CustomerMaster from "./components/CustomerMaster";
import PaymentMethodMaster from "./components/PaymentMethodMaster";
import ProjectMaster from "./components/ProjectMaster";
import SupplierMaster from "./components/Suppliermaster";
import Consumption from "./components/Consumption";
import VendorInvoice from "./components/VendorInvoice";
import VendorPayment from "./components/VendorPayment";

const ThemeContext = createContext();
const AuthContext = createContext();

export const useTheme = () => useContext(ThemeContext);
export const useAuth = () => useContext(AuthContext);

export const useDarkMode = () => {
  const { currentTheme } = useTheme();
  return { isDark: currentTheme === 'dark' };
};

const API = import.meta.env.VITE_API_URL || '/api';

function App() {
  const [currentTheme, setCurrentTheme] = useState('green');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('home');
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // ── receipts now loaded from DB, not localStorage ──────────────────────────
  const [receipts, setReceipts] = useState([]);
  // billsRefreshKey: increment to signal SaleInvoice to re-fetch bills from DB
  const [billsRefreshKey, setBillsRefreshKey] = useState(0);

  const themes = ['green', 'gray', 'red', 'orange', 'yellow', 'purple'];

  // ── Load receipts from DB ──────────────────────────────────────────────────
  const loadReceiptsFromDB = useCallback(async () => {
    try {
      const res = await fetch(`${API}/receipts`);
      if (res.ok) {
        const data = await res.json();
        // Normalise DB shape → legacy shape so SaleInvoice's paid-amount calc works
        // DB: { LinkedInvoice, AmountPaid }  →  legacy: { paymentDocNumber, receiptAmount }
        const normalised = data.map(r => ({
          ...r,
          paymentDocNumber: r.LinkedInvoice  || r.paymentDocNumber || '',
          receiptAmount:    parseFloat(r.AmountPaid || r.receiptAmount || 0),
        }));
        setReceipts(normalised);
      }
    } catch (err) {
      console.warn('Could not load receipts from DB:', err.message);
    }
  }, []);

  useEffect(() => {
    const savedAuth  = localStorage.getItem('authToken');
    const savedUser  = localStorage.getItem('user');
    if (savedAuth && savedUser) {
      setIsAuthenticated(true);
      setUser(JSON.parse(savedUser));
    }
    const savedTheme = (localStorage.getItem('currentTheme') || 'green').replace('black', 'gray');
    setCurrentTheme(savedTheme);
    document.documentElement.className = savedTheme;
  }, []);

  // Load receipts from DB once authenticated
  useEffect(() => {
    if (isAuthenticated) loadReceiptsFromDB();
  }, [isAuthenticated, loadReceiptsFromDB]);

  const setTheme = (theme) => {
    if (!themes.includes(theme)) return;
    setCurrentTheme(theme);
    document.documentElement.className = theme;
    localStorage.setItem('currentTheme', theme);
  };

  const themeValue = { currentTheme, themes, setTheme, isDark: currentTheme === 'dark' };

  const login = (username) => {
    const token = 'invoicepro-auth-' + Date.now();
    localStorage.setItem('authToken', token);
    localStorage.setItem('user', JSON.stringify({ username }));
    setIsAuthenticated(true);
    setUser({ username });
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setUser(null);
    setCurrentPage('home');
    setTimeout(() => window.location.reload(), 100);
  };

  const authValue = { isAuthenticated, user, login, logout };

  if (!isAuthenticated) {
    return (
      <ThemeContext.Provider value={themeValue}>
        <Login onLogin={login} />
      </ThemeContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={authValue}>
      <ThemeContext.Provider value={themeValue}>
        <div className="app-theme">
          <ItemMasterProvider>
            <CompanyMasterProvider>
              <div className="min-vh-100 d-flex flex-column">
                <div className="container-fluid flex-grow-1">
                  <div className="main-content px-3 px-md-4">

                    <Header currentPage={currentPage} onNavigate={setCurrentPage} />

                    {currentPage === 'home' && (
                      <SaleInvoice
                        onNavigateToInventory={() => setCurrentPage('inventory')}
                        onNavigateToCustomerMaster={() => {
                          const trigger = document.getElementById('customerModalTrigger');
                          if (trigger) trigger.click();
                        }}
                        selectInvoiceForPayment={(data) => {
                          // Compute paid from DB receipts (normalised above)
                          const paid = receipts
                            .filter(r => r.paymentDocNumber === data.billNo)
                            .reduce((sum, r) => sum + parseFloat(r.receiptAmount || 0), 0);
                          const balance = Math.max(0, data.total - paid);
                          setSelectedInvoice({ ...data, paid, balance });
                          setCurrentPage('reciptpayment');
                        }}
                        receipts={receipts}
                        refreshKey={billsRefreshKey}
                      />
                    )}

                    {currentPage === 'inventory' && (
                      <Inventory onNavigateToHome={() => setCurrentPage('home')} />
                    )}

                    {currentPage === 'consumption' && (
                      <Consumption />
                    )}

                    {currentPage === 'vendorinvoice' && (
                      <VendorInvoice />
                    )}

                    {currentPage === 'vendorpayment' && (
                      <VendorPayment />
                    )}

                    {currentPage === 'dashboard' && <Dashboard />}

                    {currentPage === 'reciptpayment' && (
                      <ReceiptPayment
                        invoice={selectedInvoice}
                        receipts={receipts}
                        onClose={() => {
                          setSelectedInvoice(null);
                          setCurrentPage('home');
                        }}
                        onReceiptSaved={async (receipt) => {
                          // Re-fetch BOTH receipts and bills from DB so status is accurate
                          await loadReceiptsFromDB();
                          setBillsRefreshKey(k => k + 1); // triggers SaleInvoice reload
                          setSelectedInvoice(null);
                          setCurrentPage('home');
                        }}
                        onDeleteReceipt={async () => {
                          await loadReceiptsFromDB();
                          setBillsRefreshKey(k => k + 1);
                        }}
                      />
                    )}

                    <ItemMaster />
                    <CompanyMaster />
                    <CustomerMaster />
                    <PaymentMethodMaster />
                    <ProjectMaster />
                    <SupplierMaster />
                    <button
                      id="customerModalTrigger"
                      data-bs-toggle="modal"
                      data-bs-target="#customerModal"
                      style={{ display: 'none' }}
                    />

                  </div>
                </div>
                <Footer />
              </div>
            </CompanyMasterProvider>
          </ItemMasterProvider>
        </div>
      </ThemeContext.Provider>
    </AuthContext.Provider>
  );
}

export default App;