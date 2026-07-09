import { and, desc, eq, inArray, isNull, sql, aliasedTable } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import {
  InsertUser,
  cateringRecipeItems,
  cateringRecipes,
  countEntries,
  countSessions,
  items,
  passwordResetTokens,
  priceHistory,
  settingsCategories,
  settingsVendors,
  settingsStorageAreas,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { invokeLLM } from "./_core/llm";

// ─── Pack Size Parsing ────────────────────────────────────────────────────────
// Parses "6/24oz", "12/2 LB", "1/50 LB", "4/1 GA" etc. and returns the case qty
export function parsePackSizeQty(packSize: string | null | undefined): number | null {
  if (!packSize) return null;
  const s = packSize.trim();

  // Strip leading non-numeric prefix like "- " (Webstaurant format: "- 25/Case")
  const stripped = s.replace(/^[-\s]+/, "");

  // Pattern 0: Multi-slash — "4/6/12 OZ", "6/4/12 OZ", "2/12 PK", "12/750 ML", "10/100 CT"
  // Rules:
  //   3+ segments + size unit (OZ, ML…) → multiply all but last (last is serving size)
  //   2 segments + size unit            → first number is case qty ("12/750 ML" = 12 bottles)
  //   2 segments + PK                   → multiply both ("2/12 PK" = 24 individual cans/bottles)
  //   2 segments + CT/EA/PC + first=1   → use second number ("1/100 CT" = 100 units per case)
  //   2 segments + CT/EA/PC + first>1   → use first number ("10/100 CT" = 10 boxes, "16/135 CT" = 16 rolls)
  //   3+ segments + count unit          → multiply all but last
  const multiSlashMatch = stripped.match(/^((?:\d+\/)+)(\d+)\s*([A-Za-z]*)$/);
  if (multiSlashMatch) {
    const parts = stripped.split("/").map(p => parseFloat(p.replace(/[^\d.]/g, "")));
    const unit = multiSlashMatch[3].toUpperCase();
    const isSizeUnit = /^(OZ|ML|L|LT|LTR|GA|GAL|G|GR|LB|KG|CL|FL)$/i.test(unit);
    const isPkUnit = /^(PK|PACK)$/i.test(unit);
    const isCountUnit = /^(CT|EA|PC|PCS|COUNT|EACH|CASE|CS)$/i.test(unit);
    if (parts.length >= 2 && parts.every(p => !isNaN(p) && p > 0)) {
      if (parts.length >= 3 && isSizeUnit) {
        // "4/6/12 OZ" → 4×6=24 (last segment is serving size in oz)
        const qty = parts.slice(0, -1).reduce((a, b) => a * b, 1);
        if (!isNaN(qty) && qty > 0) return qty;
      } else if (parts.length === 2 && isSizeUnit) {
        // "12/750 ML" → 12 (first is case qty, second is bottle size)
        const qty = parts[0];
        if (!isNaN(qty) && qty > 0) return qty;
      } else if (isPkUnit) {
        // "2/12 PK" → 2×12=24 individual cans/bottles (count by unit, not by pack)
        const qty = parts.reduce((a, b) => a * b, 1);
        if (!isNaN(qty) && qty > 0) return qty;
      } else if (parts.length >= 3 && (isCountUnit || !unit)) {
        // "4/6/12 CT" → 4×6=24 (last is per-unit count)
        const qty = parts.slice(0, -1).reduce((a, b) => a * b, 1);
        if (!isNaN(qty) && qty > 0) return qty;
      } else if (parts.length === 2 && (isCountUnit || !unit)) {
        // "1/100 CT" → 100 (single-pack: first=1 means the second IS the case qty)
        // "10/100 CT" → 10 (outer pack count: 10 boxes of 100)
        // "16/135 CT" → 16 (outer pack count: 16 rolls of 135)
        const qty = parts[0] === 1 ? parts[1] : parts[0];
        if (!isNaN(qty) && qty > 0) return qty;
      } else {
        // Unknown unit — use first number as case qty
        const qty = parts[0];
        if (!isNaN(qty) && qty > 0) return qty;
      }
    }
  }

  // Pattern 1: N/... — leading number before slash: "6/6oz", "24/1oz", "25/Case"
  const slashLeading = stripped.match(/^(\d+(?:\.\d+)?)\s*\//);
  if (slashLeading) {
    const qty = parseFloat(slashLeading[1]);
    if (!isNaN(qty) && qty > 0) return qty;
  }

  // Pattern 2: .../N — number after slash when leading is non-numeric: "CS/6", "EA/12"
  const slashTrailing = stripped.match(/^[A-Za-z]+\s*\/(\d+(?:\.\d+)?)/);
  if (slashTrailing) {
    const qty = parseFloat(slashTrailing[1]);
    if (!isNaN(qty) && qty > 0) return qty;
  }

  // Pattern 3: N CT / N EA / N PK / N PACK — standalone count with unit suffix
  const countUnit = stripped.match(/^(\d+(?:\.\d+)?)\s*(?:CT|EA|PK|PC|PCS|PACK|COUNT|EACH)\b/i);
  if (countUnit) {
    const qty = parseFloat(countUnit[1]);
    if (!isNaN(qty) && qty > 0) return qty;
  }

  return null;
}

export function computeEachPrice(price: string | null | undefined, caseQty: number | null): string | null {
  if (!price || !caseQty || caseQty <= 0) return null;
  const p = parseFloat(price);
  if (isNaN(p)) return null;
  return (p / caseQty).toFixed(4);
}

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: ReturnType<typeof mysql.createPool> | null = null;
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: true },
        waitForConnections: true,
        connectionLimit: 10,
      });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}
