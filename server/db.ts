import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  cateringRecipeItems,
  cateringRecipes,
  countEntries,
  countSessions,
  items,
  priceHistory,
  settingsCategories,
  settingsVendors,
  settingsStorageAreas,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

// ─── Pack Size Parsing ────────────────────────────────────────────────────────
// Parses "6/24oz", "12/2 LB", "1/50 LB", "4/1 GA" etc. and returns the case qty
export function parsePackSizeQty(packSize: string | null | undefined): number | null {
  if (!packSize) return null;
  // Match leading number before a slash: "6/24oz" -> 6, "12/2 LB" -> 12
  const match = packSize.trim().match(/^(\d+(?:\.\d+)?)\s*\//);
  if (match) {
    const qty = parseFloat(match[1]);
    return isNaN(qty) || qty <= 0 ? null : qty;
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

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

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
  // Re-compute eachPrice if packSize or price changed
  const enriched = (data.packSize !== undefined || data.price !== undefined)
    ? enrichItemWithPackSize(data)
    : data;
  await db.update(items).set(enriched).where(eq(items.id, id));
}

export async function deleteItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(items).set({ isActive: false }).where(eq(items.id, id));
}

export async function bulkCreateItems(data: (typeof items.$inferInsert)[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (data.length === 0) return;
  await db.insert(items).values(data);
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
  return db.select().from(countSessions).orderBy(desc(countSessions.createdAt)).limit(50);
}

export async function completeCountSession(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(countSessions).set({ completedAt: new Date() }).where(eq(countSessions.id, id));
}

// ─── Count Entries ────────────────────────────────────────────────────────────

export async function getCountEntries(sessionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(countEntries).where(eq(countEntries.sessionId, sessionId));
}

export async function upsertCountEntry(sessionId: number, itemId: number, quantity: string, notes?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db
    .select()
    .from(countEntries)
    .where(and(eq(countEntries.sessionId, sessionId), eq(countEntries.itemId, itemId)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(countEntries)
      .set({ quantity, notes: notes ?? null })
      .where(and(eq(countEntries.sessionId, sessionId), eq(countEntries.itemId, itemId)));
  } else {
    await db.insert(countEntries).values({ sessionId, itemId, quantity, notes: notes ?? null });
  }
}

export async function getSessionWithEntries(sessionId: number) {
  const db = await getDb();
  if (!db) return null;

  const session = await db.select().from(countSessions).where(eq(countSessions.id, sessionId)).limit(1);
  if (!session[0]) return null;

  const entries = await db
    .select({
      entryId: countEntries.id,
      quantity: countEntries.quantity,
      notes: countEntries.notes,
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
    })
    .from(countEntries)
    .innerJoin(items, eq(countEntries.itemId, items.id))
    .where(eq(countEntries.sessionId, sessionId));

  return { session: session[0], entries };
}

// ─── Orders / Par Level ───────────────────────────────────────────────────────

export async function getBelowParItems(vendor?: string) {
  const db = await getDb();
  if (!db) return [];

  // Get latest count session
  const sessions = await db
    .select()
    .from(countSessions)
    .orderBy(desc(countSessions.createdAt))
    .limit(1);

  const latestSession = sessions[0];

  const conditions = [eq(items.isActive, true)];
  if (vendor) conditions.push(eq(items.vendor, vendor));

  const allItems = await db.select().from(items).where(and(...conditions));

  if (!latestSession) {
    // No count session yet — show all items with par > 0 as needing a full order
    return allItems
      .filter((item) => parseFloat(item.parLevel ?? "0") > 0)
      .map((item) => ({
        ...item,
        currentStock: "0",
        casesNeeded: Math.ceil(parseFloat(item.parLevel ?? "0")),
        needsOrder: true,
      }));
  }

  const itemIds = allItems.map((i) => i.id);
  if (itemIds.length === 0) return [];

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

  return allItems
    .map((item) => {
      const currentStock = parseFloat(entryMap.get(item.id) ?? "0");
      const parLevel = parseFloat(item.parLevel ?? "0");
      // orderThreshold: fraction of par below which ordering is triggered (default 0.5 = 50%)
      const threshold = parseFloat(item.orderThreshold ?? "0.50");
      const triggerLevel = parLevel * threshold;
      const casesNeededRaw = Math.max(0, parLevel - currentStock);
      // Always round up — you can't order half a case
      const casesNeeded = Math.ceil(casesNeededRaw);
      const needsOrder = parLevel > 0 && currentStock < triggerLevel;
      return { ...item, currentStock: String(currentStock), casesNeeded, needsOrder };
    })
    .filter((item) => item.needsOrder);
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
  pfgProductNumber: string;
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
    // Look up by PFG product number first, then fall back to name match
    const existing = await db
      .select()
      .from(items)
      .where(eq(items.pfgProductNumber, row.pfgProductNumber))
      .limit(1);

        const caseQty = parsePackSizeQty(row.packSize);
    const eachPrice = computeEachPrice(row.price, caseQty);
    if (existing.length === 0) {
      // New item — create it
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
        pfgProductNumber: row.pfgProductNumber,
        isActive: true,
      });
      created++;
    } else {
      const item = existing[0];
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
