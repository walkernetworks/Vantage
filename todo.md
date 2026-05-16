# Beignets & Brew — Inventory System TODO

## Phase 1: Database Schema
- [x] Define items table (name, category, vendor, packSize, unitOfMeasure, price, parLevel, storageArea, isAlcohol, alcoholCategory)
- [x] Define countSessions table (date, createdBy, notes)
- [x] Define countEntries table (sessionId, itemId, quantity, value)
- [x] Define cateringRecipes table (name, description, servings)
- [x] Define cateringRecipeItems table (recipeId, itemId, quantityNeeded)
- [x] Generate and apply migration SQL

## Phase 2: Backend Routers
- [x] items router: list, create, update, delete, importCSV, updateParLevel
- [x] counts router: createSession, getSession, listSessions, upsertEntry, getSessionWithEntries, completeSession
- [x] orders router: getBelowPar (below-par items by vendor)
- [x] alcohol router: list (cat 100/130), addItem
- [x] catering router: listRecipes, createRecipe, updateRecipe, deleteRecipe, addRecipeItem, removeRecipeItem, calculateShortfall
- [x] Role-based access control (admin vs employee)

## Phase 3: Layout & Auth Shell
- [x] Global theme: warm cream/espresso palette, premium typography
- [x] AppLayout with mobile-first bottom nav + sidebar navigation
- [x] Role-based nav: admin sees all, employee sees Count Sheet + Catering only
- [x] Login page / auth guard

## Phase 4: Item Catalog
- [x] Item list with search, filter by category/vendor
- [x] Add/edit item modal with all fields
- [x] Delete item with confirmation
- [x] CSV import modal with source selector (GA-001, Webstaurant, PFG)
- [x] CSV column mapping and preview before import

## Phase 5: Count Sheet
- [x] View toggle: by Storage Area vs by Category
- [x] Grouped item rows with quantity input (big-button number input)
- [x] Real-time value calculation (qty × unit cost)
- [x] Session management: start new count, save progress, complete
- [x] Count history list

## Phase 6: Vendor Ordering Dashboard
- [x] Vendor filter tabs: PFG, Webstaurant, Savannah Distributing
- [x] Below-par items list with cases-to-order calculation
- [x] Par level quick-edit inline
- [x] Estimated order value summary

## Phase 7: Alcohol Management
- [x] Alcohol-specific list filtered to categories 100 and 130
- [x] One-click "Add New Item" quick-add presets
- [x] History preservation: new items don't affect previous count sessions
- [x] Example items: Borghetti Espresso Liqueur, Torani syrups

## Phase 8: Catering Calculator
- [x] Recipe list with add/edit/delete
- [x] Ingredient management per recipe
- [x] Calculator: input order volume (e.g., 150 Croissants)
- [x] Shortfall detection: compare needed vs current stock
- [x] Highlight shortfall items in red with exact deficit and progress bar

## Bug Fixes
- [x] Fix pencil/edit button in Item Catalog — clicking it does nothing, form does not open

## Phase 10: PFG Import Enhancement
- [x] Parse PFG CSV exact columns: Category Name, Custom Product Description, Product Description, Brand, Product Number, Pack Size, UOM, Price
- [x] Map PFG Category Name to internal categories (ALCOHOL-BEVERAGES → Alcohol-100, COFFEE-DRY FOODS → Coffee, etc.)
- [x] Use Product Number as stable unique key for upsert logic
- [x] On re-import: detect price changes, store old price, show variance table (item, old price, new price, $ diff, % diff)
- [x] Add pfgProductNumber field to items table for stable matching
- [x] Add priceHistory table to record price changes per import
- [x] Build PFG-specific import modal with preview and variance report
- [x] Show green/red variance badges in import results

## Phase 9: Polish & Tests
- [x] Mobile-first responsive audit (all pages)
- [x] Big-button UI audit (min 44px tap targets via btn-big / count-input)
- [x] 19 vitest unit tests covering all modules and RBAC
- [x] TypeScript strict check passes (0 errors)
- [x] Final checkpoint and delivery

## Round 3 Features
- [x] Add settings tables (categories, vendors, storage areas) to DB schema
- [x] Build admin Settings page to add/edit/delete categories, vendors, storage areas
- [x] Parse pack size (e.g. "6/24oz" → quantity=6) to compute EACH unit price = case price ÷ quantity
- [x] Store computed eachPrice on items; display in catalog and count sheet
- [x] Simplify UOM to only two options: Case and Each
- [x] Add dedicated "Par Levels" tab in Item Catalog with bulk-edit grid
- [x] Filter Count Sheet to only show items that have a par level > 0 assigned
- [x] Seed default categories, vendors, storage areas from existing hardcoded constants

## Round 4 Features
- [x] Count Sheet: dual Case + Each count inputs per item; Each input only shown when item has caseQty > 1
- [x] Count Sheet: combined value = (cases × casePrice) + (eaches × eachPrice); total stock in cases shown
- [x] Order Dashboard: cases needed always rounded up (Math.ceil), never decimals
- [x] Order Dashboard: add orderThreshold field per item (default 50%) — only show item if stock < threshold% of par
- [x] Par Levels page: add orderThreshold column (editable, default blank = 50% of par)
- [x] DB schema: add orderThreshold column to items table (decimal, default 0.5)

