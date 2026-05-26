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
  id:                raw.ItemCode         ?? raw.id                ?? null,
  name:              raw.ItemName         ?? raw.name              ?? '',
  defaultRate:       Number(raw.Rate      ?? raw.defaultRate       ?? 0),
  defaultTaxPercent: snapToSlab(raw.Tax   ?? raw.defaultTaxPercent ?? 0),
  stock:             Number(raw.Stock     ?? raw.stock             ?? 0),
  hsn:               raw.HSN              ?? raw.hsn               ?? '',
  createdDate:       raw.CreatedDate      ?? raw.createdDate       ?? null,
});

// ─── Safe guard: ensure we always work with an array ─────────────────────────
// The API returns result.recordset (array) on success, but { error: '...' }
// on failure. SaleInvoice calls setItems(prev => prev.map(...)) (updater fn).
// Both paths must be protected before calling .map().
const toSafeArray = (value) => {
  if (Array.isArray(value)) return value;
  // Any non-array (error object, null, undefined, string) → empty array
  console.warn('[ItemMasterContext] Expected an array but got:', typeof value, value);
  return [];
};

export const ItemMasterProvider = ({ children }) => {
  const [items, setItemsRaw] = useState([]);
  const [loading, setLoading] = useState(false);

  // Accepts either:
  //   • a plain array  — from DB fetch (refreshItems) or direct assignment
  //   • an updater fn  — from SaleInvoice: setItems(prev => prev.map(...))
  const setItems = useCallback((dataOrUpdater) => {
    setItemsRaw(prev => {
      // Resolve the new raw data
      const rawData = typeof dataOrUpdater === 'function'
        ? dataOrUpdater(prev)   // updater fn: receives current items → new array
        : dataOrUpdater;        // plain value: from DB or direct assignment

      // FIX: Guard against non-array responses (e.g. API error object { error: '...' })
      const safeArray = toSafeArray(rawData);

      const normalized = safeArray.map(normalizeItem);

      // Persist to localStorage for offline fallback
      try {
        localStorage.setItem('itemMaster', JSON.stringify(normalized));
      } catch (e) {
        // localStorage blocked (e.g. Edge Tracking Prevention, private browsing)
        // — not fatal, just skip the cache write
        console.warn('[ItemMasterContext] localStorage write failed:', e.message);
      }

      return normalized;
    });
  }, []);

  const refreshItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/itemmaster');

      // FIX: axios wraps the response body in res.data.
      // Guard against the server returning a non-array on error (e.g. 500 JSON).
      const data = res.data;
      if (!Array.isArray(data)) {
        console.warn('[ItemMasterContext] /api/itemmaster did not return an array:', data);
        // Fall through to the cached copy rather than crashing
        throw new Error(data?.error || 'Unexpected response from /api/itemmaster');
      }

      setItems(data);
    } catch (err) {
      console.error('Failed to load items from DB:', err.message);

      // Restore from cache so the app keeps working offline / on DB error
      try {
        const cached = localStorage.getItem('itemMaster');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) setItemsRaw(parsed);
        }
      } catch (cacheErr) {
        console.warn('[ItemMasterContext] localStorage read failed:', cacheErr.message);
      }
    } finally {
      setLoading(false);
    }
  }, [setItems]);

  // ── Auto-load on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    refreshItems();
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ItemMasterContext.Provider value={{ items, setItems, refreshItems, loading }}>
      {children}
    </ItemMasterContext.Provider>
  );
};