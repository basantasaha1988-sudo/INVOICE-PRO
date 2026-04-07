import React, { createContext, useContext, useState, useEffect } from 'react';

const ItemMasterContext = createContext();

export const ItemMasterProvider = ({ children }) => {
  const [items, setItems] = useState([]); // Existing items will get stock: undefined, treated as 0

  useEffect(() => {
    const saved = localStorage.getItem('itemMaster');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migrate existing items to include stock: 0
      const migrated = parsed.map(item => ({ ...item, stock: item.stock ?? 0 }));
      setItems(migrated);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('itemMaster', JSON.stringify(items));
  }, [items]);

  return (
    <ItemMasterContext.Provider value={{ items, setItems }}>
      {children}
    </ItemMasterContext.Provider>
  );
};

export const useItemMaster = () => {
  const context = useContext(ItemMasterContext);
  if (!context) {
    throw new Error('useItemMaster must be used within ItemMasterProvider');
  }
  return context;
};

