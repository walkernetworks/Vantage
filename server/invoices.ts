/**
 * Invoice DB helpers — create, parse, apply, and query invoices.
 */
import { eq, and, desc } from "drizzle-orm";
import { getDb, getRawPool } from "./db";
import { invoices, invoiceLines, items } from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";

export interface ParsedLine {
  itemNumber: string | null;
  description: string | null;
  pack: string | null;
  size: string | null;
  orderedQty: number | null;
  shippedQty: number;
  unitPrice: number | null;
  extension: number | null;
  category: string | null;
}

export interface ParsedInvoice {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  totalAmount: number | null;
  lines: ParsedLine[];
}

/**
 * Parse invoice images. Accepts either:
 * - base64 data URLs (data:image/jpeg;base64,...) for direct client uploads
 * - storage URLs (/manus-storage/...) for previously stored images
 */
export async function parseInvoiceImages(imageUrls: string[]): Promise<ParsedInvoice> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You are an expert at reading foodservice invoices. Extract all delivered line items accurately. Skip category header rows and subtotal rows — only extract actual product line items. The 'Shipped' column (not 'Ordered') is the quantity actually delivered.",
      },
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: `Please extract all line items from ${imageUrls.length > 1 ? `these ${imageUrls.length} invoice pages` : "this invoice"}. For each product line item extract: itemNumber (vendor SKU/item#), description, pack, size, shippedQty (the Shipped column), unitPrice, and extension (line total). Also extract the invoice header: invoiceNumber, invoiceDate (as string), totalAmount. Skip category headers, subtotal rows, and blank rows.`,
          },
          ...imageUrls.map((url) => ({
            type: "image_url" as const,
            image_url: { url, detail: "high" as const },
          })),
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "invoice_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            invoiceNumber: { type: ["string", "null"] },
            invoiceDate: { type: ["string", "null"] },
            totalAmount: { type: ["number", "null"] },
            lines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  itemNumber: { type: ["string", "null"] },
                  description: { type: ["string", "null"] },
                  pack: { type: ["string", "null"] },
                  size: { type: ["string", "null"] },
                  shippedQty: { type: "number" },
                  unitPrice: { type: ["number", "null"] },
                  extension: { type: ["number", "null"] },
                },
                required: ["itemNumber", "description", "pack", "size", "shippedQty", "unitPrice", "extension"],
                additionalProperties: false,
              },
            },
          },
          required: ["invoiceNumber", "invoiceDate", "totalAmount", "lines"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices?.[0]?.message?.content;
  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  return JSON.parse(content) as ParsedInvoice;
}

export async function createInvoice(input: {
  vendor: string;
  imageKeys: string[];
  createdBy: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db
    .insert(invoices)
    .values({
      vendor: input.vendor,
      imageKeys: input.imageKeys,
      createdBy: input.createdBy,
      notes: input.notes,
      status: "pending",
    })
    .$returningId();
  return { id: result.id };
}

/**
 * Normalize a string for fuzzy description matching:
 * lowercase, strip punctuation, collapse whitespace.
 */
function normalizeDesc(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Noise words that appear in many items and would cause false positives if used alone
const DESC_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'per', 'pkg', 'pck', 'cnt', 'qty',
  'lbs', 'doz', 'cts', 'mix', 'dry', 'frd', 'frz', 'fzn', 'iqf', 'rte',
  'nat', 'org', 'gf', 'whl', 'slcd', 'dcd', 'chpd', 'grnd', 'rst',
]);

/**
 * Extract meaningful keywords from an invoice description for multi-keyword LIKE matching.
 * Returns words sorted by length (longest/most specific first), filtered of stop words.
 */
function extractKeywords(description: string): string[] {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !DESC_STOP_WORDS.has(w))
    .sort((a, b) => b.length - a.length); // longest first = most specific first
}

