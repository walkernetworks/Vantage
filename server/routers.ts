import { TRPCError } from "@trpc/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { signLocalSession } from "./_core/localAuth";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  getUserByEmail,
  createLocalUser,
  addRecipeItem,
  addCategory,
  addStorageArea,
  addVendor,
  bulkCreateItems,
  calculateShortfall,
  completeCountSession,
  reopenCountSession,
  deleteCountSession,
  createCateringRecipe,
  createCountSession,
  createItem,
  deleteCateringRecipe,
  deleteCategory,
  deleteItem,
  bulkDeleteItems,
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
  importWebstaurantItems,
  generateCleanItemName,
  importUniversalItems,
  bulkUpdateParLevels,
  listCateringRecipes,
  listCountSessions,
  removeRecipeItem,
  updateCateringRecipe,
  updateCategory,
  updateItem,
  updateStorageArea,
  updateVendor,
  upsertCountEntry,
  listAllUsers,
  setUserRole,
  setUserActive,
  updateUserPassword,
  recalcAllEachPrices,
  getDashboardMetrics,
  bulkUpdateItems,
  type PfgImportRow,
  type WebstaurantImportRow,
  type UniversalImportRow,
} from "./db";

// ─── Shared Zod Schemas ───────────────────────────────────────────────────────

