import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  addRecipeItem,
  addCategory,
  addStorageArea,
  addVendor,
  bulkCreateItems,
  calculateShortfall,
  completeCountSession,
  createCateringRecipe,
  createCountSession,
  createItem,
  deleteCateringRecipe,
  deleteCategory,
  deleteItem,
  deleteStorageArea,
  deleteVendor,
  getAllItems,
  getBelowParItems,
  getCateringRecipe,
  getCategories,
  getCountEntries,
  getCountSession,
  getItemById,
  getPriceHistory,
  getRecipeItems,
  getSessionWithEntries,
  getStorageAreas,
  getVendors,
  importPfgItems,
  listCateringRecipes,
  listCountSessions,
  removeRecipeItem,
  updateCateringRecipe,
  updateCategory,
  updateItem,
  updateStorageArea,
  updateVendor,
  upsertCountEntry,
  type PfgImportRow,
} from "./db";

// ─── Shared Zod Schemas ───────────────────────────────────────────────────────

const itemInputSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  vendor: z.string().min(1),
  packSize: z.string().optional(),
  unitOfMeasure: z.string().optional(),
  price: z.string().optional(),
  parLevel: z.string().optional(),
  storageArea: z.string().optional(),
  isAlcohol: z.boolean().optional(),
  alcoholCategory: z.string().optional(),
  notes: z.string().optional(),
});

// ─── Admin guard ──────────────────────────────────────────────────────────────

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// ─── Items Router ─────────────────────────────────────────────────────────────

const itemsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        vendor: z.string().optional(),
        category: z.string().optional(),
        isAlcohol: z.boolean().optional(),
      }).optional()
    )
    .query(({ input }) => getAllItems(input)),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getItemById(input.id)),

  create: adminProcedure
    .input(itemInputSchema)
    .mutation(({ input }) => createItem(input)),

  update: adminProcedure
    .input(z.object({ id: z.number(), data: itemInputSchema.partial() }))
    .mutation(({ input }) => updateItem(input.id, input.data)),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteItem(input.id)),

  importCSV: adminProcedure
    .input(
      z.object({
        source: z.enum(["GA-001", "Webstaurant", "PFG"]),
        items: z.array(itemInputSchema),
      })
    )
    .mutation(async ({ input }) => {
      await bulkCreateItems(input.items);
      return { imported: input.items.length };
    }),

  importPfg: adminProcedure
    .input(
      z.object({
        rows: z.array(
          z.object({
            pfgProductNumber: z.string(),
            name: z.string(),
            brand: z.string(),
            category: z.string(),
            vendor: z.string(),
            packSize: z.string(),
            unitOfMeasure: z.string(),
            price: z.string(),
            isAlcohol: z.boolean(),
            alcoholCategory: z.string().optional(),
            storageArea: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => importPfgItems(input.rows as PfgImportRow[])),

  getPriceHistory: protectedProcedure
    .input(z.object({ itemId: z.number() }))
    .query(({ input }) => getPriceHistory(input.itemId)),

  updateParLevel: adminProcedure
    .input(z.object({ id: z.number(), parLevel: z.string() }))
    .mutation(({ input }) => updateItem(input.id, { parLevel: input.parLevel })),
});

// ─── Counts Router ────────────────────────────────────────────────────────────

const countsRouter = router({
  listSessions: protectedProcedure.query(() => listCountSessions()),

  getSession: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getCountSession(input.id)),

  getSessionWithEntries: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getSessionWithEntries(input.id)),

  createSession: protectedProcedure
    .input(z.object({ name: z.string().optional(), notes: z.string().optional() }))
    .mutation(({ input, ctx }) =>
      createCountSession({ ...input, createdBy: ctx.user.id })
    ),

  upsertEntry: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
        itemId: z.number(),
        quantity: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(({ input }) =>
      upsertCountEntry(input.sessionId, input.itemId, input.quantity, input.notes)
    ),

  completeSession: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => completeCountSession(input.id)),

  getEntries: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(({ input }) => getCountEntries(input.sessionId)),
});

// ─── Orders Router ────────────────────────────────────────────────────────────

const ordersRouter = router({
  getBelowPar: adminProcedure
    .input(z.object({ vendor: z.string().optional() }).optional())
    .query(({ input }) => getBelowParItems(input?.vendor)),
});

// ─── Alcohol Router ───────────────────────────────────────────────────────────

const alcoholRouter = router({
  list: protectedProcedure
    .input(z.object({ alcoholCategory: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const allAlcohol = await getAllItems({ isAlcohol: true });
      if (input?.alcoholCategory) {
        return allAlcohol.filter((i) => i.alcoholCategory === input.alcoholCategory);
      }
      return allAlcohol;
    }),

  addItem: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        alcoholCategory: z.enum(["100", "130"]),
        vendor: z.string().min(1),
        packSize: z.string().optional(),
        unitOfMeasure: z.string().optional(),
        price: z.string().optional(),
        parLevel: z.string().optional(),
        storageArea: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(({ input }) =>
      createItem({
        ...input,
        category: `Alcohol - ${input.alcoholCategory}`,
        isAlcohol: true,
      })
    ),
});

// ─── Catering Router ──────────────────────────────────────────────────────────

const cateringRouter = router({
  listRecipes: protectedProcedure.query(() => listCateringRecipes()),

  getRecipe: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getCateringRecipe(input.id)),

  getRecipeItems: protectedProcedure
    .input(z.object({ recipeId: z.number() }))
    .query(({ input }) => getRecipeItems(input.recipeId)),

  createRecipe: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        baseServings: z.number().min(1),
      })
    )
    .mutation(({ input }) => createCateringRecipe(input)),

  updateRecipe: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        baseServings: z.number().optional(),
      })
    )
    .mutation(({ input: { id, ...data } }) => updateCateringRecipe(id, data)),

  deleteRecipe: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteCateringRecipe(input.id)),

  addRecipeItem: adminProcedure
    .input(
      z.object({
        recipeId: z.number(),
        itemId: z.number(),
        quantityNeeded: z.string(),
        unit: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(({ input }) => addRecipeItem(input)),

  removeRecipeItem: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => removeRecipeItem(input.id)),

  calculateShortfall: protectedProcedure
    .input(z.object({ recipeId: z.number(), orderVolume: z.number().min(1) }))
    .query(({ input }) => calculateShortfall(input.recipeId, input.orderVolume)),
});

// ─── Settings Router ────────────────────────────────────────────────────────────────────

const settingsRouter = router({
  // Categories
  listCategories: protectedProcedure.query(() => getCategories()),
  addCategory: adminProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(({ input }) => addCategory(input.name)),
  updateCategory: adminProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1) }))
    .mutation(({ input }) => updateCategory(input.id, input.name)),
  deleteCategory: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteCategory(input.id)),

  // Vendors
  listVendors: protectedProcedure.query(() => getVendors()),
  addVendor: adminProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(({ input }) => addVendor(input.name)),
  updateVendor: adminProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1) }))
    .mutation(({ input }) => updateVendor(input.id, input.name)),
  deleteVendor: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteVendor(input.id)),

  // Storage Areas
  listStorageAreas: protectedProcedure.query(() => getStorageAreas()),
  addStorageArea: adminProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(({ input }) => addStorageArea(input.name)),
  updateStorageArea: adminProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1) }))
    .mutation(({ input }) => updateStorageArea(input.id, input.name)),
  deleteStorageArea: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteStorageArea(input.id)),
});

// ─── App Router ────────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  items: itemsRouter,
  counts: countsRouter,
  orders: ordersRouter,
  alcohol: alcoholRouter,
  catering: cateringRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