export async function saveInvoiceLines(
  invoiceId: number,
  lines: ParsedLine[],
  header: { invoiceNumber?: string; invoiceDate?: string; totalAmount?: number }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  await db
    .update(invoices)
    .set({
      invoiceNumber: header.invoiceNumber ?? null,
      invoiceDate: header.invoiceDate ?? null,
      totalAmount: header.totalAmount ? String(header.totalAmount) : null,
    })
    .where(eq(invoices.id, invoiceId));

  await db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));

  if (lines.length === 0) return;

  // ── Pass 1: exact item-number match via raw mysql2 pool (bypasses Drizzle ORM column casing issues) ─
  const itemNumbers = lines.map((l) => l.itemNumber).filter((n): n is string => !!n);
  let itemNumberMap = new Map<string, number>();
  if (itemNumbers.length > 0) {
    const pool = getRawPool();
    if (pool) {
      const placeholders = itemNumbers.map(() => '?').join(',');
      const [exactRows] = await pool.promise().execute(
        `SELECT id, itemNumber, name FROM items WHERE itemNumber IN (${placeholders})`,
        itemNumbers
      );
      const rows = Array.isArray(exactRows) ? exactRows as Array<{ id: number; itemNumber: string; name: string }> : [];
      itemNumberMap = new Map(rows.map((r) => [String(r.itemNumber), r.id]));
      console.log(`[Invoice Match] item-number lookup: ${itemNumbers.length} numbers → ${rows.length} matches found`);
    }
  }

  // ── Pass 2: Multi-keyword AND LIKE query ─
  // Strategy: try progressively fewer keywords (most specific combination first).
  // Start with the top 3 keywords combined with AND LIKE, then 2, then 1.
  // If exactly ONE catalog item matches at any level → use it (safe).
  // If zero OR more than one match at all levels → mark as unmatched (fail safe).
  // False negatives (unmatched) are acceptable; false positives (wrong match) corrupt inventory.
  const linesNeedingFuzzy = lines.filter((l) => !l.itemNumber || !itemNumberMap.has(l.itemNumber));
  const fuzzyMap = new Map<string, number>(); // invoice description → catalog item id

  if (linesNeedingFuzzy.length > 0) {
    const pool2 = getRawPool();
    if (pool2) {
      for (const line of linesNeedingFuzzy) {
        if (!line.description) continue;

        const keywords = extractKeywords(line.description);
        if (keywords.length === 0) {
          console.log(`[Invoice Fuzzy] "${line.description}" → unmatched (no usable keywords)`);
          continue;
        }

        let matched = false;
        // Try combinations: top 3 keywords, then top 2, then top 1
        const attempts = [
          keywords.slice(0, 3),
          keywords.slice(0, 2),
          keywords.slice(0, 1),
        ].filter((combo) => combo.length > 0);

        // Deduplicate attempts (e.g. if only 1 keyword, don't try [k] twice)
        const seen = new Set<string>();
        for (const combo of attempts) {
          const key = combo.join('|');
          if (seen.has(key)) continue;
          seen.add(key);

          // Build AND LIKE query: WHERE LOWER(name) LIKE '%kw1%' AND LOWER(name) LIKE '%kw2%' ...
          const conditions = combo.map(() => 'LOWER(name) LIKE ?').join(' AND ');
          const params = combo.map((kw) => `%${kw}%`);

          const [matchRows] = await pool2.promise().execute(
            `SELECT id, name FROM items WHERE ${conditions}`,
            params
          ) as [Array<{ id: number; name: string }>, any];

          if (matchRows.length === 1) {
            fuzzyMap.set(line.description, matchRows[0].id);
            console.log(`[Invoice Fuzzy] "${line.description}" → item ${matchRows[0].id} "${matchRows[0].name}" (keywords: [${combo.join(', ')}], 1 match)`);
            matched = true;
            break;
          } else if (matchRows.length === 0) {
            // No match at this level — try fewer keywords
            continue;
          } else {
            // Ambiguous at this level — try fewer keywords for a more specific match
            if (combo.length === 1) {
              // Last resort: still ambiguous, fail safe
              console.log(`[Invoice Fuzzy] "${line.description}" → unmatched (keyword: "${combo[0]}", ${matchRows.length} results — ambiguous)`);
            }
            continue;
          }
        }

        if (!matched) {
          console.log(`[Invoice Fuzzy] "${line.description}" → unmatched (tried keywords: [${keywords.slice(0, 3).join(', ')}], no unique match)`);
        }
      }
    }
  }

  const insertRows = lines.map((line) => {
    // Prefer exact item-number match, fall back to fuzzy description match
    const exactId = line.itemNumber ? (itemNumberMap.get(line.itemNumber) ?? null) : null;
    const fuzzyId = (!exactId && line.description) ? (fuzzyMap.get(line.description) ?? null) : null;
    const matchedItemId = exactId ?? fuzzyId;
    return {
      invoiceId,
      itemId: matchedItemId,
      itemNumber: line.itemNumber,
      description: line.description,
      pack: line.pack,
      size: line.size,
      orderedQty: line.orderedQty !== null ? String(line.orderedQty) : null,
      shippedQty: String(line.shippedQty),
      unitPrice: line.unitPrice !== null ? String(line.unitPrice) : null,
      extension: line.extension !== null ? String(line.extension) : null,
      category: line.category ?? null,
      matchStatus: matchedItemId ? ("matched" as const) : ("unmatched" as const),
    };
  });

  // Use raw SQL insert to bypass Drizzle ORM column mapping issues
  const pool = getRawPool();
  if (!pool) throw new Error('DB pool not available for insert');

  try {
    // Insert in batches of 50 to avoid huge queries
    const batchSize = 50;
    let totalInserted = 0;
    for (let i = 0; i < insertRows.length; i += batchSize) {
      const batch = insertRows.slice(i, i + batchSize);
      const placeholders = batch.map(() => '(NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const values: (string | number | null)[] = [];
      for (const row of batch) {
        values.push(
          row.invoiceId,
          row.itemId ?? null,
          row.itemNumber ?? null,
          row.description ?? null,
          row.pack ?? null,
          row.size ?? null,
          row.orderedQty ?? null,
          row.shippedQty ?? null,
          row.unitPrice ?? null,
          row.extension ?? null,
          row.category ?? null,
          row.matchStatus
        );
      }
      await pool.promise().execute(
        `INSERT INTO invoice_lines (id, invoiceId, itemId, itemNumber, description, pack, size, orderedQty, shippedQty, unitPrice, extension, category, matchStatus) VALUES ${placeholders}`,
        values
      );
      totalInserted += batch.length;
    }
    console.log(`[Invoice Insert] Successfully inserted ${totalInserted} lines for invoice ${invoiceId}`);
  } catch (err: any) {
    console.error(`[Invoice Insert] FAILED for invoice ${invoiceId}:`, err?.message ?? err);
    console.error(`[Invoice Insert] MySQL code: ${err?.code}, errno: ${err?.errno}`);
    console.error(`[Invoice Insert] First row sample:`, JSON.stringify(insertRows[0]));
    throw err;
  }
}

