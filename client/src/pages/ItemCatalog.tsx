import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { CATEGORIES, CATEGORY_ICONS, STORAGE_AREAS, UNITS, VENDOR_COLORS, VENDORS } from "../../../shared/constants";
import {
  Edit2,
  Filter,
  Package,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

export default function ItemCatalog() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
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

  const { data: items = [], isLoading } = trpc.items.list.useQuery({
    vendor: filterVendor || undefined,
    category: filterCategory || undefined,
  });

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

  const filtered = items.filter((item) =>
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
              title="Import CSV"
            >
              <Upload size={20} />
            </button>
            <button
              onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(true); }}
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
              (filterVendor || filterCategory)
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
              onClick={() => { setFilterVendor(""); setFilterCategory(""); }}
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
              onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(true); }}
              className="btn-big bg-primary text-primary-foreground mx-auto flex items-center gap-2"
            >
              <Plus size={18} /> Add First Item
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([category, catItems]) => (
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
                    className="bg-card rounded-2xl border border-border p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{item.name}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", VENDOR_COLORS[item.vendor] ?? "bg-gray-100 text-gray-700")}>
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
        <Modal title={editId ? "Edit Item" : "Add New Item"} onClose={() => { setShowForm(false); setEditId(null); setForm(emptyForm); }}>
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
                      alcoholCategory: cat === "Alcohol - 100" ? "100" : cat === "Alcohol - 130" ? "130" : "",
                    });
                  }}
                  className="form-input"
                >
                  <option value="">Select…</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
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
                    <option key={v} value={v}>{v}</option>
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
                    <option key={u} value={u}>{u}</option>
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
                  <option key={s} value={s}>{s}</option>
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
                onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm); }}
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
                  : editId ? "Save Changes" : "Add Item"}
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
            <button onClick={() => setDeleteConfirm(null)} className="flex-1 btn-big bg-muted text-foreground">
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

      {/* ── CSV Import Modal ── */}
      {showImport && <CSVImportModal onClose={() => setShowImport(false)} />}
    </div>
  );
}

// ── CSV Import Modal ───────────────────────────────────────────────────────────

function CSVImportModal({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const [source, setSource] = useState<"GA-001" | "Webstaurant" | "PFG">("GA-001");
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<any[]>([]);
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const fileRef = useRef<HTMLInputElement>(null);

  const importMutation = trpc.items.importCSV.useMutation({
    onSuccess: (res) => {
      utils.items.list.invalidate();
      setStep("done");
      toast.success(`Imported ${res.imported} items from ${source}`);
    },
    onError: (e) => toast.error(e.message),
  });

  function parseCSV(text: string) {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, "").toLowerCase());
    return lines.slice(1).map((line) => {
      const vals = line.split(",").map((v) => v.trim().replace(/"/g, ""));
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
      return obj;
    }).filter((row) => row["name"] || row["item name"] || row["item"]);
  }

  function mapRow(row: Record<string, string>) {
    const name = row["name"] || row["item name"] || row["item"] || row["description"] || "";
    const category = row["category"] || "Other";
    const vendor = source === "PFG" ? "PFG" : source === "Webstaurant" ? "Webstaurant" : (row["vendor"] || "Other");
    const packSize = row["pack size"] || row["packsize"] || row["pack"] || "";
    const unitOfMeasure = row["uom"] || row["unit"] || row["unit of measure"] || "CS";
    const price = row["price"] || row["unit price"] || row["cost"] || "";
    const parLevel = row["par"] || row["par level"] || "0";
    const storageArea = row["storage area"] || row["storage"] || row["location"] || "";
    return { name, category, vendor, packSize, unitOfMeasure, price, parLevel, storageArea, isAlcohol: category.startsWith("Alcohol"), alcoholCategory: category === "Alcohol - 100" ? "100" : category === "Alcohol - 130" ? "130" : undefined };
  }

  function handleParse() {
    const rows = parseCSV(csvText);
    const mapped = rows.map(mapRow).filter((r) => r.name);
    setPreview(mapped);
    setStep("preview");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target?.result as string ?? "");
    reader.readAsText(file);
  }

  return (
    <Modal title="Import from CSV" onClose={onClose}>
      {step === "upload" && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Import Source
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["GA-001", "Webstaurant", "PFG"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={cn(
                    "py-3 rounded-xl text-sm font-semibold border transition-colors",
                    source === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-foreground border-border hover:bg-secondary"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Upload CSV File
            </label>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileChange} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full h-24 rounded-xl border-2 border-dashed border-border bg-muted/50 flex flex-col items-center justify-center gap-2 hover:bg-muted transition-colors"
            >
              <Upload size={24} className="text-muted-foreground" />
              <span className="text-sm text-muted-foreground font-medium">
                {csvText ? "File loaded — click to replace" : "Tap to select CSV file"}
              </span>
            </button>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Or Paste CSV Text
            </label>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="name,category,vendor,price,parLevel,storageArea&#10;House Blend,Coffee,PFG,24.99,2,Dry Storage"
              rows={4}
              className="form-input resize-none font-mono text-xs"
            />
          </div>

          <div className="bg-muted/50 rounded-xl p-3 text-xs text-muted-foreground">
            <p className="font-semibold mb-1">Expected columns:</p>
            <p>name, category, vendor, pack size, uom, price, par level, storage area</p>
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 btn-big bg-muted text-foreground">Cancel</button>
            <button
              onClick={handleParse}
              disabled={!csvText.trim()}
              className="flex-1 btn-big bg-primary text-primary-foreground disabled:opacity-60"
            >
              Preview Import
            </button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Found <strong>{preview.length} items</strong> from {source}. Review before importing:
          </p>
          <div className="max-h-64 overflow-y-auto space-y-2 rounded-xl border border-border p-2">
            {preview.slice(0, 20).map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 text-sm">
                <div>
                  <p className="font-semibold text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.category} · {item.vendor}</p>
                </div>
                {item.price && <span className="text-sm font-semibold">${parseFloat(item.price || "0").toFixed(2)}</span>}
              </div>
            ))}
            {preview.length > 20 && (
              <p className="text-xs text-center text-muted-foreground py-2">
                +{preview.length - 20} more items…
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep("upload")} className="flex-1 btn-big bg-muted text-foreground">Back</button>
            <button
              onClick={() => importMutation.mutate({ source, items: preview })}
              disabled={importMutation.isPending}
              className="flex-1 btn-big bg-primary text-primary-foreground disabled:opacity-60"
            >
              {importMutation.isPending ? "Importing…" : `Import ${preview.length} Items`}
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="text-center space-y-4 py-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <span className="text-3xl">✓</span>
          </div>
          <p className="font-semibold text-foreground">Import Complete!</p>
          <button onClick={onClose} className="btn-big bg-primary text-primary-foreground w-full">Done</button>
        </div>
      )}
    </Modal>
  );
}

// ── Shared Components ──────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-card rounded-t-3xl sm:rounded-2xl shadow-lg max-h-[90vh] overflow-y-auto animate-in">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-lg font-serif font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
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
