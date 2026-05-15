import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Search, Filter, Save, ChevronDown } from "lucide-react";

type Item = {
  id: number;
  name: string;
  category: string;
  vendor: string;
  packSize: string | null;
  unitOfMeasure: string | null;
  price: string | null;
  parLevel: string | null;
  orderThreshold: string | null;
  storageArea: string | null;
  caseQty: number | null;
  eachPrice: string | null;
};

// Debounced save indicator
function ParInput({
  item,
  onSave,
  onSaveThreshold,
}: {
  item: Item;
  onSave: (id: number, val: string) => void;
  onSaveThreshold: (id: number, val: string) => void;
}) {
  const [parValue, setParValue] = useState(item.parLevel ?? "0");
  const [thresholdValue, setThresholdValue] = useState(item.orderThreshold ?? "");
  const [parDirty, setParDirty] = useState(false);
  const [thresholdDirty, setThresholdDirty] = useState(false);

  function handleParChange(v: string) {
    setParValue(v);
    setParDirty(v !== (item.parLevel ?? "0"));
  }

  function handleThresholdChange(v: string) {
    setThresholdValue(v);
    setThresholdDirty(v !== (item.orderThreshold ?? ""));
  }

  function handleParBlur() {
    if (parDirty) { onSave(item.id, parValue); setParDirty(false); }
  }

  function handleThresholdBlur() {
    if (thresholdDirty) { onSaveThreshold(item.id, thresholdValue); setThresholdDirty(false); }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  }

  const casePrice = item.price ? parseFloat(item.price) : null;
  const eachPrice = item.eachPrice ? parseFloat(item.eachPrice) : null;
  const anyDirty = parDirty || thresholdDirty;

  return (
    <div className="px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
      <div className="flex items-start gap-3">
        {/* Item info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
            {anyDirty && (
              <span className="flex-shrink-0 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">unsaved</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">{item.category}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{item.vendor}</span>
            {item.packSize && (
              <><span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{item.packSize}</span></>
            )}
            {casePrice !== null && (
              <><span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">
                ${casePrice.toFixed(2)}/case{eachPrice !== null && ` · $${eachPrice.toFixed(2)}/each`}
              </span></>
            )}
          </div>
        </div>

        {/* Par + Threshold inputs */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Par level */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs text-muted-foreground">Par</span>
            <input
              type="number" min="0" step="1"
              value={parValue}
              onChange={(e) => handleParChange(e.target.value)}
              onBlur={handleParBlur}
              onKeyDown={handleKeyDown}
              className={`w-16 h-10 text-center rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 transition-colors ${
                parDirty
                  ? "border-amber-400 bg-amber-50 text-amber-900 focus:ring-amber-300"
                  : "border-border bg-background text-foreground focus:ring-primary/30"
              }`}
            />
          </div>
          {/* Order threshold */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs text-amber-600 font-medium">Order ≤</span>
            <input
              type="number" min="0" step="1"
              value={thresholdValue}
              onChange={(e) => handleThresholdChange(e.target.value)}
              onBlur={handleThresholdBlur}
              onKeyDown={handleKeyDown}
              placeholder="—"
              className={`w-16 h-10 text-center rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 transition-colors ${
                thresholdDirty
                  ? "border-amber-400 bg-amber-50 text-amber-900 focus:ring-amber-300"
                  : "border-border bg-background text-foreground focus:ring-primary/30"
              }`}
            />
          </div>
          {anyDirty && (
            <button
              onClick={() => {
                if (parDirty) { onSave(item.id, parValue); setParDirty(false); }
                if (thresholdDirty) { onSaveThreshold(item.id, thresholdValue); setThresholdDirty(false); }
              }}
              className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform mt-5"
              title="Save"
            >
              <Save size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ParLevels() {
  const [search, setSearch] = useState("");
  const [filterVendor, setFilterVendor] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [showOnlyUnset, setShowOnlyUnset] = useState(false);

  const queryInput = useMemo(
    () => ({
      vendor: filterVendor || undefined,
      category: filterCategory || undefined,
    }),
    [filterVendor, filterCategory]
  );

  const { data: allItems = [], isLoading } = trpc.items.list.useQuery(queryInput);
  const { data: vendors = [] } = trpc.settings.listVendors.useQuery();
  const { data: categories = [] } = trpc.settings.listCategories.useQuery();
  const utils = trpc.useUtils();

  const updateParLevel = trpc.items.updateParLevel.useMutation({
    onSuccess: () => { utils.items.list.invalidate(); toast.success("Par level saved"); },
    onError: (e) => toast.error(e.message),
  });

  const updateOrderThreshold = trpc.items.updateOrderThreshold.useMutation({
    onSuccess: () => { utils.items.list.invalidate(); toast.success("Order threshold saved"); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = useCallback(
    (id: number, parLevel: string) => { updateParLevel.mutate({ id, parLevel }); },
    [updateParLevel]
  );

  const handleSaveThreshold = useCallback(
    (id: number, orderThreshold: string) => { updateOrderThreshold.mutate({ id, orderThreshold }); },
    [updateOrderThreshold]
  );

  const items = useMemo(() => {
    let list = allItems as Item[];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          i.vendor.toLowerCase().includes(q)
      );
    }
    if (showOnlyUnset) {
      list = list.filter((i) => !i.parLevel || parseFloat(i.parLevel) === 0);
    }
    return list;
  }, [allItems, search, showOnlyUnset]);

  const unsetCount = useMemo(
    () => (allItems as Item[]).filter((i) => !i.parLevel || parseFloat(i.parLevel) === 0).length,
    [allItems]
  );

  const setCount = useMemo(
    () => (allItems as Item[]).filter((i) => i.parLevel && parseFloat(i.parLevel) > 0).length,
    [allItems]
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Par Levels</h1>
        <p className="text-sm text-muted-foreground mt-1">
          <strong>Par</strong> is your target stock level. <strong>Order ≤</strong> is the trigger — when stock drops to or below this number, the item appears on the Order Dashboard. Leave Order ≤ blank to default to 50% of par.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-2xl px-4 py-3">
          <div className="text-2xl font-bold text-primary">{setCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Par levels set</div>
        </div>
        <div className="bg-card border border-border rounded-2xl px-4 py-3">
          <div className="text-2xl font-bold text-amber-600">{unsetCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Not yet set</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="w-full h-11 pl-9 pr-4 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Vendor filter */}
          <div className="relative flex-1 min-w-[140px]">
            <select
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
              className="w-full h-10 pl-3 pr-8 rounded-xl border border-border bg-background text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">All Vendors</option>
              {(vendors as { id: number; name: string }[]).map((v) => (
                <option key={v.id} value={v.name}>{v.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>

          {/* Category filter */}
          <div className="relative flex-1 min-w-[140px]">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full h-10 pl-3 pr-8 rounded-xl border border-border bg-background text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">All Categories</option>
              {(categories as { id: number; name: string }[]).map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>

          {/* Show only unset */}
          <button
            onClick={() => setShowOnlyUnset(!showOnlyUnset)}
            className={`h-10 px-4 rounded-xl border text-sm font-medium flex items-center gap-2 transition-colors active:scale-95 ${
              showOnlyUnset
                ? "bg-amber-100 border-amber-300 text-amber-800"
                : "border-border bg-background text-muted-foreground"
            }`}
          >
            <Filter size={14} />
            Unset only
          </button>
        </div>
      </div>

      {/* Items list */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">
            {items.length} item{items.length !== 1 ? "s" : ""}
          </span>
          <span className="text-xs text-muted-foreground">Par = target stock · Order ≤ = trigger level</span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Loading items…</div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            {search || filterVendor || filterCategory || showOnlyUnset
              ? "No items match your filters"
              : "No items in catalog yet"}
          </div>
        ) : (
          <div>
            {items.map((item) => (
              <ParInput key={item.id} item={item} onSave={handleSave} onSaveThreshold={handleSaveThreshold} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
