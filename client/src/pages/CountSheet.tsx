import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { CATEGORY_ICONS, STORAGE_AREAS } from "../../../shared/constants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowDownToLine,
  CheckCircle,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Layers,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Square,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type ViewMode = "storage" | "category";

// ─── Helper: compact single-line row for a counted item ───────────────────────
function CompactCountedRow({
  itemId, name, countSummary, value, isSaving, onExpand,
}: {
  itemId: number;
  name: string;
  countSummary: string;
  value: number;
  isSaving: boolean;
  onExpand: () => void;
  onScrollOut: () => void;
}) {
  return (
    <button
      onClick={onExpand}
      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
    >
      <div className="flex items-center gap-2 min-w-0">
        <CheckCircle size={14} className="text-accent shrink-0" />
        <span className="text-sm text-muted-foreground truncate">{name}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-semibold text-foreground">{countSummary}</span>
        {value > 0 && <span className="text-xs text-muted-foreground">${value.toFixed(2)}</span>}
        {isSaving && <RefreshCw size={11} className="text-muted-foreground animate-spin" />}
      </div>
    </button>
  );
}

// ─── Helper: wraps a full-edit item row and collapses it when scrolled out ────
function ScrollCollapseWrapper({
  itemId, isCounted, onScrollOut, children,
}: {
  itemId: number;
  isCounted: boolean;
  onScrollOut: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Only attach observer when the item is counted (so uncounted items are never collapsed)
  useEffect(() => {
    if (!isCounted) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // When the element is no longer visible (scrolled away), collapse it
        if (!entry.isIntersecting) {
          onScrollOut();
        }
      },
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCounted, itemId]);

  return <div ref={ref}>{children}</div>;
}

