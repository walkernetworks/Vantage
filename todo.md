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