export function getRawPool() { return _pool; }

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  // Always set admin for owner; never downgrade an existing admin on re-login
  if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  } else if (user.role !== undefined) {
    values.role = user.role;
    // Only include role in updateSet if explicitly elevating to admin
    if (user.role === "admin") updateSet.role = user.role;
    // Do NOT include role in updateSet for 'user' — preserve existing DB role
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      permissions: users.permissions,
      mustResetPassword: users.mustResetPassword,
      lastSignedIn: users.lastSignedIn,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.lastSignedIn));
}

export async function setUserRole(userId: number, role: "user" | "admin") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function setUserActive(userId: number, isActive: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ isActive }).where(eq(users.id, userId));
}

export async function updateUserPermissions(userId: number, permissions: string[] | null) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ permissions, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function setMustResetPassword(userId: number, mustResetPassword: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ mustResetPassword, updatedAt: new Date() }).where(eq(users.id, userId));
}

// ─── Items ────────────────────────────────────────────────────────────────────

export async function getAllItems(filters?: { vendor?: string; category?: string; isAlcohol?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(items.isActive, true)];
  if (filters?.vendor) conditions.push(eq(items.vendor, filters.vendor));
  if (filters?.category) conditions.push(eq(items.category, filters.category));
  if (filters?.isAlcohol !== undefined) conditions.push(eq(items.isAlcohol, filters.isAlcohol));
  return db.select().from(items).where(and(...conditions)).orderBy(items.category, items.name);
}

export async function getItemById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(items).where(eq(items.id, id)).limit(1);
  return result[0];
}

function enrichItemWithPackSize(data: Partial<typeof items.$inferInsert>): Partial<typeof items.$inferInsert> {
  // Auto-parse pack size to extract caseQty and compute eachPrice
  const packSize = data.packSize ?? null;
  const price = data.price ?? null;
  const caseQty = parsePackSizeQty(packSize);
  const eachPrice = computeEachPrice(price as string | null, caseQty);
  return {
    ...data,
    caseQty: caseQty ?? data.caseQty ?? null,
    eachPrice: eachPrice ?? data.eachPrice ?? null,
  };
}

export async function createItem(data: typeof items.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const enriched = enrichItemWithPackSize(data) as typeof items.$inferInsert;
  const result = await db.insert(items).values(enriched);
  return result[0];
}
export async function updateItem(id: number, data: Partial<typeof items.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // If packSize or price changed, recompute caseQty/eachPrice from the new values
  if (data.packSize !== undefined || data.price !== undefined) {
    const enriched = enrichItemWithPackSize(data);
    await db.update(items).set(enriched).where(eq(items.id, id));
    return;
  }
  // If only countMode changed (or any other field), fetch current price+packSize and
  // recompute eachPrice so switching to each mode always shows the correct per-unit price
  if (data.countMode !== undefined && data.eachPrice === undefined) {
    const current = await getItemById(id);
    if (current) {
      const caseQty = current.caseQty ?? parsePackSizeQty(current.packSize);
      const eachPrice = computeEachPrice(current.price, caseQty);
      await db.update(items).set({ ...data, caseQty: caseQty ?? current.caseQty, eachPrice: eachPrice ?? current.eachPrice ?? null }).where(eq(items.id, id));
      return;
    }
  }
  await db.update(items).set(data).where(eq(items.id, id));
}

export async function deleteItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(items).set({ isActive: false }).where(eq(items.id, id));
}

export async function bulkDeleteItems(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (ids.length === 0) return;
  await db.update(items).set({ isActive: false }).where(inArray(items.id, ids));
}

export async function bulkCreateItems(data: (typeof items.$inferInsert)[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (data.length === 0) return;
  await db.insert(items).values(data);
}

export async function recalcAllEachPrices() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const allItems = await db.select().from(items);
  let updated = 0;
  for (const item of allItems) {
    // Always recompute from packSize string — ignore stored caseQty so stale values get corrected
    const caseQty = parsePackSizeQty(item.packSize);
    const eachPrice = computeEachPrice(item.price, caseQty);
    const newCaseQty = caseQty ?? item.caseQty;
    const newEachPrice = eachPrice ?? item.eachPrice;
    if (newCaseQty !== item.caseQty || newEachPrice !== item.eachPrice) {
      await db.update(items)
        .set({ caseQty: newCaseQty, eachPrice: newEachPrice })
        .where(eq(items.id, item.id));
      updated++;
    }
  }
  return { updated, total: allItems.length };
}

// ─── Count Sessions ───────────────────────────────────────────────────────────

export async function createCountSession(data: typeof countSessions.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(countSessions).values(data);
  const id = (result[0] as any).insertId as number;
  const session = await db.select().from(countSessions).where(eq(countSessions.id, id)).limit(1);
  return session[0];
}

export async function getCountSession(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(countSessions).where(eq(countSessions.id, id)).limit(1);
  return result[0];
}

export async function listCountSessions() {
  const db = await getDb();
  if (!db) return [];
  const creator = aliasedTable(users, "creator");
  const rows = await db
    .select({
      id: countSessions.id,
      name: countSessions.name,
      notes: countSessions.notes,
      createdBy: countSessions.createdBy,
      creatorName: creator.name,
      completedAt: countSessions.completedAt,
      createdAt: countSessions.createdAt,
      updatedAt: countSessions.updatedAt,
    })
    .from(countSessions)
    .leftJoin(creator, eq(countSessions.createdBy, creator.id))
    .orderBy(desc(countSessions.createdAt))
    .limit(50);
  return rows;
}

