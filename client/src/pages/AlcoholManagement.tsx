import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { STORAGE_AREAS, UNITS, VENDOR_COLORS, VENDORS } from "../../../shared/constants";
import { Beer, Edit2, Plus, Wine, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type AlcoholForm = {
  name: string;
  alcoholCategory: "100" | "130";
  vendor: string;
  packSize: string;
  unitOfMeasure: string;
  price: string;
  parLevel: string;
  storageArea: string;
  notes: string;
};

const emptyForm: AlcoholForm = {
  name: "",
  alcoholCategory: "100",
  vendor: "Savannah Distributing",
  packSize: "",
  unitOfMeasure: "BTL",
  price: "",
  parLevel: "0",
  storageArea: "Bar",
  notes: "",
};

// Quick-add presets for common alcohol items
const QUICK_ADD_PRESETS = [
  { name: "Borghetti Espresso Liqueur", alcoholCategory: "100" as const, vendor: "Savannah Distributing", packSize: "750 ML", unitOfMeasure: "BTL" },
  { name: "Torani Vanilla Syrup", alcoholCategory: "130" as const, vendor: "Webstaurant", packSize: "750 ML", unitOfMeasure: "BTL" },
  { name: "Torani Caramel Syrup", alcoholCategory: "130" as const, vendor: "Webstaurant", packSize: "750 ML", unitOfMeasure: "BTL" },
  { name: "Torani Hazelnut Syrup", alcoholCategory: "130" as const, vendor: "Webstaurant", packSize: "750 ML", unitOfMeasure: "BTL" },
  { name: "Baileys Irish Cream", alcoholCategory: "100" as const, vendor: "Savannah Distributing", packSize: "750 ML", unitOfMeasure: "BTL" },
  { name: "Kahlúa Coffee Liqueur", alcoholCategory: "100" as const, vendor: "Savannah Distributing", packSize: "750 ML", unitOfMeasure: "BTL" },
];

export default function AlcoholManagement() {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<"all" | "100" | "130">("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AlcoholForm>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);

  const { data: alcoholItems = [], isLoading } = trpc.alcohol.list.useQuery(
    { alcoholCategory: activeTab === "all" ? undefined : activeTab }
  );

  const addMutation = trpc.alcohol.addItem.useMutation({
    onSuccess: () => {
      utils.alcohol.list.invalidate();
      utils.items.list.invalidate();
      setShowForm(false);
      setForm(emptyForm);
      setEditId(null);
      toast.success("Alcohol item added — historical data preserved");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.items.update.useMutation({
    onSuccess: () => {
      utils.alcohol.list.invalidate();
      utils.items.list.invalidate();
      setShowForm(false);
      setForm(emptyForm);
      setEditId(null);
      toast.success("Item updated");
    },
    onError: (e) => toast.error(e.message),
  });

  function openQuickAdd(preset: typeof QUICK_ADD_PRESETS[0]) {
    setForm({
      ...emptyForm,
      name: preset.name,
      alcoholCategory: preset.alcoholCategory,
      vendor: preset.vendor,
      packSize: preset.packSize,
      unitOfMeasure: preset.unitOfMeasure,
    });
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(item: (typeof alcoholItems)[0]) {
    setForm({
      name: item.name,
      alcoholCategory: (item.alcoholCategory ?? "100") as "100" | "130",
      vendor: item.vendor,
      packSize: item.packSize ?? "",
      unitOfMeasure: item.unitOfMeasure ?? "BTL",
      price: item.price ?? "",
      parLevel: item.parLevel ?? "0",
      storageArea: item.storageArea ?? "Bar",
      notes: item.notes ?? "",
    });
    setEditId(item.id);
    setShowForm(true);
  }

  function handleSubmit() {
    if (!form.name || !form.vendor) {
      toast.error("Name and Vendor are required");
      return;
    }
    if (editId) {
      updateMutation.mutate({
        id: editId,
        data: {
          name: form.name,
          category: `Alcohol - ${form.alcoholCategory}`,
          vendor: form.vendor,
          packSize: form.packSize || undefined,
          unitOfMeasure: form.unitOfMeasure || undefined,
          price: form.price || undefined,
          parLevel: form.parLevel || "0",
          storageArea: form.storageArea || undefined,
          isAlcohol: true,
          alcoholCategory: form.alcoholCategory,
          notes: form.notes || undefined,
        },
      });
    } else {
      addMutation.mutate({
        name: form.name,
        alcoholCategory: form.alcoholCategory,
        vendor: form.vendor,
        packSize: form.packSize || undefined,
        unitOfMeasure: form.unitOfMeasure || undefined,
        price: form.price || undefined,
        parLevel: form.parLevel || "0",
        storageArea: form.storageArea || undefined,
        notes: form.notes || undefined,
      });
    }
  }

  const cat100 = alcoholItems.filter((i) => i.alcoholCategory === "100");
  const cat130 = alcoholItems.filter((i) => i.alcoholCategory === "130");

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif text-foreground">Alcohol Module</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Categories 100 & 130</p>
        </div>
        <button
          onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(true); }}
          className="btn-big bg-primary text-primary-foreground flex items-center gap-2 shadow-sm"
        >
          <Plus size={18} />
          Add Item
        </button>
      </div>

      {/* Category Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Beer size={20} className="text-amber-700" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{cat100.length}</p>
              <p className="text-xs text-muted-foreground font-semibold">Category 100</p>
              <p className="text-xs text-muted-foreground">Spirits & Liqueurs</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <Wine size={20} className="text-purple-700" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{cat130.length}</p>
              <p className="text-xs text-muted-foreground font-semibold">Category 130</p>
              <p className="text-xs text-muted-foreground">Syrups & Mixers</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Add Presets */}
      <div className="bg-card rounded-2xl border border-border p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Quick Add
          </h2>
          <span className="text-xs text-muted-foreground">One-click add</span>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {QUICK_ADD_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => openQuickAdd(preset)}
              className="flex items-center justify-between p-3 rounded-xl bg-muted hover:bg-secondary transition-colors active:scale-98 text-left"
            >
              <div>
                <p className="font-semibold text-foreground text-sm">{preset.name}</p>
                <p className="text-xs text-muted-foreground">
                  Cat. {preset.alcoholCategory} · {preset.vendor} · {preset.packSize}
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Plus size={16} className="text-primary" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Filter */}
      <div className="flex bg-muted rounded-xl p-1 gap-1">
        {(["all", "100", "130"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
              activeTab === tab
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "all" ? "All" : `Cat. ${tab}`}
          </button>
        ))}
      </div>

      {/* Item List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-2xl skeleton" />)}
        </div>
      ) : alcoholItems.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <Beer size={48} className="mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium">No alcohol items yet</p>
          <button
            onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(true); }}
            className="btn-big bg-primary text-primary-foreground mx-auto flex items-center gap-2"
          >
            <Plus size={18} /> Add First Item
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {alcoholItems.map((item) => (
            <div key={item.id} className="bg-card rounded-2xl border border-border p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-foreground">{item.name}</p>
                    <span className={cn(
                      "text-xs font-bold px-2 py-0.5 rounded-full",
                      item.alcoholCategory === "100"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-purple-100 text-purple-800"
                    )}>
                      Cat. {item.alcoholCategory}
                    </span>
                  </div>
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
                        Par: {item.parLevel}
                      </span>
                    )}
                    {item.storageArea && (
                      <span className="text-xs text-muted-foreground">{item.storageArea}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => openEdit(item)}
                  className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary transition-colors active:scale-95 shrink-0"
                >
                  <Edit2 size={16} className="text-foreground" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => { setShowForm(false); setEditId(null); }} />
          <div className="relative w-full sm:max-w-lg bg-card rounded-t-3xl sm:rounded-2xl shadow-lg max-h-[90vh] overflow-y-auto animate-in">
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="text-lg font-serif font-semibold text-foreground">
                {editId ? "Edit Alcohol Item" : "Add Alcohol Item"}
              </h2>
              <button onClick={() => { setShowForm(false); setEditId(null); }} className="p-2 rounded-xl hover:bg-muted">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Category selector */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                  Alcohol Category *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setForm({ ...form, alcoholCategory: "100" })}
                    className={cn(
                      "py-4 rounded-xl border-2 text-center transition-all",
                      form.alcoholCategory === "100"
                        ? "border-amber-500 bg-amber-50"
                        : "border-border bg-muted hover:bg-secondary"
                    )}
                  >
                    <Beer size={24} className={cn("mx-auto mb-1", form.alcoholCategory === "100" ? "text-amber-700" : "text-muted-foreground")} />
                    <p className={cn("font-bold text-lg", form.alcoholCategory === "100" ? "text-amber-800" : "text-foreground")}>100</p>
                    <p className="text-xs text-muted-foreground">Spirits & Liqueurs</p>
                  </button>
                  <button
                    onClick={() => setForm({ ...form, alcoholCategory: "130" })}
                    className={cn(
                      "py-4 rounded-xl border-2 text-center transition-all",
                      form.alcoholCategory === "130"
                        ? "border-purple-500 bg-purple-50"
                        : "border-border bg-muted hover:bg-secondary"
                    )}
                  >
                    <Wine size={24} className={cn("mx-auto mb-1", form.alcoholCategory === "130" ? "text-purple-700" : "text-muted-foreground")} />
                    <p className={cn("font-bold text-lg", form.alcoholCategory === "130" ? "text-purple-800" : "text-foreground")}>130</p>
                    <p className="text-xs text-muted-foreground">Syrups & Mixers</p>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Item Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Borghetti Espresso Liqueur" className="form-input" />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Vendor *</label>
                <select value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} className="form-input">
                  {VENDORS.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Pack Size</label>
                  <input type="text" value={form.packSize} onChange={(e) => setForm({ ...form, packSize: e.target.value })} placeholder="e.g. 750 ML" className="form-input" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Unit</label>
                  <select value={form.unitOfMeasure} onChange={(e) => setForm({ ...form, unitOfMeasure: e.target.value })} className="form-input">
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Price ($)</label>
                  <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" className="form-input" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Par Level</label>
                  <input type="number" step="0.5" value={form.parLevel} onChange={(e) => setForm({ ...form, parLevel: e.target.value })} placeholder="0" className="form-input" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Storage Area</label>
                <select value={form.storageArea} onChange={(e) => setForm({ ...form, storageArea: e.target.value })} className="form-input">
                  <option value="">Select…</option>
                  {STORAGE_AREAS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {!editId && (
                <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-800">
                  <strong>Note:</strong> Adding this item will not affect any previous count sessions. Historical data is always preserved.
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowForm(false); setEditId(null); }} className="flex-1 btn-big bg-muted text-foreground">Cancel</button>
                <button
                  onClick={handleSubmit}
                  disabled={addMutation.isPending || updateMutation.isPending}
                  className="flex-1 btn-big bg-primary text-primary-foreground disabled:opacity-60"
                >
                  {addMutation.isPending || updateMutation.isPending ? "Saving…" : editId ? "Save Changes" : "Add Item"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