export default function CountSheet() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [viewMode, setViewMode] = useState<ViewMode>("storage");
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Track which counted items are expanded for editing
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  // localCounts stores the CASE count for each item
  const [localCounts, setLocalCounts] = useState<Record<number, string>>({});
  // localEachCounts stores the EACH count for items that have caseQty > 1
  const [localEachCounts, setLocalEachCounts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saveError, setSaveError] = useState<Record<number, boolean>>({});

  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [countSearch, setCountSearch] = useState("");

  // Bulk mode state
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showFillAll, setShowFillAll] = useState(false);
  const [fillAllValue, setFillAllValue] = useState("");

  const { data: sessions = [], refetch: refetchSessions } = trpc.counts.listSessions.useQuery();
  const { data: allItems = [] } = trpc.items.list.useQuery(undefined);
  const { data: sessionData, refetch: refetchSession } = trpc.counts.getSessionWithEntries.useQuery(
    { id: activeSessionId! },
    { enabled: activeSessionId !== null }
  );

  const createSessionMutation = trpc.counts.createSession.useMutation({
    onSuccess: (session) => {
      setActiveSessionId(session.id);
      setShowNewSession(false);
      setSessionName("");
      refetchSessions();
      toast.success("New count session started");
    },
    onError: (e) => toast.error(e.message),
  });

  const upsertEntryMutation = trpc.counts.upsertEntry.useMutation({
    onSuccess: (_, vars) => {
      setSaving((prev) => ({ ...prev, [vars.itemId]: false }));
      setSaveError((prev) => ({ ...prev, [vars.itemId]: false }));
      utils.counts.getSessionWithEntries.invalidate({ id: activeSessionId! });
      // Collapse happens on scroll-out (IntersectionObserver), not here
    },
    onError: (e, vars) => {
      setSaving((prev) => ({ ...prev, [vars.itemId]: false }));
      setSaveError((prev) => ({ ...prev, [vars.itemId]: true }));
      toast.error("Failed to save count — please retry");
    },
  });

  const reopenMutation = trpc.counts.reopenSession.useMutation({
    onSuccess: () => {
      refetchSessions();
      refetchSession();
      toast.success("Count re-opened for editing");
    },
    onError: (e) => toast.error(e.message),
  });

  const completeMutation = trpc.counts.completeSession.useMutation({
    onSuccess: () => {
      refetchSessions();
      refetchSession();
      toast.success("Count session completed!");
    },
    onError: (e) => toast.error(e.message),
  });

  const setCountModeMutation = trpc.items.setCountMode.useMutation({
    onSuccess: () => { utils.items.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.counts.deleteSession.useMutation({
    onSuccess: () => {
      setDeleteConfirm(null);
      // If we deleted the active session, clear it
      if (deleteConfirm === activeSessionId) setActiveSessionId(null);
      refetchSessions();
      toast.success("Count session deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  // Load existing counts into local state when session data loads
  // The DB stores total cases (cases + eaches/caseQty). We display the integer part as cases
  // and the fractional remainder * caseQty as eaches.
  // For 'each' mode items, the DB stores eaches directly (no case conversion).
  useEffect(() => {
    if (sessionData?.entries && allItems.length > 0) {
      const caseMap: Record<number, string> = {};
      const eachMap: Record<number, string> = {};
      const itemById = new Map(allItems.map((i) => [i.id, i]));
      sessionData.entries.forEach((e) => {
        const item = itemById.get(e.itemId);
        const total = parseFloat(e.quantity);
        const caseQty = item?.caseQty;
        const isEachMode = item?.countMode === "each";
        if (isEachMode) {
          // In each mode, quantity stored is eaches
          eachMap[e.itemId] = total > 0 ? String(total) : "";
        } else if (caseQty && caseQty > 1) {
          const cases = Math.floor(total);
          const eaches = Math.round((total - cases) * caseQty);
          caseMap[e.itemId] = cases > 0 ? String(cases) : "";
          eachMap[e.itemId] = eaches > 0 ? String(eaches) : "";
        } else {
          caseMap[e.itemId] = total > 0 ? String(total) : "";
        }
      });
      setLocalCounts(caseMap);
      setLocalEachCounts(eachMap);
    }
  }, [sessionData, allItems]);

  // Auto-select latest active session
  useEffect(() => {
    if (!activeSessionId && sessions.length > 0) {
      const inProgress = sessions.find((s) => !s.completedAt);
      if (inProgress) setActiveSessionId(inProgress.id);
    }
  }, [sessions, activeSessionId]);

  // Clear expanded items when switching sessions
  useEffect(() => {
    setExpandedItems(new Set());
  }, [activeSessionId]);

  const saveTimer = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Combined total in cases = cases + (eaches / caseQty)
  // For 'each' mode items, quantity IS eaches (no case conversion)
  function computeStoredQuantity(
    item: { id: number; caseQty: number | null; countMode?: string | null },
    casesVal: string,
    eachesVal: string
  ): string {
    if (item.countMode === "each") {
      // Store eaches directly
      return String(parseFloat(eachesVal || "0") || 0);
    }
    const cases = parseFloat(casesVal || "0");
    const eaches = parseFloat(eachesVal || "0");
    if (item.caseQty && item.caseQty > 1 && eaches > 0) {
      return String(cases + eaches / item.caseQty);
    }
    return String(cases);
  }

  function handleCaseCountChange(item: { id: number; caseQty: number | null; countMode?: string | null }, value: string) {
    setLocalCounts((prev) => ({ ...prev, [item.id]: value }));
    if (!activeSessionId) return;
    const eachesVal = localEachCounts[item.id] ?? "";
    const total = computeStoredQuantity(item, value, eachesVal);
    clearTimeout(saveTimer.current[item.id]);
    setSaving((prev) => ({ ...prev, [item.id]: true }));
    saveTimer.current[item.id] = setTimeout(() => {
      upsertEntryMutation.mutate({ sessionId: activeSessionId, itemId: item.id, quantity: total });
    }, 300);
  }

  function handleCaseCountBlur(item: { id: number; caseQty: number | null; countMode?: string | null }, value: string) {
    if (!activeSessionId) return;
    clearTimeout(saveTimer.current[item.id]);
    const eachesVal = localEachCounts[item.id] ?? "";
    const total = computeStoredQuantity(item, value, eachesVal);
    setSaving((prev) => ({ ...prev, [item.id]: true }));
    upsertEntryMutation.mutate({ sessionId: activeSessionId, itemId: item.id, quantity: total });
  }

  function handleEachCountChange(item: { id: number; caseQty: number | null; countMode?: string | null }, value: string) {
    setLocalEachCounts((prev) => ({ ...prev, [item.id]: value }));
    if (!activeSessionId) return;
    const casesVal = localCounts[item.id] ?? "";
    const total = computeStoredQuantity(item, casesVal, value);
    clearTimeout(saveTimer.current[item.id]);
    setSaving((prev) => ({ ...prev, [item.id]: true }));
    saveTimer.current[item.id] = setTimeout(() => {
      upsertEntryMutation.mutate({ sessionId: activeSessionId, itemId: item.id, quantity: total });
    }, 300);
  }

  function handleEachCountBlur(item: { id: number; caseQty: number | null; countMode?: string | null }, value: string) {
    if (!activeSessionId) return;
    clearTimeout(saveTimer.current[item.id]);
    const casesVal = localCounts[item.id] ?? "";
    const total = computeStoredQuantity(item, casesVal, value);
    setSaving((prev) => ({ ...prev, [item.id]: true }));
    upsertEntryMutation.mutate({ sessionId: activeSessionId, itemId: item.id, quantity: total });
  }

  // Build entry map for value calculation
  const entryMap = useMemo(() => {
    const map = new Map<number, string>();
    sessionData?.entries?.forEach((e) => map.set(e.itemId, e.quantity));
    return map;
  }, [sessionData]);

  // Merge local counts with saved
  const effectiveCounts = useMemo(() => {
    const map = new Map(entryMap);
    Object.entries(localCounts).forEach(([id, qty]) => map.set(Number(id), qty));
    return map;
  }, [entryMap, localCounts]);

  // ─── Bulk helpers ──────────────────────────────────────────────────────────
  function toggleSelectItem(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleSelectAll() {
    if (selectedIds.size === countableItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(countableItems.map((i) => i.id)));
    }
  }

  function handleBulkCopyDown() {
    const visible = countableItems.filter((i) => selectedIds.has(i.id));
    if (visible.length < 2) { toast.error("Select at least 2 items to copy down"); return; }
    const first = visible[0];
    const isEachMode = first.countMode === "each";
    const sourceVal = isEachMode
      ? (localEachCounts[first.id] ?? "0")
      : (localCounts[first.id] ?? "0");
    const newCounts: Record<number, string> = { ...localCounts };
    const newEachCounts: Record<number, string> = { ...localEachCounts };
    visible.slice(1).forEach((i) => {
      if (i.countMode === "each") { newEachCounts[i.id] = sourceVal; }
      else { newCounts[i.id] = sourceVal; }
    });
    setLocalCounts(newCounts);
    setLocalEachCounts(newEachCounts);
    if (activeSessionId) {
      visible.slice(1).forEach((i) => {
        const casesVal = i.countMode === "each" ? "" : sourceVal;
        const eachesVal = i.countMode === "each" ? sourceVal : (newEachCounts[i.id] ?? "");
        const total = computeStoredQuantity(i, casesVal, eachesVal);
        upsertEntryMutation.mutate({ sessionId: activeSessionId, itemId: i.id, quantity: total });
      });
    }
    toast.success(`Copied ${sourceVal} to ${visible.length - 1} item${visible.length > 2 ? "s" : ""}`);
  }

  function handleBulkFillAll() {
    const val = fillAllValue.trim();
    if (!val || isNaN(parseFloat(val))) { toast.error("Enter a valid number"); return; }
    const visible = countableItems.filter((i) => selectedIds.has(i.id));
    if (visible.length === 0) { toast.error("Select at least one item"); return; }
    const newCounts: Record<number, string> = { ...localCounts };
    const newEachCounts: Record<number, string> = { ...localEachCounts };
    visible.forEach((i) => {
      if (i.countMode === "each") { newEachCounts[i.id] = val; }
      else { newCounts[i.id] = val; }
    });
    setLocalCounts(newCounts);
    setLocalEachCounts(newEachCounts);
    if (activeSessionId) {
      visible.forEach((i) => {
        const casesVal = i.countMode === "each" ? "" : val;
        const eachesVal = i.countMode === "each" ? val : (newEachCounts[i.id] ?? "");
        const total = computeStoredQuantity(i, casesVal, eachesVal);
        upsertEntryMutation.mutate({ sessionId: activeSessionId, itemId: i.id, quantity: total });
      });
    }
    toast.success(`Set ${val} on ${visible.length} item${visible.length !== 1 ? "s" : ""}`);
    setShowFillAll(false);
    setFillAllValue("");
  }

  // Only show items with a par level assigned (> 0)
  const countableItems = useMemo(
    () => allItems.filter((item) => item.parLevel && parseFloat(item.parLevel) > 0),
    [allItems]
  );

  // Calculate total inventory value (across all countable items)
  const totalValue = useMemo(() => {
    return countableItems.reduce((sum, item) => {
      const qty = parseFloat(effectiveCounts.get(item.id) ?? "0") || 0;
      const isEach = item.unitOfMeasure?.toLowerCase() === "each";
      const rawPrice = isEach && item.eachPrice ? item.eachPrice : (item.price ?? "0");
      const unitPrice = parseFloat(rawPrice) || 0;
      return sum + qty * unitPrice;
    }, 0);
  }, [countableItems, effectiveCounts]);

  // Search-filtered items — matches name, brand, manufacturer, product numbers, vendor, category, storage area
  const searchFilteredItems = useMemo(() => {
    if (!countSearch.trim()) return countableItems;
    const q = countSearch.toLowerCase();
    return countableItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.storageArea ?? "").toLowerCase().includes(q) ||
        (item.vendor ?? "").toLowerCase().includes(q) ||
        (item.brand ?? "").toLowerCase().includes(q) ||
        ((item as any).itemNumber ?? "").toLowerCase().includes(q)
    );
  }, [countableItems, countSearch]);

  // Group items
  const grouped = useMemo(() => {
    const groups: Record<string, typeof allItems> = {};
    searchFilteredItems.forEach((item) => {
      const key = viewMode === "storage" ? (item.storageArea ?? "Other") : item.category;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [searchFilteredItems, viewMode]);

  // Default all groups to collapsed when groupKeys change
  const prevGroupKeysRef = useRef<string[]>([]);
  const groupKeys = useMemo(() => {
    if (viewMode === "storage") {
      const order = [...STORAGE_AREAS];
      return Object.keys(grouped).sort((a, b) => {
        const ai = order.indexOf(a as any);
        const bi = order.indexOf(b as any);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    }
    return Object.keys(grouped).sort();
  }, [grouped, viewMode]);

  // When groupKeys changes, ensure any new key starts collapsed
  useEffect(() => {
    const prev = new Set(prevGroupKeysRef.current);
    const newKeys = groupKeys.filter((k) => !prev.has(k));
    if (newKeys.length > 0) {
      setCollapsed((c) => {
        const next = { ...c };
        newKeys.forEach((k) => { if (next[k] === undefined) next[k] = true; });
        return next;
      });
    }
    prevGroupKeysRef.current = groupKeys;
  }, [groupKeys]);

  const isCompleted = sessionData?.session?.completedAt != null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif text-foreground">Counts &amp; History</h1>
          {activeSessionId && sessionData?.session && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {sessionData.session.name ?? "Inventory Count"} ·{" "}
              {new Date(sessionData.session.createdAt).toLocaleDateString()}
              {(sessionData.session as any).creatorName && (
                <span className="ml-1 inline-flex items-center gap-1">
                  · <User size={11} className="inline" /> {(sessionData.session as any).creatorName}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeSessionId && !isCompleted && (
            <button
              onClick={() => {
                setBulkMode(!bulkMode);
                setSelectedIds(new Set());
                setShowFillAll(false);
                setFillAllValue("");
              }}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors active:scale-95",
                bulkMode
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-foreground hover:bg-muted"
              )}
            >
              <SlidersHorizontal size={15} />
              {bulkMode ? "Exit Bulk" : "Bulk Fill"}
            </button>
          )}
          <button
            onClick={() => setShowNewSession(true)}
            className="btn-big bg-primary text-primary-foreground flex items-center gap-2 shadow-sm"
          >
            <Plus size={18} />
            New Count
          </button>
        </div>
      </div>

      {/* Total Value Banner */}
      {activeSessionId && (
        <div className="bg-primary rounded-2xl p-4 shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-primary-foreground/70 text-xs font-semibold uppercase tracking-wider">
                Total Inventory Value
              </p>
              <p className="text-3xl font-serif font-semibold text-primary-foreground mt-1">
                ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <DollarSign size={24} className="text-primary-foreground" />
            </div>
          </div>
          {isCompleted && (
            <div className="mt-3 flex items-center gap-2 text-primary-foreground/80 text-sm">
              <CheckCircle size={16} />
              <span>Session completed</span>
            </div>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {bulkMode && activeSessionId && !isCompleted && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors active:scale-95"
            >
              {selectedIds.size === countableItems.length ? "Deselect All" : "Select All"}
            </button>

            <span className="text-sm font-semibold text-primary">
              {selectedIds.size} selected
            </span>

            <button
              onClick={handleBulkCopyDown}
              disabled={selectedIds.size < 2}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-background border border-border hover:bg-muted disabled:opacity-40 transition-colors active:scale-95"
            >
              <ArrowDownToLine size={13} />
              Copy Down Cases
            </button>

            <button
              onClick={() => setShowFillAll(!showFillAll)}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-background border border-border hover:bg-muted disabled:opacity-40 transition-colors active:scale-95"
            >
              <SlidersHorizontal size={13} />
              Fill All Cases
            </button>
          </div>

          {showFillAll && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="1"
                value={fillAllValue}
                onChange={(e) => setFillAllValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBulkFillAll()}
                placeholder="Enter case count…"
                className="h-9 w-36 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                autoFocus
              />
              <button
                onClick={handleBulkFillAll}
                className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-95 transition-transform"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}

      {/* Session Selector */}
      {sessions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Previous Counts</p>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {sessions.map((s) => (
              <div key={s.id} className="relative shrink-0 flex items-center gap-1">
                <button
                  onClick={() => setActiveSessionId(s.id)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-semibold border transition-colors whitespace-nowrap",
                    activeSessionId === s.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-border hover:bg-muted"
                  )}
                >
                  <span className="block leading-tight">
                    {s.name ?? "Count"} ·{" "}
                    {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {!s.completedAt ? (
                      <span className="ml-1.5 w-2 h-2 rounded-full bg-primary inline-block" title="In progress" />
                    ) : (
                      <span className="ml-1.5 w-2 h-2 rounded-full bg-accent inline-block" title="Completed" />
                    )}
                  </span>
                  {(s as any).creatorName && (
                    <span className="block text-[10px] font-normal opacity-70 mt-0.5">
                      <User size={9} className="inline mr-0.5" />{(s as any).creatorName}
                    </span>
                  )}
                </button>
                {/* Delete button — always visible for admins */}
                {user?.role === "admin" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(s.id); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-95 transition-all shrink-0"
                    title="Delete this count session"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View Mode Toggle */}
      {activeSessionId && (
        <div className="flex items-center gap-2">
          <div className="flex bg-muted rounded-xl p-1 gap-1">
            <button
              onClick={() => setViewMode("storage")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                viewMode === "storage"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MapPin size={15} /> Storage Area
            </button>
            <button
              onClick={() => setViewMode("category")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                viewMode === "category"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Layers size={15} /> Category
            </button>
          </div>
          {!isCompleted ? (
            <button
              onClick={() => completeMutation.mutate({ id: activeSessionId })}
              disabled={completeMutation.isPending || Object.values(saving).some(Boolean)}
              title={Object.values(saving).some(Boolean) ? "Waiting for saves to finish…" : undefined}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:opacity-90 transition-colors active:scale-95 disabled:opacity-60"
            >
              <CheckCircle size={16} />
              {completeMutation.isPending ? "Completing…" : Object.values(saving).some(Boolean) ? "Saving…" : "Complete"}
            </button>
          ) : (
            <button
              onClick={() => reopenMutation.mutate({ id: activeSessionId })}
              disabled={reopenMutation.isPending}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:bg-secondary/80 transition-colors active:scale-95 disabled:opacity-60"
            >
              <RefreshCw size={16} />
              {reopenMutation.isPending ? "Re-opening…" : "Re-open to Edit"}
            </button>
          )}
        </div>
      )}

      {/* No Session State */}
      {!activeSessionId && (
        <div className="text-center py-16 space-y-4">
          <ClipboardList size={48} className="mx-auto text-muted-foreground/40" />
          <div>
            <p className="font-semibold text-foreground">No Active Count Session</p>
            <p className="text-sm text-muted-foreground mt-1">Start a new count to begin entering stock</p>
          </div>
          <button
            onClick={() => setShowNewSession(true)}
            className="btn-big bg-primary text-primary-foreground mx-auto flex items-center gap-2"
          >
            <Plus size={18} /> Start Count
          </button>
        </div>
      )}

      {/* Count Search Bar */}
      {activeSessionId && allItems.length > 0 && (
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={countSearch}
            onChange={(e) => setCountSearch(e.target.value)}
            placeholder="Search items…"
            className="w-full h-11 pl-10 pr-10 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {countSearch && (
            <button
              onClick={() => setCountSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* Count Groups */}
      {activeSessionId && allItems.length > 0 && (
        <div className="space-y-3">
          {groupKeys.map((groupKey) => {
            const groupItems = grouped[groupKey] ?? [];
            const isCollapsed = collapsed[groupKey];
            const groupValue = groupItems.reduce((sum, item) => {
              const qty = parseFloat(effectiveCounts.get(item.id) ?? "0") || 0;
              const isEach = item.unitOfMeasure?.toLowerCase() === "each";
              const rawPrice = isEach && item.eachPrice ? item.eachPrice : (item.price ?? "0");
              const unitPrice = parseFloat(rawPrice) || 0;
              return sum + qty * unitPrice;
            }, 0);
                    const countedItems = groupItems.filter((i) => parseFloat(effectiveCounts.get(i.id) ?? "0") > 0).length;
            // Default to collapsed if not explicitly set
            const isCollapsedGroup = collapsed[groupKey] !== false;

            return (
              <div key={groupKey} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                {/* Group Header */}
                <button
                  onClick={() => setCollapsed((prev) => ({ ...prev, [groupKey]: prev[groupKey] === false }))}
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">
                      {viewMode === "category"
                        ? (CATEGORY_ICONS[groupKey] ?? "📋")
                        : groupKey === "Walk-In" ? "🧊" : groupKey === "Freezer" ? "❄️" : groupKey === "Bar" ? "🍸" : "📦"}
                    </span>
                    <div className="text-left">
                      <p className="font-semibold text-foreground">{groupKey}</p>
                      <p className="text-xs text-muted-foreground">
                        {countedItems}/{groupItems.length} counted · ${groupValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {countedItems === groupItems.length && groupItems.length > 0 && (
                      <CheckCircle size={16} className="text-accent" />
                    )}
                    {isCollapsedGroup ? <ChevronRight size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
                  </div>
                </button>

                {/* Group Items */}
                {!isCollapsedGroup && (
                  <div className="border-t border-border divide-y divide-border">
                                        {groupItems.map((item) => {
                      const isEachMode = item.countMode === "each";
                      const casesVal = localCounts[item.id] ?? "";
                      const eachesVal = localEachCounts[item.id] ?? "";
                      // In each mode, hasEach is always true (only show each input)
                      const hasEach = isEachMode || (item.caseQty ?? 0) > 1;
                      // Compute display value
                      const casePrice = parseFloat(item.price ?? "0") || 0;
                      const eachPrice = item.eachPrice ? (parseFloat(item.eachPrice) || 0) : 0;
                      let value: number;
                      if (isEachMode) {
                        // value = eaches * eachPrice
                        value = (parseFloat(eachesVal || "0") || 0) * (eachPrice || (item.caseQty ? casePrice / item.caseQty : 0));
                      } else {
                        value = (parseFloat(casesVal || "0") || 0) * casePrice + ((item.caseQty ?? 0) > 1 ? (parseFloat(eachesVal || "0") || 0) * eachPrice : 0);
                      }
                      const isSaving = saving[item.id];
                      const hasError = saveError[item.id];
                      const savedEntry = sessionData?.entries?.find((e) => e.itemId === item.id);
                      const editorName = (savedEntry as any)?.editorName;

                      // Determine if item has been counted — check both cases and eaches
                      const isCounted = (() => {
                        const stored = parseFloat(effectiveCounts.get(item.id) ?? "0");
                        if (stored > 0) return true;
                        // Also check local each count for each-mode items
                        const localEach = parseFloat(localEachCounts[item.id] ?? "0");
                        return localEach > 0;
                      })();
                      const isExpanded = expandedItems.has(item.id);

                      // Build count summary string for compact row
                      const countSummary = (() => {
                        if (isEachMode) {
                          return eachesVal ? `${eachesVal} each` : "";
                        }
                        const parts: string[] = [];
                        if (casesVal) parts.push(`${casesVal} cs`);
                        if (eachesVal && (item.caseQty ?? 0) > 1) parts.push(`${eachesVal} ea`);
                        return parts.join(" + ");
                      })();

                      // Compact counted row — shown when counted and not expanded
                      if (isCounted && !isExpanded && !bulkMode && !isCompleted) {
                        return (
                          <CompactCountedRow
                            key={item.id}
                            itemId={item.id}
                            name={item.name}
                            countSummary={countSummary}
                            value={value}
                            isSaving={!!isSaving}
                            onExpand={() => setExpandedItems((prev) => { const n = new Set(prev); n.add(item.id); return n; })}
                            onScrollOut={() => {/* already collapsed */}}
                          />
                        );
                      }

                      return (
                        <ScrollCollapseWrapper
                          key={item.id}
                          itemId={item.id}
                          isCounted={isCounted}
                          onScrollOut={() => setExpandedItems((prev) => { const n = new Set(prev); n.delete(item.id); return n; })}
                        >
                        <div className={cn("p-4", bulkMode && selectedIds.has(item.id) && "bg-primary/5")}>
                          {/* Collapse-back button for expanded counted items */}
                          {isCounted && isExpanded && !bulkMode && !isCompleted && (
                            <button
                              onClick={() => setExpandedItems((prev) => { const n = new Set(prev); n.delete(item.id); return n; })}
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors"
                            >
                              <ChevronDown size={13} />
                              <span>Collapse</span>
                            </button>
                          )}
                          <div className="flex items-center justify-between gap-3 mb-3">
                            {bulkMode && (
                              <button
                                onClick={() => toggleSelectItem(item.id)}
                                className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                              >
                                {selectedIds.has(item.id)
                                  ? <CheckSquare size={18} className="text-primary" />
                                  : <Square size={18} />}
                              </button>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-foreground text-sm leading-tight">{item.name}</p>
                                {/* Count mode toggle — admin only, not shown on completed sessions */}
                                {user?.role === "admin" && !isCompleted && (
                                  <button
                                    onClick={() => setCountModeMutation.mutate({ id: item.id, countMode: isEachMode ? "case" : "each" })}
                                    disabled={setCountModeMutation.isPending}
                                    className={cn(
                                      "text-[10px] font-bold px-2 py-1 rounded-lg border-2 transition-all shrink-0 flex items-center gap-1",
                                      isEachMode
                                        ? "bg-secondary text-secondary-foreground border-primary/40 hover:bg-secondary/80 active:scale-95"
                                        : "bg-muted text-foreground border-border hover:bg-muted/80 active:scale-95"
                                    )}
                                    title={isEachMode ? "Currently counting by Each — tap to switch to Case" : "Currently counting by Case — tap to switch to Each"}
                                  >
                                    <span>{isEachMode ? "EACH" : "CASE"}</span>
                                    <span className="opacity-60 text-[9px]">▼</span>
                                  </button>
                                )}
                              </div>
                              {(item as any).itemNumber && (
                                <p className="text-xs text-muted-foreground/70 mt-0.5 font-mono">
                                  #{(item as any).itemNumber}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {item.packSize && <span>{item.packSize} · </span>}
                                {isEachMode
                                  ? <span>${(eachPrice || (item.caseQty ? casePrice / item.caseQty : 0)).toFixed(2)}/each</span>
                                  : <><span>${casePrice.toFixed(2)}/case</span>{(item.caseQty ?? 0) > 1 && eachPrice > 0 && <span> · ${eachPrice.toFixed(2)}/each</span>}</>
                                }
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              {value > 0 && (
                                <p className="text-sm font-bold text-foreground">${value.toFixed(2)}</p>
                              )}
                              {isSaving ? (
                                <RefreshCw size={12} className="text-muted-foreground animate-spin ml-auto" />
                              ) : hasError ? (
                                <span className="text-[10px] font-semibold text-destructive ml-auto block">Save failed</span>
                              ) : editorName && !isSaving ? (
                                <span className="text-[10px] text-muted-foreground/60 ml-auto block flex items-center gap-0.5 justify-end">
                                  <User size={9} />{editorName}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {/* Count inputs */}
                          <div className="space-y-2">
                            {/* Case count row — hidden in each mode */}
                            {!isEachMode && <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-muted-foreground w-10 shrink-0">CASE</span>
                              <button
                                onClick={() => {
                                  const c = parseFloat(casesVal || "0");
                                  if (c > 0) handleCaseCountChange(item, String(Math.max(0, c - 1)));
                                }}
                                disabled={isCompleted}
                                className="w-11 h-11 rounded-xl bg-muted text-foreground text-xl font-bold flex items-center justify-center hover:bg-secondary transition-colors active:scale-95 disabled:opacity-40 shrink-0"
                              >−</button>
                              <input
                                type="number" inputMode="numeric" min="0" step="1"
                                value={casesVal}
                                onChange={(e) => handleCaseCountChange(item, e.target.value)}
                                onBlur={(e) => handleCaseCountBlur(item, e.target.value)}
                                disabled={isCompleted}
                                placeholder="0"
                                className="count-input disabled:opacity-60"
                              />
                              <button
                                onClick={() => handleCaseCountChange(item, String(parseFloat(casesVal || "0") + 1))}
                                disabled={isCompleted}
                                className="w-11 h-11 rounded-xl bg-primary text-primary-foreground text-xl font-bold flex items-center justify-center hover:opacity-90 transition-colors active:scale-95 disabled:opacity-40 shrink-0"
                              >+</button>
                            </div>}
                            {/* Each count row — shown when item has multiple units per case OR in each mode */}
                            {hasEach && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-muted-foreground w-10 shrink-0">
                                  {isEachMode ? "EACH" : "UNIT"}
                                </span>
                                <button
                                  onClick={() => {
                                    const e = parseFloat(eachesVal || "0");
                                    if (e > 0) handleEachCountChange(item, String(Math.max(0, e - 1)));
                                  }}
                                  disabled={isCompleted}
                                  className="w-11 h-11 rounded-xl bg-muted text-foreground text-xl font-bold flex items-center justify-center hover:bg-secondary transition-colors active:scale-95 disabled:opacity-40 shrink-0"
                                >−</button>
                                <input
                                  type="number" inputMode="numeric" min="0" step="1"
                                  value={eachesVal}
                                  onChange={(e) => handleEachCountChange(item, e.target.value)}
                                  onBlur={(e) => handleEachCountBlur(item, e.target.value)}
                                  disabled={isCompleted}
                                  placeholder="0"
                                  className="count-input disabled:opacity-60"
                                />
                                <button
                                  onClick={() => handleEachCountChange(item, String(parseFloat(eachesVal || "0") + 1))}
                                  disabled={isCompleted}
                                  className="w-11 h-11 rounded-xl bg-accent text-accent-foreground text-xl font-bold flex items-center justify-center hover:opacity-90 transition-colors active:scale-95 disabled:opacity-40 shrink-0"
                                >+</button>
                              </div>
                            )}
                          </div>
                        </div>
                        </ScrollCollapseWrapper>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New Session Modal */}
      {showNewSession && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setShowNewSession(false)} />
          <div className="relative w-full sm:max-w-md bg-card rounded-t-3xl sm:rounded-2xl shadow-lg p-6 space-y-4 animate-in">
            <h2 className="text-xl font-serif font-semibold text-foreground">Start New Count</h2>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Session Name (optional)
              </label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder={`Count — ${new Date().toLocaleDateString()}`}
                className="form-input"
                autoFocus
              />
            </div>
            <div className="bg-secondary/40 rounded-xl p-3 text-sm text-foreground">
              <strong>Note:</strong> Starting a new count doesn't affect previous session data.
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowNewSession(false)} className="flex-1 btn-big bg-muted text-foreground">
                Cancel
              </button>
              <button
                onClick={() => createSessionMutation.mutate({ name: sessionName || undefined })}
                disabled={createSessionMutation.isPending}
                className="flex-1 btn-big bg-primary text-primary-foreground disabled:opacity-60"
              >
                {createSessionMutation.isPending ? "Starting…" : "Start Count"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 size={18} className="text-destructive" />
              Delete Count Session?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the session and all its count entries. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirm(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm !== null && deleteMutation.mutate({ id: deleteConfirm })}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
