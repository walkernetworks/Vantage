import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { CATEGORY_ICONS, UNITS, VENDOR_COLORS } from "../../../shared/constants";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CheckSquare,
  Copy,
  Edit2,
  Filter,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

type ItemForm = {
  name: string;
  brand: string;
  category: string;
  vendor: string;
  packSize: string;
  unitOfMeasure: string;
  price: string;
  parLevel: string;
  storageArea: string;
  isAlcohol: boolean;
  alcoholCategory: string;
  notes: string;
  itemNumber: string;
};

const emptyForm: ItemForm = {
  name: "",
  brand: "",
  category: "",
  vendor: "",
  packSize: "",
  unitOfMeasure: "Case",
  price: "",
  parLevel: "0",
  storageArea: "",
  isAlcohol: false,
  alcoholCategory: "",
  notes: "",
  itemNumber: "",
};

// ── PFG Category → Internal Category mapping ──────────────────────────────────
const PFG_CATEGORY_MAP: Record<string, string> = {
  "ALCOHOL-BEVERAGES": "Alcohol - 100",
  "ALCOHOL-DRY FOODS": "Alcohol - 130",
  "BEIGNETS & FOOD-DRY FOODS": "Bakery",
  "BEIGNETS & FOOD-FROZEN": "Bakery",
  "BEIGNETS & FOOD-REFRIG": "Bakery",
  "BEIGNETS & FOOD-DAIRY": "Dairy",
  "BEIGNETS & FOOD-PRODUCE": "Produce",
  "BEIGNETS & FOOD-CHICKEN": "Protein",
  "BEIGNETS & FOOD-STEAK/POR": "Protein",
  "BEIGNETS & FOOD-PAPER": "Paper Goods",
  "COFFEE-BEVERAGES": "Coffee",
  "COFFEE-DRY FOODS": "Coffee",
  "COFFEE-DAIRY": "Dairy",
  "COFFEE-PRODUCE": "Produce",
  "COFFEE-PAPER": "Paper Goods",
  "NA BEVERAGES": "Coffee",
  "NA BEVERAGES-FROZEN": "Coffee",
  "NA BEVERAGES-PRODUCE": "Produce",
  "CHEMICALS": "Supplies",
  "CHEMICALS-PAPER": "Supplies",
};

const PFG_STORAGE_MAP: Record<string, string> = {
  "ALCOHOL-BEVERAGES": "Bar",
  "ALCOHOL-DRY FOODS": "Bar",
  "BEIGNETS & FOOD-FROZEN": "Freezer",
  "BEIGNETS & FOOD-REFRIG": "Walk-In",
  "BEIGNETS & FOOD-DAIRY": "Walk-In",
  "COFFEE-DAIRY": "Walk-In",
  "BEIGNETS & FOOD-PRODUCE": "Walk-In",
  "COFFEE-PRODUCE": "Walk-In",
  "NA BEVERAGES-FROZEN": "Freezer",
  "NA BEVERAGES-PRODUCE": "Walk-In",
};

type PfgRow = {
  itemNumber: string;
  name: string;
  brand: string;
  category: string;
  vendor: string;
  packSize: string;
  unitOfMeasure: string;
  price: string;
  isAlcohol: boolean;
  alcoholCategory?: string;
  storageArea?: string;
  pfgCategory: string; // raw PFG category for display
};

type PriceChange = {
  itemId: number;
  name: string;
  brand: string;
  oldPrice: string;
  newPrice: string;
  diff: string;
  pctChange: string;
};

type ImportResult = {
  created: number;
  updated: number;
  unchanged: number;
  priceChanges: PriceChange[];
};

