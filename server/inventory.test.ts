import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module
vi.mock("./db", () => ({
  getAllItems: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "House Blend Coffee",
      category: "Coffee",
      vendor: "PFG",
      packSize: "5 LB",
      unitOfMeasure: "CS",
      price: "24.99",
      parLevel: "3",
      storageArea: "Dry Storage",
      isAlcohol: false,
      alcoholCategory: null,
      isActive: true,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      name: "Borghetti Espresso Liqueur",
      category: "Alcohol - 100",
      vendor: "Savannah Distributing",
      packSize: "750 ML",
      unitOfMeasure: "BTL",
      price: "32.00",
      parLevel: "2",
      storageArea: "Bar",
      isAlcohol: true,
      alcoholCategory: "100",
      isActive: true,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  getItemById: vi.fn().mockResolvedValue({
    id: 1,
    name: "House Blend Coffee",
    category: "Coffee",
    vendor: "PFG",
    isAlcohol: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  createItem: vi.fn().mockResolvedValue({}),
  updateItem: vi.fn().mockResolvedValue({}),
  deleteItem: vi.fn().mockResolvedValue({}),
  bulkCreateItems: vi.fn().mockResolvedValue({}),
  upsertUser: vi.fn().mockResolvedValue({}),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  listCountSessions: vi.fn().mockResolvedValue([]),
  createCountSession: vi.fn().mockResolvedValue({ id: 1, name: "Test", createdAt: new Date(), updatedAt: new Date() }),
  getCountSession: vi.fn().mockResolvedValue({ id: 1, name: "Test", createdAt: new Date(), updatedAt: new Date() }),
  getSessionWithEntries: vi.fn().mockResolvedValue(null),
  upsertCountEntry: vi.fn().mockResolvedValue({}),
  getCountEntries: vi.fn().mockResolvedValue([]),
  completeCountSession: vi.fn().mockResolvedValue({}),
  getBelowParItems: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "House Blend Coffee",
      category: "Coffee",
      vendor: "PFG",
      parLevel: "3",
      unitOfMeasure: "CS",
      price: "24.99",
      currentStock: "1",
      casesNeeded: 2,
      isActive: true,
      isAlcohol: false,
      alcoholCategory: null,
      packSize: "5 LB",
      storageArea: "Dry Storage",
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  listCateringRecipes: vi.fn().mockResolvedValue([]),
  getCateringRecipe: vi.fn().mockResolvedValue(undefined),
  createCateringRecipe: vi.fn().mockResolvedValue({ id: 1, name: "Croissant Order", baseServings: 1, createdAt: new Date(), updatedAt: new Date() }),
  updateCateringRecipe: vi.fn().mockResolvedValue({}),
  deleteCateringRecipe: vi.fn().mockResolvedValue({}),
  getRecipeItems: vi.fn().mockResolvedValue([]),
  addRecipeItem: vi.fn().mockResolvedValue({}),
  removeRecipeItem: vi.fn().mockResolvedValue({}),
  calculateShortfall: vi.fn().mockResolvedValue([
    {
      itemId: 1,
      itemName: "Croissants",
      category: "Bakery",
      quantityNeeded: 150,
      currentStock: 50,
      shortfall: 100,
      isShort: true,
      unit: "EACH",
    },
  ]),
}));

function makeAdminCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-user",
      email: "admin@beignetsbrew.com",
      name: "Admin Owner",
      loginMethod: "local" as const,
      role: "admin" as const,
      isActive: true,
      mustResetPassword: false,
      permissions: null,
      passwordHash: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeEmployeeCtx(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "employee-user",
      email: "employee@beignetsbrew.com",
      name: "Employee",
      loginMethod: "local" as const,
      role: "user" as const,
      isActive: true,
      mustResetPassword: false,
      permissions: null,
      passwordHash: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("Items Router", () => {
  it("admin can list all items", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const items = await caller.items.list();
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe("House Blend Coffee");
  });

  it("employee can list items", async () => {
    const caller = appRouter.createCaller(makeEmployeeCtx());
    const items = await caller.items.list();
    expect(items).toHaveLength(2);
  });

  it("admin can create an item", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    await expect(
      caller.items.create({
        name: "Test Item",
        category: "Coffee",
        vendor: "PFG",
      })
    ).resolves.toBeDefined();
  });

  it("employee cannot create an item (FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(makeEmployeeCtx());
    await expect(
      caller.items.create({
        name: "Test Item",
        category: "Coffee",
        vendor: "PFG",
      })
    ).rejects.toThrow();
  });

  it("admin can import CSV items", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.items.importCSV({
      source: "PFG",
      items: [
        { name: "Bulk Item 1", category: "Coffee", vendor: "PFG" },
        { name: "Bulk Item 2", category: "Bakery", vendor: "PFG" },
      ],
    });
    expect(result.imported).toBe(2);
  });
});

describe("Orders Router", () => {
  it("admin can get below-par items", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const items = await caller.orders.getBelowPar();
    expect(items).toHaveLength(1);
    expect(items[0].casesNeeded).toBe(2);
  });

  it("admin can filter below-par by vendor", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const items = await caller.orders.getBelowPar({ vendor: "PFG" });
    expect(items).toBeDefined();
  });

  it("employee cannot access order dashboard (FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(makeEmployeeCtx());
    await expect(caller.orders.getBelowPar()).rejects.toThrow();
  });
});

describe("Catering Router", () => {
  it("employee can access catering calculator", async () => {
    const caller = appRouter.createCaller(makeEmployeeCtx());
    const recipes = await caller.catering.listRecipes();
    expect(Array.isArray(recipes)).toBe(true);
  });

  it("calculates shortfall for 150 croissants", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.catering.calculateShortfall({ recipeId: 1, orderVolume: 150 });
    expect(result).toHaveLength(1);
    expect(result[0].isShort).toBe(true);
    expect(result[0].shortfall).toBe(100);
    expect(result[0].itemName).toBe("Croissants");
  });

  it("admin can create a catering recipe", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const recipe = await caller.catering.createRecipe({
      name: "Croissant Order",
      baseServings: 1,
    });
    expect(recipe.name).toBe("Croissant Order");
  });

  it("employee cannot create a recipe (FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(makeEmployeeCtx());
    await expect(
      caller.catering.createRecipe({ name: "Test", baseServings: 1 })
    ).rejects.toThrow();
  });
});

describe("Count Sessions Router", () => {
  it("employee can create a count session", async () => {
    const caller = appRouter.createCaller(makeEmployeeCtx());
    const session = await caller.counts.createSession({ name: "Morning Count" });
    expect(session).toBeDefined();
  });

  it("employee can upsert count entry", async () => {
    const caller = appRouter.createCaller(makeEmployeeCtx());
    await expect(
      caller.counts.upsertEntry({ sessionId: 1, itemId: 1, quantity: "5" })
    ).resolves.toBeDefined();
  });
});

describe("Auth Router", () => {
  it("logout clears session cookie", async () => {
    const ctx = makeAdminCtx();
    const clearedCookies: string[] = [];
    (ctx.res as any).clearCookie = (name: string) => clearedCookies.push(name);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    expect(clearedCookies).toHaveLength(1);
  });
});
