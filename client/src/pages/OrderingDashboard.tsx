import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { VENDOR_COLORS, VENDORS } from "../../../shared/constants";
import {
  AlertTriangle,
  CheckCircle,
  Edit2,
  FileSpreadsheet,
  FileText,
  ShoppingCart,
  TrendingDown,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type BelowParItem = {
  id: number;
  name: string | null;
  vendor: string | null;
  category: string | null;
  packSize: string | null;
  price: string | null;
  parLevel: string | null;
  orderThreshold: string | null;
  pfgProductNumber: string | null;
  currentStock: string;
  casesNeeded: number;
  needsOrder: boolean;
};

type Session = {
  id: number;
  name: string | null;
  createdAt: Date;
};

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportToCSV(items: BelowParItem[], vendor: string, sessionLabel: string) {
  const rows: string[][] = [
    ["Vendor", "Product #", "Item Name", "Category", "Pack Size", "On Hand (Cases)", "Par (Cases)", "Cases to Order", "Unit Price", "Est. Cost"],
  ];
  for (const item of items) {
    const price = parseFloat(item.price ?? "0");
    rows.push([
      item.vendor ?? "",
      item.pfgProductNumber ?? "",
      item.name ?? "",
      item.category ?? "",
      item.packSize ?? "",
      parseFloat(item.currentStock).toFixed(1),
      Math.round(parseFloat(item.parLevel ?? "0")).toString(),
      Math.ceil(item.casesNeeded).toString(),
      price > 0 ? `$${price.toFixed(2)}` : "",
      price > 0 ? `$${(Math.ceil(item.casesNeeded) * price).toFixed(2)}` : "",
    ]);
  }
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `order-${vendor || "all"}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("CSV downloaded");
}

// ─── PDF Export ───────────────────────────────────────────────────────────────
function exportToPDF(
  items: BelowParItem[],
  vendor: string,
  sessionLabel: string,
  totalCases: number,
  totalCost: number
) {
  const vendorLabel = vendor || "All Vendors";
  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const tableRows = items.map((item) => {
    const price = parseFloat(item.price ?? "0");
    return `<tr>
      <td>${item.vendor ?? ""}</td>
      <td style="font-family:monospace">${item.pfgProductNumber ?? "—"}</td>
      <td>${item.name ?? ""}</td>
      <td>${item.packSize ?? "—"}</td>
      <td style="text-align:center">${parseFloat(item.currentStock).toFixed(1)}</td>
      <td style="text-align:center">${Math.round(parseFloat(item.parLevel ?? "0"))}</td>
      <td style="text-align:center;font-weight:700;color:#b91c1c">${Math.ceil(item.casesNeeded)}</td>
      <td style="text-align:right">${price > 0 ? `$${price.toFixed(2)}` : "—"}</td>
      <td style="text-align:right">${price > 0 ? `$${(Math.ceil(item.casesNeeded) * price).toFixed(2)}` : "—"}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Order Sheet — ${vendorLabel}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;padding:24px}
h1{font-size:20px;font-weight:700;color:#3b1f0e;margin-bottom:4px}
.meta{font-size:11px;color:#6b7280;margin-bottom:3px}
.badge{display:inline-block;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:6px;padding:2px 8px;font-size:10px;font-weight:600;margin:8px 0 16px}
table{width:100%;border-collapse:collapse;margin-top:8px}
th{background:#3b1f0e;color:white;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
td{padding:5px 8px;border-bottom:1px solid #e5e7eb;vertical-align:middle}
tr:nth-child(even) td{background:#f9fafb}
.total td{background:#fef3c7!important;font-weight:700;border-top:2px solid #f59e0b}
.footer{margin-top:20px;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between}
@media print{body{padding:12px}}
</style></head><body>
<h1>Beignets &amp; Brew — Order Sheet</h1>
<p class="meta">${dateStr}</p>
<p class="meta">Vendor: <strong>${vendorLabel}</strong></p>
<span class="badge">Count: ${sessionLabel}</span>
<table>
<thead><tr>
<th>Vendor</th><th>Product #</th><th>Item</th><th>Pack Size</th>
<th style="text-align:center">On Hand</th><th style="text-align:center">Par</th>
<th style="text-align:center">Order Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Est. Cost</th>
</tr></thead>
<tbody>${tableRows}
<tr class="total">
<td colspan="6" style="text-align:right">TOTALS</td>
<td style="text-align:center">${totalCases} cases</td>
<td></td>
<td style="text-align:right">$${totalCost.toFixed(2)}</td>
</tr></tbody></table>
<div class="footer"><span>Beignets &amp; Brew Inventory System</span><span>Printed ${new Date().toLocaleString()}</span></div>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.onload = () => { win.print(); URL.revokeObjectURL(url); };
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = `order-${vendor || "all"}-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }
  toast.success("PDF print dialog opened");
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function OrderingDashboard() {
  const utils = trpc.useUtils();
  const [selectedVendor, setSelectedVendor] = useState<string>("");
  const [editParId, setEditParId] = useState<number | null>(null);
  const [parValue, setParValue] = useState("");

  const queryInput = useMemo(() => ({ vendor: selectedVendor || undefined }), [selectedVendor]);

  const { data: result, isLoading } = trpc.orders.getBelowPar.useQuery(queryInput);

  // Handle both old array shape and new { session, items } shape
  const belowPar: BelowParItem[] = Array.isArray(result)
    ? (result as BelowParItem[])
    : ((result as { session: Session | null; items: BelowParItem[] } | undefined)?.items ?? []);
  const activeSession: Session | null = Array.isArray(result)
    ? null
    : ((result as { session: Session | null; items: BelowParItem[] } | undefined)?.session ?? null);

  const { data: allItems = [] } = trpc.items.list.useQuery(queryInput);

  const updateParMutation = trpc.items.updateParLevel.useMutation({
    onSuccess: () => {
      utils.orders.getBelowPar.invalidate();
      utils.items.list.invalidate();
      setEditParId(null);
      setParValue("");
      toast.success("Par level updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const totalCasesNeeded = belowPar.reduce((sum, item) => sum + Math.ceil(item.casesNeeded), 0);
  const totalOrderValue = belowPar.reduce((sum, item) => {
    const price = parseFloat(item.price ?? "0");
    return sum + Math.ceil(item.casesNeeded) * price;
  }, 0);
  const atParCount = (allItems as { id: number }[]).length - belowPar.length;

  const sessionLabel = activeSession
    ? `${activeSession.name ?? "Inventory Count"} · ${new Date(activeSession.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : "No count session yet";

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-serif text-foreground">Order Dashboard</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {activeSession ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-secondary text-secondary-foreground border border-border rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                {sessionLabel}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground italic">No count session — showing full par as needed</span>
            )}
          </div>
        </div>
        {/* Export Buttons */}
        {belowPar.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => exportToCSV(belowPar, selectedVendor, sessionLabel)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-accent-foreground text-xs font-semibold hover:opacity-90 transition-colors active:scale-95 shadow-sm"
              title="Export to CSV spreadsheet"
            >
              <FileSpreadsheet size={14} />
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={() => exportToPDF(belowPar, selectedVendor, sessionLabel, totalCasesNeeded, totalOrderValue)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-colors active:scale-95 shadow-sm"
              title="Export to printable PDF"
            >
              <FileText size={14} />
              <span className="hidden sm:inline">PDF</span>
            </button>
          </div>
        )}
      </div>

      {/* Vendor Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          onClick={() => setSelectedVendor("")}
          className={cn(
            "shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors",
            !selectedVendor
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-foreground border-border hover:bg-muted"
          )}
        >
          All Vendors
        </button>
        {VENDORS.filter((v) => v !== "Other").map((vendor) => (
          <button
            key={vendor}
            onClick={() => setSelectedVendor(vendor)}
            className={cn(
              "shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors whitespace-nowrap",
              selectedVendor === vendor
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:bg-muted"
            )}
          >
            {vendor}
          </button>
        ))}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-2xl border border-border p-3 shadow-sm text-center">
          <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center mx-auto mb-2">
            <TrendingDown size={16} className="text-destructive" />
          </div>
          <p className="text-xl font-bold text-destructive">{belowPar.length}</p>
          <p className="text-xs text-muted-foreground font-medium">Below Par</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-3 shadow-sm text-center">
          <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center mx-auto mb-2">
            <CheckCircle size={16} className="text-accent" />
          </div>
          <p className="text-xl font-bold text-accent">{atParCount}</p>
          <p className="text-xs text-muted-foreground font-medium">At Par</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-3 shadow-sm text-center">
          <div className="w-8 h-8 rounded-lg bg-ring/20 flex items-center justify-center mx-auto mb-2">
            <ShoppingCart size={16} className="text-ring" />
          </div>
          <p className="text-xl font-bold text-foreground">{totalCasesNeeded}</p>
          <p className="text-xs text-muted-foreground font-medium">Cases Needed</p>
        </div>
      </div>

      {/* Order Value Banner */}
      {belowPar.length > 0 && totalOrderValue > 0 && (
        <div className="bg-secondary border border-border rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-secondary-foreground uppercase tracking-wider">Estimated Order Value</p>
            <p className="text-2xl font-serif font-bold text-foreground mt-0.5">
              ${totalOrderValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <AlertTriangle size={32} className="text-primary" />
        </div>
      )}

      {/* Below Par Items */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl skeleton" />)}
        </div>
      ) : belowPar.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <CheckCircle size={48} className="mx-auto text-accent" />
          <div>
            <p className="font-semibold text-foreground">All Items at Par!</p>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedVendor ? `No ${selectedVendor} items` : "No items"} need to be ordered.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Items to Order
            </h2>
            <span className="text-xs text-muted-foreground">{belowPar.length} items</span>
          </div>

          {belowPar.map((item) => {
            const isEditingPar = editParId === item.id;
            const price = parseFloat(item.price ?? "0");

            return (
              <div
                key={item.id}
                className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground leading-tight">{item.name}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", VENDOR_COLORS[item.vendor ?? ""] ?? "bg-gray-100 text-gray-700")}>
                          {item.vendor}
                        </span>
                        {item.pfgProductNumber && (
                          <span className="text-xs font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded-full border border-border">
                            #{item.pfgProductNumber}
                          </span>
                        )}
                        {item.category && (
                          <span className="text-xs text-muted-foreground">{item.category}</span>
                        )}
                        {item.packSize && (
                          <span className="text-xs text-muted-foreground">{item.packSize}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="bg-primary/10 border border-primary/30 rounded-xl px-3 py-2 text-center min-w-[72px]">
                        <p className="text-2xl font-bold text-primary">
                          {Math.ceil(item.casesNeeded)}
                        </p>
                        <p className="text-xs font-semibold text-primary">Cases</p>
                      </div>
                    </div>
                  </div>

                  {/* Stock vs Par row */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">On Hand:</span>
                      <span className="font-semibold text-foreground">
                        {parseFloat(item.currentStock).toFixed(1)} cs
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Par:</span>
                      {isEditingPar ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="1"
                            value={parValue}
                            onChange={(e) => setParValue(e.target.value)}
                            className="w-20 h-7 px-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            autoFocus
                          />
                          <button
                            onClick={() => updateParMutation.mutate({ id: item.id, parLevel: parValue })}
                            disabled={updateParMutation.isPending}
                            className="h-7 px-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => { setEditParId(null); setParValue(""); }}
                            className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditParId(item.id); setParValue(item.parLevel ?? "0"); }}
                          className="flex items-center gap-1 font-semibold text-foreground hover:text-primary transition-colors"
                        >
                          {Math.round(parseFloat(item.parLevel ?? "0"))} cs
                          <Edit2 size={12} className="text-muted-foreground" />
                        </button>
                      )}
                    </div>
                    {item.orderThreshold && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">Order at:</span>
                        <span className="font-semibold text-foreground">
                          ≤{parseFloat(item.orderThreshold).toFixed(0)} cs
                        </span>
                      </div>
                    )}
                    {price > 0 && (
                      <div className="ml-auto flex items-center gap-1.5">
                        <span className="text-muted-foreground">Est.:</span>
                        <span className="font-semibold text-foreground">${(Math.ceil(item.casesNeeded) * price).toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="h-2 bg-muted rounded-full overflow-hidden relative">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (parseFloat(item.currentStock) / Math.max(0.01, parseFloat(item.parLevel ?? "1"))) * 100)}%`,
                        }}
                      />
                      {item.orderThreshold && (
                        <div
                          className="absolute top-0 h-full w-0.5 bg-foreground/40"
                          style={{
                            left: `${Math.min(100, (parseFloat(item.orderThreshold) / Math.max(0.01, parseFloat(item.parLevel ?? "1"))) * 100)}%`,
                          }}
                        />
                      )}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>0</span>
                      {item.orderThreshold && (
                        <span className="text-muted-foreground">≤{parseFloat(item.orderThreshold).toFixed(0)}</span>
                      )}
                      <span>Par {Math.round(parseFloat(item.parLevel ?? "0"))}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
