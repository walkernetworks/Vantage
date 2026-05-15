import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  cateringRecipeItems,
  cateringRecipes,
  countEntries,
  countSessions,
  items,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

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
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
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

export async function createItem(data: typeof items.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(items).values(data);
  return result[0];
}

export async function updateItem(id: number, data: Partial<typeof items.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(items).set(data).where(eq(items.id, id));
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
    return allItems.map((item) => ({
      ...item,
      currentStock: "0",
      casesNeeded: parseFloat(item.parLevel ?? "0"),
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
      const casesNeeded = Math.max(0, parLevel - currentStock);
      return { ...item, currentStock: String(currentStock), casesNeeded };
    })
    .filter((item) => item.casesNeeded > 0);
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