## Round 5 Features
- [x] Count Sheet: add "Load Previous Count" button that opens a session picker and loads that session's quantities for editing
- [x] Count Sheet: when editing a previous session, show a banner indicating which date/session is loaded
- [x] Order Dashboard: show which count session the below-par data is based on (date + session name)
- [x] Order Dashboard: show product number (pfgProductNumber or custom) on each item card
- [x] Order Dashboard: Export to CSV button — downloads vendor-grouped spreadsheet with item name, product#, pack size, cases needed, unit price, total cost
- [x] Order Dashboard: Export to PDF button — generates a printable vendor order sheet with the same columns
- [x] Backend: add getSessionWithEntries procedure that returns a session with all its count entries for loading into Count Sheet

## User Management (Admin)
- [x] DB: add `isActive` boolean column to users table (default true); migration SQL applied
- [x] Backend: add `admin.listUsers` procedure (admin-only) — returns all users with id, name, email, role, isActive, lastSignedIn
- [x] Backend: add `admin.setRole` procedure (admin-only) — updates role for a given userId
- [x] Backend: add `admin.setActive` procedure (admin-only) — toggles isActive for a given userId
- [x] Backend: enforce isActive check in auth context so deactivated users get 401
- [x] Frontend: build /admin/users page with user list (name, email, role badge, last sign-in, active status)
- [x] Frontend: role toggle button (Admin ↔ Employee) on each user row
- [x] Frontend: deactivate/reactivate toggle on each user row
- [x] Frontend: add "Users" nav item to admin sidebar (admin-only)
- [x] Frontend: route /admin/users registered in App.tsx

## Round 6 Features

### AI Item Name Generation
- [x] Backend: add `cleanItemName(rawName, brand, packSize)` LLM helper that returns a concise internal name
- [x] Backend: call cleanItemName during Webstaurant import for each row before upsert
- [x] Frontend: show AI-generated name alongside original vendor description in import preview table

### Webstaurant CSV Import
- [x] Parse Webstaurant CSV format: skip header rows, columns = Item Number, Name, Vendor, Quantity, Base Price/Unit
- [x] Strip "$" and "*" from price field; parse pack size from Name field (e.g. "- 25/Case" → packSize)
- [x] Use Item Number as stable upsert key (webstaurantItemNumber field on items table)
- [x] DB: add `webstaurantItemNumber` varchar column to items table; migration applied
- [x] Track price history on re-import (same priceHistory table used by PFG)
- [x] Show variance report after import (same pattern as PFG: old price, new price, $ diff, % diff)
- [x] Frontend: add Webstaurant import modal in Item Catalog with CSV upload + AI name generation + preview + variance report

### Bulk Edit — Par Levels
- [x] Par Levels page: add checkbox column for multi-select rows
- [x] "Select All" / "Deselect All" toggle in header
- [x] "Copy Down" button: fills all selected rows with the par value from the first selected row
- [x] "Set All" button: opens a small input, applies typed value to all selected rows in one mutation
- [x] Bulk save sends a single `items.bulkUpdateParLevels` mutation with array of {id, parLevel}

### Bulk Edit — Count Sheet
- [x] Count Sheet: add multi-select mode toggle button
- [x] When in multi-select mode: each item row shows a checkbox
- [x] "Fill All Cases" button: opens input, applies same case count to all selected items
- [x] "Copy Down Cases" button: copies first selected item's case count to all other selected items
- [x] Bulk save sends array of upsertEntry mutations in parallel

## Round 7 Features & Fixes

- [x] Bug fix: $NaN in count history — guard all parseFloat/price calculations against null/undefined/empty string values
- [x] Count Sheet: add Select All / Deselect All button in bulk mode header
- [x] Par Levels: add Select All / Deselect All button in bulk mode header (verified toggleSelectAll already existed)
- [x] Count History: add Delete button on each session with confirmation dialog (admin-only, hover to reveal)
- [x] Backend: add `counts.deleteSession` procedure (admin-only) — hard-deletes session and all its entries

## Round 8 Nav Cleanup

- [x] Remove Count History nav item from AppLayout sidebar
- [x] Rename "Count Sheet" nav label to "Counts & History"
- [x] Update page title inside CountSheet.tsx to match new label

## Round 9 — AI Name Improvements

- [x] Update `generateCleanItemName` prompt: produce 2-4 word short names, strip size/spec/brand noise
- [x] Apply AI naming silently on Webstaurant import — no separate preview column
- [x] Removed "Proposed Name" preview column from Webstaurant import modal; vendor description shown as-is in preview

## Round 10 — Par Levels Bug Fixes

- [x] Bug: after bulk save, per-row "unsaved" badge still shows — fixed with savedVersion counter passed to child rows
- [x] Mobile: item name truncated/invisible — restructured row layout so name wraps on its own line above inputs
