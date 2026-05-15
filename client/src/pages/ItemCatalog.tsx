import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { CATEGORIES, CATEGORY_ICONS, STORAGE_AREAS, UNITS, VENDOR_COLORS, VENDORS } from "../../../shared/constants";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Edit2,
  Filter,
  Minus,
  Package,
  Plus,
  Search,
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
};

const emptyForm: ItemForm = {
  name: "",
  category: "",
  vendor: "",
  packSize: "",
  unitOfMeasure: "CS",
  price: "",
  parLevel: "0",
  storageArea: "",
  isAlcohol: false,
  alcoholCategory: "",
  notes: "",
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
  pfgProductNumber: string;
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
    const pfgProductNumber = (cols[idx.productNumber] ?? "").trim();
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
      pfgProductNumber,
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

  const queryInput = useMemo(
    () => ({ vendor: filterVendor || undefined, category: filterCategory || undefined }),
    [filterVendor, filterCategory]
  );
  const { data: items = [], isLoading } = trpc.items.list.useQuery(queryInput);

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

  const deleteMutation = trpc.items.delete.useMutation({
    onSuccess: () => {
      utils.items.list.invalidate();
      setDeleteConfirm(null);
      toast.success("Item removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = items.filter(
    (item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase()) ||
      item.vendor.toLowerCase().includes(search.toLowerCase())
  );

  function openEdit(item: (typeof items)[0]) {
    setForm({
      name: item.name,
      category: item.category,
      vendor: item.vendor,
      packSize: item.packSize ?? "",
      unitOfMeasure: item.unitOfMeasure ?? "CS",
      price: item.price ?? "",
      parLevel: item.parLevel ?? "0",
      storageArea: item.storageArea ?? "",
      isAlcohol: item.isAlcohol,
      alcoholCategory: item.alcoholCategory ?? "",
      notes: item.notes ?? "",
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
      price: form.price || undefined,
      parLevel: form.parLevel || "0",
      packSize: form.packSize || undefined,
      storageArea: form.storageArea || undefined,
      alcoholCategory: form.alcoholCategory || undefined,
      notes: form.notes || undefined,
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
              onClick={() => setShowImport(true)}
              className="p-3 rounded-xl bg-secondary text-secondary-foreground hover:bg-muted transition-colors active:scale-95"
              title="Import PFG Order Guide"
            >
              <Upload size={20} />
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
                {VENDORS.map((v) => (
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
                {CATEGORIES.map((c) => (
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
                    {CATEGORY_ICONS[c]} {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

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
                    <div key={item.id} className="bg-card rounded-2xl border border-border p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground truncate">{item.name}</p>
                          {(item as any).brand && (
                            <p className="text-xs text-muted-foreground mt-0.5">{(item as any).brand}</p>
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
                            {item.price && (
                              <span className="text-sm font-semibold text-foreground">
                                ${parseFloat(item.price).toFixed(2)}
                              </span>
                            )}
                            {item.parLevel && parseFloat(item.parLevel) > 0 && (
                              <span className="text-xs text-muted-foreground">
                                Par: {item.parLevel} {item.unitOfMeasure}
                              </span>
                            )}
                            {item.storageArea && (
                              <span className="text-xs text-muted-foreground">{item.storageArea}</span>
                            )}
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => openEdit(item)}
                              className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary transition-colors active:scale-95"
                            >
                              <Edit2 size={16} className="text-foreground" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(item.id)}
                              className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center hover:bg-destructive/20 transition-colors active:scale-95"
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
                  {CATEGORIES.map((c) => (
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
                  {VENDORS.map((v) => (
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
                  step="0.5"
                  value={form.parLevel}
                  onChange={(e) => setForm({ ...form, parLevel: e.target.value })}
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
                {STORAGE_AREAS.map((s) => (
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

      {/* ── PFG Import Modal ── */}
      {showImport && (
        <PfgImportModal
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
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-1">
            <p className="font-semibold flex items-center gap-2">
              <Upload size={16} /> PFG Order Guide CSV
            </p>
            <p>Upload your PFG Order Guide export. The system will automatically map all columns and categories.</p>
            <p className="text-xs text-amber-700 mt-1">
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
                    {row.brand} · #{row.pfgProductNumber} · {row.packSize}
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
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{result.created}</p>
              <p className="text-xs font-semibold text-green-600 mt-0.5">New Items</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{result.updated}</p>
              <p className="text-xs font-semibold text-blue-600 mt-0.5">Price Updated</p>
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
                <AlertTriangle size={16} className="text-amber-500" />
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
                        isUp ? "bg-red-50/50" : "bg-green-50/50"
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
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        )}
                      >
                        {isUp ? "+" : ""}${Math.abs(diff).toFixed(2)}
                      </span>
                      {/* Percent badge */}
                      <span
                        className={cn(
                          "text-xs font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 justify-end",
                          isUp
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
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
                          <span className="flex items-center gap-1.5 text-red-600">
                            <TrendingUp size={14} />
                            {increases.length} price increase{increases.length !== 1 ? "s" : ""}
                          </span>
                          <span className="font-bold text-red-600">+${totalIncrease.toFixed(2)}</span>
                        </div>
                      )}
                      {decreases.length > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1.5 text-green-600">
                            <TrendingDown size={14} />
                            {decreases.length} price decrease{decreases.length !== 1 ? "s" : ""}
                          </span>
                          <span className="font-bold text-green-600">${totalDecrease.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
              <CheckCircle2 size={20} className="text-green-600 shrink-0" />
              <div>
                <p className="font-semibold text-green-800 text-sm">No price changes detected</p>
                <p className="text-xs text-green-700">All existing item prices match the imported guide.</p>
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
