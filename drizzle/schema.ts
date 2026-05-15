import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  index,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Item Catalog ─────────────────────────────────────────────────────────────

export const CATEGORIES = [
  "Alcohol - 100",
  "Alcohol - 130",
  "Coffee",
  "Bakery",
  "Dairy",
  "Dry Goods",
  "Paper Goods",
  "Produce",
  "Protein",
  "Syrups",
  "Supplies",
  "Other",
] as const;

export const VENDORS = ["PFG", "Webstaurant", "Savannah Distributing", "Other"] as const;

export const STORAGE_AREAS = ["Dry Storage", "Walk-In", "Freezer", "Bar", "Other"] as const;

export const UNITS = ["CS", "EACH", "LB", "OZ", "GAL", "BTL", "BAG", "BOX", "PKG"] as const;

export const items = mysqlTable(
  "items",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    category: varchar("category", { length: 64 }).notNull(),
    vendor: varchar("vendor", { length: 64 }).notNull(),
    packSize: varchar("packSize", { length: 64 }),
    unitOfMeasure: varchar("unitOfMeasure", { length: 32 }),
    price: decimal("price", { precision: 10, scale: 2 }),
    parLevel: decimal("parLevel", { precision: 10, scale: 2 }).default("0"),
    storageArea: varchar("storageArea", { length: 64 }),
    isAlcohol: boolean("isAlcohol").default(false).notNull(),
    alcoholCategory: varchar("alcoholCategory", { length: 16 }),
    isActive: boolean("isActive").default(true).notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_items_category").on(t.category), index("idx_items_vendor").on(t.vendor)]
);

export type Item = typeof items.$inferSelect;
export type InsertItem = typeof items.$inferInsert;

// ─── Count Sessions ───────────────────────────────────────────────────────────

export const countSessions = mysqlTable("count_sessions", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }),
  notes: text("notes"),
  createdBy: int("createdBy").references(() => users.id),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CountSession = typeof countSessions.$inferSelect;
export type InsertCountSession = typeof countSessions.$inferInsert;

// ─── Count Entries ────────────────────────────────────────────────────────────

export const countEntries = mysqlTable(
  "count_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    sessionId: int("sessionId")
      .notNull()
      .references(() => countSessions.id),
    itemId: int("itemId")
      .notNull()
      .references(() => items.id),
    quantity: decimal("quantity", { precision: 10, scale: 2 }).default("0").notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_count_entries_session").on(t.sessionId),
    index("idx_count_entries_item").on(t.itemId),
  ]
);

export type CountEntry = typeof countEntries.$inferSelect;
export type InsertCountEntry = typeof countEntries.$inferInsert;

// ─── Catering Recipes ─────────────────────────────────────────────────────────

export const cateringRecipes = mysqlTable("catering_recipes", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  baseServings: int("baseServings").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CateringRecipe = typeof cateringRecipes.$inferSelect;
export type InsertCateringRecipe = typeof cateringRecipes.$inferInsert;

// ─── Catering Recipe Items ────────────────────────────────────────────────────

export const cateringRecipeItems = mysqlTable(
  "catering_recipe_items",
  {
    id: int("id").autoincrement().primaryKey(),
    recipeId: int("recipeId")
      .notNull()
      .references(() => cateringRecipes.id),
    itemId: int("itemId")
      .notNull()
      .references(() => items.id),
    quantityNeeded: decimal("quantityNeeded", { precision: 10, scale: 3 }).notNull(),
    unit: varchar("unit", { length: 32 }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_recipe_items_recipe").on(t.recipeId)]
);

export type CateringRecipeItem = typeof cateringRecipeItems.$inferSelect;
export type InsertCateringRecipeItem = typeof cateringRecipeItems.$inferInsert;