export async function completeCountSession(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(countSessions).set({ completedAt: new Date() }).where(eq(countSessions.id, id));
}
export async function reopenCountSession(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(countSessions).set({ completedAt: null }).where(eq(countSessions.id, id));
}

export async function deleteCountSession(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Delete all entries first (foreign key), then the session
  await db.delete(countEntries).where(eq(countEntries.sessionId, id));
  await db.delete(countSessions).where(eq(countSessions.id, id));
}

// ─── Count Entries ────────────────────────────────────────────────────────────

export async function getCountEntries(sessionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(countEntries).where(eq(countEntries.sessionId, sessionId));
}

export async function upsertCountEntry(
  sessionId: number,
  itemId: number,
  quantity: string,
  notes?: string,
  updatedBy?: number,
  confirmed?: boolean
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db
    .select()
    .from(countEntries)
    .where(and(eq(countEntries.sessionId, sessionId), eq(countEntries.itemId, itemId)))
    .limit(1);

  if (existing.length > 0) {
    // Only update confirmed if explicitly provided (don't reset it on normal saves)
    const updateData: Record<string, unknown> = { quantity, notes: notes ?? null, updatedBy: updatedBy ?? null };
    if (confirmed !== undefined) updateData.confirmed = confirmed;
    await db
      .update(countEntries)
      .set(updateData as any)
      .where(and(eq(countEntries.sessionId, sessionId), eq(countEntries.itemId, itemId)));
  } else {
    await db.insert(countEntries).values({
      sessionId,
      itemId,
      quantity,
      notes: notes ?? null,
      updatedBy: updatedBy ?? null,
      confirmed: confirmed ?? false,
    });
  }
}

export async function getSessionWithEntries(sessionId: number) {
  const db = await getDb();
  if (!db) return null;

  const session = await db.select().from(countSessions).where(eq(countSessions.id, sessionId)).limit(1);
  if (!session[0]) return null;

  const editor = aliasedTable(users, "editor");
  const entries = await db
    .select({
      entryId: countEntries.id,
      quantity: countEntries.quantity,
      confirmed: countEntries.confirmed,
      notes: countEntries.notes,
      updatedBy: countEntries.updatedBy,
      editorName: editor.name,
      updatedAt: countEntries.updatedAt,
      itemId: items.id,
      itemName: items.name,
      category: items.category,
      vendor: items.vendor,
      storageArea: items.storageArea,
      price: items.price,
      packSize: items.packSize,
      unitOfMeasure: items.unitOfMeasure,
      parLevel: items.parLevel,
      isAlcohol: items.isAlcohol,
      alcoholCategory: items.alcoholCategory,
      eachPrice: items.eachPrice,
      countMode: items.countMode,
      caseQty: items.caseQty,
    })
    .from(countEntries)
    .innerJoin(items, eq(countEntries.itemId, items.id))
    .leftJoin(editor, eq(countEntries.updatedBy, editor.id))
    .where(eq(countEntries.sessionId, sessionId));

  return { session: session[0], entries };
}

// ─── Orders / Par Level ───────────────────────────────────────────────────────

export async function getBelowParItems(vendor?: string) {
  const db = await getDb();
  if (!db) return { session: null, items: [] };
  // Get latest count session
  const sessions = await db
    .select()
    .from(countSessions)
    .orderBy(desc(countSessions.createdAt))
    .limit(1);
  const latestSession = sessions[0] ?? null;
  const conditions = [eq(items.isActive, true)];
  if (vendor) conditions.push(eq(items.vendor, vendor));
  const allItems = await db.select().from(items).where(and(...conditions));
  if (!latestSession) {
    // No count session yet — show all items with par > 0 as needing a full order
    const orderItems = allItems
      .filter((item) => parseFloat(item.parLevel ?? "0") > 0)
      .map((item) => ({
        ...item,
        currentStock: "0",
        casesNeeded: Math.ceil(parseFloat(item.parLevel ?? "0")),
        needsOrder: true,
      }));
    return { session: null, items: orderItems };
  }
  const itemIds = allItems.map((i) => i.id);
  if (itemIds.length === 0) return { session: latestSession, items: [] };
  const entries = await db
    .select()
    .from(countEntries)
    .where(
      and(
        eq(countEntries.sessionId, latestSession.id),
        inArray(countEntries.itemId, itemIds)
      )
    );
  const entryMap = new Map(entries.map((e) => [e.itemId, e.quantity]));
  const orderItems = allItems
    .map((item) => {
      const rawQty = parseFloat(entryMap.get(item.id) ?? "0");
      // If item is counted in eaches, convert back to cases for order math
      const currentStock =
        item.countMode === "each" && item.caseQty && item.caseQty > 0
          ? rawQty / item.caseQty
          : rawQty;
      const parLevel = parseFloat(item.parLevel ?? "0");
      // orderThreshold is stored as a percentage (0–100); default is 50%
      const thresholdPct = item.orderThreshold ? parseFloat(item.orderThreshold) : 50;
      const triggerLevel = parLevel * (thresholdPct / 100);
      const casesNeededRaw = Math.max(0, parLevel - currentStock);
      const casesNeeded = Math.ceil(casesNeededRaw);
      const needsOrder = parLevel > 0 && currentStock <= triggerLevel;
      return { ...item, currentStock: String(currentStock), casesNeeded, needsOrder };
    })
    .filter((item) => item.needsOrder);
  return { session: latestSession, items: orderItems };
}

// ─── Catering ─────────────────────────────────────────────────────────────────

