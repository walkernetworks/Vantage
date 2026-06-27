/**
 * Invoice DB helpers — all raw Drizzle queries for invoice upload, parsing, and application.
 */
import { eq, desc, and, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { invoices, invoiceLines, items } from "../drizzle/schema";
import type { Invoice, InvoiceLine, InsertInvoice, InsertInvoiceLine } from "../drizzle/schema";

export type { Invoice, InvoiceLine };

// ─── Create invoice record (after images uploaded to S3) ─────────────────────

export async function createInvoice(data: {
  vendor: string;
  imageKeys: string[];
  createdBy: number;
  notes?: string;
}): Promise<Invoice> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db
    .insert(invoices)
    .values({
      vendor: data.vendor,
      imageKeys: data.imageKeys,
      status: "pending",
      createdBy: data.createdBy,
      notes: data.notes ?? null,
    })
    .$returningId();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, row.id));
  return invoice;
}

// ─── Save parsed lines from AI extraction ────────────────────────────────────

export async function saveInvoiceLines(
  invoiceId: number,
  parsedLines: Array<{
    itemNumber?: string;
    description?: string;
    pack?: string;
    size?: string;
    orderedQty?: number;
    shippedQty: number;
    unitPrice?: number;
    extension?: number;
    category?: string;
  }>,
  invoiceHeader: {
    invoiceNumber?: string;
    invoiceDate?: string;
    totalAmount?: number;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Delete any previously parsed lines for this invoice (re-parse scenario)
  await db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));

  // Fetch all active items for matching by itemNumber
  const allItems = await db
    .select({ id: items.id, itemNumber: items.itemNumber, name: items.name })
    .from(items)
    .where(eq(items.isActive, true));

  // Build lookup map: itemNumber (lowercase) → itemId
  const itemNumberMap = new Map<string, number>();
  for (const item of allItems) {
    if (item.itemNumber) {
      itemNumberMap.set(item.itemNumber.toLowerCase().trim(), item.id);
    }
  }

  // Build insert rows with match resolution
  const rows: InsertInvoiceLine[] = parsedLines.map((line) => {
    const key = (line.itemNumber ?? "").toLowerCase().trim();
    const matchedItemId = key ? (itemNumberMap.get(key) ?? null) : null;
    return {
      invoiceId,
      itemId: matchedItemId,
      itemNumber: line.itemNumber ?? null,
      description: line.description ?? null,
      pack: line.pack ?? null,
      size: line.size ?? null,
      orderedQty: line.orderedQty != null ? String(line.orderedQty) : null,
      shippedQty: String(line.shippedQty),
      unitPrice: line.unitPrice != null ? String(line.unitPrice) : null,
      extension: line.extension != null ? String(line.extension) : null,
      category: line.category ?? null,
      matchStatus: matchedItemId ? "matched" : "unmatched",
    };
  });

  if (rows.length > 0) {
    await db.insert(invoiceLines).values(rows);
  }

  // Update invoice with header info and status=parsed
  await db
    .update(invoices)
    .set({
      invoiceNumber: invoiceHeader.invoiceNumber ?? null,
      invoiceDate: invoiceHeader.invoiceDate ?? null,
      totalAmount: invoiceHeader.totalAmount != null ? String(invoiceHeader.totalAmount) : null,
      status: "parsed",
    })
    .where(eq(invoices.id, invoiceId));
}

// ─── List invoices ────────────────────────────────────────────────────────────

export async function listInvoices(): Promise<
  Array<Invoice & { lineCount: number; matchedCount: number }>
> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(invoices).orderBy(desc(invoices.createdAt));

  // For each invoice, get line counts
  const result = await Promise.all(
    rows.map(async (inv) => {
      const lines = await db
        .select({ id: invoiceLines.id, matchStatus: invoiceLines.matchStatus })
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, inv.id));
      return {
        ...inv,
        lineCount: lines.length,
        matchedCount: lines.filter((l) => l.matchStatus === "matched").length,
      };
    })
  );
  return result;
}

// ─── Get invoice with all lines ───────────────────────────────────────────────