const itemInputSchema = z.object({
  name: z.string().min(1),
  brand: z.string().optional(),
  category: z.string().min(1),
  vendor: z.string().min(1),
  packSize: z.string().optional(),
  unitOfMeasure: z.string().optional(),
  price: z.string().optional(),
  parLevel: z.string().optional(),
  orderThreshold: z.string().optional(), // absolute case count trigger; blank = default to 50% of par
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
  bulkDelete: adminProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(({ input }) => bulkDeleteItems(input.ids)),

  bulkUpdate: adminProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1),
      patch: z.object({
        brand: z.string().optional(),
        vendor: z.string().optional(),
        category: z.string().optional(),
        storageArea: z.string().optional(),
        parLevel: z.number().optional(),
      }),
    }))
    .mutation(({ input }) => bulkUpdateItems(input.ids, input.patch)),

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

  updateOrderThreshold: adminProcedure
    .input(z.object({ id: z.number(), orderThreshold: z.string() }))
    .mutation(({ input }) => updateItem(input.id, { orderThreshold: input.orderThreshold })),

  bulkUpdateParLevels: adminProcedure
    .input(z.object({ updates: z.array(z.object({ id: z.number(), parLevel: z.string() })) }))
    .mutation(({ input }) => bulkUpdateParLevels(input.updates)),

  setCountMode: adminProcedure
    .input(z.object({ id: z.number(), countMode: z.enum(["case", "each"]) }))
    .mutation(({ input }) => updateItem(input.id, { countMode: input.countMode })),

  recalcEachPrices: adminProcedure
    .mutation(() => recalcAllEachPrices()),

  importWebstaurant: adminProcedure
    .input(
      z.object({
        rows: z.array(
          z.object({
            webstaurantItemNumber: z.string(),
            rawName: z.string(),
            cleanName: z.string(),
            brand: z.string(),
            packSize: z.string(),
            price: z.string(),
          })
        ),
      })
    )
    .mutation(({ input }) => importWebstaurantItems(input.rows as WebstaurantImportRow[])),

  generateCleanName: adminProcedure
    .input(z.object({ rawName: z.string(), brand: z.string().optional(), packSize: z.string().optional() }))
    .mutation(({ input }) =>
      generateCleanItemName(input.rawName, input.brand ?? null, input.packSize ?? null)
    ),

  // ── AI-powered universal CSV importer ──────────────────────────────────────
  // Step 1: send raw CSV text → LLM maps columns → returns mapped rows for preview
  analyzeAndMapCsv: adminProcedure
    .input(z.object({ csvText: z.string().max(500_000) }))
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("./_core/llm");

      // Parse header + up to 8 sample rows from the raw CSV
      function parseCsvLine(line: string): string[] {
        const result: string[] = [];
        let current = "";
        let inQuotes = false;
        for (const ch of line) {
          if (ch === '"') { inQuotes = !inQuotes; }
          else if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; }
          else { current += ch; }
        }
        result.push(current.trim());
        return result;
      }

      const cleaned = input.csvText.replace(/^\uFEFF/, "").trim();
      const lines = cleaned.split(/\r?\n/).filter((l) => l.trim());

      // Find the header row: first row that has at least 3 non-empty cells
      let headerIdx = 0;
      for (let i = 0; i < Math.min(5, lines.length); i++) {
        const cells = parseCsvLine(lines[i]).filter((c) => c.trim());
        if (cells.length >= 3) { headerIdx = i; break; }
      }

      const headers = parseCsvLine(lines[headerIdx]);
      const sampleRows = lines.slice(headerIdx + 1, headerIdx + 9).map(parseCsvLine);

      // Build a compact representation for the LLM
      const sampleTable = [
        headers.join(" | "),
        ...sampleRows.map((r) => r.join(" | ")),
      ].join("\n");

      // ── Heuristic fallback: map columns by header name keywords ──────────────
      function heuristicMapping(hdrs: string[]): Record<string, number> {
        const m: Record<string, number> = {};
        hdrs.forEach((h, i) => {
          const lh = h.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
          if (m.name === undefined && (lh.includes("product description") || lh.includes("item description") || lh.includes("description") || lh.includes("product name") || lh.includes("item name") || lh === "name")) m.name = i;
          if (m.brand === undefined && (lh === "brand" || lh.includes("manufacturer") || lh.includes("brand name"))) m.brand = i;
          if (m.price === undefined && (lh === "price" || lh.includes("unit price") || lh.includes("case price") || lh.includes("base price") || lh.includes("your price"))) m.price = i;
          if (m.packSize === undefined && (lh.includes("pack size") || lh === "pack" || lh.includes("size"))) m.packSize = i;
          if (m.unitOfMeasure === undefined && (lh === "uom" || lh === "unit" || lh.includes("unit of measure"))) m.unitOfMeasure = i;
          if (m.storageArea === undefined && (lh.includes("storage") || lh.includes("location") || lh.includes("storage location"))) m.storageArea = i;
          if (m.category === undefined && (lh.includes("category") || lh.includes("inventory category") || lh.includes("category name"))) m.category = i;
          if (m.vendor === undefined && (lh === "vendor" || lh.includes("supplier") || lh.includes("distributor"))) m.vendor = i;
        });
        // Prefer "Inventory Category" (more specific) over "Category Name" for category
        const invCatIdx = hdrs.findIndex(h => h.toLowerCase().includes("inventory category"));
        if (invCatIdx !== -1) m.category = invCatIdx;
        // Prefer "Full Product Description" over plain "Product Description" if available
        const fullDescIdx = hdrs.findIndex(h => h.toLowerCase().includes("full product description"));
        const descIdx = hdrs.findIndex(h => h.toLowerCase().includes("product description") && !h.toLowerCase().includes("full"));
        if (descIdx !== -1) m.name = descIdx; // plain description is more reliable
        if (fullDescIdx !== -1 && (hdrs[fullDescIdx] ?? "").trim()) m.name = descIdx !== -1 ? descIdx : fullDescIdx;
        return m;
      }

      // Try heuristic first (fast, no LLM cost)
      const heuristic = heuristicMapping(headers);
      let mapping: Record<string, number> = heuristic;

      // Only call LLM if heuristic couldn't find the name column
      if (heuristic.name === undefined) {
        const systemPrompt = `You are a data mapping assistant for a restaurant inventory system.
You will be given a CSV header row and sample data rows from a vendor spreadsheet.
Your job is to identify which column index (0-based) corresponds to each of these fields:
- name: the product/item name or description (REQUIRED - pick the most descriptive column)
- brand: manufacturer or brand name
- price: case price or unit price (a dollar amount, may have $ prefix)
- packSize: pack size string like "6/750 ML", "12/1 L", "2/12 PK"
- unitOfMeasure: unit like CS, EA, PK, BT
- storageArea: where the item is stored (e.g. Bar, Walk-In, Dry Storage, Freezer, Merchandiser)
- category: product category (e.g. Beer, Wine, Liquor, Bakery, Dairy)
- vendor: the vendor/distributor name

Return ONLY a valid JSON object. Field values must be integer column indices (0-based).
Omit fields that are not clearly present. You MUST include "name".
Example: {"name":4,"brand":5,"price":13,"packSize":6,"unitOfMeasure":7,"storageArea":1,"category":3}`;

        try {
          const llmResponse = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Map these columns (indices 0-${headers.length - 1}):\n${sampleTable}` },
            ],
          });
          const rawContent = llmResponse?.choices?.[0]?.message?.content;
          const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent ?? "{}");
          // Extract JSON from response (LLM may wrap in markdown code blocks)
          const jsonMatch = contentStr.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (typeof parsed.name === "number") mapping = parsed;
          }
        } catch (e) {
          console.error("[analyzeAndMapCsv] LLM mapping failed, using heuristic:", e);
        }
      }

      // Apply mapping to all data rows
      const dataRows = lines.slice(headerIdx + 1);
      const mappedRows: UniversalImportRow[] = [];

      // Determine if this looks like an alcohol import based on category column values
      const categoryColIdx = mapping.category ?? -1;
      const sampleCategories = sampleRows
        .map((r) => (r[categoryColIdx] ?? "").toLowerCase())
        .join(" ");
      const looksLikeAlcohol =
        sampleCategories.includes("alcohol") ||
        sampleCategories.includes("beer") ||
        sampleCategories.includes("wine") ||
        sampleCategories.includes("liquor") ||
        sampleCategories.includes("hemp");

      for (const line of dataRows) {
        if (!line.trim()) continue;
        const cols = parseCsvLine(line);

        const rawName = (cols[mapping.name] ?? "").trim();
        if (!rawName) continue;

        // Skip footer/summary rows
        if (rawName.toLowerCase().startsWith("add items") || rawName.toLowerCase().startsWith("total")) continue;

        const rawPrice = (cols[mapping.price ?? -1] ?? "").replace(/[$,*\s]/g, "");
        const price = rawPrice && !isNaN(parseFloat(rawPrice)) ? parseFloat(rawPrice).toFixed(2) : undefined;

        const rawCategory = (cols[mapping.category ?? -1] ?? "").trim();
        // Map raw category to internal category
        let internalCategory = "Other";
        const catLower = rawCategory.toLowerCase();
        if (catLower.includes("beer") || catLower.includes("na")) internalCategory = "Alcohol - 100";
        else if (catLower.includes("wine")) internalCategory = "Alcohol - 100";
        else if (catLower.includes("liquor") || catLower.includes("spirit")) internalCategory = "Alcohol - 100";
        else if (catLower.includes("hemp") || catLower.includes("thc") || catLower.includes("cbd")) internalCategory = "Alcohol - 100";
        else if (catLower.includes("alcohol")) internalCategory = "Alcohol - 100";
        else if (catLower.includes("bakery") || catLower.includes("bread") || catLower.includes("beignet")) internalCategory = "Bakery";
        else if (catLower.includes("dairy") || catLower.includes("cheese") || catLower.includes("milk")) internalCategory = "Dairy";
        else if (catLower.includes("produce") || catLower.includes("vegetable") || catLower.includes("fruit")) internalCategory = "Produce";
        else if (catLower.includes("protein") || catLower.includes("chicken") || catLower.includes("beef") || catLower.includes("pork")) internalCategory = "Protein";
        else if (catLower.includes("coffee") || catLower.includes("beverage") || catLower.includes("drink")) internalCategory = "Coffee";
        else if (catLower.includes("paper") || catLower.includes("supply") || catLower.includes("chemical") || catLower.includes("clean")) internalCategory = "Supplies";

        const rawStorage = (cols[mapping.storageArea ?? -1] ?? "").trim();
        let storageArea = "Dry Storage";
        const storageLower = rawStorage.toLowerCase();
        if (storageLower.includes("bar") || storageLower.includes("merchandiser")) storageArea = "Bar";
        else if (storageLower.includes("cooler") || storageLower.includes("wi ") || storageLower.includes("walk")) storageArea = "Walk-In";
        else if (storageLower.includes("freeze")) storageArea = "Freezer";
        else if (storageLower.includes("dry")) storageArea = "Dry Storage";
        else if (rawStorage) storageArea = rawStorage; // keep original if unrecognized

        // Simple title-case clean name
        const cleanName = rawName
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" ");

        mappedRows.push({
          name: cleanName,
          brand: mapping.brand !== undefined ? (cols[mapping.brand] ?? "").trim() || undefined : undefined,
          price,
          packSize: mapping.packSize !== undefined ? (cols[mapping.packSize] ?? "").trim() || undefined : undefined,
          unitOfMeasure: mapping.unitOfMeasure !== undefined ? (cols[mapping.unitOfMeasure] ?? "").trim() || undefined : undefined,
          storageArea,
          category: internalCategory,
          vendor: mapping.vendor !== undefined ? (cols[mapping.vendor] ?? "").trim() || undefined : undefined,
          isAlcohol: looksLikeAlcohol,
          alcoholCategory: looksLikeAlcohol ? "100" : undefined,
        });
      }

      return {
        mapping,
        headers,
        rows: mappedRows,
        detectedSource: looksLikeAlcohol ? "Alcohol" : "General",
      };
    }),

  // ── AI row enrichment: infer brand, clean name, parse pack size, normalize category/vendor ──
  enrichImportRows: adminProcedure
    .input(z.object({
      rows: z.array(z.object({
        name: z.string(),
        brand: z.string().optional(),
        packSize: z.string().optional(),
        category: z.string().optional(),
        vendor: z.string().optional(),
        storageArea: z.string().optional(),
        price: z.string().optional(),
      })),
      importSource: z.string().optional(), // hint: "PFG", "Webstaurant", "Alcohol", etc.
    }))
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("./_core/llm");

      const CANONICAL_CATEGORIES = ["Alcohol - 100","Alcohol - 130","Coffee","Bakery","Dairy","Dry Goods","Paper Goods","Produce","Protein","Syrups","Supplies","Other"];
      const CANONICAL_VENDORS = ["PFG","Webstaurant","Savannah Distributing","United","Other"];
      const CANONICAL_STORAGE = ["Dry Storage","Walk-In","Freezer","Bar","Other"];

      const systemPrompt = `You are an expert restaurant inventory assistant with deep knowledge of food and beverage products, brands, and distributors.

You will receive a JSON array of inventory items parsed from a vendor CSV. For each item, return an enriched version with:
1. "cleanName": A clean, readable product name. Remove vendor codes, size suffixes (e.g. "12 OZ"), redundant words. Title case. Keep it concise.
2. "brand": The manufacturer/brand name inferred from your product knowledge. Examples:
   - "Tropicalia" → brand: "Creature Comforts" (it's a Creature Comforts beer)
   - "Heineken" → brand: "Heineken"
   - "Tito's Handmade Vodka" → brand: "Tito's"
   - "Blue Moon Belgian White" → brand: "Blue Moon"
   - "Jack Daniel's Tennessee Whiskey" → brand: "Jack Daniel's"
   - If brand is already provided in the input, keep it unless clearly wrong.
   - If you cannot determine the brand, return null.
3. "caseQty": Integer number of individual units per case, parsed from packSize. Examples:
   - "4/6/12 OZ" → 24 (4 packs × 6 cans)
   - "6/4/12 OZ" → 24 (6 packs × 4 cans)
   - "2/12 PK" → 24 (2 × 12)
   - "12/750 ML" → 12 (12 bottles)
   - "24 PK" → 24
   - "6/750 ML" → 6
   - "- 25/Case" → 25
   - "1/50 LB" → 1
   - If you cannot parse it, return null.
4. "category": Must be exactly one of: ${CANONICAL_CATEGORIES.join(", ")}. Map the raw category to the closest match.
5. "vendor": Must be exactly one of: ${CANONICAL_VENDORS.join(", ")}. Map raw vendor names:
   - "UNITED", "United Distributors" → "Savannah Distributing" (they are the same distributor in Savannah, GA)
   - "PFG", "Performance Food Group" → "PFG"
   - "Webstaurant", "WebstaurantStore" → "Webstaurant"
   - If unknown, return "Other"
6. "storageArea": Must be exactly one of: ${CANONICAL_STORAGE.join(", ")}. Infer from category/name if not provided.

Return a JSON array with one object per input row, in the same order. Each object: {"cleanName": string, "brand": string|null, "caseQty": number|null, "category": string, "vendor": string, "storageArea": string}`;

      // Process in batches of 25 to stay within token limits
      const BATCH_SIZE = 25;
      const enriched: Array<{
        cleanName: string;
        brand: string | null;
        caseQty: number | null;
        category: string;
        vendor: string;
        storageArea: string;
      }> = [];

      for (let i = 0; i < input.rows.length; i += BATCH_SIZE) {
        const batch = input.rows.slice(i, i + BATCH_SIZE);
        const batchPayload = batch.map((r, idx) => ({
          idx,
          name: r.name,
          brand: r.brand ?? null,
          packSize: r.packSize ?? null,
          category: r.category ?? null,
          vendor: r.vendor ?? null,
          storageArea: r.storageArea ?? null,
        }));

        try {
          const llmResponse = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: JSON.stringify(batchPayload) },
            ],
          });
          const rawContent = llmResponse?.choices?.[0]?.message?.content;
          const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent ?? "[]");
          const jsonMatch = contentStr.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed) && parsed.length === batch.length) {
              enriched.push(...parsed);
              continue;
            }
          }
        } catch (e) {
          console.error("[enrichImportRows] LLM batch failed:", e);
        }

        // Fallback: return rows unchanged for this batch
        for (const r of batch) {
          enriched.push({
            cleanName: r.name,
            brand: r.brand ?? null,
            caseQty: null,
            category: r.category ?? "Other",
            vendor: r.vendor ?? "Other",
            storageArea: r.storageArea ?? "Dry Storage",
          });
        }
      }

      // Merge enriched data back into original rows
      return input.rows.map((row, i) => {
        const e = enriched[i];
        if (!e) return row;
        return {
          ...row,
          name: e.cleanName || row.name,
          brand: e.brand ?? row.brand ?? undefined,
          caseQty: e.caseQty ?? undefined,
          category: e.category || row.category || "Other",
          vendor: e.vendor || row.vendor || "Other",
          storageArea: e.storageArea || row.storageArea || "Dry Storage",
        };
      });
    }),

  // Step 2: import the AI-mapped rows
  importUniversal: adminProcedure
    .input(
      z.object({
        rows: z.array(
          z.object({
            name: z.string().min(1),
            brand: z.string().optional(),
            category: z.string().optional(),
            vendor: z.string().optional(),
            packSize: z.string().optional(),
            unitOfMeasure: z.string().optional(),
            price: z.string().optional(),
            storageArea: z.string().optional(),
            isAlcohol: z.boolean().optional(),
            alcoholCategory: z.string().optional(),
            notes: z.string().optional(),
          })
        ),
        importSource: z.string().default("Universal"),
      })
    )
    .mutation(({ input }) =>
      importUniversalItems(input.rows as UniversalImportRow[], input.importSource)
    ),
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
  reopenSession: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => reopenCountSession(input.id)),

  deleteSession: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return deleteCountSession(input.id);
    }),

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

// ─── Admin Users Router ─────────────────────────────────────────────────────

const adminUsersRouter = router({
  list: adminProcedure.query(() => listAllUsers()),

  setRole: adminProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["user", "admin"]) }))
    .mutation(async ({ input, ctx }) => {
      // Prevent an admin from demoting themselves
      if (input.userId === ctx.user.id && input.role !== "admin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot demote yourself" });
      }
      await setUserRole(input.userId, input.role);
      return { success: true };
    }),

  setActive: adminProcedure
    .input(z.object({ userId: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      // Prevent an admin from deactivating themselves
      if (input.userId === ctx.user.id && !input.isActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot deactivate yourself" });
      }
      await setUserActive(input.userId, input.isActive);
      return { success: true };
    }),

  createUser: adminProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required"),
        email: z.string().email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
        role: z.enum(["user", "admin"]).default("user"),
      })
    )
    .mutation(async ({ input }) => {
      const existing = await getUserByEmail(input.email);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "An account with that email already exists." });
      }
      const passwordHash = await bcrypt.hash(input.password, 12);
      const user = await createLocalUser({
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
      });
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create user." });
      return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }),

  resetPassword: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      })
    )
    .mutation(async ({ input }) => {
      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      await updateUserPassword(input.userId, passwordHash);
      return { success: true };
    }),
});

// ─── Dashboard Router ───────────────────────────────────────────────────────────

const dashboardRouter = router({
  metrics: protectedProcedure.query(() => getDashboardMetrics()),
});

// ─── App Router ────────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),

    register: publicProcedure
      .input(
        z.object({
          name: z.string().min(1, "Name is required"),
          email: z.string().email("Invalid email address"),
          password: z.string().min(8, "Password must be at least 8 characters"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const existing = await getUserByEmail(input.email);
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An account with that email already exists.",
          });
        }
        const passwordHash = await bcrypt.hash(input.password, 12);
        const user = await createLocalUser({
          name: input.name,
          email: input.email,
          passwordHash,
          role: "user",
        });
        if (!user) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create account." });
        }
        const token = await signLocalSession({
          userId: user.id,
          email: user.email ?? input.email,
          name: user.name ?? input.name,
          role: user.role,
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);
        return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
      }),

    login: publicProcedure
      .input(
        z.object({
          email: z.string().email("Invalid email address"),
          password: z.string().min(1, "Password is required"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const user = await getUserByEmail(input.email);
        if (!user || !user.passwordHash) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password.",
          });
        }
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password.",
          });
        }
        if (!user.isActive) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Account is deactivated. Contact an admin.",
          });
        }
        const token = await signLocalSession({
          userId: user.id,
          email: user.email ?? input.email,
          name: user.name ?? "",
          role: user.role,
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);
        return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  items: itemsRouter,
  counts: countsRouter,
  orders: ordersRouter,
  catering: cateringRouter,
  settings: settingsRouter,
  adminUsers: adminUsersRouter,
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;