export async function listCateringRecipes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cateringRecipes).orderBy(cateringRecipes.name);
}

export async function getCateringRecipe(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(cateringRecipes).where(eq(cateringRecipes.id, id)).limit(1);
  return result[0];
}

export async function createCateringRecipe(data: typeof cateringRecipes.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(cateringRecipes).values(data);
  const id = (result[0] as any).insertId as number;
  const recipe = await db.select().from(cateringRecipes).where(eq(cateringRecipes.id, id)).limit(1);
  return recipe[0];
}

export async function updateCateringRecipe(id: number, data: Partial<typeof cateringRecipes.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(cateringRecipes).set(data).where(eq(cateringRecipes.id, id));
}

export async function deleteCateringRecipe(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(cateringRecipeItems).where(eq(cateringRecipeItems.recipeId, id));
  await db.delete(cateringRecipes).where(eq(cateringRecipes.id, id));
}

export async function getRecipeItems(recipeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: cateringRecipeItems.id,
      recipeId: cateringRecipeItems.recipeId,
      itemId: cateringRecipeItems.itemId,
      quantityNeeded: cateringRecipeItems.quantityNeeded,
      unit: cateringRecipeItems.unit,
      notes: cateringRecipeItems.notes,
      itemName: items.name,
      category: items.category,
      storageArea: items.storageArea,
      price: items.price,
    })
    .from(cateringRecipeItems)
    .innerJoin(items, eq(cateringRecipeItems.itemId, items.id))
    .where(eq(cateringRecipeItems.recipeId, recipeId));
}

export async function addRecipeItem(data: typeof cateringRecipeItems.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(cateringRecipeItems).values(data);
}

export async function removeRecipeItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(cateringRecipeItems).where(eq(cateringRecipeItems.id, id));
}

// ─── PFG Import & Price History ─────────────────────────────────────────────────────

export type PfgImportRow = {
  itemNumber: string;
  name: string;
  brand: string;
  category: string;
  vendor: string;
  packSize: string;
  unitOfMeasure: string;
  price: string;
  isAlcohol: boolean;
  alcoholCategory?: string;
  storageArea?: string;
};

export type PfgImportResult = {
  created: number;
  updated: number;
  unchanged: number;
  priceChanges: Array<{
    itemId: number;
    name: string;
    brand: string;
    oldPrice: string;
    newPrice: string;
    diff: string;
    pctChange: string;
  }>;
};

export async function importPfgItems(rows: PfgImportRow[]): Promise<PfgImportResult> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const priceChanges: PfgImportResult["priceChanges"] = [];

  for (const row of rows) {
    // Look up by PFG product number (including soft-deleted rows)
    const existing = await db
      .select()
      .from(items)
      .where(and(eq(items.vendor, "PFG"), eq(items.itemNumber, row.itemNumber)))
      .limit(1);

    const caseQty = parsePackSizeQty(row.packSize);
    const eachPrice = computeEachPrice(row.price, caseQty);

    if (existing.length === 0) {
      // Truly new item — create it
      await db.insert(items).values({
        name: row.name,
        brand: row.brand,
        category: row.category,
        vendor: "PFG",
        packSize: row.packSize,
        unitOfMeasure: "Case",
        price: row.price,
        caseQty,
        eachPrice,
        parLevel: "0",
        storageArea: row.storageArea ?? "Dry Storage",
        isAlcohol: row.isAlcohol,
        alcoholCategory: row.alcoholCategory ?? null,
        itemNumber: row.itemNumber,
        isActive: true,
      });
      created++;
    } else {
      const item = existing[0];

      // If the item was soft-deleted, reactivate it and treat as a fresh insert
      if (!item.isActive) {
        await db
          .update(items)
          .set({
            name: row.name,
            brand: row.brand,
            category: row.category,
            vendor: "PFG",
            packSize: row.packSize,
            unitOfMeasure: "Case",
            price: row.price,
            caseQty,
            eachPrice,
            storageArea: row.storageArea ?? item.storageArea ?? "Dry Storage",
            isAlcohol: row.isAlcohol,
            alcoholCategory: row.alcoholCategory ?? null,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(items.id, item.id));
        created++;
        continue;
      }

      const oldPrice = item.price ?? "0";
      const newPrice = row.price;
      if (parseFloat(oldPrice) !== parseFloat(newPrice)) {
        // Price changed — record history and update
        await db.insert(priceHistory).values({
          itemId: item.id,
          oldPrice,
          newPrice,
          importSource: "PFG",
        });
        const diff = parseFloat(newPrice) - parseFloat(oldPrice);
        const pct = oldPrice !== "0" ? (diff / parseFloat(oldPrice)) * 100 : 0;
        priceChanges.push({
          itemId: item.id,
          name: item.name,
          brand: item.brand ?? row.brand,
          oldPrice,
          newPrice,
          diff: diff.toFixed(2),
          pctChange: pct.toFixed(1),
        });
        await db
          .update(items)
          .set({ price: newPrice, brand: row.brand, packSize: row.packSize, caseQty, eachPrice, updatedAt: new Date() })
          .where(eq(items.id, item.id));
        updated++;
      } else {
        // Price unchanged — still update brand/packSize/caseQty/eachPrice in case they changed
        await db
          .update(items)
          .set({ brand: row.brand, packSize: row.packSize, caseQty, eachPrice, updatedAt: new Date() })
          .where(eq(items.id, item.id));
        unchanged++;
      }
    }
  }

  return { created, updated, unchanged, priceChanges };
}

