import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  CheckSquare,
  ChevronDown,
  Filter,
  Save,
  Search,
  Square,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

// ─── Single-row par input ─────────────────────────────────────────────────────

function ParInput({
  item,
  onSave,
  onSaveThreshold,
  bulkMode,
  selected,
  onToggleSelect,
  overrideValue,
  overrideThresholdValue,
  savedVersion,
}: {
  item: Item;
  onSave: (id: number, val: string) => void;
  onSaveThreshold: (id: number, val: string) => void;
  bulkMode: boolean;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  overrideValue?: string;
  overrideThresholdValue?: string;
  savedVersion: number; // increments each time a bulk save completes
}) {
  const [parValue, setParValue] = useState(item.parLevel ?? "0");
  const [thresholdValue, setThresholdValue] = useState(item.orderThreshold ?? "");
  const [parDirty, setParDirty] = useState(false);
  const [thresholdDirty, setThresholdDirty] = useState(false);
  const prevOverride = useRef<string | undefined>(undefined);
  const prevThresholdOverride = useRef<string | undefined>(undefined);
  const prevSavedVersion = useRef(savedVersion);

  // When a bulk save completes (savedVersion increments), clear dirty flags unconditionally.
  useEffect(() => {
    if (savedVersion !== prevSavedVersion.current) {
      prevSavedVersion.current = savedVersion;
      setParDirty(false);
      setThresholdDirty(false);
    }
  }, [savedVersion]);

  // Apply external par override (bulk fill)
  if (overrideValue !== undefined && overrideValue !== prevOverride.current) {
    prevOverride.current = overrideValue;
    setParValue(overrideValue);
    setParDirty(true);
  }

  // Apply external threshold override (bulk fill)
  if (overrideThresholdValue !== undefined && overrideThresholdValue !== prevThresholdOverride.current) {
    prevThresholdOverride.current = overrideThresholdValue;
    setThresholdValue(overrideThresholdValue);
    setThresholdDirty(true);
  }

  // When item data refreshes from server after save, sync local value
  const prevParLevel = useRef(item.parLevel);
  if (item.parLevel !== prevParLevel.current) {
    prevParLevel.current = item.parLevel;
    if (!parDirty) {
      setParValue(item.parLevel ?? "0");
    }
  }

  function handleParChange(v: string) {
    setParValue(v);
    setParDirty(v !== (item.parLevel ?? "0"));
  }

  function handleThresholdChange(v: string) {
    // Strip any decimal portion — only whole numbers allowed
    const whole = v.includes(".") ? String(Math.floor(parseFloat(v) || 0)) : v;
    setThresholdValue(whole);
    setThresholdDirty(whole !== (item.orderThreshold ?? ""));
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

  const casePriceRaw = item.price ? parseFloat(item.price) : null;
  const casePrice = casePriceRaw !== null && !isNaN(casePriceRaw) ? casePriceRaw : null;
  const eachPriceRaw = item.eachPrice ? parseFloat(item.eachPrice) : null;
  const eachPrice = eachPriceRaw !== null && !isNaN(eachPriceRaw) ? eachPriceRaw : null;
  const anyDirty = parDirty || thresholdDirty;

  return (
    <div
      className={cn(
        "px-3 py-3 border-b border-border last:border-0 transition-colors",
        selected ? "bg-primary/5" : "hover:bg-muted/20"
      )}
    >
      {/* Mobile-first: stack name on top, inputs on bottom row */}
      <div className="flex items-start gap-2">
        {/* Checkbox (bulk mode only) */}
        {bulkMode && (
          <button
            onClick={() => onToggleSelect(item.id)}
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
          >
            {selected ? (
              <CheckSquare size={18} className="text-primary" />
            ) : (
              <Square size={18} />
            )}
          </button>
        )}

        {/* Item info — takes all available width */}
        <div className="flex-1 min-w-0">
          {/* Name row — always visible, wraps on mobile */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground leading-snug break-words">
              {item.name}
            </span>
            {anyDirty && (
              <span className="shrink-0 text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                unsaved
              </span>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">{item.category}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{item.vendor}</span>
            {(item as any).itemNumber && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground font-mono">#{(item as any).itemNumber}</span>
              </>
            )}
            {item.packSize && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">{item.packSize}</span>
              </>
            )}
            {casePrice !== null && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">
                  ${casePrice.toFixed(2)}/cs
                  {eachPrice !== null && ` · $${eachPrice.toFixed(2)}/ea`}
                </span>
              </>
            )}
          </div>

          {/* Inputs row — sits below the name on mobile, inline on wider screens */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-xs text-muted-foreground">Par</span>
              <input
                type="number"
                min="0"
                step="1"
                value={parValue}
                onChange={(e) => handleParChange(e.target.value)}
                onBlur={handleParBlur}
                onKeyDown={handleKeyDown}
                className={cn(
                  "w-16 h-10 text-center rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 transition-colors",
                  parDirty
                    ? "border-primary bg-primary/5 text-foreground focus:ring-primary/30"
                    : "border-border bg-background text-foreground focus:ring-primary/30"
                )}
              />
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-xs text-muted-foreground font-medium" title="Order trigger: % of par level. Default 50% — enter 70 to order when stock drops below 70% of par, 20 for less aggressive.">Order ≤ %</span>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={thresholdValue}
                  onChange={(e) => handleThresholdChange(e.target.value)}
                  onBlur={handleThresholdBlur}
                  onKeyDown={(e) => {
                    if (e.key === "." || e.key === ",") e.preventDefault();
                    handleKeyDown(e);
                  }}
                  placeholder="50"
                  title="Percentage of par level that triggers an order. Default: 50%. Enter 70 for aggressive (order sooner), 20 for conservative."
                  className={cn(
                    "w-16 h-10 text-center rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 transition-colors",
                    thresholdDirty
                      ? "border-primary bg-primary/5 text-foreground focus:ring-primary/30"
                      : "border-border bg-background text-foreground focus:ring-primary/30"
                  )}
                />
              </div>
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
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ParLevels() {
  const { user } = useAuth();
  const userPermissions: string[] = (user as any)?.permissions ?? [];
  const canAccess = user?.role === "admin" || userPermissions.includes("par_levels");

  const [search, setSearch] = useState("");
  const [filterVendor, setFilterVendor] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [showOnlyUnset, setShowOnlyUnset] = useState(false);

  // Bulk edit state
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkField, setBulkField] = useState<"par" | "threshold">("par");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [setAllInput, setSetAllInput] = useState("");
  const [showSetAll, setShowSetAll] = useState(false);
  // Map of itemId → override value applied by bulk fill (copy-down or set-all)
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [thresholdOverrides, setThresholdOverrides] = useState<Record<number, string>>({});
  // Increments on each successful bulk save so child rows can clear their dirty state
  const [savedVersion, setSavedVersion] = useState(0);

  const queryInput = useMemo(
    () => ({ vendor: filterVendor || undefined, category: filterCategory || undefined }),
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

  const bulkUpdateParLevels = trpc.items.bulkUpdateParLevels.useMutation({
    onSuccess: (_data, vars) => {
      utils.items.list.invalidate();
      toast.success(`${vars.updates.length} par level${vars.updates.length !== 1 ? "s" : ""} saved`);
      setSavedVersion((v) => v + 1);
      setOverrides({});
      setSelectedIds(new Set());
      setBulkMode(false);
      setShowSetAll(false);
      setSetAllInput("");
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkUpdateOrderThresholds = trpc.items.bulkUpdateOrderThresholds.useMutation({
    onSuccess: (_data, vars) => {
      utils.items.list.invalidate();
      toast.success(`${vars.updates.length} order threshold${vars.updates.length !== 1 ? "s" : ""} saved`);
      setSavedVersion((v) => v + 1);
      setThresholdOverrides({});
      setSelectedIds(new Set());
      setBulkMode(false);
      setShowSetAll(false);
      setSetAllInput("");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = useCallback(
    (id: number, parLevel: string) => updateParLevel.mutate({ id, parLevel }),
    [updateParLevel]
  );

  const handleSaveThreshold = useCallback(
    (id: number, orderThreshold: string) => updateOrderThreshold.mutate({ id, orderThreshold }),
    [updateOrderThreshold]
  );

  const filteredItems = useMemo(() => {
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

  const allFilteredSelected =
    filteredItems.length > 0 && filteredItems.every((i) => selectedIds.has(i.id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredItems.forEach((i) => next.delete(i.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredItems.forEach((i) => next.add(i.id));
        return next;
      });
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  /** Copy-down: fill all selected rows with the value of the first selected item */
  function handleCopyDown() {
    const selected = filteredItems.filter((i) => selectedIds.has(i.id));
    if (selected.length < 2) {
      toast.error("Select at least 2 items to copy down");
      return;
    }
    if (bulkField === "par") {
      const sourceValue = overrides[selected[0].id] ?? selected[0].parLevel ?? "0";
      const newOverrides: Record<number, string> = { ...overrides };
      selected.slice(1).forEach((i) => { newOverrides[i.id] = sourceValue; });
      setOverrides(newOverrides);
      toast.info(`Copied par ${sourceValue} to ${selected.length - 1} item${selected.length > 2 ? "s" : ""}. Click Save All to confirm.`);
    } else {
      const sourceValue = thresholdOverrides[selected[0].id] ?? selected[0].orderThreshold ?? "50";
      const newOverrides: Record<number, string> = { ...thresholdOverrides };
      selected.slice(1).forEach((i) => { newOverrides[i.id] = sourceValue; });
      setThresholdOverrides(newOverrides);
      toast.info(`Copied Order % ${sourceValue} to ${selected.length - 1} item${selected.length > 2 ? "s" : ""}. Click Save All to confirm.`);
    }
  }

  /** Set all: apply typed value to all selected rows */
  function handleSetAll() {
    const val = setAllInput.trim();
    if (!val || isNaN(parseFloat(val))) {
      toast.error("Enter a valid number first");
      return;
    }
    const selected = filteredItems.filter((i) => selectedIds.has(i.id));
    if (selected.length === 0) {
      toast.error("Select at least one item");
      return;
    }
    if (bulkField === "par") {
      const newOverrides: Record<number, string> = { ...overrides };
      selected.forEach((i) => { newOverrides[i.id] = val; });
      setOverrides(newOverrides);
      toast.info(`Set par ${val} on ${selected.length} item${selected.length !== 1 ? "s" : ""}. Click Save All to confirm.`);
    } else {
      const newOverrides: Record<number, string> = { ...thresholdOverrides };
      selected.forEach((i) => { newOverrides[i.id] = val; });
      setThresholdOverrides(newOverrides);
      toast.info(`Set Order % ${val} on ${selected.length} item${selected.length !== 1 ? "s" : ""}. Click Save All to confirm.`);
    }
    setShowSetAll(false);
    setSetAllInput("");
  }

  /** Commit all pending overrides to the backend */
  function handleSaveAll() {
    if (bulkField === "par") {
      const updates = Object.entries(overrides).map(([id, parLevel]) => ({ id: parseInt(id), parLevel }));
      if (updates.length === 0) { toast.error("No pending changes to save"); return; }
      bulkUpdateParLevels.mutate({ updates });
    } else {
      const updates = Object.entries(thresholdOverrides).map(([id, orderThreshold]) => ({ id: parseInt(id), orderThreshold }));
      if (updates.length === 0) { toast.error("No pending changes to save"); return; }
      bulkUpdateOrderThresholds.mutate({ updates });
    }
  }

  function exitBulkMode() {
    setBulkMode(false);
    setSelectedIds(new Set());
    setOverrides({});
    setThresholdOverrides({});
    setShowSetAll(false);
    setSetAllInput("");
    setBulkField("par");
  }

  const pendingCount = bulkField === "par" ? Object.keys(overrides).length : Object.keys(thresholdOverrides).length;

  if (!canAccess) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-3">
        <p className="text-lg font-semibold text-foreground">Access Restricted</p>
        <p className="text-sm text-muted-foreground">You don't have permission to view Par Levels. Contact your administrator.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Par Levels</h1>
          <p className="text-sm text-muted-foreground mt-1">
            <strong>Par</strong> is your target stock level.{" "}
            <strong>Order ≤</strong> is the trigger — when stock drops to or below this, the item appears on the Order Dashboard.
          </p>
        </div>
        <button
          onClick={() => (bulkMode ? exitBulkMode() : setBulkMode(true))}
          className={cn(
            "shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors active:scale-95",
            bulkMode
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background border-border text-foreground hover:bg-muted"
          )}
        >
          <SlidersHorizontal size={15} />
          {bulkMode ? "Exit Bulk" : "Bulk Edit"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-2xl px-4 py-3">
          <div className="text-2xl font-bold text-primary">{setCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Par levels set</div>
        </div>
        <div className="bg-card border border-border rounded-2xl px-4 py-3">
          <div className="text-2xl font-bold text-muted-foreground">{unsetCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Not yet set</div>
        </div>
      </div>

      {/* Bulk action bar */}
      {bulkMode && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Select All / Deselect All */}
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors active:scale-95"
            >
              {allFilteredSelected ? "Deselect All" : "Select All"}
            </button>

            <span className="text-sm font-semibold text-primary">
              {selectedIds.size} selected
            </span>

            {/* Field toggle: Par vs Order % */}
            <div className="flex rounded-xl border border-border overflow-hidden text-xs font-semibold">
              <button
                onClick={() => { setBulkField("par"); setShowSetAll(false); setSetAllInput(""); }}
                className={cn(
                  "px-3 py-2 transition-colors",
                  bulkField === "par" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted"
                )}
              >Par</button>
              <button
                onClick={() => { setBulkField("threshold"); setShowSetAll(false); setSetAllInput(""); }}
                className={cn(
                  "px-3 py-2 transition-colors border-l border-border",
                  bulkField === "threshold" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted"
                )}
              >Order %</button>
            </div>

            {/* Copy Down */}
            <button
              onClick={handleCopyDown}
              disabled={selectedIds.size < 2}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-background border border-border hover:bg-muted disabled:opacity-40 transition-colors active:scale-95"
            >
              <ArrowDownToLine size={13} />
              Copy Down
            </button>

            {/* Set All toggle */}
            <button
              onClick={() => setShowSetAll(!showSetAll)}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-background border border-border hover:bg-muted disabled:opacity-40 transition-colors active:scale-95"
            >
              <SlidersHorizontal size={13} />
              Set All
            </button>

            {/* Save All */}
            {pendingCount > 0 && (
              <button
                onClick={handleSaveAll}
                disabled={bulkUpdateParLevels.isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors active:scale-95"
              >
                <Save size={13} />
                Save {pendingCount} change{pendingCount !== 1 ? "s" : ""}
              </button>
            )}
          </div>

          {/* Set All input row */}
          {showSetAll && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="1"
                value={setAllInput}
                onChange={(e) => {
                  const v = e.target.value;
                  // For threshold field, strip decimals
                  if (bulkField === "threshold") {
                    setSetAllInput(v.includes(".") ? String(Math.floor(parseFloat(v) || 0)) : v);
                  } else {
                    setSetAllInput(v);
                  }
                }}
                onKeyDown={(e) => {
                  if (bulkField === "threshold" && (e.key === "." || e.key === ",")) e.preventDefault();
                  if (e.key === "Enter") handleSetAll();
                }}
                placeholder={bulkField === "par" ? "Enter par value…" : "Enter % (1–100)…"}
                className="h-9 w-36 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                autoFocus
              />
              <button
                onClick={handleSetAll}
                className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-95 transition-transform"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
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

          <button
            onClick={() => setShowOnlyUnset(!showOnlyUnset)}
            className={cn(
              "h-10 px-4 rounded-xl border text-sm font-medium flex items-center gap-2 transition-colors active:scale-95",
              showOnlyUnset
                ? "bg-secondary border-border text-secondary-foreground"
                : "border-border bg-background text-muted-foreground"
            )}
          >
            <Filter size={14} />
            Unset only
          </button>
        </div>
      </div>

      {/* Items list */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {bulkMode && (
              <button
                onClick={toggleSelectAll}
                className="text-muted-foreground hover:text-primary transition-colors"
                title={allFilteredSelected ? "Deselect all" : "Select all"}
              >
                {allFilteredSelected ? (
                  <CheckSquare size={16} className="text-primary" />
                ) : (
                  <Square size={16} />
                )}
              </button>
            )}
            <span className="text-sm font-semibold text-foreground">
              {filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""}
            </span>
          </div>
          <span className="text-xs text-muted-foreground hidden sm:block">Par = target · Order ≤ = trigger</span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Loading items…</div>
        ) : filteredItems.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            {search || filterVendor || filterCategory || showOnlyUnset
              ? "No items match your filters"
              : "No items in catalog yet"}
          </div>
        ) : (
          <div>
            {filteredItems.map((item) => (
              <ParInput
                key={item.id}
                item={item}
                onSave={handleSave}
                onSaveThreshold={handleSaveThreshold}
                bulkMode={bulkMode}
                selected={selectedIds.has(item.id)}
                onToggleSelect={toggleSelect}
                overrideValue={overrides[item.id]}
                overrideThresholdValue={thresholdOverrides[item.id]}
                savedVersion={savedVersion}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
