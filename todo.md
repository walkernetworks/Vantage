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

## Round 11 — Count Mode (Case vs Each)

- [x] DB: add `countMode` varchar column to items table (`case` | `each`, default `case`); migration applied
- [x] Note: `caseQty` already existed (parsed from packSize), so no new unitsPerCase column needed
- [x] Backend: add `items.setCountMode` procedure (admin-only) — updates countMode via updateItem
- [x] Count Sheet: admin-only count mode toggle badge on each item row (CASE/EACH pill, amber when each mode)
- [x] Count Sheet: when mode = each, hide CASE row and show only EACH input with correct per-unit price
- [x] Count Sheet: when mode = each, store eaches directly in DB (no case conversion); convert for order math via caseQty
- [x] Count Sheet: bulk fill helpers updated to respect countMode per item
- [x] Count Sheet: load-from-DB logic updated to split eaches vs cases correctly per countMode

## Round 12 — Each Mode: caseQty & eachPrice Fix

- [x] Bug: parsePackSizeQty now handles leading dash ("- 25/Case"), CT/EA/PK suffixes ("12 CT"), and CS/N trailing formats
- [x] Bug: eachPrice recomputed on setCountMode toggle — updateItem fetches current price+caseQty and stores eachPrice
- [x] Fix: recalcAllEachPrices() backend function iterates all items and recomputes caseQty+eachPrice from packSize
- [x] Fix: "Recalc Each Prices" admin button (÷ icon, amber) added to Item Catalog toolbar — run once after import to fix existing items
- [x] Frontend: Count Sheet each mode already derives price client-side as casePrice/caseQty fallback when eachPrice is null

## Round 13 — Bug Fixes

- [x] Bug: delete count session broken — root cause was delete button hidden behind opacity-0/group-hover (invisible on mobile/touch). Fixed: button now always visible for admins as a Trash2 icon with proper tap target size next to each session chip.

## Round 14 — Item Catalog Delete

- [x] Item Catalog: delete button (Trash2 icon) already existed on each item card (admin-only)
- [x] Item Catalog: single-item delete uses Modal confirmation (createPortal-based)
- [x] Item Catalog: calls `trpc.items.delete` mutation on confirm, invalidates list on success

## Round 15 — Bulk Delete & Count Mode Fix

- [x] Item Catalog: bulk select mode toggle button added (admin-only, CheckSquare icon)
- [x] Item Catalog: checkbox on each item card in bulk mode
- [x] Item Catalog: Select All / Deselect All in bulk mode toolbar
- [x] Item Catalog: Delete Selected button with count badge in bulk mode toolbar
- [x] Item Catalog: Modal confirmation before bulk delete showing count of items
- [x] Item Catalog: calls `items.bulkDelete` mutation on confirm, invalidates list on success
- [x] Count Sheet: toggle button now clearly shows current mode (blue CASE▼ / amber EACH▼) with dropdown arrow indicator
- [x] Count Sheet: setCountMode mutation persists change to DB via `items.setCountMode` procedure
- [x] Count Sheet: CASE is default; EACH hides case row and shows only EACH input
- [x] Count Sheet: added search bar above item groups to filter by name/category/storage/vendor

## Round 16 — Import Re-insert Bug Fix

- [x] Bug: after deleting all items, re-uploading CSV only ran price-check — root cause was soft-delete: rows remained in DB with isActive=false. Fixed: both PFG and Webstaurant importers now check isActive on matched rows; if false, they reactivate the row and update all fields (counted as 'created'), bypassing the price-check path.

## Round 17 — Brand Colors, Logo, Search Expansion