export async function getPriceHistory(itemId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.itemId, itemId))
    .orderBy(desc(priceHistory.importedAt))
    .limit(20);
}

export async function calculateShortfall(recipeId: number, orderVolume: number) {
  const db = await getDb();
  if (!db) return [];

  const recipe = await getCateringRecipe(recipeId);
  if (!recipe) return [];

  const recipeItemsList = await getRecipeItems(recipeId);
  const baseServings = recipe.baseServings;
  const multiplier = orderVolume / baseServings;

  // Get latest count session
  const sessions = await db
    .select()
    .from(countSessions)
    .orderBy(desc(countSessions.createdAt))
    .limit(1);

  const latestSession = sessions[0];
  const itemIds = recipeItemsList.map((ri) => ri.itemId);

  let entryMap = new Map<number, string>();
  if (latestSession && itemIds.length > 0) {
    const entries = await db
      .select()
      .from(countEntries)
      .where(
        and(
          eq(countEntries.sessionId, latestSession.id),
          inArray(countEntries.itemId, itemIds)
        )
      );
    entryMap = new Map(entries.map((e) => [e.itemId, e.quantity]));
  }

  return recipeItemsList.map((ri) => {
    const needed = parseFloat(ri.quantityNeeded) * multiplier;
    const currentStock = parseFloat(entryMap.get(ri.itemId) ?? "0");
    const shortfall = Math.max(0, needed - currentStock);
    return {
      itemId: ri.itemId,
      itemName: ri.itemName,
      category: ri.category,
      quantityNeeded: needed,
      currentStock,
      shortfall,
      isShort: shortfall > 0,
      unit: ri.unit,
    };
  });
}

// ─── Settings: Categories ─────────────────────────────────────────────────────

export async function getCategories() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(settingsCategories).orderBy(settingsCategories.sortOrder, settingsCategories.name);
}

export async function addCategory(name: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(settingsCategories).values({ name: name.trim() });
}

export async function updateCategory(id: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(settingsCategories).set({ name: name.trim() }).where(eq(settingsCategories.id, id));
}

export async function deleteCategory(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(settingsCategories).where(eq(settingsCategories.id, id));
}

// ─── Settings: Vendors ────────────────────────────────────────────────────────

export async function getVendors() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(settingsVendors).orderBy(settingsVendors.sortOrder, settingsVendors.name);
}

export async function addVendor(name: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(settingsVendors).values({ name: name.trim() });
}

export async function updateVendor(id: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(settingsVendors).set({ name: name.trim() }).where(eq(settingsVendors.id, id));
}

export async function deleteVendor(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(settingsVendors).where(eq(settingsVendors.id, id));
}

// ─── Settings: Storage Areas ──────────────────────────────────────────────────

export async function getStorageAreas() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(settingsStorageAreas).orderBy(settingsStorageAreas.sortOrder, settingsStorageAreas.name);
}

export async function addStorageArea(name: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(settingsStorageAreas).values({ name: name.trim() });
}

export async function updateStorageArea(id: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(settingsStorageAreas).set({ name: name.trim() }).where(eq(settingsStorageAreas.id, id));
}

export async function deleteStorageArea(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(settingsStorageAreas).where(eq(settingsStorageAreas.id, id));
}

// ─── AI Item Name Generation ──────────────────────────────────────────────────

/**
 * Uses the LLM to generate a clean, concise internal item name from raw vendor data.
 * e.g. "COFFEE CREAMER FRENCH VANILLA 6/32OZ" + brand "International Delight" → "French Vanilla Coffee Creamer"
 * Falls back to the rawName if the LLM call fails.
 */
export async function generateCleanItemName(
  rawName: string,
  brand: string | null,
  packSize: string | null
): Promise<string> {
  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
"You are a food & beverage inventory naming assistant. Your job is to produce the SHORTEST possible practical name for an item — 2 to 4 words maximum. Strip ALL of the following: brand names, vendor names, pack counts, sizes, weights, dimensions, adjectives like 'choice'/'premium'/'customizable', certifications, and spec codes. Keep only the core product type and one key distinguishing word if needed. Examples: 'Tampersafe Dome Lid', 'French Vanilla Creamer', 'Blood Orange Syrup', 'N2O Cream Chargers', 'Cocktail Napkins', 'Plastic Straw', 'Espresso Cup'. Return ONLY the name, nothing else, no punctuation, no quotes.",
        },
        {
          role: "user",
          content: `Raw description: ${rawName}\nBrand: ${brand ?? "unknown"}\nPack size: ${packSize ?? "unknown"}`,
        },
      ],
      max_tokens: 32,
    });
    const name = (result.choices[0]?.message?.content as string)?.trim();
    return name && name.length > 0 && name.length < 120 ? name : rawName;
  } catch {
    return rawName;
  }
}

// ─── Webstaurant Import ───────────────────────────────────────────────────────

export type WebstaurantImportRow = {
  itemNumber: string;
  rawName: string;          // original vendor description
  cleanName: string;        // AI-generated clean name
  brand: string;
  packSize: string;
  price: string;
};

export type WebstaurantImportResult = {
  created: number;
  updated: number;
  unchanged: number;
  priceChanges: Array<{
    itemId: number;
    name: string;
    oldPrice: string;
    newPrice: string;
    diff: string;
    pctChange: string;
  }>;
};

