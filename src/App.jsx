import React, { useState, createContext, useContext, useEffect } from "react";
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
// Already in your App.jsx — the {currentPage === 'dashboard'} block will render it

const ThemeContext = createContext();
const AuthContext = createContext();

export const useTheme = () => useContext(ThemeContext);
export const useAuth = () => useContext(AuthContext);

export const useDarkMode = () => {
  const { currentTheme } = useTheme();
  return { isDark: currentTheme === 'dark' };
};

function App() {
  const [currentTheme, setCurrentTheme] = useState('green');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('home');
  const [selectedInvoice, setSelectedInvoice] = useState(null); // {total, customer, billNo, balance, paid: 0}
  const [receipts, setReceipts] = useState([]);

  const themes = ['green', 'black', 'red', 'orange', 'yellow', 'purple'];

  useEffect(() => {
    const savedAuth = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('user');
    if (savedAuth && savedUser) {
      setIsAuthenticated(true);
      setUser(JSON.parse(savedUser));
    }
    const savedTheme = localStorage.getItem('currentTheme') || 'green';
    setCurrentTheme(savedTheme);
    document.documentElement.className = savedTheme;

    // Load receipts
    const savedReceipts = localStorage.getItem('receipts');
    if (savedReceipts) setReceipts(JSON.parse(savedReceipts));
  }, []);

  useEffect(() => {
    localStorage.setItem('receipts', JSON.stringify(receipts));
  }, [receipts]);

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
    localStorage.clear(); // Clear all for safety
    setIsAuthenticated(false);
    setUser(null);
    setCurrentPage('home');
    // Force reload to sync state
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
                        selectInvoiceForPayment={(data) => {
                          // Calculate current paid and balance
                          const paid = receipts
                            .filter(r => r.paymentDocNumber === data.billNo)
                            .reduce((sum, r) => sum + r.receiptAmount, 0);
                          const balance = data.total - paid;
                          setSelectedInvoice({ ...data, paid, balance });
                          setCurrentPage('reciptpayment');
                        }}
                        receipts={receipts}
                      />
                    )}

{currentPage === 'inventory' && (
                      <Inventory onNavigateToHome={() => setCurrentPage('home')} />
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
                        onReceiptSaved={(receipt) => {
                          setReceipts(prev => [...prev, receipt]);
                          console.log('Receipt saved:', receipt);
                          alert(`Receipt saved! Balance updated for ${receipt.paymentDocNumber}`);
                          setSelectedInvoice(null);
                          setCurrentPage('home');
                        }}
                        onDeleteReceipt={(id) => {
                          setReceipts(prev => prev.filter(r => r.id !== id));
                        }}
                      />
                    )}

                    <ItemMaster />

                    <CompanyMaster />

                    <CustomerMaster />

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