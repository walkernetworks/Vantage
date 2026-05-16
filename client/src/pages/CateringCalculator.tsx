import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Calculator,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Edit2,
  Package,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function CateringCalculator() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();

  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [orderVolume, setOrderVolume] = useState("");
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [showIngredientForm, setShowIngredientForm] = useState(false);
  const [recipeName, setRecipeName] = useState("");
  const [recipeDesc, setRecipeDesc] = useState("");
  const [recipeServings, setRecipeServings] = useState("1");
  const [editRecipeId, setEditRecipeId] = useState<number | null>(null);
  const [deleteRecipeId, setDeleteRecipeId] = useState<number | null>(null);
  const [ingredientItemId, setIngredientItemId] = useState("");
  const [ingredientQty, setIngredientQty] = useState("");
  const [ingredientUnit, setIngredientUnit] = useState("");

  const { data: recipes = [], isLoading: recipesLoading } = trpc.catering.listRecipes.useQuery();
  const { data: allItems = [] } = trpc.items.list.useQuery(undefined);

  const { data: recipeItems = [] } = trpc.catering.getRecipeItems.useQuery(
    { recipeId: selectedRecipeId! },
    { enabled: selectedRecipeId !== null }
  );

  const volumeNum = parseFloat(orderVolume) || 0;

  const { data: shortfall = [], isLoading: shortfallLoading } = trpc.catering.calculateShortfall.useQuery(
    { recipeId: selectedRecipeId!, orderVolume: volumeNum },
    { enabled: selectedRecipeId !== null && volumeNum > 0 }
  );

  const createRecipeMutation = trpc.catering.createRecipe.useMutation({
    onSuccess: (recipe) => {
      utils.catering.listRecipes.invalidate();
      setShowRecipeForm(false);
      setRecipeName("");
      setRecipeDesc("");
      setRecipeServings("1");
      setEditRecipeId(null);
      setSelectedRecipeId(recipe.id);
      toast.success("Recipe created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateRecipeMutation = trpc.catering.updateRecipe.useMutation({
    onSuccess: () => {
      utils.catering.listRecipes.invalidate();
      setShowRecipeForm(false);
      setEditRecipeId(null);
      toast.success("Recipe updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteRecipeMutation = trpc.catering.deleteRecipe.useMutation({
    onSuccess: () => {
      utils.catering.listRecipes.invalidate();
      setDeleteRecipeId(null);
      if (selectedRecipeId === deleteRecipeId) setSelectedRecipeId(null);
      toast.success("Recipe deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const addIngredientMutation = trpc.catering.addRecipeItem.useMutation({
    onSuccess: () => {
      utils.catering.getRecipeItems.invalidate({ recipeId: selectedRecipeId! });
      setShowIngredientForm(false);
      setIngredientItemId("");
      setIngredientQty("");
      setIngredientUnit("");
      toast.success("Ingredient added");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeIngredientMutation = trpc.catering.removeRecipeItem.useMutation({
    onSuccess: () => {
      utils.catering.getRecipeItems.invalidate({ recipeId: selectedRecipeId! });
      toast.success("Ingredient removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedRecipe = recipes.find((r) => r.id === selectedRecipeId);

  const shortItems = shortfall.filter((s) => s.isShort);
  const okItems = shortfall.filter((s) => !s.isShort);

  function openEditRecipe(recipe: (typeof recipes)[0]) {
    setRecipeName(recipe.name);
    setRecipeDesc(recipe.description ?? "");
    setRecipeServings(String(recipe.baseServings));
    setEditRecipeId(recipe.id);
    setShowRecipeForm(true);
  }

  function handleRecipeSubmit() {
    if (!recipeName.trim()) { toast.error("Recipe name is required"); return; }
    if (editRecipeId) {
      updateRecipeMutation.mutate({ id: editRecipeId, name: recipeName, description: recipeDesc || undefined, baseServings: parseInt(recipeServings) || 1 });
    } else {
      createRecipeMutation.mutate({ name: recipeName, description: recipeDesc || undefined, baseServings: parseInt(recipeServings) || 1 });
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif text-foreground">Catering Calculator</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Check stock for large orders</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setRecipeName(""); setRecipeDesc(""); setRecipeServings("1"); setEditRecipeId(null); setShowRecipeForm(true); }}
            className="btn-big bg-primary text-primary-foreground flex items-center gap-2 shadow-sm"
          >
            <Plus size={18} />
            New Recipe
          </button>
        )}
      </div>

      {/* Recipe Selector */}
      {recipesLoading ? (
        <div className="h-16 rounded-2xl skeleton" />
      ) : recipes.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <Calculator size={48} className="mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium">No catering recipes yet</p>
          {isAdmin && (
            <button
              onClick={() => { setRecipeName(""); setRecipeDesc(""); setRecipeServings("1"); setEditRecipeId(null); setShowRecipeForm(true); }}
              className="btn-big bg-primary text-primary-foreground mx-auto flex items-center gap-2"
            >
              <Plus size={18} /> Create First Recipe
            </button>
          )}
        </div>
      ) : (
        <>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Select Recipe
            </label>
            <div className="space-y-2">
              {recipes.map((recipe) => (
                <div
                  key={recipe.id}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer",
                    selectedRecipeId === recipe.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card hover:bg-muted"
                  )}
                  onClick={() => setSelectedRecipeId(recipe.id === selectedRecipeId ? null : recipe.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      selectedRecipeId === recipe.id ? "bg-primary" : "bg-muted"
                    )}>
                      <Calculator size={18} className={selectedRecipeId === recipe.id ? "text-primary-foreground" : "text-muted-foreground"} />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{recipe.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Base: {recipe.baseServings} serving{recipe.baseServings !== 1 ? "s" : ""}
                        {recipe.description && ` · ${recipe.description}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditRecipe(recipe); }}
                          className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-secondary transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteRecipeId(recipe.id); }}
                          className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center hover:bg-destructive/20 transition-colors"
                        >
                          <Trash2 size={14} className="text-destructive" />
                        </button>
                      </>
                    )}
                    {selectedRecipeId === recipe.id ? <ChevronDown size={18} className="text-primary" /> : <ChevronRight size={18} className="text-muted-foreground" />}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Selected Recipe Detail */}
          {selectedRecipeId && selectedRecipe && (
            <div className="space-y-4">
              {/* Ingredients List */}
              <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h3 className="font-semibold text-foreground">
                    Ingredients for {selectedRecipe.name}
                  </h3>
                  {isAdmin && (
                    <button
                      onClick={() => setShowIngredientForm(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-colors"
                    >
                      <Plus size={14} /> Add
                    </button>
                  )}
                </div>
                {recipeItems.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    No ingredients yet. {isAdmin && "Add ingredients to calculate shortfalls."}
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {recipeItems.map((ri) => (
                      <div key={ri.id} className="flex items-center justify-between p-4">
                        <div>
                          <p className="font-semibold text-foreground text-sm">{ri.itemName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {parseFloat(ri.quantityNeeded).toFixed(2)} {ri.unit ?? "units"} per {selectedRecipe.baseServings} serving{selectedRecipe.baseServings !== 1 ? "s" : ""}
                          </p>
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => removeIngredientMutation.mutate({ id: ri.id })}
                            className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center hover:bg-destructive/20 transition-colors"
                          >
                            <Trash2 size={14} className="text-destructive" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Order Volume Input */}
              <div className="bg-card rounded-2xl border border-border p-4 shadow-sm space-y-3">
                <h3 className="font-semibold text-foreground">Calculate Order</h3>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    Order Volume (servings)
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setOrderVolume(String(Math.max(1, (parseInt(orderVolume) || 0) - 10)))}
                      className="w-12 h-12 rounded-xl bg-muted text-foreground text-lg font-bold flex items-center justify-center hover:bg-secondary active:scale-95"
                    >
                      −10
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      value={orderVolume}
                      onChange={(e) => setOrderVolume(e.target.value)}
                      placeholder="e.g. 150"
                      className="count-input"
                    />
                    <button
                      onClick={() => setOrderVolume(String((parseInt(orderVolume) || 0) + 10))}
                      className="w-12 h-12 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center hover:opacity-90 active:scale-95"
                    >
                      +10
                    </button>
                  </div>
                  {/* Quick presets */}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {[25, 50, 100, 150, 200].map((n) => (
                      <button
                        key={n}
                        onClick={() => setOrderVolume(String(n))}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors",
                          orderVolume === String(n)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted text-foreground border-border hover:bg-secondary"
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Shortfall Results */}
              {volumeNum > 0 && recipeItems.length > 0 && (
                <div className="space-y-3">
                  {shortfallLoading ? (
                    <div className="h-32 rounded-2xl skeleton" />
                  ) : (
                    <>
                      {/* Summary Banner */}
                      <div className={cn(
                        "rounded-2xl p-4 flex items-center justify-between",
                        shortItems.length > 0
                          ? "bg-destructive/5 border border-destructive/30"
                          : "bg-accent/5 border border-accent/30"
                      )}>
                        <div>
                          <p className={cn("text-xs font-semibold uppercase tracking-wider", shortItems.length > 0 ? "text-destructive" : "text-accent")}>
                            {shortItems.length > 0 ? "⚠️ Shortfalls Detected" : "✅ All Stock Sufficient"}
                          </p>
                          <p className={cn("text-lg font-bold mt-0.5", shortItems.length > 0 ? "text-destructive" : "text-accent")}>
                            {shortItems.length > 0
                              ? `${shortItems.length} item${shortItems.length !== 1 ? "s" : ""} need restocking for ${volumeNum} servings`
                              : `Ready for ${volumeNum} servings of ${selectedRecipe.name}`}
                          </p>
                        </div>
                        {shortItems.length > 0
                          ? <AlertTriangle size={32} className="text-destructive shrink-0" />
                          : <CheckCircle size={32} className="text-accent shrink-0" />
                        }
                      </div>

                      {/* Shortfall Items */}
                      {shortItems.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold text-destructive uppercase tracking-wider px-1">
                            Items Short
                          </h4>
                          {shortItems.map((item) => (
                            <div key={item.itemId} className="shortfall-row rounded-2xl border border-destructive/30 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <p className="font-semibold text-foreground">{item.itemName}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">{item.category}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-lg font-bold text-destructive">
                                    −{item.shortfall % 1 === 0 ? item.shortfall : item.shortfall.toFixed(2)} {item.unit ?? "units"}
                                  </p>
                                  <p className="text-xs text-destructive">short</p>
                                </div>
                              </div>
                              <div className="mt-2 flex items-center gap-4 text-sm">
                                <span className="text-muted-foreground">
                                  Need: <strong className="text-foreground">{item.quantityNeeded % 1 === 0 ? item.quantityNeeded : item.quantityNeeded.toFixed(2)} {item.unit ?? "units"}</strong>
                                </span>
                                <span className="text-muted-foreground">
                                  Have: <strong className="text-foreground">{item.currentStock} {item.unit ?? "units"}</strong>
                                </span>
                              </div>
                              {/* Progress bar */}
                              <div className="mt-2">
                                <div className="h-2 bg-destructive/10 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-destructive rounded-full"
                                    style={{ width: `${Math.min(100, (item.currentStock / item.quantityNeeded) * 100)}%` }}
                                  />
                                </div>
                                <p className="text-xs text-destructive mt-1">
                                  {Math.round((item.currentStock / item.quantityNeeded) * 100)}% of needed
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* OK Items */}
                      {okItems.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold text-accent uppercase tracking-wider px-1">
                            Items OK
                          </h4>
                          {okItems.map((item) => (
                            <div key={item.itemId} className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between">
                              <div>
                                <p className="font-semibold text-foreground text-sm">{item.itemName}</p>
                                <p className="text-xs text-muted-foreground">
                                  Need {item.quantityNeeded % 1 === 0 ? item.quantityNeeded : item.quantityNeeded.toFixed(2)} · Have {item.currentStock}
                                </p>
                              </div>
                              <CheckCircle size={20} className="text-accent shrink-0" />
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Recipe Form Modal */}
      {showRecipeForm && (
        <Modal title={editRecipeId ? "Edit Recipe" : "New Catering Recipe"} onClose={() => { setShowRecipeForm(false); setEditRecipeId(null); }}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Recipe Name *</label>
              <input type="text" value={recipeName} onChange={(e) => setRecipeName(e.target.value)} placeholder="e.g. Croissant Order" className="form-input" autoFocus />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Description</label>
              <input type="text" value={recipeDesc} onChange={(e) => setRecipeDesc(e.target.value)} placeholder="Optional description" className="form-input" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Base Servings</label>
              <input type="number" min="1" value={recipeServings} onChange={(e) => setRecipeServings(e.target.value)} placeholder="1" className="form-input" />
              <p className="text-xs text-muted-foreground mt-1">Ingredient quantities are per this many servings</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowRecipeForm(false); setEditRecipeId(null); }} className="flex-1 btn-big bg-muted text-foreground">Cancel</button>
              <button onClick={handleRecipeSubmit} disabled={createRecipeMutation.isPending || updateRecipeMutation.isPending} className="flex-1 btn-big bg-primary text-primary-foreground disabled:opacity-60">
                {createRecipeMutation.isPending || updateRecipeMutation.isPending ? "Saving…" : editRecipeId ? "Save" : "Create Recipe"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Ingredient Modal */}
      {showIngredientForm && selectedRecipeId && (
        <Modal title="Add Ingredient" onClose={() => setShowIngredientForm(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Item *</label>
              <select value={ingredientItemId} onChange={(e) => setIngredientItemId(e.target.value)} className="form-input">
                <option value="">Select item…</option>
                {allItems.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} ({item.category})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Quantity *</label>
                <input type="number" step="0.001" min="0" value={ingredientQty} onChange={(e) => setIngredientQty(e.target.value)} placeholder="e.g. 12" className="form-input" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Unit</label>
                <input type="text" value={ingredientUnit} onChange={(e) => setIngredientUnit(e.target.value)} placeholder="e.g. EACH" className="form-input" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Per {selectedRecipe?.baseServings ?? 1} serving{(selectedRecipe?.baseServings ?? 1) !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowIngredientForm(false)} className="flex-1 btn-big bg-muted text-foreground">Cancel</button>
              <button
                onClick={() => {
                  if (!ingredientItemId || !ingredientQty) { toast.error("Item and quantity are required"); return; }
                  addIngredientMutation.mutate({ recipeId: selectedRecipeId, itemId: parseInt(ingredientItemId), quantityNeeded: ingredientQty, unit: ingredientUnit || undefined });
                }}
                disabled={addIngredientMutation.isPending}
                className="flex-1 btn-big bg-primary text-primary-foreground disabled:opacity-60"
              >
                {addIngredientMutation.isPending ? "Adding…" : "Add Ingredient"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Recipe Confirm */}
      {deleteRecipeId !== null && (
        <Modal title="Delete Recipe?" onClose={() => setDeleteRecipeId(null)}>
          <p className="text-muted-foreground mb-6">This will permanently delete the recipe and all its ingredients.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteRecipeId(null)} className="flex-1 btn-big bg-muted text-foreground">Cancel</button>
            <button onClick={() => deleteRecipeMutation.mutate({ id: deleteRecipeId })} disabled={deleteRecipeMutation.isPending} className="flex-1 btn-big bg-destructive text-destructive-foreground disabled:opacity-60">
              {deleteRecipeMutation.isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-card rounded-t-3xl sm:rounded-2xl shadow-lg max-h-[90vh] overflow-y-auto animate-in">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-lg font-serif font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors"><X size={20} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