export async function importWebstaurantItems(
  rows: WebstaurantImportRow[]
): Promise<WebstaurantImportResult> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const priceChanges: WebstaurantImportResult["priceChanges"] = [];

  for (const row of rows) {
    // Look up by Webstaurant item number (including soft-deleted rows)
    const existing = await db
      .select()
      .from(items)
      .where(and(eq(items.vendor, "Webstaurant"), eq(items.itemNumber, row.itemNumber)))
      .limit(1);

    const caseQty = parsePackSizeQty(row.packSize);
    const eachPrice = computeEachPrice(row.price, caseQty);

    if (existing.length === 0) {
      // Truly new item — create it
      await db.insert(items).values({
        name: row.cleanName,
        brand: row.brand || null,
        category: "Other",
        vendor: "Webstaurant",
        packSize: row.packSize || null,
        unitOfMeasure: "Case",
        price: row.price,
        caseQty,
        eachPrice,
        parLevel: "0",
        storageArea: "Dry Storage",
        isAlcohol: false,
        itemNumber: row.itemNumber,
        isActive: true,
      });
      created++;
    } else {
      const item = existing[0];

      // If the item was soft-deleted, reactivate it and treat as a fresh insert
      if (!item.isActive) {
        await db
          .update(items)
          .set({
            name: row.cleanName,
            brand: row.brand || null,
            vendor: "Webstaurant",
            packSize: row.packSize || null,
            unitOfMeasure: "Case",
            price: row.price,
            caseQty,
            eachPrice,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(items.id, item.id));
        created++;
        continue;
      }

      const oldPrice = item.price ?? "0";
      const newPrice = row.price;

      if (parseFloat(oldPrice) !== parseFloat(newPrice)) {
        await db.insert(priceHistory).values({
          itemId: item.id,
          oldPrice,
          newPrice,
          importSource: "Webstaurant",
        });
        const diff = parseFloat(newPrice) - parseFloat(oldPrice);
        const pct = parseFloat(oldPrice) !== 0 ? (diff / parseFloat(oldPrice)) * 100 : 0;
        priceChanges.push({
          itemId: item.id,
          name: item.name,
          oldPrice,
          newPrice,
          diff: diff.toFixed(2),
          pctChange: pct.toFixed(1),
        });
        await db
          .update(items)
          .set({ price: newPrice, packSize: row.packSize, caseQty, eachPrice, updatedAt: new Date() })
          .where(eq(items.id, item.id));
        updated++;
      } else {
        await db
          .update(items)
          .set({ packSize: row.packSize, caseQty, eachPrice, updatedAt: new Date() })
          .where(eq(items.id, item.id));
        unchanged++;
      }
    }
  }

  return { created, updated, unchanged, priceChanges };
}

// ─── Bulk Par Level Update ────────────────────────────────────────────────────

export async function bulkUpdateParLevels(
  updates: Array<{ id: number; parLevel: string }>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  for (const u of updates) {
    await db
      .update(items)
      .set({ parLevel: u.parLevel, updatedAt: new Date() })
      .where(eq(items.id, u.id));
  }
}

export async function bulkUpdateOrderThresholds(
  updates: Array<{ id: number; orderThreshold: string }>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  for (const u of updates) {
    await db
      .update(items)
      .set({ orderThreshold: u.orderThreshold, updatedAt: new Date() })
      .where(eq(items.id, u.id));
  }
}

// ─── Universal (AI-mapped) Import ─────────────────────────────────────────────

export type UniversalImportRow = {
  name: string;           // cleaned item name (required)
  brand?: string;
  category?: string;      // mapped to internal category
  vendor?: string;
  packSize?: string;
  unitOfMeasure?: string;
  price?: string;
  storageArea?: string;
  isAlcohol?: boolean;
  alcoholCategory?: string;
  notes?: string;
};

export type UniversalImportResult = {
  created: number;
  updated: number;
  unchanged: number;
  priceChanges: Array<{
    itemId: number;
    name: string;
    brand: string;
    oldPrice: string;
    newPrice: string;
    diff: string;
    pctChange: string;
  }>;
};

export async function importUniversalItems(
  rows: UniversalImportRow[],
  importSource: string
): Promise<UniversalImportResult> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const priceChanges: UniversalImportResult["priceChanges"] = [];

  for (const row of rows) {
    if (!row.name?.trim()) continue;

    const caseQty = parsePackSizeQty(row.packSize ?? null);
    const newPrice = row.price ?? "0";
    const eachPrice = computeEachPrice(newPrice, caseQty);

    // Match by exact name (case-insensitive) — best effort for formats without product numbers
    const existing = await db
      .select()
      .from(items)
      .where(eq(items.name, row.name.trim()))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(items).values({
        name: row.name.trim(),
        brand: row.brand ?? null,
        category: row.category ?? "Other",
        vendor: row.vendor ?? importSource,
        packSize: row.packSize ?? null,
        unitOfMeasure: row.unitOfMeasure ?? "Case",
        price: newPrice,
        caseQty,
        eachPrice,
        parLevel: "0",
        storageArea: row.storageArea ?? "Dry Storage",
        isAlcohol: row.isAlcohol ?? false,
        alcoholCategory: row.alcoholCategory ?? null,
        notes: row.notes ?? null,
        isActive: true,
      });
      created++;
    } else {
      const item = existing[0];

      if (!item.isActive) {
        await db
          .update(items)
          .set({
            brand: row.brand ?? item.brand,
            category: row.category ?? item.category,
            vendor: row.vendor ?? item.vendor ?? importSource,
            packSize: row.packSize ?? item.packSize,
            unitOfMeasure: row.unitOfMeasure ?? item.unitOfMeasure,
            price: newPrice,
            caseQty,
            eachPrice,
            storageArea: row.storageArea ?? item.storageArea,
            isAlcohol: row.isAlcohol ?? item.isAlcohol,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(items.id, item.id));
        created++;
        continue;
      }

      const oldPrice = item.price ?? "0";
      if (parseFloat(oldPrice) !== parseFloat(newPrice)) {
        await db.insert(priceHistory).values({
          itemId: item.id,
          oldPrice,
          newPrice,
          importSource,
        });
        const diff = parseFloat(newPrice) - parseFloat(oldPrice);
        const pct = parseFloat(oldPrice) !== 0 ? (diff / parseFloat(oldPrice)) * 100 : 0;
        priceChanges.push({
          itemId: item.id,
          name: item.name,
          brand: row.brand ?? item.brand ?? "",
          oldPrice,
          newPrice,
          diff: diff.toFixed(2),
          pctChange: pct.toFixed(1),
        });
        await db
          .update(items)
          .set({
            price: newPrice,
            brand: row.brand ?? item.brand,
            packSize: row.packSize ?? item.packSize,
            caseQty,
            eachPrice,
            updatedAt: new Date(),
          })
          .where(eq(items.id, item.id));
        updated++;
      } else {
        await db
          .update(items)
          .set({
            brand: row.brand ?? item.brand,
            packSize: row.packSize ?? item.packSize,
            caseQty,
            eachPrice,
            updatedAt: new Date(),
          })
          .where(eq(items.id, item.id));
        unchanged++;
      }
    }
  }

  return { created, updated, unchanged, priceChanges };
}

