import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, X, Tag, Truck, Warehouse } from "lucide-react";
import { createPortal } from "react-dom";

// ─── Reusable editable list section ──────────────────────────────────────────

type ListItem = { id: number; name: string; sortOrder: number; createdAt: Date };

function SettingsSection({
  title,
  icon: Icon,
  items,
  onAdd,
  onUpdate,
  onDelete,
  isLoading,
}: {
  title: string;
  icon: React.ElementType;
  items: ListItem[];
  onAdd: (name: string) => void;
  onUpdate: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  isLoading: boolean;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setNewName("");
  }

  function startEdit(item: ListItem) {
    setEditingId(item.id);
    setEditName(item.name);
  }

  function confirmEdit() {
    if (editingId === null || !editName.trim()) return;
    onUpdate(editingId, editName.trim());
    setEditingId(null);
    setEditName("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon size={18} className="text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? "item" : "items"}</p>
        </div>
      </div>

      {/* Add new */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={`Add new ${title.toLowerCase().replace(/s$/, "")}…`}
            className="flex-1 h-11 px-4 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={handleAdd}
            disabled={!newName.trim()}
            className="h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 disabled:opacity-40 active:scale-[0.97] transition-transform"
          >
            <Plus size={16} />
            Add
          </button>
        </div>
      </div>

      {/* List */}
      <div className="divide-y divide-border">
        {isLoading ? (
          <div className="px-5 py-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-8 text-center text-muted-foreground text-sm">No {title.toLowerCase()} yet</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-5 py-3">
              {editingId === item.id ? (
                <>
                  <input
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    className="flex-1 h-10 px-3 rounded-xl border border-primary bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    onClick={confirmEdit}
                    className="w-9 h-9 rounded-xl bg-accent/20 text-accent flex items-center justify-center active:scale-95 transition-transform"
                    title="Save"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center active:scale-95 transition-transform"
                    title="Cancel"
                  >
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-foreground">{item.name}</span>
                  <button
                    onClick={() => startEdit(item)}
                    className="w-9 h-9 rounded-xl bg-muted/60 text-muted-foreground hover:text-primary hover:bg-primary/10 flex items-center justify-center active:scale-95 transition-all"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(item.id)}
                    className="w-9 h-9 rounded-xl bg-muted/60 text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center active:scale-95 transition-all"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Delete confirm portal */}
      {deleteConfirmId !== null &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setDeleteConfirmId(null);
            }}
          >
            <div
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl"
              onMouseDown={(e) => e.stopPropagation()}
              style={{ animation: "modalIn 180ms cubic-bezier(0.23,1,0.32,1) both" }}
            >
              <h3 className="text-lg font-semibold text-foreground mb-2">Delete {title.replace(/s$/, "")}?</h3>
              <p className="text-sm text-muted-foreground mb-5">
                This will remove it from the list. Existing items using this value will keep their current assignment.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 h-11 rounded-xl border border-border bg-background text-sm font-medium active:scale-[0.97] transition-transform"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onDelete(deleteConfirmId!);
                    setDeleteConfirmId(null);
                  }}
                  className="flex-1 h-11 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium active:scale-[0.97] transition-transform"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────

export default function Settings() {
  const utils = trpc.useUtils();

  // Queries
  const { data: categories = [], isLoading: catLoading } = trpc.settings.listCategories.useQuery();
  const { data: vendors = [], isLoading: vendorLoading } = trpc.settings.listVendors.useQuery();
  const { data: storageAreas = [], isLoading: storageLoading } = trpc.settings.listStorageAreas.useQuery();

  // Category mutations
  const addCat = trpc.settings.addCategory.useMutation({
    onSuccess: () => { utils.settings.listCategories.invalidate(); toast.success("Category added"); },
    onError: (e) => toast.error(e.message),
  });
  const updateCat = trpc.settings.updateCategory.useMutation({
    onSuccess: () => { utils.settings.listCategories.invalidate(); toast.success("Category updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteCat = trpc.settings.deleteCategory.useMutation({
    onSuccess: () => { utils.settings.listCategories.invalidate(); toast.success("Category deleted"); },
    onError: (e) => toast.error(e.message),
  });

  // Vendor mutations
  const addVendor = trpc.settings.addVendor.useMutation({
    onSuccess: () => { utils.settings.listVendors.invalidate(); toast.success("Vendor added"); },
    onError: (e) => toast.error(e.message),
  });
  const updateVendor = trpc.settings.updateVendor.useMutation({
    onSuccess: () => { utils.settings.listVendors.invalidate(); toast.success("Vendor updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteVendor = trpc.settings.deleteVendor.useMutation({
    onSuccess: () => { utils.settings.listVendors.invalidate(); toast.success("Vendor deleted"); },
    onError: (e) => toast.error(e.message),
  });

  // Storage area mutations
  const addStorage = trpc.settings.addStorageArea.useMutation({
    onSuccess: () => { utils.settings.listStorageAreas.invalidate(); toast.success("Storage area added"); },
    onError: (e) => toast.error(e.message),
  });
  const updateStorage = trpc.settings.updateStorageArea.useMutation({
    onSuccess: () => { utils.settings.listStorageAreas.invalidate(); toast.success("Storage area updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteStorage = trpc.settings.deleteStorageArea.useMutation({
    onSuccess: () => { utils.settings.listStorageAreas.invalidate(); toast.success("Storage area deleted"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the categories, vendors, and storage areas used across the system.
        </p>
      </div>

      <SettingsSection
        title="Categories"
        icon={Tag}
        items={categories as ListItem[]}
        isLoading={catLoading}
        onAdd={(name) => addCat.mutate({ name })}
        onUpdate={(id, name) => updateCat.mutate({ id, name })}
        onDelete={(id) => deleteCat.mutate({ id })}
      />

      <SettingsSection
        title="Vendors"
        icon={Truck}
        items={vendors as ListItem[]}
        isLoading={vendorLoading}
        onAdd={(name) => addVendor.mutate({ name })}
        onUpdate={(id, name) => updateVendor.mutate({ id, name })}
        onDelete={(id) => deleteVendor.mutate({ id })}
      />

      <SettingsSection
        title="Storage Areas"
        icon={Warehouse}
        items={storageAreas as ListItem[]}
        isLoading={storageLoading}
        onAdd={(name) => addStorage.mutate({ name })}
        onUpdate={(id, name) => updateStorage.mutate({ id, name })}
        onDelete={(id) => deleteStorage.mutate({ id })}
      />
    </div>
  );
}
