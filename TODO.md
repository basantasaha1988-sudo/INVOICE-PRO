# Fix ItemMaster Network Error & Responsiveness

## Information Gathered
1. **Network Error (`ERR_CONNECTION_REFUSED`)**:
   - `ItemMaster.jsx` and `ItemMasterContext.jsx` hardcoded `http://localhost:5000/api/itemmaster`, bypassing the Vite proxy.
   - `vite.config.ts` had a proxy for `/api` but included an incorrect `rewrite` rule that stripped `/api`, causing 404s even if the proxy was used.

2. **Responsiveness Issues**:
   - Modal used `modal-xl` which was too wide for mobile.
   - Form only used `col-lg-*` classes, causing poor stacking on tablets and phones.
   - Inline edit section lacked responsive grid classes.
   - Table action buttons could overflow on narrow viewports.

## Plan

| # | File | Change |
|---|------|--------|
| 1 | `vite.config.ts` | **Fix proxy**: Remove the `rewrite` rule so `/api/*` correctly proxies to `http://localhost:5000/api/*`. |
| 2 | `src/contexts/ItemMasterContext.jsx` | **Fix API URL**: Change `API_URL` from `http://localhost:5000/api/itemmaster` to `/api/itemmaster`. |
| 3 | `src/components/ItemMaster.jsx` | **Fix API URL**: Change `API_URL` to `/api/itemmaster`.<br>**Responsive modal**: Change `modal-xl` to `modal-lg modal-fullscreen-sm-down`.<br>**Responsive form**: Update grid classes to `col-12 col-md-6 col-lg-4` etc.<br>**Responsive edit section**: Wrap inputs in responsive rows.<br>**Responsive buttons**: Use flex-wrap utilities to prevent overflow. |

## Status
- [x] `vite.config.ts` proxy fixed
- [x] `src/contexts/ItemMasterContext.jsx` API URL fixed
- [x] `src/components/ItemMaster.jsx` API URL fixed
- [x] `src/components/ItemMaster.jsx` modal made responsive
- [x] `src/components/ItemMaster.jsx` add form made responsive
- [x] `src/components/ItemMaster.jsx` edit section made responsive
- [x] `src/components/ItemMaster.jsx` table action buttons made responsive
- [x] `backend/server.js` auto-creates `ITEMMASTER` table on startup
- [x] `backend/api/itemmaster.js` added input validation and null-coalescing for numeric fields
- [x] `src/components/ItemMaster.jsx` improved error handling to show backend error messages

## Follow-up Steps
- Restart the backend server (`cd backend && node server.js`) so the table auto-creation runs.
- Run frontend (`npm run dev`).
- Test adding an item — the exact backend error will now show in the alert if something still fails.
- Verify responsive layout on mobile/tablet/desktop.


