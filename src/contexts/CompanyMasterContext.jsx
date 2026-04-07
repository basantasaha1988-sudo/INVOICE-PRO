import React, { createContext, useContext, useState, useEffect } from 'react';

const CompanyMasterContext = createContext();

export const CompanyMasterProvider = ({ children }) => {
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem('companyMaster');
    if (saved) setCompanies(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('companyMaster', JSON.stringify(companies));
  }, [companies]);

  return (
    <CompanyMasterContext.Provider value={{ companies, setCompanies }}>
      {children}
    </CompanyMasterContext.Provider>
  );
};

export const useCompanyMaster = () => {
  const context = useContext(CompanyMasterContext);
  if (!context) {
    throw new Error('useCompanyMaster must be used within CompanyMasterProvider');
  }
  return context;
};

