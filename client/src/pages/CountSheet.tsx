import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { CATEGORY_ICONS, STORAGE_AREAS } from "../../../shared/constants";
import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Layers,
  MapPin,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type ViewMode = "storage" | "category";

export default function CountSheet() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [viewMode, setViewMode] = useState<ViewMode>("storage");
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // localCounts stores the CASE count for each item
  const [localCounts, setLocalCounts] = useState<Record<number, string>>({});
  // localEachCounts stores the EACH count for items that have caseQty > 1
  const [localEachCounts, setLocalEachCounts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

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
      utils.counts.getSessionWithEntries.invalidate({ id: activeSessionId! });
    },
    onError: (e, vars) => {
      setSaving((prev) => ({ ...prev, [vars.itemId]: false }));
      toast.error("Failed to save count");
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

  // Load existing counts into local state when session data loads
  // The DB stores total cases (cases + eaches/caseQty). We display the integer part as cases
  // and the fractional remainder * caseQty as eaches.
  useEffect(() => {
    if (sessionData?.entries && allItems.length > 0) {
      const caseMap: Record<number, string> = {};
      const eachMap: Record<number, string> = {};
      const itemById = new Map(allItems.map((i) => [i.id, i]));
      sessionData.entries.forEach((e) => {
        const item = itemById.get(e.itemId);
        const total = parseFloat(e.quantity);
        const caseQty = item?.caseQty;
        if (caseQty && caseQty > 1) {
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

  const saveTimer = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Combined total in cases = cases + (eaches / caseQty)
  function computeTotalCases(itemId: number, caseQty: number | null, casesVal: string, eachesVal: string): string {
    const cases = parseFloat(casesVal || "0");
    const eaches = parseFloat(eachesVal || "0");
    if (caseQty && caseQty > 1 && eaches > 0) {
      return String(cases + eaches / caseQty);
    }
    return String(cases);
  }

  function handleCaseCountChange(item: { id: number; caseQty: number | null }, value: string) {
    setLocalCounts((prev) => ({ ...prev, [item.id]: value }));
    if (!activeSessionId) return;
    const eachesVal = localEachCounts[item.id] ?? "";
    const total = computeTotalCases(item.id, item.caseQty, value, eachesVal);
    clearTimeout(saveTimer.current[item.id]);
    setSaving((prev) => ({ ...prev, [item.id]: true }));
    saveTimer.current[item.id] = setTimeout(() => {
      upsertEntryMutation.mutate({ sessionId: activeSessionId, itemId: item.id, quantity: total });
    }, 800);
  }

  function handleEachCountChange(item: { id: number; caseQty: number | null }, value: string) {
    setLocalEachCounts((prev) => ({ ...prev, [item.id]: value }));
    if (!activeSessionId) return;
    const casesVal = localCounts[item.id] ?? "";
    const total = computeTotalCases(item.id, item.caseQty, casesVal, value);
    clearTimeout(saveTimer.current[item.id]);
    setSaving((prev) => ({ ...prev, [item.id]: true }));
    saveTimer.current[item.id] = setTimeout(() => {
      upsertEntryMutation.mutate({ sessionId: activeSessionId, itemId: item.id, quantity: total });
    }, 800);
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

  // Only show items with a par level assigned (> 0)
  const countableItems = useMemo(
    () => allItems.filter((item) => item.parLevel && parseFloat(item.parLevel) > 0),
    [allItems]
  );

  // Calculate total inventory value (across all countable items)
  const totalValue = useMemo(() => {
    return countableItems.reduce((sum, item) => {
      const qty = parseFloat(effectiveCounts.get(item.id) ?? "0");
      const isEach = item.unitOfMeasure?.toLowerCase() === "each";
      const unitPrice = isEach && item.eachPrice
        ? parseFloat(item.eachPrice)
        : parseFloat(item.price ?? "0");
      return sum + qty * unitPrice;
    }, 0);
  }, [countableItems, effectiveCounts]);

  // Group items
  const grouped = useMemo(() => {
    const groups: Record<string, typeof allItems> = {};
    countableItems.forEach((item) => {
      const key = viewMode === "storage" ? (item.storageArea ?? "Other") : item.category;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [countableItems, viewMode]);

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

  const isCompleted = sessionData?.session?.completedAt != null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif text-foreground">Count Sheet</h1>
          {activeSessionId && sessionData?.session && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {sessionData.session.name ?? "Inventory Count"} ·{" "}
              {new Date(sessionData.session.createdAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowNewSession(true)}
          className="btn-big bg-primary text-primary-foreground flex items-center gap-2 shadow-sm"
        >
          <Plus size={18} />
          New Count
        </button>
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

      {/* Session Selector */}
      {sessions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Previous Counts</p>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSessionId(s.id)}
                className={cn(
                  "shrink-0 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors whitespace-nowrap",
                  activeSessionId === s.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:bg-muted"
                )}
              >
                {s.name ?? "Count"} ·{" "}
                {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {!s.completedAt ? (
                  <span className="ml-1.5 w-2 h-2 rounded-full bg-amber-400 inline-block" title="In progress" />
                ) : (
                  <span className="ml-1.5 w-2 h-2 rounded-full bg-green-500 inline-block" title="Completed" />
                )}
              </button>
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
              disabled={completeMutation.isPending}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors active:scale-95 disabled:opacity-60"
            >
              <CheckCircle size={16} />
              {completeMutation.isPending ? "Completing…" : "Complete"}
            </button>
          ) : (
            <button
              onClick={() => reopenMutation.mutate({ id: activeSessionId })}
              disabled={reopenMutation.isPending}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors active:scale-95 disabled:opacity-60"
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

      {/* Count Groups */}
      {activeSessionId && allItems.length > 0 && (
        <div className="space-y-3">
          {groupKeys.map((groupKey) => {
            const groupItems = grouped[groupKey] ?? [];
            const isCollapsed = collapsed[groupKey];
            const groupValue = groupItems.reduce((sum, item) => {
              const qty = parseFloat(effectiveCounts.get(item.id) ?? "0");
              const isEach = item.unitOfMeasure?.toLowerCase() === "each";
              const unitPrice = isEach && item.eachPrice
                ? parseFloat(item.eachPrice)
                : parseFloat(item.price ?? "0");
              return sum + qty * unitPrice;
            }, 0);
            const countedItems = groupItems.filter((i) => parseFloat(effectiveCounts.get(i.id) ?? "0") > 0).length;

            return (
              <div key={groupKey} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                {/* Group Header */}
                <button
                  onClick={() => setCollapsed((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))}
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
                        {countedItems}/{groupItems.length} counted · ${groupValue.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {countedItems === groupItems.length && groupItems.length > 0 && (
                      <CheckCircle size={16} className="text-green-600" />
                    )}
                    {isCollapsed ? <ChevronRight size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
                  </div>
                </button>

                {/* Group Items */}
                {!isCollapsed && (
                  <div className="border-t border-border divide-y divide-border">
                                        {groupItems.map((item) => {
                      const casesVal = localCounts[item.id] ?? "";
                      const eachesVal = localEachCounts[item.id] ?? "";
                      const hasEach = (item.caseQty ?? 0) > 1; // show Each input only if pack has multiple units
                      // Compute display value
                      const totalCases = parseFloat(casesVal || "0") + (hasEach ? parseFloat(eachesVal || "0") / (item.caseQty ?? 1) : 0);
                      const casePrice = parseFloat(item.price ?? "0");
                      const eachPrice = item.eachPrice ? parseFloat(item.eachPrice) : 0;
                      const value = parseFloat(casesVal || "0") * casePrice + (hasEach ? parseFloat(eachesVal || "0") * eachPrice : 0);
                      const isSaving = saving[item.id];
                      return (
                        <div key={item.id} className="p-4">
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-foreground text-sm leading-tight">{item.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {item.packSize && <span>{item.packSize} · </span>}
                                <span>${casePrice.toFixed(2)}/case</span>
                                {hasEach && eachPrice > 0 && <span> · ${eachPrice.toFixed(2)}/each</span>}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              {value > 0 && (
                                <p className="text-sm font-bold text-foreground">${value.toFixed(2)}</p>
                              )}
                              {isSaving && (
                                <RefreshCw size={12} className="text-muted-foreground animate-spin ml-auto" />
                              )}
                            </div>
                          </div>
                          {/* Case count row */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
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
                                disabled={isCompleted}
                                placeholder="0"
                                className="count-input disabled:opacity-60"
                              />
                              <button
                                onClick={() => handleCaseCountChange(item, String(parseFloat(casesVal || "0") + 1))}
                                disabled={isCompleted}
                                className="w-11 h-11 rounded-xl bg-primary text-primary-foreground text-xl font-bold flex items-center justify-center hover:opacity-90 transition-colors active:scale-95 disabled:opacity-40 shrink-0"
                              >+</button>
                            </div>
                            {/* Each count row — only shown when item has multiple units per case */}
                            {hasEach && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-muted-foreground w-10 shrink-0">EACH</span>
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
                                  disabled={isCompleted}
                                  placeholder="0"
                                  className="count-input disabled:opacity-60"
                                />
                                <button
                                  onClick={() => handleEachCountChange(item, String(parseFloat(eachesVal || "0") + 1))}
                                  disabled={isCompleted}
                                  className="w-11 h-11 rounded-xl bg-amber-600 text-white text-xl font-bold flex items-center justify-center hover:opacity-90 transition-colors active:scale-95 disabled:opacity-40 shrink-0"
                                >+</button>
                              </div>
                            )}
                          </div>
                        </div>
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
            <div className="bg-amber-50 rounded-xl p-3 text-sm text-amber-800">
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
    </div>
  );
}
