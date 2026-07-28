import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, FileText, Tag, ClipboardList,
  ArrowLeft, ChevronRight, DollarSign, Package, AlertTriangle,
  BarChart2, Calendar, ExternalLink
} from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportTab = "cogs" | "invoices" | "prices" | "counts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtExact$(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
function fmtDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtPct(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

// ─── Sub-nav tabs ─────────────────────────────────────────────────────────────

const TABS: { id: ReportTab; label: string; icon: React.ReactNode; description: string }[] = [
  { id: "cogs", label: "Weekly COGS", icon: <TrendingUp size={18} />, description: "Consumption cost by week" },
  { id: "invoices", label: "Invoice History", icon: <FileText size={18} />, description: "All vendor invoices" },
  { id: "prices", label: "Price Changes", icon: <Tag size={18} />, description: "Item price movements" },
  { id: "counts", label: "Count History", icon: <ClipboardList size={18} />, description: "Completed inventory counts" },
];

// ─── Weekly COGS Report ───────────────────────────────────────────────────────

function WeeklyCogsReport() {
  const [weeks, setWeeks] = useState(12);
  const { data, isLoading } = trpc.reports.weeklyCogs.useQuery({ weeks });

  if (isLoading) return <ReportSkeleton />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp size={40} className="text-muted-foreground/40" />}
        title="No COGS data yet"
        description="Apply invoices and complete inventory counts to see weekly cost of goods data."
      />
    );
  }

  const totalConsumption = data.reduce((s, r) => s + r.consumptionCost, 0);
  const avgWeekly = totalConsumption / data.filter(r => r.consumptionCost > 0).length || 0;
  const lastWeek = data[data.length - 1];
  const prevWeek = data[data.length - 2];
  const weekOverWeek = prevWeek && prevWeek.consumptionCost > 0
    ? ((lastWeek.consumptionCost - prevWeek.consumptionCost) / prevWeek.consumptionCost) * 100
    : null;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryCard label="Total COGS" value={fmt$(totalConsumption)} sub={`Last ${weeks} weeks`} />
        <SummaryCard label="Avg / Week" value={fmt$(avgWeekly)} sub="Active weeks only" />
        {weekOverWeek !== null && (
          <SummaryCard
            label="Week vs Prior"
            value={fmtPct(weekOverWeek)}
            sub="Most recent week"
            valueClass={weekOverWeek > 0 ? "text-destructive" : "text-green-600"}
          />
        )}
      </div>

      {/* Range selector */}
      <div className="flex gap-2">
        {[4, 8, 12, 26].map(w => (
          <button
            key={w}
            onClick={() => setWeeks(w)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              weeks === w ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {w}w
          </button>
        ))}
      </div>

      {/* Weekly table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Week</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Opening</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Receipts</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Closing</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Consumed</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{fmtDate(row.weekStart)}</div>
                    <div className="text-xs text-muted-foreground">→ {fmtDate(row.weekEnd)}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmt$(row.openingCost)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmt$(row.receiptsCost)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmt$(row.closingCost)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("font-semibold", row.consumptionCost > 0 ? "text-foreground" : "text-muted-foreground")}>
                      {fmt$(row.consumptionCost)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top items breakdown for most recent week */}
      {lastWeek.topItems.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Top Items — {fmtDate(lastWeek.weekStart)} Week
          </h3>
          <div className="space-y-2">
            {lastWeek.topItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-muted/40">
                <span className="text-sm font-medium text-foreground truncate flex-1 mr-4">{item.name}</span>
                <span className="text-sm font-semibold text-foreground shrink-0">{fmtExact$(item.cost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Invoice History Report ───────────────────────────────────────────────────

function InvoiceHistoryReport() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data, isLoading } = trpc.reports.invoiceHistory.useQuery({ limit: 100 });

  if (isLoading) return <ReportSkeleton />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<FileText size={40} className="text-muted-foreground/40" />}
        title="No invoices yet"
        description="Upload vendor invoices to see history here."
        action={<Link href="/invoices"><Button size="sm">Go to Invoices</Button></Link>}
      />
    );
  }

  const totalInvoiced = data.reduce((s: number, r: typeof data[0]) => s + (r.totalAmount ?? r.calculatedTotal), 0);
  const applied = data.filter((r: typeof data[0]) => r.status === "applied").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryCard label="Total Invoiced" value={fmt$(totalInvoiced)} sub={`${data.length} invoices`} />
        <SummaryCard label="Applied" value={String(applied)} sub={`${data.length - applied} pending`} />
        <SummaryCard
          label="Match Rate"
          value={`${Math.round(data.reduce((s, r) => s + r.matchedCount, 0) / Math.max(1, data.reduce((s, r) => s + r.lineCount, 0)) * 100)}%`}
          sub="Lines matched"
        />
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Invoice</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Vendor</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Stated</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Calculated</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Lines</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const gap = row.totalAmount !== null
                  ? Math.abs(row.totalAmount - row.calculatedTotal)
                  : null;
                const hasGap = gap !== null && gap > 1;
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedId(selectedId === row.id ? null : row.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{row.invoiceNumber ?? `#${row.id}`}</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(row.invoiceDate ?? row.appliedAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.vendor}</td>
                    <td className="px-4 py-3 text-right">
                      {row.totalAmount !== null ? fmtExact$(row.totalAmount) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-medium">{fmtExact$(row.calculatedTotal)}</div>
                      {hasGap && (
                        <div className="text-xs text-amber-600 flex items-center justify-end gap-1">
                          <AlertTriangle size={10} />
                          {fmtExact$(gap!)} gap
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {row.matchedCount}/{row.lineCount}
                      {row.unmatchedCount > 0 && (
                        <span className="text-xs text-amber-600 ml-1">({row.unmatchedCount} unmatched)</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gap explanation */}
      <p className="text-xs text-muted-foreground">
        <AlertTriangle size={12} className="inline mr-1 text-amber-500" />
        A gap between Stated and Calculated totals may indicate unmatched lines, items without catalog prices, or multi-page invoices uploaded separately.
        <Link href="/catalog" className="text-primary ml-1 hover:underline">Update item prices →</Link>
      </p>
    </div>
  );
}

// ─── Price Changes Report ─────────────────────────────────────────────────────

function PriceChangesReport() {
  const [days, setDays] = useState(90);
  const { data, isLoading } = trpc.reports.priceChanges.useQuery({ days });

  if (isLoading) return <ReportSkeleton />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<Tag size={40} className="text-muted-foreground/40" />}
        title="No price changes recorded"
        description="Price changes are tracked automatically when you re-upload an order guide with updated prices."
      />
    );
  }

  const increases = data.filter(r => r.diff > 0);
  const decreases = data.filter(r => r.diff < 0);
  const avgIncrease = increases.length > 0
    ? increases.reduce((s, r) => s + r.pctChange, 0) / increases.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryCard label="Price Increases" value={String(increases.length)} sub="Items went up" valueClass="text-destructive" />
        <SummaryCard label="Price Decreases" value={String(decreases.length)} sub="Items went down" valueClass="text-green-600" />
        <SummaryCard label="Avg Increase" value={fmtPct(avgIncrease)} sub="Of items that went up" />
      </div>

      <div className="flex gap-2">
        {[30, 60, 90, 180].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              days === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {d}d
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Item</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Old Price</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">New Price</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Change</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{row.itemName}</div>
                    {row.vendor && <div className="text-xs text-muted-foreground">{row.vendor}</div>}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmtExact$(row.oldPrice)}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmtExact$(row.newPrice)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("font-semibold", row.diff > 0 ? "text-destructive" : "text-green-600")}>
                      {row.diff > 0 ? "+" : ""}{fmtExact$(row.diff)} ({fmtPct(row.pctChange)})
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground text-xs">{fmtDate(row.changedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Count History Report ─────────────────────────────────────────────────────

function CountHistoryReport() {
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const { data, isLoading } = trpc.reports.countHistory.useQuery();
  const { data: detail, isLoading: detailLoading } = trpc.reports.countSessionDetail.useQuery(
    { sessionId: selectedSession! },
    { enabled: selectedSession !== null }
  );

  if (selectedSession !== null) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedSession(null)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
          Back to count history
        </button>

        {detailLoading ? (
          <ReportSkeleton />
        ) : detail ? (
          <CountSessionDetailView detail={detail} />
        ) : (
          <p className="text-muted-foreground text-sm">Session not found.</p>
        )}
      </div>
    );
  }

  if (isLoading) return <ReportSkeleton />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList size={40} className="text-muted-foreground/40" />}
        title="No completed counts"
        description="Complete an inventory count to see history here."
        action={<Link href="/count"><Button size="sm">Start Count</Button></Link>}
      />
    );
  }

  const totalCost = data.reduce((s: number, r: typeof data[0]) => s + r.totalCost, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Total Counts" value={String(data.length)} sub="Completed sessions" />
        <SummaryCard label="Latest Value" value={fmt$(data[0]?.totalCost ?? 0)} sub="Most recent count" />
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Items</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total Value</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Below Par</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr
                  key={row.sessionId}
                  className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setSelectedSession(row.sessionId)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{row.sessionName ?? `Count #${row.sessionId}`}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(row.completedAt ?? row.createdAt)}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{row.entryCount}</td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">{fmtExact$(row.totalCost)}</td>
                  <td className="px-4 py-3 text-right">
                    {row.belowParCount > 0 ? (
                      <span className="text-amber-600 font-medium">{row.belowParCount}</span>
                    ) : (
                      <span className="text-green-600">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight size={16} className="text-muted-foreground ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface CountSessionDetailData {
  session: { id: number; name: string | null; completedAt: Date | null; createdAt: Date };
  entries: Array<{
    itemId: number; itemName: string; vendor: string | null; category: string | null;
    quantity: number; unit: string; parLevel: number | null; price: number | null;
    totalCost: number | null; belowPar: boolean;
  }>;
}

function CountSessionDetailView({ detail }: { detail: CountSessionDetailData }) {
  if (!detail) return null;
  const { session, entries } = detail;

  // Group by category
  type CountEntry = CountSessionDetailData["entries"][number];
  const byCategory = entries.reduce((acc: Record<string, CountEntry[]>, e: CountEntry) => {
    const cat = e.category ?? "Uncategorized";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(e);
    return acc;
  }, {} as Record<string, CountEntry[]>);

  const totalValue = entries.reduce((s: number, e: CountEntry) => s + (e.totalCost ?? 0), 0);
  const belowPar = entries.filter((e: CountEntry) => e.belowPar).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-serif font-semibold text-foreground">
          {session.name ?? `Count #${session.id}`}
        </h2>
        <p className="text-sm text-muted-foreground">{fmtDate(session.completedAt ?? session.createdAt)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryCard label="Total Value" value={fmtExact$(totalValue)} sub={`${entries.length} items`} />
        <SummaryCard label="Below Par" value={String(belowPar)} sub="Need reorder" valueClass={belowPar > 0 ? "text-amber-600" : "text-green-600"} />
      </div>

      {Object.entries(byCategory).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]: [string, CountEntry[]]) => {
        const catTotal = items.reduce((s: number, e: CountEntry) => s + (e.totalCost ?? 0), 0);
        return (
          <div key={cat}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{cat}</h3>
              <span className="text-xs text-muted-foreground">{fmtExact$(catTotal)}</span>
            </div>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {items.map((entry) => (
                    <tr key={entry.itemId} className={cn(
                      "border-b border-border last:border-0",
                      entry.belowPar && "bg-amber-50 dark:bg-amber-950/20"
                    )}>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-foreground">{entry.itemName}</span>
                        {entry.belowPar && (
                          <span className="ml-2 text-xs text-amber-600 font-medium">↓ below par</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {entry.quantity.toFixed(2)} {entry.unit}
                        {entry.parLevel !== null && (
                          <span className="text-xs ml-1">/ {entry.parLevel} par</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-foreground">
                        {entry.totalCost !== null ? fmtExact$(entry.totalCost) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared UI Components ─────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, valueClass }: {
  label: string; value: string; sub?: string; valueClass?: string;
}) {
  return (
    <div className="rounded-xl bg-card border border-border px-4 py-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={cn("text-2xl font-bold text-foreground", valueClass)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    applied: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    review: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    cancelled: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize", map[status] ?? map.pending)}>
      {status}
    </span>
  );
}

function EmptyState({ icon, title, description, action }: {
  icon: React.ReactNode; title: string; description: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      {icon}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
      {action}
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

// ─── Main Reports Page ────────────────────────────────────────────────────────

export default function Reports() {
  const [activeTab, setActiveTab] = useState<ReportTab>("cogs");

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif font-semibold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Operational data from inventory counts, invoices, and price history
        </p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-1 justify-center",
              activeTab === tab.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Active tab label on mobile */}
      <div className="sm:hidden">
        <p className="text-xs text-muted-foreground font-medium">
          {TABS.find(t => t.id === activeTab)?.label} — {TABS.find(t => t.id === activeTab)?.description}
        </p>
      </div>

      {/* Report content */}
      <div>
        {activeTab === "cogs" && <WeeklyCogsReport />}
        {activeTab === "invoices" && <InvoiceHistoryReport />}
        {activeTab === "prices" && <PriceChangesReport />}
        {activeTab === "counts" && <CountHistoryReport />}
      </div>
    </div>
  );
}
