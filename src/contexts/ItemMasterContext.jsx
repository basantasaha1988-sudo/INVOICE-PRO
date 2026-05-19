import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const ItemMasterContext = createContext();

export const useItemMaster = () => useContext(ItemMasterContext);

// ─── Snap to nearest GST slab (0,5,12,18,28) ─────────────────────────────────
const GST_SLABS = [0, 5, 12, 18, 28];
const snapToSlab = (val) => {
  const n = Number(val) || 0;
  if (GST_SLABS.includes(n)) return n;
  return GST_SLABS.reduce((prev, curr) =>
    Math.abs(curr - n) < Math.abs(prev - n) ? curr : prev, 0);
};

// ─── Normalize DB row → consistent shape used everywhere in the app ───────────
// DB columns: ItemCode, ItemName, Rate, Tax, Stock, CreatedDate
export const normalizeItem = (raw) => ({
  id:                 raw.ItemCode          ?? raw.id                 ?? null,
  name:               raw.ItemName          ?? raw.name               ?? '',
  defaultRate:        Number(raw.Rate       ?? raw.defaultRate        ?? 0),
  defaultTaxPercent:  snapToSlab(raw.Tax ?? raw.defaultTaxPercent ?? 0),
  stock:              Number(raw.Stock      ?? raw.stock              ?? 0),
  hsn:                raw.HSN               ?? raw.hsn                ?? '',
  createdDate:        raw.CreatedDate       ?? raw.createdDate        ?? null,
});

export const ItemMasterProvider = ({ children }) => {
  const [items, setItemsRaw] = useState([]);
  const [loading, setLoading] = useState(false);

  // FIX: Handle both a plain array (from DB fetch) and an updater function
  // (from deductStock/restoreStock in SaleInvoice which calls setItemMaster(prev => prev.map(...)))
  const setItems = useCallback((dataOrUpdater) => {
    setItemsRaw(prev => {
      const rawData = typeof dataOrUpdater === 'function'
        ? dataOrUpdater(prev)   // updater fn: receives current items, returns new array
        : dataOrUpdater;        // plain array: from DB or direct assignment
      const normalized = rawData.map(normalizeItem);
      localStorage.setItem('itemMaster', JSON.stringify(normalized));
      return normalized;
    });
  }, []);

  const refreshItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/itemmaster');
      setItems(res.data);
    } catch (err) {
      console.error('Failed to load items from DB:', err.message);
      const cached = localStorage.getItem('itemMaster');
      if (cached) setItemsRaw(JSON.parse(cached));
    } finally {
      setLoading(false);
    }
  }, [setItems]);

  // ── Auto-load on mount ────────────────────────────────────────────────────
  useEffect(() => {
    refreshItems();
  }, []);

  return (
    <ItemMasterContext.Provider value={{ items, setItems, refreshItems, loading }}>
      {children}
    </ItemMasterContext.Provider>
  );
};