// ─── Dashboard Metrics ────────────────────────────────────────────────────────

/**
 * Returns three datasets for the main dashboard charts:
 * 1. inventoryValueByCategory: current total value (price × parLevel) per category
 * 2. priceFluctuationsByVendor: monthly avg price changes per importSource over last 12 months
 * 3. orderCostTrend: estimated monthly order cost (items below par × price) from count sessions
 */
export async function getDashboardMetrics() {
  const db = await getDb();
  if (!db) return { inventoryValueByCategory: [], priceFluctuationsByVendor: [], orderCostTrend: [] };

  // 1. Inventory value by category:
  //    - fullParValue: sum(price * parLevel) — what stock would be worth at full par
  //    - currentStockValue: sum(price * latest_count_quantity) — actual counted value
  //    - gapToFullPar: fullParValue - currentStockValue — cost to restock to full par
  type CategoryRow = { category: string; fullParValue: string; currentStockValue: string; itemCount: number };
  let categoryRows: CategoryRow[] = [];
  try {
    // Get the latest count session ID
    const latestSessionResult = await db.execute(
      sql`SELECT id FROM count_sessions ORDER BY createdAt DESC LIMIT 1`
    );
    const latestSessionRows = (latestSessionResult[0] as unknown as { id: number }[]) ?? [];
    const latestSessionId = latestSessionRows[0]?.id ?? null;

    if (latestSessionId) {
      const result = await db.execute(
        sql`SELECT i.category,
               ROUND(SUM(COALESCE(i.price, 0) * COALESCE(i.parLevel, 0)), 2) AS fullParValue,
               ROUND(SUM(COALESCE(i.price, 0) * COALESCE(ce.quantity, 0)), 2) AS currentStockValue,
               COUNT(DISTINCT i.id) AS itemCount
            FROM items i
            LEFT JOIN count_entries ce ON ce.itemId = i.id AND ce.sessionId = ${latestSessionId}
            WHERE i.isActive = 1
            GROUP BY i.category
            ORDER BY fullParValue DESC`
      );
      categoryRows = (result[0] as unknown as CategoryRow[]) ?? [];
    } else {
      // No sessions yet — just show par values, current = 0
      const result = await db.execute(
        sql`SELECT category,
               ROUND(SUM(COALESCE(price, 0) * COALESCE(parLevel, 0)), 2) AS fullParValue,
               0 AS currentStockValue,
               COUNT(*) AS itemCount
            FROM items
            WHERE isActive = 1
            GROUP BY category
            ORDER BY fullParValue DESC`
      );
      categoryRows = (result[0] as unknown as CategoryRow[]) ?? [];
    }
  } catch (e) {
    console.warn("[dashboard] inventoryValueByCategory query failed:", e);
  }

  // 2. Price fluctuations by vendor: monthly avg price change % per importSource (last 12 months)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const cutoff = twelveMonthsAgo.toISOString().slice(0, 10);

  type PriceRow = { importSource: string; month: string; avgOldPrice: string; avgNewPrice: string; changeCount: number };
  let priceRows: PriceRow[] = [];
  try {
    const result = await db.execute(
      sql`SELECT importSource,
             DATE_FORMAT(importedAt, '%Y-%m') AS month,
             AVG(COALESCE(oldPrice, newPrice)) AS avgOldPrice,
             AVG(newPrice) AS avgNewPrice,
             COUNT(*) AS changeCount
          FROM price_history
          WHERE importedAt >= ${cutoff}
          GROUP BY importSource, DATE_FORMAT(importedAt, '%Y-%m')
          ORDER BY month ASC`
    );
    priceRows = (result[0] as unknown as PriceRow[]) ?? [];
  } catch (e) {
    console.warn("[dashboard] priceFluctuationsByVendor query failed:", e);
  }

  // 3. Order cost trend: from count sessions — sum of (price × max(0, parLevel - quantity)) per completed session
  const sessionRows = await db
    .select({
      sessionId: countSessions.id,
      sessionName: countSessions.name,
      completedAt: countSessions.completedAt,
      createdAt: countSessions.createdAt,
    })
    .from(countSessions)
    .orderBy(desc(countSessions.createdAt))
    .limit(24);

  const orderCostData: { month: string; estimatedCost: number; sessionCount: number }[] = [];

  if (sessionRows.length > 0) {
    // For each session, compute estimated order cost = sum(price * max(0, parLevel - quantity))
    const sessionIds = sessionRows.map((s) => s.sessionId);
    const entryRows = await db
      .select({
        sessionId: countEntries.sessionId,
        quantity: countEntries.quantity,
        itemPrice: items.price,
        itemParLevel: items.parLevel,
      })
      .from(countEntries)
      .innerJoin(items, eq(countEntries.itemId, items.id))
      .where(inArray(countEntries.sessionId, sessionIds));

    // Group by session
    const sessionCosts: Record<number, number> = {};
    for (const entry of entryRows) {
      const qty = parseFloat(entry.quantity ?? "0");
      const par = parseFloat(entry.itemParLevel ?? "0");
      const price = parseFloat(entry.itemPrice ?? "0");
      const shortfall = Math.max(0, par - qty);
      sessionCosts[entry.sessionId] = (sessionCosts[entry.sessionId] ?? 0) + shortfall * price;
    }

    // Group sessions by month
    const monthMap: Record<string, { cost: number; count: number }> = {};
    for (const session of sessionRows) {
      const date = session.completedAt ?? session.createdAt;
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!monthMap[month]) monthMap[month] = { cost: 0, count: 0 };
      monthMap[month].cost += sessionCosts[session.sessionId] ?? 0;
      monthMap[month].count += 1;
    }

    for (const [month, { cost, count }] of Object.entries(monthMap).sort()) {
      orderCostData.push({ month, estimatedCost: Math.round(cost * 100) / 100, sessionCount: count });
    }
  }

  return {
    inventoryValueByCategory: categoryRows.map((r) => ({
      category: r.category,
      totalValue: parseFloat((r as any).fullParValue ?? "0"),
      fullParValue: parseFloat((r as any).fullParValue ?? "0"),
      currentStockValue: parseFloat((r as any).currentStockValue ?? "0"),
      gapToFullPar: Math.max(0, parseFloat((r as any).fullParValue ?? "0") - parseFloat((r as any).currentStockValue ?? "0")),
      itemCount: r.itemCount,
    })),
    priceFluctuationsByVendor: priceRows.map((r) => ({
      importSource: r.importSource,
      month: r.month,
      avgOldPrice: parseFloat(r.avgOldPrice ?? "0"),
      avgNewPrice: parseFloat(r.avgNewPrice ?? "0"),
      changeCount: r.changeCount,
      changePct:
        parseFloat(r.avgOldPrice ?? "0") > 0
          ? Math.round(
              ((parseFloat(r.avgNewPrice ?? "0") - parseFloat(r.avgOldPrice ?? "0")) /
                parseFloat(r.avgOldPrice ?? "0")) *
                1000
            ) / 10
          : 0,
    })),
    orderCostTrend: orderCostData,
  };
}

