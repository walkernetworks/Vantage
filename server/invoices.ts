/**
 * Invoice DB helpers — create, parse, apply, and query invoices.
 */
import { eq, and, desc, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { invoices, invoiceLines, items } from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";

export interface ParsedLine {
  itemNumber: string | null;
  description: string | null;
  pack: string | null;
  size: string | null;
  shippedQty: number;
  unitPrice: number | null;
  extension: number | null;
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

  const itemNumbers = lines.map((l) => l.itemNumber).filter((n): n is string => !!n);
  const matchedItems =
    itemNumbers.length > 0
      ? await db
          .select({ id: items.id, itemNumber: items.itemNumber })
          .from(items)
          .where(inArray(items.itemNumber, itemNumbers))
      : [];

  const itemMap = new Map(matchedItems.map((i) => [i.itemNumber, i.id]));

  await db.insert(invoiceLines).values(
    lines.map((line) => {
      const matchedItemId = line.itemNumber ? (itemMap.get(line.itemNumber) ?? null) : null;
      return {
        invoiceId,
        itemId: matchedItemId,
        itemNumber: line.itemNumber,
        description: line.description,
        pack: line.pack,
        size: line.size,
        shippedQty: String(line.shippedQty),
        unitPrice: line.unitPrice !== null ? String(line.unitPrice) : null,
        extension: line.extension !== null ? String(line.extension) : null,
        matchStatus: matchedItemId ? ("matched" as const) : ("unmatched" as const),
      };
    })
  );
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