export async function listInvoices() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: invoices.id,
      vendor: invoices.vendor,
      invoiceNumber: invoices.invoiceNumber,
      invoiceDate: invoices.invoiceDate,
      totalAmount: invoices.totalAmount,
      status: invoices.status,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .orderBy(desc(invoices.createdAt));
}

export async function getInvoiceWithLines(invoiceId: number) {
  const db = await getDb();
  if (!db) return null;

  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!invoice) return null;

  const lines = await db
    .select({
      id: invoiceLines.id,
      invoiceId: invoiceLines.invoiceId,
      itemId: invoiceLines.itemId,
      itemNumber: invoiceLines.itemNumber,
      description: invoiceLines.description,
      pack: invoiceLines.pack,
      size: invoiceLines.size,
      shippedQty: invoiceLines.shippedQty,
      unitPrice: invoiceLines.unitPrice,
      extension: invoiceLines.extension,
      matchStatus: invoiceLines.matchStatus,
      itemName: items.name,
    })
    .from(invoiceLines)
    .leftJoin(items, eq(invoiceLines.itemId, items.id))
    .where(eq(invoiceLines.invoiceId, invoiceId));

  return { invoice, lines };
}

export async function updateInvoiceLine(
  lineId: number,
  updates: {
    itemId?: number | null;
    shippedQty?: number;
    matchStatus?: "matched" | "unmatched" | "skipped";
  }
) {
  const db = await getDb();
  if (!db) return;
  const vals: Record<string, unknown> = {};
  if (updates.itemId !== undefined) {
    vals.itemId = updates.itemId;
    if (updates.matchStatus === undefined) {
      vals.matchStatus = updates.itemId ? "matched" : "unmatched";
    }
  }
  if (updates.shippedQty !== undefined) vals.shippedQty = String(updates.shippedQty);
  if (updates.matchStatus !== undefined) vals.matchStatus = updates.matchStatus;
  if (Object.keys(vals).length > 0) {
    await db.update(invoiceLines).set(vals).where(eq(invoiceLines.id, lineId));
  }
}

export async function markInvoiceReviewed(invoiceId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(invoices).set({ status: "reviewed" }).where(eq(invoices.id, invoiceId));
}

export async function applyInvoiceToInventory(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];

  const lines = await db
    .select()
    .from(invoiceLines)
    .where(and(eq(invoiceLines.invoiceId, invoiceId), eq(invoiceLines.matchStatus, "matched")));

  const applied: Array<{ itemId: number; shippedQty: number }> = [];
  for (const line of lines) {
    if (!line.itemId) continue;
    const qty = parseFloat(String(line.shippedQty));
    if (isNaN(qty) || qty <= 0) continue;
    applied.push({ itemId: line.itemId, shippedQty: qty });
  }

  await db.update(invoices).set({ status: "applied" }).where(eq(invoices.id, invoiceId));
  return applied;
}

export async function deleteInvoice(invoiceId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(invoices).where(eq(invoices.id, invoiceId));
}