export async function getInvoiceWithLines(invoiceId: number): Promise<{
  invoice: Invoice;
  lines: Array<InvoiceLine & { itemName?: string }>;
} | null> {
  const db = await getDb();
  if (!db) return null;
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!invoice) return null;

  const lines = await db
    .select({
      line: invoiceLines,
      itemName: items.name,
    })
    .from(invoiceLines)
    .leftJoin(items, eq(invoiceLines.itemId, items.id))
    .where(eq(invoiceLines.invoiceId, invoiceId));

  return {
    invoice,
    lines: lines.map((r) => ({ ...r.line, itemName: r.itemName ?? undefined })),
  };
}

// ─── Update a single invoice line (manual match correction) ──────────────────

export async function updateInvoiceLine(
  lineId: number,
  data: { itemId?: number | null; shippedQty?: number; matchStatus?: "matched" | "unmatched" | "skipped" }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const updates: Partial<InvoiceLine> = {};
  if (data.itemId !== undefined) {
    updates.itemId = data.itemId;
    updates.matchStatus = data.itemId ? "matched" : "unmatched";
  }
  if (data.shippedQty !== undefined) updates.shippedQty = String(data.shippedQty) as unknown as typeof updates.shippedQty;
  if (data.matchStatus !== undefined) updates.matchStatus = data.matchStatus;
  await db.update(invoiceLines).set(updates).where(eq(invoiceLines.id, lineId));
}

// ─── Mark invoice as reviewed ─────────────────────────────────────────────────

export async function markInvoiceReviewed(invoiceId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(invoices).set({ status: "reviewed" }).where(eq(invoices.id, invoiceId));
}

// ─── Apply invoice to inventory ───────────────────────────────────────────────
// Returns list of {itemId, itemName, shippedQty} that were applied

export async function applyInvoiceToInventory(invoiceId: number): Promise<
  Array<{ itemId: number; itemName: string; shippedQty: number }>
> {
  const db = await getDb();
  if (!db) return [];

  // Get all matched lines (not skipped)
  const lines = await db
    .select({
      line: invoiceLines,
      itemName: items.name,
    })
    .from(invoiceLines)
    .leftJoin(items, eq(invoiceLines.itemId, items.id))
    .where(
      and(
        eq(invoiceLines.invoiceId, invoiceId),
        eq(invoiceLines.matchStatus, "matched")
      )
    );

  const applied: Array<{ itemId: number; itemName: string; shippedQty: number }> = [];

  for (const { line, itemName } of lines) {
    if (!line.itemId) continue;
    const qty = parseFloat(String(line.shippedQty));
    if (qty <= 0) continue;
    applied.push({
      itemId: line.itemId,
      itemName: itemName ?? "Unknown",
      shippedQty: qty,
    });
  }

  // Mark invoice as applied
  await db
    .update(invoices)
    .set({ status: "applied", appliedAt: new Date() })
    .where(eq(invoices.id, invoiceId));

  return applied;
}

// ─── Delete invoice and its lines ────────────────────────────────────────────

export async function deleteInvoice(invoiceId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  await db.delete(invoices).where(eq(invoices.id, invoiceId));
}

// ─── Get deliveries since a given count session date ─────────────────────────
// Used by dashboard to compute running inventory: count + deliveries

export async function getDeliveriesSinceDate(
  sinceDate: Date
): Promise<Map<number, number>> {
  const db = await getDb();
  if (!db) return new Map();

  // Get all applied invoice lines since sinceDate
  const appliedInvoices = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.status, "applied"));

  if (appliedInvoices.length === 0) return new Map();

  const invoiceIds = appliedInvoices.map((i) => i.id);
  const lines = await db
    .select({
      itemId: invoiceLines.itemId,
      shippedQty: invoiceLines.shippedQty,
      invoiceId: invoiceLines.invoiceId,
    })
    .from(invoiceLines)
    .where(
      and(
        inArray(invoiceLines.invoiceId, invoiceIds),
        eq(invoiceLines.matchStatus, "matched")
      )
    );

  // Sum by itemId
  const totals = new Map<number, number>();
  for (const line of lines) {
    if (!line.itemId) continue;
    const qty = parseFloat(String(line.shippedQty));
    totals.set(line.itemId, (totals.get(line.itemId) ?? 0) + qty);
  }
  return totals;
}
