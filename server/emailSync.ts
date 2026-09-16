import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { VendorIntegration } from "../drizzle/schema";
import { decrypt } from "./crypto";
import { updateVendorIntegrationSyncStatus } from "./db";
import { createInvoice, saveInvoiceLines } from "./invoices";
import { validateAndNormalizeVendorInvoice } from "./invoiceOcr";
import { parseGenericInvoicePdf } from "./routers/invoices";

export interface SyncResult {
  imported: number;
  skipped: number;
  errors: string[];
}

async function processWebstaurantEmail(
  source: Buffer,
  shipToFilter: string | undefined,
  userId: number,
): Promise<{ imported: number; skipped: number; error?: string }> {
  const parsed = await simpleParser(source);

  // Filter by ship-to address if configured
  if (shipToFilter) {
    const text = [parsed.subject ?? "", parsed.text ?? "", typeof parsed.html === "string" ? parsed.html : ""].join(" ");
    if (!text.toLowerCase().includes(shipToFilter.toLowerCase())) {
      return { imported: 0, skipped: 1 };
    }
  }

  const pdfs = (parsed.attachments ?? []).filter(
    (a) => a.contentType === "application/pdf" || a.filename?.toLowerCase().endsWith(".pdf"),
  );

  if (pdfs.length === 0) return { imported: 0, skipped: 1 };

  let imported = 0;
  const errors: string[] = [];

  for (const pdf of pdfs) {
    try {
      const base64Pdf = (pdf.content as Buffer).toString("base64");
      const result = await parseGenericInvoicePdf(base64Pdf, "Webstaurant");
      const validation = validateAndNormalizeVendorInvoice(result.lines, result.summary, "Webstaurant");

      const invoice = await createInvoice({
        vendor: "Webstaurant",
        imageKeys: [],
        createdBy: userId,
        notes: validation.errors.length > 0
          ? `[email sync — review required]\n${validation.errors.join("\n")}`
          : "[email sync]",
      });

      const lines = validation.lines.map((l) => ({
        itemNumber: l.itemNumber,
        description: l.description,
        pack: l.pack,
        size: l.size,
        orderedQty: l.orderedQty,
        shippedQty: l.shippedQty ?? 0,
        unitPrice: l.unitPrice,
        extension: l.extension,
        category: l.category,
      }));

      await saveInvoiceLines(invoice.id, lines, {
        invoiceNumber: result.invoiceNumber ?? undefined,
        invoiceDate: result.invoiceDate ?? undefined,
        totalAmount: result.totalAmount ?? result.summary.total ?? undefined,
      });

      imported++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { imported, skipped: errors.length > 0 ? 1 : 0 };
}

export async function syncVendorIntegration(
  integration: VendorIntegration,
  userId: number,
): Promise<SyncResult> {
  if (!integration.email || !integration.encryptedPassword) {
    return { imported: 0, skipped: 0, errors: ["Integration is missing email or credentials"] };
  }

  let password: string;
  try {
    password = decrypt(integration.encryptedPassword);
  } catch {
    return { imported: 0, skipped: 0, errors: ["Failed to decrypt credentials — re-enter the password in Settings"] };
  }

  const config = (integration.config ?? {}) as {
    imapHost?: string;
    imapPort?: number;
    shipToFilter?: string;
    senderFilter?: string;
  };

  const client = new ImapFlow({
    host: config.imapHost ?? "imap.gmail.com",
    port: config.imapPort ?? 993,
    secure: true,
    auth: { user: integration.email, pass: password },
    logger: false,
  });

  const result: SyncResult = { imported: 0, skipped: 0, errors: [] };

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const since = new Date();
      since.setDate(since.getDate() - 8); // 8-day window covers a full week + buffer

      const fromFilter = config.senderFilter ?? "@webstaurantstore.com";
      const searchResult = await client.search({ from: fromFilter, since });
      const messages: number[] = Array.isArray(searchResult) ? searchResult : [];
      console.log(`[emailSync] ${integration.vendorName}: found ${messages.length} messages since ${since.toISOString()}`);

      for (const uid of messages) {
        try {
          const msg = await client.fetchOne(String(uid), { source: true });
          if (!msg || !("source" in msg) || !msg.source) continue;
          const { imported, skipped, error } = await processWebstaurantEmail(
            msg.source as Buffer,
            config.shipToFilter,
            userId,
          );
          result.imported += imported;
          result.skipped += skipped;
          if (error) result.errors.push(error);
        } catch (err) {
          result.errors.push(`Message ${uid}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    console.error(`[emailSync] ${integration.vendorName} sync failed:`, err);
  }

  const status = result.errors.length > 0 && result.imported === 0 ? "error"
    : result.errors.length > 0 ? "partial"
    : "success";
  const message = `${result.imported} imported, ${result.skipped} skipped${result.errors.length > 0 ? `, ${result.errors.length} error(s)` : ""}`;

  await updateVendorIntegrationSyncStatus(integration.id, status, message).catch(() => {});

  return result;
}
