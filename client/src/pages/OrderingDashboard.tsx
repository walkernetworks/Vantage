import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { VENDOR_COLORS, VENDORS } from "../../../shared/constants";
import {
  AlertTriangle,
  CheckCircle,
  Edit2,
  Package,
  ShoppingCart,
  TrendingDown,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function OrderingDashboard() {
  const utils = trpc.useUtils();
  const [selectedVendor, setSelectedVendor] = useState<string>("");
  const [editParId, setEditParId] = useState<number | null>(null);
  const [parValue, setParValue] = useState("");

  const { data: belowPar = [], isLoading, refetch } = trpc.orders.getBelowPar.useQuery(
    { vendor: selectedVendor || undefined }
  );

  const { data: allItems = [] } = trpc.items.list.useQuery(
    { vendor: selectedVendor || undefined }
  );

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
    return sum + item.casesNeeded * price;
  }, 0);

  const atParCount = allItems.length - belowPar.length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif text-foreground">Order Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Based on latest inventory count
        </p>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-2xl border border-border p-3 shadow-sm text-center">
          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center mx-auto mb-2">
            <TrendingDown size={16} className="text-red-600" />
          </div>
          <p className="text-xl font-bold text-foreground">{belowPar.length}</p>
          <p className="text-xs text-muted-foreground font-medium">Below Par</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-3 shadow-sm text-center">
          <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center mx-auto mb-2">
            <CheckCircle size={16} className="text-green-600" />
          </div>
          <p className="text-xl font-bold text-foreground">{atParCount}</p>
          <p className="text-xs text-muted-foreground font-medium">At Par</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-3 shadow-sm text-center">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mx-auto mb-2">
            <ShoppingCart size={16} className="text-blue-600" />
          </div>
          <p className="text-xl font-bold text-foreground">{totalCasesNeeded}</p>
          <p className="text-xs text-muted-foreground font-medium">Cases Needed</p>
        </div>
      </div>

      {/* Order Value Banner */}
      {belowPar.length > 0 && totalOrderValue > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Estimated Order Value</p>
            <p className="text-2xl font-serif font-bold text-amber-900 mt-0.5">
              ${totalOrderValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <AlertTriangle size={32} className="text-amber-500" />
        </div>
      )}

      {/* Below Par Items */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl skeleton" />)}
        </div>
      ) : belowPar.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <CheckCircle size={48} className="mx-auto text-green-500" />
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
            const orderCost = item.casesNeeded * price;

            return (
              <div
                key={item.id}
                className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">{item.name}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", VENDOR_COLORS[item.vendor] ?? "bg-gray-100 text-gray-700")}>
                          {item.vendor}
                        </span>
                        <span className="text-xs text-muted-foreground">{item.category}</span>
                        {item.packSize && (
                          <span className="text-xs text-muted-foreground">{item.packSize}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-center">
                        <p className="text-2xl font-bold text-red-700">
                          {Math.ceil(item.casesNeeded)}
                        </p>
                        <p className="text-xs font-semibold text-red-600">Cases needed</p>
                      </div>
                    </div>
                  </div>

                  {/* Stock vs Par */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">On Hand:</span>
                      <span className="font-semibold text-foreground">
                        {parseFloat(item.currentStock).toFixed(2)} cases
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
                          {Math.round(parseFloat(item.parLevel ?? "0"))} cases
                          <Edit2 size={12} className="text-muted-foreground" />
                        </button>
                      )}
                    </div>
                    {item.orderThreshold && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">Order at:</span>
                        <span className="font-semibold text-amber-700">
                          ≤{parseFloat(item.orderThreshold).toFixed(0)} cases
                        </span>
                      </div>
                    )}
                    {price > 0 && (
                      <div className="ml-auto flex items-center gap-1.5">
                        <span className="text-muted-foreground">Est. cost:</span>
                        <span className="font-semibold text-foreground">${(Math.ceil(item.casesNeeded) * price).toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                  {/* Progress bar: red fill = current stock, threshold marker line */}
                  <div className="mt-3">
                    <div className="h-2 bg-muted rounded-full overflow-hidden relative">
                      <div
                        className="h-full bg-red-400 rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (parseFloat(item.currentStock) / Math.max(0.01, parseFloat(item.parLevel ?? "1"))) * 100)}%`,
                        }}
                      />
                      {/* Threshold marker */}
                      {item.orderThreshold && (
                        <div
                          className="absolute top-0 h-full w-0.5 bg-amber-500"
                          style={{
                            left: `${Math.min(100, (parseFloat(item.orderThreshold) / Math.max(0.01, parseFloat(item.parLevel ?? "1"))) * 100)}%`,
                          }}
                        />
                      )}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>0</span>
                      {item.orderThreshold && (
                        <span className="text-amber-600">Order ≤{parseFloat(item.orderThreshold).toFixed(0)}</span>
                      )}
                      <span>Par: {Math.round(parseFloat(item.parLevel ?? "0"))}</span>
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
