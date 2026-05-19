# ItemMaster Fix Plan

## Issues Identified:
1. **Item name not coming** - Component using wrong field names
2. **Item can't delete** - Using wrong ID field

## Root Cause:
The `ItemMasterContext.jsx` normalizes data from DB field names to App field names:
- `ItemCode` → `id`
- `ItemName` → `name`
- `Rate` → `defaultRate`
- `Tax` → `defaultTaxPercent`

But `ItemMaster.jsx` is still using the OLD (non-normalized) field names.

## Field Name Mapping:
| Old (broken) | New (correct) |
|--------------|---------------|
| `item.ItemCode` | `item.id` |
| `item.ItemName` | `item.name` |
| `item.Rate` | `item.defaultRate` |
| `item.Tax` | `item.defaultTaxPercent` |

## Steps to Fix:
- [x] 1. Update editItemFn to use normalized field names
- [x] 2. Update filteredItems filter to use normalized field name
- [x] 3. Update table rendering to use normalized field names
- [x] 4. Update delete button to use normalized ID
- [x] 5. Update CSV export to use normalized field names
- [x] 6. Build test passed
