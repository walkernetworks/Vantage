import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  addRecipeItem,
  bulkCreateItems,
  calculateShortfall,
  completeCountSession,
  createCateringRecipe,
  createCountSession,
  createItem,
  deleteCateringRecipe,
  deleteItem,
  getAllItems,
  getBelowParItems,
  getCateringRecipe,
  getCountEntries,
  getCountSession,
  getItemById,
  getRecipeItems,
  getSessionWithEntries,
  listCateringRecipes,
  listCountSessions,
  removeRecipeItem,
  updateCateringRecipe,
  updateItem,
  upsertCountEntry,
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

// ─── App Router ───────────────────────────────────────────────────────────────

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
});

export type AppRouter = typeof appRouter;