- [x] Count Sheet search: expand to match brand, pfgProductNumber, webstaurantItemNumber, vendor, category, storageArea (not just item name)
- [x] Brand color scheme: updated index.css CSS variables to B&B palette (Coral #ff7a6e, Pink #fcccc8, Mint #d3e5df, Emerald #57b296, Blue #73d0d1, Dark Gray #262626)
- [x] Logo: uploaded B&BLogo-Transparent.png and placed in sidebar header, top header, and login page

## Round 18 — Color Audit, Alcohol Removal, Universal Importer

- [x] Color audit: sweep all pages/components for hardcoded colors and replace with brand palette CSS variables
- [x] Remove Alcohol Module (page, route, nav item, router, tests)
- [x] Universal CSV importer — single modal auto-detects PFG vs Webstaurant format

## Round 19 — Import Fixes & Manual Add Item
- [x] Remove divider/separator next to Import button in Item Catalog toolbar
- [x] Unify Webstaurant import to run price-change detection (same as PFG), not just insert
- [x] Add manual "Add Item" form to Item Catalog for alcohol and other non-order-guide items
- [x] Apply Comfortaa as universal font across all text, headings, buttons, and inputs

## Round 20 — AI-Powered Universal CSV Importer
- [x] Build server-side AI column mapper: send CSV header + sample rows to LLM, get back field mapping JSON
- [x] Build universal importAny tRPC procedure that accepts AI-mapped rows and upserts with price-change detection
- [x] Update UniversalImportModal frontend to use new AI-mapped flow for any CSV format
- [x] Support Alcohol2.csv distributor format (Storage Location, Category Name, Product Description, Brand, Pack Size, UOM, Price)

## Round 21 — Logo Size & Dashboard Charts
- [x] Increase B&B logo size in sidebar header and mobile top bar
- [x] Add tRPC procedures for dashboard metrics: order costs over time, inventory value by category, price fluctuations by distributor
- [x] Build dashboard charts: Cost of Orders (line), Inventory Value by Category (donut), Price Fluctuations by Distributor (multi-line)

## Round 22 — Nav, Logo, User Dropdown
- [x] Hide Catering Calculator from nav (keep code, remove nav item)
- [x] Fix logo size — make it visibly larger in header and sidebar
- [x] User dropdown menu in top-right (Account Settings, User Management admin-only, Sign Out)
- [x] Account Settings page (display name, email, role badge)

## Round 23 — Logo Fix, Pack Size Parsing, Bulk Edit
- [x] Fix logo size — actually visible increase in header and sidebar
- [x] Fix pack size parsing in CSV importer (4/6/12oz → total units → each price)
- [x] Bulk edit in Item Catalog — select multiple items, batch change vendor/category/storage/par

## Round 24 — AI-Enriched Import for All CSV Formats
- [x] AI enrichment for all CSV imports: brand inference, pack size parsing, clean names, category suggestions
- [x] Bulk edit in Item Catalog (select multiple → change vendor/category/storage/par)
- [x] Logo size fix (cropped PNG already uploaded)

## Round 25 — Email+Password Auth & GitHub
- [x] Replace Manus OAuth with email+password auth (register, login, logout, session cookie)
- [x] Add password hash column to users table (bcrypt)
- [x] Build server-side register/login/logout/me tRPC procedures
- [x] Build frontend Login and Register pages
- [x] Update useAuth hook to use new email/password auth
- [x] Remove Manus OAuth references (getLoginUrl, VITE_OAUTH_PORTAL_URL, etc.)
- [x] Push project to GitHub repo walkernetworks/Vantage

## Auth Migration — Email+Password (replacing Manus OAuth)
- [x] DB schema: passwordHash column added to users, openId made nullable, email unique
- [x] Migration SQL applied to database
- [x] server/_core/localAuth.ts: signLocalSession, verifyLocalSession, authenticateLocalRequest (HS256 JWT)
- [x] server/_core/context.ts: uses authenticateLocalRequest instead of sdk.authenticateRequest
- [x] server/db.ts: getUserById, getUserByEmail, createLocalUser, updateUserPassword, updateUserProfile helpers
- [x] server/routers.ts: auth.register and auth.login procedures (bcryptjs hashing, JWT cookie)
- [x] server/_core/index.ts: removed registerOAuthRoutes() call
- [x] client/src/pages/Login.tsx: email+password login form with B&B branding
- [x] client/src/pages/Register.tsx: registration form with B&B branding
- [x] client/src/_core/hooks/useAuth.ts: redirects to /login instead of Manus OAuth URL
- [x] client/src/components/AppLayout.tsx: unauthenticated redirect to /login
- [x] client/src/App.tsx: /login and /register routes outside AppLayout
- [x] client/src/main.tsx: global error handler redirects to /login instead of OAuth
- [x] client/src/const.ts: getLoginUrl() returns /login (no more Manus OAuth URL)
- [x] server/auth.localauth.test.ts: 4 tests for register/login procedures
- [x] TypeScript clean (0 errors), 45 tests pass

## Round 27 — Permissions, Temp Password, Item Numbers

- [x] DB schema: add `permissions` JSON column and `mustResetPassword` boolean to users table
- [x] DB migration: apply schema changes to TiDB Cloud production database
- [x] Server: update createUser to auto-generate temp password, set mustResetPassword=true
- [x] Server: add adminUsers.updatePermissions procedure
- [x] Server: add auth.changePassword procedure (for forced reset flow)
- [x] Server: enforce permissions on protected procedures (check ctx.user.permissions)
- [x] UserManagement UI: show permission toggles per user (8 permissions)
- [x] UserManagement UI: show generated temp password on user creation (copy to clipboard)
- [x] Add /change-password forced-reset page shown when mustResetPassword=true
- [x] Item Catalogue: show item number column
- [x] Par List: show item number column
- [x] Count Sheet: show item number column
- [x] Edit Item dialog: show item number field

## Round 28 — itemNumber Migration Complete

- [x] DB schema: replaced pfgProductNumber + webstaurantItemNumber with unified itemNumber column
- [x] DB migration: applied itemNumber column change to TiDB Cloud (178 items migrated)
- [x] server/db.ts: importPfgItems and importWebstaurantItems both use itemNumber
- [x] server/routers.ts: itemNumber in all item schemas
- [x] CountSheet.tsx: replaced pfgProductNumber/webstaurantItemNumber with itemNumber
- [x] ParLevels.tsx: replaced pfgProductNumber/webstaurantItemNumber with itemNumber
- [x] OrderingDashboard.tsx: replaced pfgProductNumber with itemNumber in type, CSV export, PDF export, item card
- [x] ItemCatalog.tsx: replaced pfgProductNumber/webstaurantItemNumber in PFG and Webstaurant import preview rows
- [x] TypeScript check: 0 errors
- [x] Tests: 45 passing
- [x] All 18 changed files pushed to GitHub via direct API (no orphan branch)

## Round 27 — Permissions & Auth (completed)

- [x] DB schema: added permissions (JSON) and mustResetPassword (boolean) columns to users table
- [x] DB migration: applied to TiDB Cloud
- [x] server/db.ts: createLocalUser, updateUserPermissions, setMustResetPassword helpers
- [x] server/routers.ts: adminUsers.createUser, adminUsers.resetPassword, adminUsers.updatePermissions procedures
- [x] UserManagement.tsx: Add User with auto-generated temp password (shown once, copy button), permission toggles per user, Reset Password
- [x] ForcePasswordReset.tsx: /reset-password page for first-login forced password change
- [x] AppLayout.tsx: redirects to /reset-password when mustResetPassword=true
- [x] Logo: embedded as base64 data URL in client/src/lib/logo.ts (no Render static file issues)
- [x] All Manus branding removed from user-facing UI

## Round 29 — Count Session Collaboration & Auto-Save

### Who created each session
- [x] Backend: update listCountSessions to LEFT JOIN users table and return creatorName (users.name)
- [x] Frontend CountSheet: show "Started by <name>" beneath each session chip in the history list
- [x] Frontend CountSheet: show "Started by <name>" in the active session banner

### Per-entry last-edited-by tracking
- [x] DB schema: add `updatedBy` int column (FK → users.id) to count_entries table
- [x] DB migration: apply updatedBy column to TiDB Cloud
- [x] Backend: update upsertEntry to accept and store updatedBy (ctx.user.id)
- [x] Backend: update getSessionWithEntries to return updatedBy + editorName (JOIN users)
- [x] Frontend CountSheet: show "Last edited by <name>" tooltip or small label on each item row when entry exists

### Instant auto-save (no debounce data loss)
- [x] Frontend CountSheet: reduce debounce from 800ms to 300ms so saves fire faster
- [x] Frontend CountSheet: add onBlur save — fire upsertEntry immediately when user leaves an input field (catches tab/swipe away before debounce fires)
- [x] Frontend CountSheet: show per-item save indicator (spinner while pending, green check when saved, red dot on error)
- [x] Frontend CountSheet: prevent completing a session while any entry is still pending save (disable Complete button with tooltip "Saving…")

## Round 30 — Welcome Email on User Creation

- [x] Install Resend npm package for transactional email
- [x] Add RESEND_API_KEY secret to environment
- [x] Add RESEND_FROM_EMAIL secret (sender address, e.g. no-reply@beignetsbrew.com)
- [x] Build server/email.ts helper: sendWelcomeEmail(to, name, tempPassword, loginUrl)
- [x] Build server/email.ts helper: sendPasswordResetEmail(to, name, tempPassword, loginUrl)
- [x] Update adminUsers.createUser procedure to call sendWelcomeEmail after user created
- [x] Update adminUsers.resetPassword procedure to call sendPasswordResetEmail after reset
- [x] Graceful fallback: if email fails, still return tempPassword (don't throw) and log warning
- [x] UserManagement.tsx: show "Email sent to <email>" toast on successful user creation

## Round 31 — Forgot Password Self-Service Flow

- [x] DB schema: add passwordResetTokens table (id, userId, token, expiresAt, usedAt, createdAt)
- [x] DB migration: apply passwordResetTokens table to TiDB Cloud
- [x] server/db.ts: add createPasswordResetToken, getPasswordResetToken, markTokenUsed helpers
- [x] server/email.ts: add sendPasswordResetRequestEmail(to, name, resetUrl)
- [x] server/routers.ts: add auth.requestPasswordReset publicProcedure (input: email) — creates token, sends email, always returns success (no user enumeration)
- [x] server/routers.ts: add auth.resetPasswordWithToken publicProcedure (input: token, newPassword) — validates token, updates password, marks token used
- [x] Frontend: add "Forgot password?" link on Login page
- [x] Frontend: create /forgot-password page — email input form, success state
- [x] Frontend: create /reset-password-link page — reads ?token= from URL, new password + confirm form
- [x] Frontend: register /forgot-password and /reset-password-link routes in App.tsx
- [x] Write vitest tests for requestPasswordReset and resetPasswordWithToken procedures

## Round 32 — UserManagement UI Fixes
- [x] Fix missing name: show email as fallback when user.name is null
- [x] Fix button row overflow: stack action buttons on small screens / Safari

## Round 33 — Count Sheet Glove Each-Count Bug Fix

- [x] Bug: entering a value in the "each" field for glove items (Glove Nitrile Large/Medium Powder Free Amethyst) caused the value to disappear immediately
- [x] Root cause: packSize "10/100 CT" was parsed as caseQty=1000 (10×100 individual gloves). Storing 2 eaches = 2/1000 = 0.002, which DECIMAL(10,2) rounded to 0.00 and read back as empty
- [x] Fix 1: widen count_entries.quantity from DECIMAL(10,2) to DECIMAL(10,4) in schema and both databases
- [x] Fix 2: update glove items in dev and production DB — set caseQty=10 (boxes per case) and eachPrice=$3.59/box, so "each" unit = 1 box of 100 gloves
- [x] Applied to dev database (Manus TiDB) and production database (beignets_brew on gateway01)
- [x] TypeScript: 0 errors, 53 tests pass

## Round 34 — Pack Size Parser Fix (System-Wide)

- [x] Root cause: parsePackSizeQty multiplied all segments for N/M CT/PK/EA formats, giving wrong caseQty for all multi-pack items (cups, lids, straws, napkins, forks, gloves, paper towels, register rolls)
- [x] New rule: 2-segment + CT/EA/PC: if first=1 use second number (single-pack), if first>1 use first number (outer pack count)
- [x] PK unit kept as multiply (2/12 PK = 24 individual cans/bottles — count by unit)
- [x] 1/N CT items preserved correctly (1/100 CT = 100 per case, 1/1000 CT = 1000 per case)
- [x] 24 items recalculated in both dev and production databases
- [x] Added 23 unit tests for parsePackSizeQty covering all patterns (76 tests total pass)
- [x] TypeScript: 0 errors

## Round 35 — Count Sheet UX: Collapse Counted Items & Default Collapsed Categories

- [x] Categories default to collapsed on page load
- [x] Counted items visually recede (dimmed/compact) but remain tappable to expand and edit
- [x] Category header shows counted/total progress (e.g. "3/12 counted")
- [x] Uncounted items remain fully visible within an open category

## Round 36 — Count Sheet UX Refinements

- [x] isCounted now checks localEachCounts so each-mode items also collapse correctly
- [x] Collapse triggered by scroll-out (IntersectionObserver) instead of a fixed 600ms timer
- [x] +/- buttons no longer trigger collapse — only scrolling away does
- [x] Category totals formatted with comma separators (toLocaleString)

## Round 37 — Order Threshold as Percentage of Par

- [x] Change orderThreshold column semantics: store as percentage (0–100), default 50
- [x] Update getOrderDashboard in db.ts: triggerLevel = parLevel * (threshold / 100)
- [x] Update Par Levels UI: show "%" suffix, placeholder "50", validation 1–100
- [x] Add tooltip/helper text explaining the percentage meaning
- [x] Migrate existing NULL orderThreshold rows to NULL (keep as default 50%)
- [x] Push to GitHub

## Round 49 — Persist "Done" state to DB

- [x] Add `confirmed` boolean column to `count_entries` table (default false)
- [x] Migrate dev and production databases
- [x] Update saveCount mutation to accept `confirmed` flag
- [x] Update handleDone to call saveCount with confirmed=true (upsert entry)
- [x] Update getSessionWithEntries to return `confirmed` field
- [x] Update countedItems filter to check `confirmed` from DB instead of markedDone
- [x] Keep markedDone as optimistic UI state (sync from DB on load)
- [x] Push to GitHub

## Round 50 — Export Count Session as CSV

- [x] Add counts.exportSession tRPC procedure that returns CSV string for a session
- [x] Add Export CSV button to Count Sheet active session header
- [x] Add Export CSV button to each session row in Count History
- [x] CSV columns: Category, Item Name, Vendor, Pack Size, Unit, Par Level, Quantity Counted, Confirmed, Last Edited By, Notes
- [x] Push to GitHub
