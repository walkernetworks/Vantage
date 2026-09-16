import cron from "node-cron";
import { listVendorIntegrations } from "./db";
import { syncVendorIntegration } from "./emailSync";

// Runs every Monday at 3:00 AM UTC — covers a full week of Webstaurant invoices
// (emailSync looks back 8 days so no invoices are missed)
export function startScheduler() {
  cron.schedule("0 3 * * 1", async () => {
    console.log("[scheduler] Starting weekly vendor integration sync");
    let integrations;
    try {
      integrations = await listVendorIntegrations();
    } catch (err) {
      console.error("[scheduler] Failed to load integrations:", err);
      return;
    }

    const active = integrations.filter((i) => i.isActive);
    console.log(`[scheduler] Running sync for ${active.length} active integration(s)`);

    for (const integration of active) {
      try {
        const result = await syncVendorIntegration(integration, null);
        console.log(
          `[scheduler] ${integration.vendorName}: imported=${result.imported} skipped=${result.skipped} errors=${result.errors.length}`
        );
      } catch (err) {
        console.error(`[scheduler] ${integration.vendorName} sync failed:`, err);
      }
    }

    console.log("[scheduler] Weekly sync complete");
  });

  console.log("[scheduler] Weekly vendor sync scheduled (Mon 03:00 UTC)");
}