// ─── Bulk Update Items ────────────────────────────────────────────────────────
export async function bulkUpdateItems(
  ids: number[],
  patch: {
    brand?: string;
    vendor?: string;
    category?: string;
    storageArea?: string;
    parLevel?: number;
  }
): Promise<number> {
  const db = await getDb();
  if (!db || ids.length === 0) return 0;

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.brand !== undefined) updateData.brand = patch.brand;
  if (patch.vendor !== undefined) updateData.vendor = patch.vendor;
  if (patch.category !== undefined) updateData.category = patch.category;
  if (patch.storageArea !== undefined) updateData.storageArea = patch.storageArea;
  if (patch.parLevel !== undefined) updateData.parLevel = patch.parLevel;

  await db.update(items).set(updateData).where(inArray(items.id, ids));
  return ids.length;
}

// ─── Local Auth Helpers ───────────────────────────────────────────────────────

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  return result[0];
}

export async function createLocalUser(data: {
  name: string;
  email: string;
  passwordHash: string;
  role?: "user" | "admin";
  mustResetPassword?: boolean;
  permissions?: string[] | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(users).values({
    name: data.name,
    email: data.email.toLowerCase().trim(),
    passwordHash: data.passwordHash,
    loginMethod: "email",
    role: data.role ?? "user",
    mustResetPassword: data.mustResetPassword ?? false,
    permissions: data.permissions ?? null,
    lastSignedIn: new Date(),
  });
  const insertId = (result as any)[0]?.insertId ?? (result as any).insertId;
  return getUserById(Number(insertId));
}

export async function updateUserPassword(userId: number, passwordHash: string, clearMustReset = false) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ passwordHash, mustResetPassword: clearMustReset ? false : undefined, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function updateUserProfile(
  userId: number,
  data: { name?: string }
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

// ─── Password Reset Tokens ────────────────────────────────────────────────────

export async function createPasswordResetToken(userId: number, token: string, expiresAt: Date) {
  await getDb(); // ensure pool is initialized
  const pool = getRawPool();
  if (!pool) return;
  // Use raw mysql2 pool to bypass Drizzle ORM null-serialization issues
  const expiresAtStr = expiresAt.toISOString().slice(0, 19).replace('T', ' ');
  await pool.promise().execute(
    'INSERT INTO password_reset_tokens (userId, token, expiresAt) VALUES (?, ?, ?)',
    [userId, token, expiresAtStr]
  );
}

export async function getPasswordResetToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token))
    .limit(1);
  return rows[0] ?? null;
}

export async function markTokenUsed(tokenId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, tokenId));
}
