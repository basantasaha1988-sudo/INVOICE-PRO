// src/contexts/ItemMasterContext.jsx
import React, { createContext, useContext, useState, useCallback } from 'react';
import axios from 'axios';

const ItemMasterContext = createContext();

export const useItemMaster = () => useContext(ItemMasterContext);

export const ItemMasterProvider = ({ children }) => {
  const [items, setItems] = useState([]);

  // Fetch all items from SQL Server via backend API
  const refreshItems = useCallback(async () => {
    try {
      const res = await axios.get('/api/itemmaster');
      setItems(res.data);
    } catch (err) {
      console.error('Failed to load items from DB:', err.message);
      // Fallback to localStorage cache if API is unreachable
      const cached = localStorage.getItem('itemMaster');
      if (cached) setItems(JSON.parse(cached));
    }
  }, []);

  // Keep localStorage in sync as a cache
  const setItemsWithCache = useCallback((data) => {
    setItems(data);
    localStorage.setItem('itemMaster', JSON.stringify(data));
  }, []);

  return (
    <ItemMasterContext.Provider value={{ items, setItems: setItemsWithCache, refreshItems }}>
      {children}
    </ItemMasterContext.Provider>
  );
};