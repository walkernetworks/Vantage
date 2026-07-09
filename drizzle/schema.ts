import {
  int,
  json,
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
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  permissions: json("permissions").$type<string[]>(),
  mustResetPassword: boolean("mustResetPassword").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Item Catalog ─────────────────────────────────────────────────────────────

// Default seed values (used for initial DB seeding)
export const DEFAULT_CATEGORIES = [
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
];

export const DEFAULT_VENDORS = ["PFG", "Webstaurant", "Savannah Distributing", "Other"];

export const DEFAULT_STORAGE_AREAS = ["Dry Storage", "Walk-In", "Freezer", "Bar", "Other"];

// Simplified UOM: only Case and Each
export const UNITS = ["Case", "Each"] as const;

// ─── Settings Tables ──────────────────────────────────────────────────────────

export const settingsCategories = mysqlTable("settings_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const settingsVendors = mysqlTable("settings_vendors", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const settingsStorageAreas = mysqlTable("settings_storage_areas", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SettingsCategory = typeof settingsCategories.$inferSelect;
export type SettingsVendor = typeof settingsVendors.$inferSelect;
export type SettingsStorageArea = typeof settingsStorageAreas.$inferSelect;

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
    itemNumber: varchar("itemNumber", { length: 64 }),
    brand: varchar("brand", { length: 128 }),
    // Pack size parsing: caseQty is extracted from packSize (e.g. "6/24oz" -> 6)
    // eachPrice = price / caseQty when UOM is Each
    caseQty: int("caseQty"),
    eachPrice: decimal("eachPrice", { precision: 10, scale: 4 }),
    // orderThreshold: fraction of par (0.0–1.0) below which an order is triggered.
    // Default 0.5 means "order when stock < 50% of par".
    orderThreshold: decimal("orderThreshold", { precision: 4, scale: 2 }).default("0.50"),
    // countMode: how this item is counted — 'case' (default) or 'each' (individual units)
    // When 'each', caseQty is used to convert eaches → cases for ordering
    countMode: varchar("countMode", { length: 8 }).default("case").notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_items_category").on(t.category),
    index("idx_items_vendor").on(t.vendor),
    index("idx_items_vendor_item_number").on(t.vendor, t.itemNumber),
  ]
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
    quantity: decimal("quantity", { precision: 10, scale: 4 }).default("0").notNull(),
    confirmed: boolean("confirmed").default(false).notNull(),
    notes: text("notes"),
    updatedBy: int("updatedBy").references(() => users.id),
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

// ─── Price History ────────────────────────────────────────────────────────────

export const priceHistory = mysqlTable(
  "price_history",
  {
    id: int("id").autoincrement().primaryKey(),
    itemId: int("itemId")
      .notNull()
      .references(() => items.id),
    oldPrice: decimal("oldPrice", { precision: 10, scale: 2 }),
    newPrice: decimal("newPrice", { precision: 10, scale: 2 }).notNull(),
    importSource: varchar("importSource", { length: 32 }).notNull().default("PFG"),
    importedAt: timestamp("importedAt").defaultNow().notNull(),
  },
  (t) => [index("idx_price_history_item").on(t.itemId)]
);

export type PriceHistory = typeof priceHistory.$inferSelect;
export type InsertPriceHistory = typeof priceHistory.$inferInsert;

// ─── Password Reset Tokens ────────────────────────────────────────────────────
export const passwordResetTokens = mysqlTable(
  "password_reset_tokens",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    token: varchar("token", { length: 128 }).notNull().unique(),
    expiresAt: timestamp("expiresAt").notNull(),
    usedAt: timestamp("usedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_prt_token").on(t.token), index("idx_prt_user").on(t.userId)]
);
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// ─── Invoices ─────────────────────────────────────────────────────────────────
export const invoices = mysqlTable(
  "invoices",
  {
    id: int("id").autoincrement().primaryKey(),
    vendor: varchar("vendor", { length: 64 }).notNull().default("PFG"),
    invoiceNumber: varchar("invoiceNumber", { length: 64 }),
    invoiceDate: varchar("invoiceDate", { length: 32 }),
    totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }),
    imageKeys: json("imageKeys").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    status: mysqlEnum("status", ["pending", "reviewed", "applied"]).notNull().default("pending"),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_invoices_status").on(t.status), index("idx_invoices_created").on(t.createdAt)]
);
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

// ─── Invoice Lines ────────────────────────────────────────────────────────────
export const invoiceLines = mysqlTable(
  "invoice_lines",
  {
    id: int("id").autoincrement().primaryKey(),
    invoiceId: int("invoiceId")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    itemId: int("itemId").references(() => items.id),
    itemNumber: varchar("itemNumber", { length: 64 }),
    description: varchar("description", { length: 255 }),
    pack: varchar("pack", { length: 64 }),
    size: varchar("size", { length: 64 }),
    orderedQty: decimal("orderedQty", { precision: 10, scale: 4 }),
    shippedQty: decimal("shippedQty", { precision: 10, scale: 4 }).notNull().default("0"),
    unitPrice: decimal("unitPrice", { precision: 10, scale: 4 }),
    extension: decimal("extension", { precision: 10, scale: 2 }),
    category: varchar("category", { length: 64 }),
    matchStatus: mysqlEnum("matchStatus", ["matched", "unmatched", "skipped"])
      .notNull()
      .default("unmatched"),
  },
  (t) => [
    index("idx_invoice_lines_invoice").on(t.invoiceId),
    index("idx_invoice_lines_item").on(t.itemId),
  ]
);
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type InsertInvoiceLine = typeof invoiceLines.$inferInsert;