// ── Parse PFG CSV ──────────────────────────────────────────────────────────────
function parsePfgCsv(text: string): PfgRow[] {
  // Strip BOM
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  const lines = cleaned.split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse header (handle quoted fields)
  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, " ").trim());

  // Find column indices
  const idx = {
    categoryName: headers.indexOf("category name"),
    customDesc: headers.indexOf("custom product description"),
    productDesc: headers.indexOf("product description"),
    brand: headers.indexOf("brand"),
    productNumber: headers.indexOf("product number"),
    packSize: headers.indexOf("pack size"),
    uom: headers.indexOf("uom"),
    price: headers.indexOf("price"),
  };

  const rows: PfgRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseLine(line);

    const pfgCategory = (cols[idx.categoryName] ?? "").trim().toUpperCase();
    // Use Custom Product Description if available, otherwise Product Description
    const customDesc = (cols[idx.customDesc] ?? "").trim();
    const productDesc = (cols[idx.productDesc] ?? "").trim();
    const rawName = customDesc || productDesc;
    if (!rawName) continue;

    // Clean up the name: title-case and strip excessive noise
    const name = rawName
      .replace(/\b0 GRAMS TRANS FAT PER SERVING\b/gi, "")
      .replace(/\bUNITED_STATES_DEPT_AGRICULTURE SHIELD\b/gi, "")
      .replace(/\bULTRA-HIGH-TEMPERATURE STABILIZED\b/gi, "")
      .replace(/\bULTRA PASTEURIZED\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      // Convert ALL_CAPS to Title Case
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");

    const brand = (cols[idx.brand] ?? "").trim();
    const itemNumber = (cols[idx.productNumber] ?? "").trim();
    const packSize = (cols[idx.packSize] ?? "").trim();
    const unitOfMeasure = (cols[idx.uom] ?? "CS").trim();
    const rawPrice = (cols[idx.price] ?? "").trim().replace(/[$,]/g, "");
    const price = rawPrice ? parseFloat(rawPrice).toFixed(2) : "0.00";

    const internalCategory = PFG_CATEGORY_MAP[pfgCategory] ?? "Other";
    const storageArea = PFG_STORAGE_MAP[pfgCategory] ?? "Dry Storage";
    const isAlcohol = internalCategory.startsWith("Alcohol");
    const alcoholCategory = internalCategory === "Alcohol - 100"
      ? "100"
      : internalCategory === "Alcohol - 130"
        ? "130"
        : undefined;

    rows.push({
      itemNumber,
      name,
      brand,
      category: internalCategory,
      vendor: "PFG",
      packSize,
      unitOfMeasure,
      price,
      isAlcohol,
      alcoholCategory,
      storageArea,
      pfgCategory,
    });
  }

  return rows;
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ItemCatalog() {
  const { user, loading: authLoading } = useAuth();
  // The catalog page is already admin-only in navigation.
  // Show admin controls once auth resolves (either admin or any authenticated user on this page).
  // Server-side RBAC still enforces actual permissions.
  const isAdmin = !authLoading && !!user;
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [filterVendor, setFilterVendor] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ItemForm>(emptyForm);
  const [showImport, setShowImport] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState({ brand: "", vendor: "", category: "", storageArea: "", parLevel: "" });

  const recalcEachPricesMutation = trpc.items.recalcEachPrices.useMutation({
    onSuccess: (res) => {
      utils.items.list.invalidate();
      toast.success(`Updated ${res.updated} of ${res.total} items with each prices`);
    },
    onError: (e) => toast.error(e.message),
  });

  const queryInput = useMemo(
    () => ({ vendor: filterVendor || undefined, category: filterCategory || undefined }),
    [filterVendor, filterCategory]
  );
  const { data: items = [], isLoading } = trpc.items.list.useQuery(queryInput);
  const { data: settingsCategories = [] } = trpc.settings.listCategories.useQuery();
  const { data: settingsVendors = [] } = trpc.settings.listVendors.useQuery();
  const { data: settingsStorageAreas = [] } = trpc.settings.listStorageAreas.useQuery();
  const categoryNames = (settingsCategories as { id: number; name: string }[]).map((c) => c.name);
  const vendorNames = (settingsVendors as { id: number; name: string }[]).map((v) => v.name);
  const storageAreaNames = (settingsStorageAreas as { id: number; name: string }[]).map((s) => s.name);

  const createMutation = trpc.items.create.useMutation({
    onSuccess: () => {
      utils.items.list.invalidate();
      setShowForm(false);
      setForm(emptyForm);
      toast.success("Item added successfully");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.items.update.useMutation({
    onSuccess: () => {
      utils.items.list.invalidate();
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm);
      toast.success("Item updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const duplicateMutation = trpc.items.create.useMutation({
    onSuccess: () => {
      utils.items.list.invalidate();
      toast.success("Item duplicated");
    },
    onError: (e) => toast.error(e.message),
  });

  function handleDuplicate(item: (typeof items)[0]) {
    duplicateMutation.mutate({
      name: item.name + " (Copy)",
      brand: (item as any).brand ?? undefined,
      category: item.category,
      vendor: item.vendor,
      packSize: item.packSize ?? undefined,
      unitOfMeasure: item.unitOfMeasure ?? "CS",
      price: item.price ?? undefined,
      parLevel: String(Math.floor(parseFloat(item.parLevel ?? "0") || 0)),
      storageArea: item.storageArea ?? undefined,
      isAlcohol: item.isAlcohol,
      alcoholCategory: item.alcoholCategory ?? undefined,
      notes: item.notes ?? undefined,
      itemNumber: (item as any).itemNumber ?? undefined,
    });
  }

  const deleteMutation = trpc.items.delete.useMutation({
    onSuccess: () => {
      utils.items.list.invalidate();
      setDeleteConfirm(null);
      toast.success("Item removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkDeleteMutation = trpc.items.bulkDelete.useMutation({
    onSuccess: (_, vars) => {
      utils.items.list.invalidate();
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
      setBulkMode(false);
      toast.success(`${vars.ids.length} item${vars.ids.length === 1 ? '' : 's'} removed`);
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkUpdateMutation = trpc.items.bulkUpdate.useMutation({
    onSuccess: (count) => {
      utils.items.list.invalidate();
      setSelectedIds(new Set());
      setShowBulkEdit(false);
      setBulkMode(false);
      setBulkEditForm({ brand: "", vendor: "", category: "", storageArea: "", parLevel: "" });
      toast.success(`Updated ${count} item${count === 1 ? '' : 's'}`);
    },
    onError: (e) => toast.error(e.message),
  });

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(filtered.map((i) => i.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  const filtered = items.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.vendor.toLowerCase().includes(q) ||
      ((item as any).brand ?? "").toLowerCase().includes(q) ||
      ((item as any).itemNumber ?? "").toLowerCase().includes(q)
    );
  });

  function openEdit(item: (typeof items)[0]) {
    setForm({
      name: item.name,
      brand: (item as any).brand ?? "",
      category: item.category,
      vendor: item.vendor,
      packSize: item.packSize ?? "",
      unitOfMeasure: item.unitOfMeasure ?? "CS",
      price: item.price ?? "",
      parLevel: String(Math.floor(parseFloat(item.parLevel ?? "0") || 0)),
      storageArea: item.storageArea ?? "",
      isAlcohol: item.isAlcohol,
      alcoholCategory: item.alcoholCategory ?? "",
      notes: item.notes ?? "",
      itemNumber: (item as any).itemNumber ?? "",
    });
    setEditId(item.id);
    setShowForm(true);
  }

  function handleSubmit() {
    if (!form.name || !form.category || !form.vendor) {
      toast.error("Name, Category, and Vendor are required");
      return;
    }
    const data = {
      ...form,
      brand: form.brand || undefined,
      price: form.price || undefined,
      parLevel: form.parLevel || "0",
      packSize: form.packSize || undefined,
      storageArea: form.storageArea || undefined,
      alcoholCategory: form.alcoholCategory || undefined,
      notes: form.notes || undefined,
      itemNumber: form.itemNumber || undefined,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, data });
    } else {
      createMutation.mutate(data);
    }
  }

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, item) => {
    const key = item.category;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif text-foreground">Item Catalog</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{items.length} items total</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setBulkMode((v) => !v);
                setSelectedIds(new Set());
              }}
              className={cn(
                "p-3 rounded-xl transition-colors active:scale-95",
                bulkMode
                  ? "bg-destructive/15 text-destructive"
                  : "bg-muted text-muted-foreground hover:bg-secondary"
              )}
              title={bulkMode ? "Exit bulk select" : "Bulk select items"}
            >
              <CheckSquare size={20} />
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="p-3 rounded-xl bg-secondary text-secondary-foreground hover:bg-muted transition-colors active:scale-95"
              title="Import Order Guide Spreadsheet (PFG or Webstaurant)"
            >
              <Upload size={20} />
            </button>
            <button
              onClick={() => recalcEachPricesMutation.mutate()}
              disabled={recalcEachPricesMutation.isPending}
              className="p-3 rounded-xl bg-secondary text-secondary-foreground hover:bg-muted transition-colors active:scale-95 disabled:opacity-50"
              title="Recalculate each prices from pack size for all items"
            >
              <RefreshCw size={20} className={recalcEachPricesMutation.isPending ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={() => {
                setForm(emptyForm);
                setEditId(null);
                setShowForm(true);
              }}
              className="btn-big bg-primary text-primary-foreground flex items-center gap-2 shadow-sm"
            >
              <Plus size={20} />
              Add Item
            </button>
          </div>
        )}
      </div>

      {/* Search & Filter */}
      <div className="space-y-2">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-12 pl-10 pr-4 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-base"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X size={16} className="text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors",
              filterVendor || filterCategory
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:bg-muted"
            )}
          >
            <Filter size={16} />
            Filters
            {(filterVendor || filterCategory) && (
              <span className="w-5 h-5 rounded-full bg-white/30 text-xs flex items-center justify-center">
                {(filterVendor ? 1 : 0) + (filterCategory ? 1 : 0)}
              </span>
            )}
          </button>
          {(filterVendor || filterCategory) && (
            <button
              onClick={() => {
                setFilterVendor("");
                setFilterCategory("");
              }}
              className="px-4 py-2.5 rounded-xl border border-border bg-card text-sm font-semibold text-muted-foreground hover:bg-muted"
            >
              Clear
            </button>
          )}
        </div>

        {showFilters && (
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3 animate-in">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Vendor
              </label>
              <div className="flex flex-wrap gap-2">
                {vendorNames.map((v) => (
                  <button
                    key={v}
                    onClick={() => setFilterVendor(filterVendor === v ? "" : v)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
                      filterVendor === v
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground hover:bg-secondary"
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Category
              </label>
              <div className="flex flex-wrap gap-2">
                {categoryNames.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFilterCategory(filterCategory === c ? "" : c)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
                      filterCategory === c
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground hover:bg-secondary"
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Action Bar */}
      {bulkMode && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/20 rounded-2xl px-4 py-3">
          <button
            onClick={selectedIds.size === filtered.length ? deselectAll : selectAll}
            className="flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            {selectedIds.size === filtered.length
              ? <CheckSquare size={18} className="text-primary" />
              : <Square size={18} className="text-muted-foreground" />}
            {selectedIds.size === filtered.length ? "Deselect All" : "Select All"}
          </button>
          <span className="text-sm text-muted-foreground ml-auto">
            {selectedIds.size} selected
          </span>
          {selectedIds.size > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowBulkEdit(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all"
              >
                <Edit2 size={16} />
                Edit {selectedIds.size}
              </button>
              <button
                onClick={() => setBulkDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 active:scale-95 transition-all"
              >
                <Trash2 size={16} />
                Delete {selectedIds.size}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Item List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-2xl skeleton" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Package size={48} className="mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium">No items found</p>
          {isAdmin && (
            <button
              onClick={() => {
                setForm(emptyForm);
                setEditId(null);
                setShowForm(true);
              }}
              className="btn-big bg-primary text-primary-foreground mx-auto flex items-center gap-2"
            >
              <Plus size={18} /> Add First Item
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, catItems]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-lg">{CATEGORY_ICONS[category] ?? "📋"}</span>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    {category}
                  </h3>
                  <span className="text-xs text-muted-foreground">({catItems.length})</span>
                </div>
                <div className="space-y-2">
                  {catItems.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "bg-card rounded-2xl border p-4 shadow-sm transition-colors",
                        bulkMode && selectedIds.has(item.id)
                          ? "border-destructive bg-destructive/5"
                          : "border-border",
                        bulkMode && "cursor-pointer"
                      )}
                      onClick={bulkMode ? () => toggleSelect(item.id) : undefined}
                    >
                      <div className="flex items-start justify-between gap-3">
                        {bulkMode && (
                          <div className="shrink-0 mt-0.5">
                            {selectedIds.has(item.id)
                              ? <CheckSquare size={20} className="text-destructive" />
                              : <Square size={20} className="text-muted-foreground" />}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground truncate">{item.name}</p>
                          {(item as any).brand && (
                            <p className="text-xs text-muted-foreground mt-0.5">{(item as any).brand}</p>
                          )}
                          {(item as any).itemNumber && (
                            <p className="text-xs text-muted-foreground/70 mt-0.5 font-mono">
                              #{(item as any).itemNumber}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <span
                              className={cn(
                                "text-xs font-semibold px-2 py-0.5 rounded-full",
                                VENDOR_COLORS[item.vendor] ?? "bg-gray-100 text-gray-700"
                              )}
                            >
                              {item.vendor}
                            </span>
                            {item.packSize && (
                              <span className="text-xs text-muted-foreground">{item.packSize}</span>
                            )}
                            {item.unitOfMeasure && (
                              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                                {item.unitOfMeasure}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            {item.price && parseFloat(item.price) > 0 && (
                              <span className="text-sm font-semibold text-foreground">
                                ${(parseFloat(item.price) || 0).toFixed(2)}
                                {(item as any).eachPrice && parseFloat((item as any).eachPrice) > 0 && (
                                  <span className="text-xs font-normal text-muted-foreground ml-1">
                                    · Each: ${(parseFloat((item as any).eachPrice) || 0).toFixed(2)}
                                  </span>
                                )}
                              </span>
                            )}
                            {item.parLevel && parseFloat(item.parLevel) > 0 && (
                              <span className="text-xs text-muted-foreground">
                                Par: {Math.floor(parseFloat(item.parLevel))} {item.unitOfMeasure}
                              </span>
                            )}
                            {item.storageArea && (
                              <span className="text-xs text-muted-foreground">{item.storageArea}</span>
                            )}
                          </div>
                        </div>
                        {isAdmin && !bulkMode && (
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); openEdit(item); }}
                              className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary transition-colors active:scale-95"
                              title="Edit item"
                            >
                              <Edit2 size={16} className="text-foreground" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDuplicate(item); }}
                              className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary transition-colors active:scale-95"
                              title="Duplicate item"
                              disabled={duplicateMutation.isPending}
                            >
                              <Copy size={16} className="text-foreground" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item.id); }}
                              className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center hover:bg-destructive/20 transition-colors active:scale-95"
                              title="Delete item"
                            >
                              <Trash2 size={16} className="text-destructive" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* ── Add/Edit Item Modal ── */}
      {showForm && (
        <Modal
          title={editId ? "Edit Item" : "Add New Item"}
          onClose={() => {
            setShowForm(false);
            setEditId(null);
            setForm(emptyForm);
          }}
        >
          <div className="space-y-4">
            <FormField label="Item Name *">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. House Blend Coffee"
                className="form-input"
              />
            </FormField>

            <FormField label="Brand / Manufacturer">
              <input
                type="text"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="e.g. Svedka, Tito's, Heineken"
                className="form-input"
              />
            </FormField>

            <FormField label="Item #">
              <input
                type="text"
                value={form.itemNumber}
                onChange={(e) => setForm({ ...form, itemNumber: e.target.value })}
                placeholder="e.g. 12345"
                className="form-input font-mono"
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Category *">
                <select
                  value={form.category}
                  onChange={(e) => {
                    const cat = e.target.value;
                    setForm({
                      ...form,
                      category: cat,
                      isAlcohol: cat.startsWith("Alcohol"),
                      alcoholCategory:
                        cat === "Alcohol - 100" ? "100" : cat === "Alcohol - 130" ? "130" : "",
                    });
                  }}
                  className="form-input"
                >
                  <option value="">Select…</option>
                  {categoryNames.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Vendor *">
                <select
                  value={form.vendor}
                  onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                  className="form-input"
                >
                  <option value="">Select…</option>
                  {vendorNames.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Pack Size">
                <input
                  type="text"
                  value={form.packSize}
                  onChange={(e) => setForm({ ...form, packSize: e.target.value })}
                  placeholder="e.g. 6/750 ML"
                  className="form-input"
                />
              </FormField>
              <FormField label="Unit of Measure">
                <select
                  value={form.unitOfMeasure}
                  onChange={(e) => setForm({ ...form, unitOfMeasure: e.target.value })}
                  className="form-input"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Price ($)">
                <input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="0.00"
                  className="form-input"
                />
              </FormField>
              <FormField label="Par Level">
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={form.parLevel}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm({ ...form, parLevel: v.includes(".") ? String(Math.floor(parseFloat(v) || 0)) : v });
                  }}
                  onKeyDown={(e) => { if (e.key === "." || e.key === ",") e.preventDefault(); }}
                  placeholder="0"
                  className="form-input"
                />
              </FormField>
            </div>

            <FormField label="Storage Area">
              <select
                value={form.storageArea}
                onChange={(e) => setForm({ ...form, storageArea: e.target.value })}
                className="form-input"
              >
                <option value="">Select…</option>
                {storageAreaNames.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Notes">
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes…"
                rows={2}
                className="form-input resize-none"
              />
            </FormField>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditId(null);
                  setForm(emptyForm);
                }}
                className="flex-1 btn-big bg-muted text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex-1 btn-big bg-primary text-primary-foreground disabled:opacity-60"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving…"
                  : editId
                    ? "Save Changes"
                    : "Add Item"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteConfirm !== null && (
        <Modal title="Remove Item?" onClose={() => setDeleteConfirm(null)}>
          <p className="text-muted-foreground mb-6">
            This item will be deactivated and hidden from all views. Historical count data is preserved.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="flex-1 btn-big bg-muted text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteMutation.mutate({ id: deleteConfirm })}
              disabled={deleteMutation.isPending}
              className="flex-1 btn-big bg-destructive text-destructive-foreground disabled:opacity-60"
            >
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Bulk Edit Modal ── */}
      {showBulkEdit && (
        <Modal title={`Edit ${selectedIds.size} Item${selectedIds.size === 1 ? '' : 's'}`} onClose={() => setShowBulkEdit(false)}>
          <p className="text-sm text-muted-foreground mb-4">
            Leave fields blank to keep existing values. Only filled fields will be updated.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Brand / Manufacturer</label>
              <input
                type="text"
                placeholder="e.g. Creature Comforts (leave blank to keep)"
                value={bulkEditForm.brand}
                onChange={(e) => setBulkEditForm((f) => ({ ...f, brand: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Vendor</label>
              <select
                value={bulkEditForm.vendor}
                onChange={(e) => setBulkEditForm((f) => ({ ...f, vendor: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm"
              >
                <option value="">— keep existing —</option>
                {vendorNames.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Category</label>
              <select
                value={bulkEditForm.category}
                onChange={(e) => setBulkEditForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm"
              >
                <option value="">— keep existing —</option>
                {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Storage Area</label>
              <select
                value={bulkEditForm.storageArea}
                onChange={(e) => setBulkEditForm((f) => ({ ...f, storageArea: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm"
              >
                <option value="">— keep existing —</option>
                {storageAreaNames.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Par Level</label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 2 (leave blank to keep)"
                value={bulkEditForm.parLevel}
                onChange={(e) => {
                  const v = e.target.value;
                  setBulkEditForm((f) => ({ ...f, parLevel: v.includes(".") ? String(Math.floor(parseFloat(v) || 0)) : v }));
                }}
                onKeyDown={(e) => { if (e.key === "." || e.key === ",") e.preventDefault(); }}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setShowBulkEdit(false)} className="flex-1 btn-big bg-muted text-foreground">
              Cancel
            </button>
            <button
              onClick={() => {
                const patch: { brand?: string; vendor?: string; category?: string; storageArea?: string; parLevel?: number } = {};
                if (bulkEditForm.brand) patch.brand = bulkEditForm.brand;
                if (bulkEditForm.vendor) patch.vendor = bulkEditForm.vendor;
                if (bulkEditForm.category) patch.category = bulkEditForm.category;
                if (bulkEditForm.storageArea) patch.storageArea = bulkEditForm.storageArea;
                if (bulkEditForm.parLevel) patch.parLevel = parseFloat(bulkEditForm.parLevel);
                if (Object.keys(patch).length === 0) {
                  toast.error("Please fill in at least one field to update.");
                  return;
                }
                bulkUpdateMutation.mutate({ ids: Array.from(selectedIds), patch });
              }}
              disabled={bulkUpdateMutation.isPending}
              className="flex-1 btn-big bg-primary text-primary-foreground disabled:opacity-60"
            >
              {bulkUpdateMutation.isPending ? "Updating…" : `Update ${selectedIds.size} Items`}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Bulk Delete Confirm ── */}
      {bulkDeleteConfirm && (
        <Modal title={`Remove ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}?`} onClose={() => setBulkDeleteConfirm(false)}>
          <p className="text-muted-foreground mb-6">
            {selectedIds.size} item{selectedIds.size === 1 ? '' : 's'} will be deactivated and hidden from all views. Historical count data is preserved.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setBulkDeleteConfirm(false)}
              className="flex-1 btn-big bg-muted text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={() => bulkDeleteMutation.mutate({ ids: Array.from(selectedIds) })}
              disabled={bulkDeleteMutation.isPending}
              className="flex-1 btn-big bg-destructive text-destructive-foreground disabled:opacity-60"
            >
              {bulkDeleteMutation.isPending ? "Removing…" : `Remove ${selectedIds.size}`}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Universal Import Modal ── */}
      {showImport && (
        <UniversalImportModal
          onClose={() => {
            setShowImport(false);
            utils.items.list.invalidate();
          }}
        />
      )}
    </div>
  );
}

// ── PFG Import Modal ───────────────────────────────────────────────────────────

function PfgImportModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [rows, setRows] = useState<PfgRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [filterCat, setFilterCat] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const importMutation = trpc.items.importPfg.useMutation({
    onSuccess: (res) => {
      setResult(res as ImportResult);
      setStep("result");
    },
    onError: (e) => toast.error(e.message),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string ?? "";
      const parsed = parsePfgCsv(text);
      if (parsed.length === 0) {
        toast.error("No valid rows found. Make sure this is a PFG Order Guide CSV.");
        return;
      }
      setRows(parsed);
      setStep("preview");
    };
    reader.readAsText(file);
  }

  function handleImport() {
    importMutation.mutate({ rows });
  }

  const uniqueCats = Array.from(new Set(rows.map((r) => r.pfgCategory))).sort();
  const displayRows = filterCat ? rows.filter((r) => r.pfgCategory === filterCat) : rows;

  return (
    <Modal title="Import PFG Order Guide" onClose={onClose}>
      {/* ── Step 1: Upload ── */}
      {step === "upload" && (
        <div className="space-y-5">
          <div className="bg-secondary border border-border rounded-xl p-4 text-sm text-foreground space-y-1">
            <p className="font-semibold flex items-center gap-2">
              <Upload size={16} /> PFG Order Guide CSV
            </p>
            <p>Upload your PFG Order Guide export. The system will automatically map all columns and categories.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Expected columns: <span className="font-mono">Category Name, Product Description, Brand, Product Number, Pack Size, UOM, Price</span>
            </p>
          </div>

          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileChange} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full h-32 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 flex flex-col items-center justify-center gap-3 hover:bg-primary/10 transition-colors active:scale-[0.98]"
          >
            <Upload size={32} className="text-primary" />
            <div className="text-center">
              <p className="font-semibold text-foreground">Tap to select PFG CSV file</p>
              <p className="text-sm text-muted-foreground">Supports .csv and .txt files</p>
            </div>
          </button>

          <button onClick={onClose} className="w-full btn-big bg-muted text-foreground">
            Cancel
          </button>
        </div>
      )}

      {/* ── Step 2: Preview ── */}
      {step === "preview" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">{rows.length} items found</p>
              <p className="text-sm text-muted-foreground">
                New items will be created. Existing items (matched by Product #) will have pricing updated.
              </p>
            </div>
          </div>

          {/* Category filter chips */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterCat("")}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-semibold transition-colors",
                !filterCat ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
              )}
            >
              All ({rows.length})
            </button>
            {uniqueCats.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCat(filterCat === cat ? "" : cat)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-semibold transition-colors",
                  filterCat === cat ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                )}
              >
                {cat.split("-")[0]} ({rows.filter((r) => r.pfgCategory === cat).length})
              </button>
            ))}
          </div>

          {/* Preview table */}
          <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border">
            {displayRows.map((row, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2.5 text-sm bg-card">
                <div className="flex-1 min-w-0 mr-3">
                  <p className="font-semibold text-foreground truncate">{row.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {row.brand} · #{(row as any).itemNumber} · {row.packSize}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    → <span className="font-medium text-foreground">{row.category}</span>
                    {row.storageArea && <span> · {row.storageArea}</span>}
                  </p>
                </div>
                <span className="font-bold text-foreground shrink-0">${row.price}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep("upload")}
              className="flex-1 btn-big bg-muted text-foreground"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={importMutation.isPending}
              className="flex-1 btn-big bg-primary text-primary-foreground disabled:opacity-60"
            >
              {importMutation.isPending ? "Importing…" : `Import ${rows.length} Items`}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Result ── */}
      {step === "result" && result && (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-accent/10 border border-accent/30 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-accent">{result.created}</p>
              <p className="text-xs font-semibold text-accent mt-0.5">New Items</p>
            </div>
            <div className="bg-ring/10 border border-ring/30 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-ring">{result.updated}</p>
              <p className="text-xs font-semibold text-ring mt-0.5">Price Updated</p>
            </div>
            <div className="bg-muted border border-border rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-muted-foreground">{result.unchanged}</p>
              <p className="text-xs font-semibold text-muted-foreground mt-0.5">Unchanged</p>
            </div>
          </div>

          {/* Price variance report */}
          {result.priceChanges.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-primary" />
                <p className="font-semibold text-foreground text-sm">
                  Price Changes Detected ({result.priceChanges.length})
                </p>
              </div>
              <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-2 bg-muted text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <span>Item</span>
                  <span className="text-right">Old</span>
                  <span className="text-right">New</span>
                  <span className="text-right">$ Diff</span>
                  <span className="text-right">%</span>
                </div>
                {result.priceChanges.map((change) => {
                  const diff = parseFloat(change.diff);
                  const pct = parseFloat(change.pctChange);
                  const isUp = diff > 0;
                  return (
                    <div
                      key={change.itemId}
                      className={cn(
                        "grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-3 items-center text-sm",
                        isUp ? "bg-destructive/5" : "bg-accent/5"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate text-xs">{change.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{change.brand}</p>
                      </div>
                      <span className="text-muted-foreground font-mono text-xs text-right">
                        ${parseFloat(change.oldPrice).toFixed(2)}
                      </span>
                      <span className="font-bold font-mono text-xs text-right">
                        ${parseFloat(change.newPrice).toFixed(2)}
                      </span>
                      {/* Dollar diff badge */}
                      <span
                        className={cn(
                          "text-xs font-bold font-mono px-1.5 py-0.5 rounded-md text-right",
                          isUp
                            ? "bg-destructive/10 text-destructive"
                            : "bg-accent/20 text-accent"
                        )}
                      >
                        {isUp ? "+" : ""}${Math.abs(diff).toFixed(2)}
                      </span>
                      {/* Percent badge */}
                      <span
                        className={cn(
                          "text-xs font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 justify-end",
                          isUp
                            ? "bg-destructive/10 text-destructive"
                            : "bg-accent/20 text-accent"
                        )}
                      >
                        {isUp ? (
                          <ArrowUp size={10} />
                        ) : (
                          <ArrowDown size={10} />
                        )}
                        {Math.abs(pct).toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Net impact summary */}
              <div className="bg-card border border-border rounded-xl p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Net Price Impact
                </p>
                {(() => {
                  const increases = result.priceChanges.filter((c) => parseFloat(c.diff) > 0);
                  const decreases = result.priceChanges.filter((c) => parseFloat(c.diff) < 0);
                  const totalIncrease = increases.reduce((s, c) => s + parseFloat(c.diff), 0);
                  const totalDecrease = decreases.reduce((s, c) => s + parseFloat(c.diff), 0);
                  return (
                    <div className="space-y-1.5">
                      {increases.length > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1.5 text-destructive">
                            <TrendingUp size={14} />
                            {increases.length} price increase{increases.length !== 1 ? "s" : ""}
                          </span>
                          <span className="font-bold text-destructive">+${totalIncrease.toFixed(2)}</span>
                        </div>
                      )}
                      {decreases.length > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1.5 text-accent">
                            <TrendingDown size={14} />
                            {decreases.length} price decrease{decreases.length !== 1 ? "s" : ""}
                          </span>
                          <span className="font-bold text-accent">${totalDecrease.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-accent/10 border border-accent/30 rounded-xl p-4">
              <CheckCircle2 size={20} className="text-accent shrink-0" />
              <div>
                <p className="font-semibold text-foreground text-sm">No price changes detected</p>
                <p className="text-xs text-muted-foreground">All existing item prices match the imported guide.</p>
              </div>
            </div>
          )}

          <button onClick={onClose} className="w-full btn-big bg-primary text-primary-foreground">
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}

// ── Shared Components ──────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Use a ref to track whether the modal was just mounted.
  // This prevents the same click event that opened the modal from
  // immediately triggering the backdrop onMouseDown and closing it.
  const justMounted = useRef(true);
  useEffect(() => {
    // After first paint, allow backdrop clicks to close
    const t = setTimeout(() => { justMounted.current = false; }, 50);
    return () => clearTimeout(t);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onMouseDown={(e) => {
          if (justMounted.current) return;
          if (e.target === e.currentTarget) onClose();
        }}
      />
      <div
        className="relative w-full sm:max-w-lg bg-card rounded-t-3xl sm:rounded-2xl shadow-lg max-h-[90vh] overflow-y-auto"
        style={{ animation: "modalIn 200ms cubic-bezier(0.23,1,0.32,1) both" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-lg font-serif font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  );
}

// ── Webstaurant CSV Parser ─────────────────────────────────────────────────────
// CSV format: header row 1 is ",Order Guide,,," (skip)
// header row 2: "Item Number,Name,Vendor,Quantity,Base Price/Unit*"
// Last row has "*Add items to your cart..." — skip it

type WebstaurantRow = {
  itemNumber: string;
  rawName: string;
  cleanName: string;
  brand: string;
  packSize: string;
  price: string;
};

function parseWebstaurantCsv(text: string): WebstaurantRow[] {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  const lines = cleaned.split(/\r?\n/);
  if (lines.length < 3) return [];

  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; }
      else { current += ch; }
    }
    result.push(current.trim());
    return result;
  }

  // Find the real header row (contains "Item Number")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    if (lines[i].toLowerCase().includes("item number")) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return [];

  const headers = parseLine(lines[headerIdx]).map((h) => h.toLowerCase().replace(/\s+/g, " ").trim());
  const idxItemNum = headers.findIndex((h) => h.includes("item number"));
  const idxName = headers.findIndex((h) => h === "name");
  const idxVendor = headers.findIndex((h) => h === "vendor");
  const idxPrice = headers.findIndex((h) => h.includes("price"));

  const rows: WebstaurantRow[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseLine(line);

    const itemNumber = (cols[idxItemNum] ?? "").trim();
    const fullName = (cols[idxName] ?? "").trim();
    const brand = (cols[idxVendor] ?? "").trim();
    const rawPriceStr = (cols[idxPrice] ?? "").trim().replace(/[$,*]/g, "");

    // Skip footer row
    if (!itemNumber || fullName.toLowerCase().includes("add items to your cart")) continue;
    if (!fullName) continue;

    const price = rawPriceStr && !isNaN(parseFloat(rawPriceStr))
      ? parseFloat(rawPriceStr).toFixed(2)
      : "0.00";

    // Extract pack size from name (e.g. "- 25/Case", "- 500/Case", "- 6/Case")
    const packMatch = fullName.match(/[-–]\s*([\d,]+\s*\/\s*\w+)\s*$/);
    const packSize = packMatch ? packMatch[1].replace(/,/g, "") : "";

    // Clean name: strip trailing pack size descriptor
    const nameWithoutPack = fullName.replace(/\s*[-–]\s*[\d,]+\s*\/\s*\w+\s*$/, "").trim();

    // Simple title-case clean name (AI will improve this server-side)
    const cleanName = nameWithoutPack
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");

    rows.push({
      itemNumber: itemNumber,
      rawName: fullName,
      cleanName,
      brand,
      packSize,
      price,
    });
  }

  return rows;
}

// ── Webstaurant Import Modal ───────────────────────────────────────────────────

type WebstaurantImportResult = {
  created: number;
  updated: number;
  unchanged: number;
  priceChanges: Array<{
    itemId: number;
    name: string;
    oldPrice: string;
    newPrice: string;
    diff: string;
    pctChange: string;
  }>;
};

function WebstaurantImportModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"upload" | "preview" | "generating" | "result">("upload");
  const [rows, setRows] = useState<WebstaurantRow[]>([]);
  const [result, setResult] = useState<WebstaurantImportResult | null>(null);
  const [aiProgress, setAiProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const generateCleanName = trpc.items.generateCleanName.useMutation();

  const importMutation = trpc.items.importWebstaurant.useMutation({
    onSuccess: (res) => {
      setResult(res as WebstaurantImportResult);
      setStep("result");
    },
    onError: (e) => toast.error(e.message),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? "";
      const parsed = parseWebstaurantCsv(text);
      if (parsed.length === 0) {
        toast.error("No valid rows found. Make sure this is a Webstaurant Order Guide CSV.");
        return;
      }
      setRows(parsed);
      setStep("preview");
    };
    reader.readAsText(file);
  }

  async function handleImportWithAI() {
    setStep("generating");
    setAiProgress(0);
    const enhanced: WebstaurantRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const aiName = await generateCleanName.mutateAsync({
          rawName: row.rawName,
          brand: row.brand,
          packSize: row.packSize,
        });
        enhanced.push({ ...row, cleanName: typeof aiName === "string" ? aiName : row.cleanName });
      } catch {
        enhanced.push(row);
      }
      setAiProgress(Math.round(((i + 1) / rows.length) * 100));
    }
    importMutation.mutate({ rows: enhanced });
  }

  return (
    <Modal title="Import Webstaurant Order Guide" onClose={onClose}>
      {/* Step 1: Upload */}
      {step === "upload" && (
        <div className="space-y-5">
          <div className="bg-secondary border border-border rounded-xl p-4 text-sm text-foreground space-y-1">
            <p className="font-semibold flex items-center gap-2">
              <Upload size={16} /> Webstaurant Order Guide CSV
            </p>
            <p>Export your order guide from WebstaurantStore (Saved Lists → Export CSV) then upload here.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Expected columns: <span className="font-mono">Item Number, Name, Vendor, Quantity, Base Price/Unit</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Re-uploading will update prices and track changes. Historical price data is preserved.
            </p>
          </div>

          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileChange} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full h-32 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 flex flex-col items-center justify-center gap-3 hover:bg-primary/10 transition-colors active:scale-[0.98]"
          >
            <Upload size={32} className="text-primary" />
            <div className="text-center">
              <p className="font-semibold text-foreground">Tap to select Webstaurant CSV</p>
              <p className="text-sm text-muted-foreground">Supports .csv and .txt files</p>
            </div>
          </button>

          <button onClick={onClose} className="w-full btn-big bg-muted text-foreground">
            Cancel
          </button>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === "preview" && (
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-foreground">{rows.length} items found</p>
            <p className="text-sm text-muted-foreground">
New items will be created; existing items (matched by Item #) will have prices updated.
            </p>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border">
            {rows.map((row, i) => (
              <div key={i} className="px-3 py-2.5 text-sm bg-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {/* Original vendor description */}
                    <p className="text-xs text-foreground truncate">{row.rawName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.brand} · #{(row as any).itemNumber}
                      {row.packSize && ` · ${row.packSize}`}
                    </p>
                  </div>
                  <span className="font-bold text-foreground shrink-0">${row.price}</span>
                </div>
              </div>
            ))}
          </div>



          <div className="flex gap-3">
            <button onClick={() => setStep("upload")} className="flex-1 btn-big bg-muted text-foreground">
              Back
            </button>
            <button
              onClick={handleImportWithAI}
              className="flex-1 btn-big bg-primary text-primary-foreground disabled:opacity-60"
            >
              Import {rows.length} Items
            </button>
          </div>
        </div>
      )}

      {/* Step 3: AI Generation in progress */}
      {step === "generating" && (
        <div className="space-y-5 py-4 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Upload size={28} className="text-primary animate-bounce" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Importing items…</p>
            <p className="text-sm text-muted-foreground mt-1">
              Processing item {Math.round((aiProgress / 100) * rows.length)} of {rows.length}
            </p>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${aiProgress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{aiProgress}% complete</p>
        </div>
      )}

      {/* Step 4: Result */}
      {step === "result" && result && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-accent/10 border border-accent/30 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-accent">{result.created}</p>
              <p className="text-xs font-semibold text-accent mt-0.5">New Items</p>
            </div>
            <div className="bg-ring/10 border border-ring/30 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-ring">{result.updated}</p>
              <p className="text-xs font-semibold text-ring mt-0.5">Price Updated</p>
            </div>
            <div className="bg-muted border border-border rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-muted-foreground">{result.unchanged}</p>
              <p className="text-xs font-semibold text-muted-foreground mt-0.5">Unchanged</p>
            </div>
          </div>

          {result.priceChanges.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-primary" />
                <p className="font-semibold text-foreground text-sm">
                  Price Changes Detected ({result.priceChanges.length})
                </p>
              </div>
              <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-2 bg-muted text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <span>Item</span>
                  <span className="text-right">Old</span>
                  <span className="text-right">New</span>
                  <span className="text-right">$ Diff</span>
                  <span className="text-right">%</span>
                </div>
                {result.priceChanges.map((change) => {
                  const diff = parseFloat(change.diff);
                  const pct = parseFloat(change.pctChange);
                  const isUp = diff > 0;
                  return (
                    <div
                      key={change.itemId}
                      className={cn(
                        "grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-3 items-center text-sm",
                        isUp ? "bg-destructive/5" : "bg-accent/5"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate text-xs">{change.name}</p>
                      </div>
                      <span className="text-muted-foreground font-mono text-xs text-right">
                        ${parseFloat(change.oldPrice).toFixed(2)}
                      </span>
                      <span className="font-bold font-mono text-xs text-right">
                        ${parseFloat(change.newPrice).toFixed(2)}
                      </span>
                      <span className={cn("text-xs font-bold font-mono px-1.5 py-0.5 rounded-md text-right", isUp ? "bg-destructive/10 text-destructive" : "bg-accent/20 text-accent")}>
                        {isUp ? "+" : ""}${Math.abs(diff).toFixed(2)}
                      </span>
                      <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 justify-end", isUp ? "bg-destructive/10 text-destructive" : "bg-accent/20 text-accent")}>
                        {isUp ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                        {Math.abs(pct).toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="bg-card border border-border rounded-xl p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Net Price Impact</p>
                {(() => {
                  const increases = result.priceChanges.filter((c) => parseFloat(c.diff) > 0);
                  const decreases = result.priceChanges.filter((c) => parseFloat(c.diff) < 0);
                  const totalIncrease = increases.reduce((s, c) => s + parseFloat(c.diff), 0);
                  const totalDecrease = decreases.reduce((s, c) => s + parseFloat(c.diff), 0);
                  return (
                    <div className="space-y-1.5">
                      {increases.length > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1.5 text-destructive">
                            <TrendingUp size={14} />
                            {increases.length} price increase{increases.length !== 1 ? "s" : ""}
                          </span>
                          <span className="font-bold text-destructive">+${totalIncrease.toFixed(2)}</span>
                        </div>
                      )}
                      {decreases.length > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1.5 text-accent">
                            <TrendingDown size={14} />
                            {decreases.length} price decrease{decreases.length !== 1 ? "s" : ""}
                          </span>
                          <span className="font-bold text-accent">${totalDecrease.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-accent/10 border border-accent/30 rounded-xl p-4">
              <CheckCircle2 size={20} className="text-accent shrink-0" />
              <div>
                <p className="font-semibold text-foreground text-sm">No price changes detected</p>
                <p className="text-xs text-muted-foreground">All existing item prices match the imported guide.</p>
              </div>
            </div>
          )}

          <button onClick={onClose} className="w-full btn-big bg-primary text-primary-foreground">
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}

// ── Universal Import Modal ─────────────────────────────────────────────────────
// Detects PFG vs Webstaurant format automatically; any other format goes through
// the AI-powered column mapper (analyzeAndMapCsv) for universal support.

type DetectedFormat = "pfg" | "webstaurant" | "ai";

type AiMappedRow = {
  name: string;
  brand?: string;
  category?: string;
  vendor?: string;
  packSize?: string;
  unitOfMeasure?: string;
  price?: string;
  storageArea?: string;
  isAlcohol?: boolean;
  alcoholCategory?: string;
};

function detectFormat(text: string): DetectedFormat {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  const firstLines = cleaned.split(/\r?\n/).slice(0, 5).join("\n").toLowerCase();
  // PFG files have a unique "Custom Product Description" column
  if (firstLines.includes("custom product description") && firstLines.includes("product number")) {
    return "pfg";
  }
  if (firstLines.includes("item number") && (firstLines.includes("base price") || firstLines.includes("vendor"))) {
    return "webstaurant";
  }
  // Webstaurant sometimes has a title row before the header
  if (firstLines.includes("item number") && firstLines.includes("name")) {
    return "webstaurant";
  }
  // Everything else goes through AI mapping
  return "ai";
}

function UniversalImportModal({ onClose }: { onClose: () => void }) {
  type Step = "upload" | "pfg-preview" | "web-preview" | "web-generating" | "ai-analyzing" | "ai-preview" | "ai-enriching" | "result";
  const [step, setStep] = useState<Step>("upload");
  const [format, setFormat] = useState<DetectedFormat>("ai");
  const [pfgRows, setPfgRows] = useState<PfgRow[]>([]);
  const [webRows, setWebRows] = useState<WebstaurantRow[]>([]);
  const [aiRows, setAiRows] = useState<AiMappedRow[]>([]);
  const [aiSource, setAiSource] = useState("Universal");
  const [filterCat, setFilterCat] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [aiProgress, setAiProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const generateCleanName = trpc.items.generateCleanName.useMutation();
  const enrichImportRows = trpc.items.enrichImportRows.useMutation();

  const importPfgMutation = trpc.items.importPfg.useMutation({
    onSuccess: (res) => { setResult(res as ImportResult); setStep("result"); },
    onError: (e) => toast.error(e.message),
  });

  const importWebMutation = trpc.items.importWebstaurant.useMutation({
    onSuccess: (res) => { setResult(res as ImportResult); setStep("result"); },
    onError: (e) => toast.error(e.message),
  });

  const analyzeAndMapCsv = trpc.items.analyzeAndMapCsv.useMutation({
    onSuccess: (res) => {
      if (!res.rows || res.rows.length === 0) {
        toast.error("AI could not find any valid rows in this file.");
        setStep("upload");
        return;
      }
      const source = res.detectedSource ?? "Universal";
      setAiSource(source);
      // Now enrich the mapped rows with AI brand/name/packSize intelligence
      setStep("ai-enriching");
      enrichImportRows.mutate(
        { rows: res.rows as AiMappedRow[], importSource: source },
        {
          onSuccess: (enriched) => {
            setAiRows(enriched as AiMappedRow[]);
            setStep("ai-preview");
          },
          onError: () => {
            // Fallback: use unenriched rows
            setAiRows(res.rows as AiMappedRow[]);
            setStep("ai-preview");
          },
        }
      );
    },
    onError: (e) => {
      toast.error("AI analysis failed: " + e.message);
      setStep("upload");
    },
  });

  const importUniversalMutation = trpc.items.importUniversal.useMutation({
    onSuccess: (res) => { setResult(res as ImportResult); setStep("result"); },
    onError: (e) => toast.error(e.message),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? "";
      const detected = detectFormat(text);
      setFormat(detected);

      if (detected === "pfg") {
        const rows = parsePfgCsv(text);
        if (rows.length === 0) {
          toast.error("No valid rows found in this file.");
          return;
        }
        // Enrich PFG rows with AI brand/name intelligence
        setStep("ai-enriching");
        setAiSource("PFG");
        enrichImportRows.mutate(
          { rows: rows.map((r) => ({ name: r.name, brand: r.brand, packSize: r.packSize, category: r.category, vendor: "PFG", storageArea: r.storageArea, price: r.price })), importSource: "PFG" },
          {
            onSuccess: (enriched) => {
              // Merge enriched data back into pfgRows
              const merged = rows.map((r, i) => ({
                ...r,
                name: (enriched[i] as AiMappedRow)?.name ?? r.name,
                brand: (enriched[i] as AiMappedRow)?.brand ?? r.brand,
                category: (enriched[i] as AiMappedRow)?.category ?? r.category,
                storageArea: (enriched[i] as AiMappedRow)?.storageArea ?? r.storageArea,
              }));
              setPfgRows(merged);
              setStep("pfg-preview");
            },
            onError: () => { setPfgRows(rows); setStep("pfg-preview"); },
          }
        );
      } else if (detected === "webstaurant") {
        const rows = parseWebstaurantCsv(text);
        if (rows.length === 0) {
          toast.error("No valid rows found in this file.");
          return;
        }
        // Enrich Webstaurant rows with AI brand/name intelligence
        setStep("ai-enriching");
        setAiSource("Webstaurant");
        enrichImportRows.mutate(
          { rows: rows.map((r) => ({ name: r.rawName, brand: r.brand, packSize: r.packSize, category: undefined, vendor: "Webstaurant", price: r.price })), importSource: "Webstaurant" },
          {
            onSuccess: (enriched) => {
              const merged = rows.map((r, i) => ({
                ...r,
                cleanName: (enriched[i] as AiMappedRow)?.name ?? r.cleanName,
                brand: (enriched[i] as AiMappedRow)?.brand ?? r.brand,
              }));
              setWebRows(merged);
              setStep("web-preview");
            },
            onError: () => { setWebRows(rows); setStep("web-preview"); },
          }
        );
      } else {
        // Unknown format — send to AI for column mapping
        setStep("ai-analyzing");
        analyzeAndMapCsv.mutate({ csvText: text });
      }
    };
    reader.readAsText(file);
  }

  async function handleWebImportWithAI() {
    setStep("web-generating");
    setAiProgress(0);
    const enhanced: WebstaurantRow[] = [];
    for (let i = 0; i < webRows.length; i++) {
      const row = webRows[i];
      try {
        const aiName = await generateCleanName.mutateAsync({
          rawName: row.rawName,
          brand: row.brand,
          packSize: row.packSize,
        });
        enhanced.push({ ...row, cleanName: typeof aiName === "string" ? aiName : row.cleanName });
      } catch {
        enhanced.push(row);
      }
      setAiProgress(Math.round(((i + 1) / webRows.length) * 100));
    }
    importWebMutation.mutate({ rows: enhanced });
  }

  const formatLabel = format === "pfg" ? "PFG" : format === "webstaurant" ? "Webstaurant" : aiSource;
  const totalRows = format === "pfg" ? pfgRows.length : format === "webstaurant" ? webRows.length : aiRows.length;

  // Shared result UI
  function ResultStep() {
    if (!result) return null;
    return (
      <div className="space-y-5">
        <div className="bg-secondary border border-border rounded-xl p-3 text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            {formatLabel} Import Complete
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-accent/10 border border-accent/30 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-accent">{result.created}</p>
            <p className="text-xs font-semibold text-accent mt-0.5">New Items</p>
          </div>
          <div className="bg-ring/10 border border-ring/30 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-ring">{result.updated}</p>
            <p className="text-xs font-semibold text-ring mt-0.5">Price Updated</p>
          </div>
          <div className="bg-muted border border-border rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{result.unchanged}</p>
            <p className="text-xs font-semibold text-muted-foreground mt-0.5">Unchanged</p>
          </div>
        </div>

        {result.priceChanges.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-primary" />
              <p className="font-semibold text-foreground text-sm">
                Price Changes Detected ({result.priceChanges.length})
              </p>
            </div>
            <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-2 bg-muted text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <span>Item</span>
                <span className="text-right">Old</span>
                <span className="text-right">New</span>
                <span className="text-right">$ Diff</span>
                <span className="text-right">%</span>
              </div>
              {result.priceChanges.map((change) => {
                const diff = parseFloat(change.diff);
                const pct = parseFloat(change.pctChange);
                const isUp = diff > 0;
                return (
                  <div
                    key={change.itemId}
                    className={cn(
                      "grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-3 items-center text-sm",
                      isUp ? "bg-destructive/5" : "bg-accent/5"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate text-xs">{change.name}</p>
                    </div>
                    <span className="text-muted-foreground font-mono text-xs text-right">
                      ${parseFloat(change.oldPrice).toFixed(2)}
                    </span>
                    <span className="font-bold font-mono text-xs text-right">
                      ${parseFloat(change.newPrice).toFixed(2)}
                    </span>
                    <span className={cn(
                      "text-xs font-bold font-mono px-1.5 py-0.5 rounded-md text-right",
                      isUp ? "bg-destructive/10 text-destructive" : "bg-accent/20 text-accent"
                    )}>
                      {isUp ? "+" : ""}${Math.abs(diff).toFixed(2)}
                    </span>
                    <span className={cn(
                      "text-xs font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 justify-end",
                      isUp ? "bg-destructive/10 text-destructive" : "bg-accent/20 text-accent"
                    )}>
                      {isUp ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                      {Math.abs(pct).toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="bg-card border border-border rounded-xl p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Net Price Impact</p>
              {(() => {
                const increases = result.priceChanges.filter((c) => parseFloat(c.diff) > 0);
                const decreases = result.priceChanges.filter((c) => parseFloat(c.diff) < 0);
                const totalIncrease = increases.reduce((s, c) => s + parseFloat(c.diff), 0);
                const totalDecrease = decreases.reduce((s, c) => s + parseFloat(c.diff), 0);
                return (
                  <div className="space-y-1.5">
                    {increases.length > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-destructive">
                          <TrendingUp size={14} />
                          {increases.length} price increase{increases.length !== 1 ? "s" : ""}
                        </span>
                        <span className="font-bold text-destructive">+${totalIncrease.toFixed(2)}</span>
                      </div>
                    )}
                    {decreases.length > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-accent">
                          <TrendingDown size={14} />
                          {decreases.length} price decrease{decreases.length !== 1 ? "s" : ""}
                        </span>
                        <span className="font-bold text-accent">${totalDecrease.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-accent/10 border border-accent/30 rounded-xl p-4">
            <CheckCircle2 size={20} className="text-accent shrink-0" />
            <div>
              <p className="font-semibold text-foreground text-sm">No price changes detected</p>
              <p className="text-xs text-muted-foreground">All existing item prices match the imported guide.</p>
            </div>
          </div>
        )}

        <button onClick={onClose} className="w-full btn-big bg-primary text-primary-foreground">
          Done
        </button>
      </div>
    );
  }

  return (
    <Modal title="Import Order Guide" onClose={onClose}>
      {/* Step 1: Upload */}
      {step === "upload" && (
        <div className="space-y-5">
          <div className="bg-secondary border border-border rounded-xl p-4 text-sm text-foreground space-y-1">
            <p className="font-semibold flex items-center gap-2">
              <Upload size={16} /> Universal Order Guide Importer
            </p>
            <p>Upload any vendor spreadsheet — PFG, Webstaurant, alcohol distributor, or any other format. AI automatically maps the columns.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports: <span className="font-mono">PFG</span> · <span className="font-mono">Webstaurant</span> · <span className="font-mono">Any Distributor CSV</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Re-uploading will update prices and track changes. Historical price data is preserved.
            </p>
          </div>

          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileChange} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full h-32 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 flex flex-col items-center justify-center gap-3 hover:bg-primary/10 transition-colors active:scale-[0.98]"
          >
            <Upload size={32} className="text-primary" />
            <div className="text-center">
              <p className="font-semibold text-foreground">Tap to select CSV file</p>
              <p className="text-sm text-muted-foreground">Any vendor format · .csv or .txt</p>
            </div>
          </button>

          <button onClick={onClose} className="w-full btn-big bg-muted text-foreground">
            Cancel
          </button>
        </div>
      )}

      {/* PFG Preview */}
      {step === "pfg-preview" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">{pfgRows.length} items found <span className="text-xs font-normal text-muted-foreground">(PFG format)</span></p>
              <p className="text-sm text-muted-foreground">
                New items will be created. Existing items (matched by Product #) will have pricing updated.
              </p>
            </div>
          </div>

          {/* Category filter chips */}
          {(() => {
            const uniqueCats = Array.from(new Set(pfgRows.map((r) => r.pfgCategory))).sort();
            const displayRows = filterCat ? pfgRows.filter((r) => r.pfgCategory === filterCat) : pfgRows;
            return (
              <>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setFilterCat("")}
                    className={cn("px-3 py-1 rounded-lg text-xs font-semibold transition-colors",
                      !filterCat ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}
                  >
                    All ({pfgRows.length})
                  </button>
                  {uniqueCats.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFilterCat(filterCat === cat ? "" : cat)}
                      className={cn("px-3 py-1 rounded-lg text-xs font-semibold transition-colors",
                        filterCat === cat ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}
                    >
                      {cat.split("-")[0]} ({pfgRows.filter((r) => r.pfgCategory === cat).length})
                    </button>
                  ))}
                </div>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                  {displayRows.map((row, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2.5 text-sm bg-card">
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="font-semibold text-foreground truncate">{row.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {row.brand} · #{(row as any).itemNumber} · {row.packSize}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          → <span className="font-medium text-foreground">{row.category}</span>
                          {row.storageArea && <span> · {row.storageArea}</span>}
                        </p>
                      </div>
                      <span className="font-bold text-foreground shrink-0">${row.price}</span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}

          <div className="flex gap-3">
            <button onClick={() => setStep("upload")} className="flex-1 btn-big bg-muted text-foreground">Back</button>
            <button
              onClick={() => importPfgMutation.mutate({ rows: pfgRows })}
              disabled={importPfgMutation.isPending}
              className="flex-1 btn-big bg-primary text-primary-foreground disabled:opacity-60"
            >
              {importPfgMutation.isPending ? "Importing…" : `Import ${pfgRows.length} Items`}
            </button>
          </div>
        </div>
      )}

      {/* Webstaurant Preview */}
      {step === "web-preview" && (
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-foreground">{webRows.length} items found <span className="text-xs font-normal text-muted-foreground">(Webstaurant format)</span></p>
            <p className="text-sm text-muted-foreground">
              New items will be created; existing items (matched by Item #) will have prices updated.
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border">
            {webRows.map((row, i) => (
              <div key={i} className="px-3 py-2.5 text-sm bg-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground truncate">{row.rawName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.brand} · #{(row as any).itemNumber}
                      {row.packSize && ` · ${row.packSize}`}
                    </p>
                  </div>
                  <span className="font-bold text-foreground shrink-0">${row.price}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep("upload")} className="flex-1 btn-big bg-muted text-foreground">Back</button>
            <button
              onClick={handleWebImportWithAI}
              className="flex-1 btn-big bg-primary text-primary-foreground disabled:opacity-60"
            >
              Import {webRows.length} Items
            </button>
          </div>
        </div>
      )}

      {/* AI enriching — brand/name/packSize enrichment in progress */}
      {step === "ai-enriching" && (
        <div className="space-y-5 py-4 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Sparkles size={28} className="text-primary animate-pulse" />
          </div>
          <div>
            <p className="font-semibold text-foreground">AI Enriching Items…</p>
            <p className="text-sm text-muted-foreground mt-1">
              Inferring brands, parsing pack sizes, and cleaning item names.
            </p>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: "70%" }} />
          </div>
          <p className="text-xs text-muted-foreground">Using AI product knowledge…</p>
        </div>
      )}

      {/* AI analyzing — column mapping in progress */}
      {step === "ai-analyzing" && (
        <div className="space-y-5 py-4 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Upload size={28} className="text-primary animate-bounce" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Analyzing spreadsheet…</p>
            <p className="text-sm text-muted-foreground mt-1">
              AI is reading the column headers and mapping them to inventory fields.
            </p>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: "60%" }} />
          </div>
          <p className="text-xs text-muted-foreground">This usually takes a few seconds…</p>
        </div>
      )}

      {/* AI Preview — show mapped rows before importing */}
      {step === "ai-preview" && (
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-foreground">
              {aiRows.length} items found{" "}
              <span className="text-xs font-normal text-muted-foreground">({aiSource} format — AI mapped)</span>
            </p>
            <p className="text-sm text-muted-foreground">
              New items will be created. Existing items (matched by name) will have pricing updated.
            </p>
          </div>
          {/* Category filter chips */}
          {(() => {
            const uniqueCats = Array.from(new Set(aiRows.map((r) => r.category ?? "Other"))).sort();
            const displayRows = filterCat ? aiRows.filter((r) => (r.category ?? "Other") === filterCat) : aiRows;
            return (
              <>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setFilterCat("")}
                    className={cn("px-3 py-1 rounded-lg text-xs font-semibold transition-colors",
                      !filterCat ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}
                  >
                    All ({aiRows.length})
                  </button>
                  {uniqueCats.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFilterCat(filterCat === cat ? "" : cat)}
                      className={cn("px-3 py-1 rounded-lg text-xs font-semibold transition-colors",
                        filterCat === cat ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}
                    >
                      {cat} ({aiRows.filter((r) => (r.category ?? "Other") === cat).length})
                    </button>
                  ))}
                </div>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                  {displayRows.map((row, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2.5 text-sm bg-card">
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="font-semibold text-foreground truncate">{row.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {row.brand && <span>{row.brand} · </span>}
                          {row.packSize && <span>{row.packSize} · </span>}
                          <span className="font-medium text-foreground">{row.category ?? "Other"}</span>
                          {row.storageArea && <span> · {row.storageArea}</span>}
                        </p>
                      </div>
                      <span className="font-bold text-foreground shrink-0">
                        {row.price ? `$${parseFloat(row.price).toFixed(2)}` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
          <div className="flex gap-3">
            <button onClick={() => setStep("upload")} className="flex-1 btn-big bg-muted text-foreground">Back</button>
            <button
              onClick={() => importUniversalMutation.mutate({ rows: aiRows, importSource: aiSource })}
              disabled={importUniversalMutation.isPending}
              className="flex-1 btn-big bg-primary text-primary-foreground disabled:opacity-60"
            >
              {importUniversalMutation.isPending ? "Importing…" : `Import ${aiRows.length} Items`}
            </button>
          </div>
        </div>
      )}

      {/* AI name generation in progress */}
      {step === "web-generating" && (
        <div className="space-y-5 py-4 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Upload size={28} className="text-primary animate-bounce" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Importing items…</p>
            <p className="text-sm text-muted-foreground mt-1">
              Processing item {Math.round((aiProgress / 100) * webRows.length)} of {webRows.length}
            </p>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${aiProgress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{aiProgress}% complete</p>
        </div>
      )}

      {/* Result */}
      {step === "result" && <ResultStep />}
    </Modal>
  );
}
