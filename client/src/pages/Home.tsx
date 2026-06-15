import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Calculator,
  ChevronRight,
  ClipboardList,
  Package,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  DollarSign,
  BarChart3,
} from "lucide-react";
import { Link } from "wouter";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";

// Brand palette colours
const BRAND_COLORS = [
  "#ff7a6e", // coral / primary
  "#57b296", // emerald
  "#73d0d1", // teal
  "#fcccc8", // soft pink
  "#d3e5df", // mint
  "#f4a261", // warm orange
  "#a8dadc", // light teal
  "#e9c46a", // gold
  "#264653", // dark teal
  "#2a9d8f", // medium teal
];

export default function Home() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: allItems } = trpc.items.list.useQuery(undefined);
  const { data: sessions } = trpc.counts.listSessions.useQuery();
  const { data: belowParResult } = trpc.orders.getBelowPar.useQuery(undefined, {
    enabled: isAdmin,
  });
  const { data: metrics, isLoading: metricsLoading } = trpc.dashboard.metrics.useQuery(undefined, {
    enabled: isAdmin,
  });

  const belowParItems = Array.isArray(belowParResult)
    ? belowParResult
    : (belowParResult?.items ?? []);

  const totalItems = allItems?.length ?? 0;
  const totalSessions = sessions?.length ?? 0;
  const belowParCount = belowParItems.length;
  const latestSession = sessions?.[0];

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // ── Derived chart data ──────────────────────────────────────────────────────

  // Total inventory value — three figures
  const allCategories = metrics?.inventoryValueByCategory ?? [];
  const pricedCategories = allCategories.filter((c) => (c.fullParValue ?? c.totalValue) > 0);
  const unpricedCategories = allCategories.filter((c) => (c.fullParValue ?? c.totalValue) === 0);
  const totalCurrentStockValue = pricedCategories.reduce((sum, c) => sum + (c.currentStockValue ?? 0), 0);
  const totalFullParValue = pricedCategories.reduce((sum, c) => sum + (c.fullParValue ?? c.totalValue), 0);
  const totalGapToFullPar = Math.max(0, totalFullParValue - totalCurrentStockValue);
  const totalInventoryValue = totalCurrentStockValue; // keep for legacy compat
  const totalUnpricedItems = unpricedCategories.reduce((sum, c) => sum + c.itemCount, 0);

  // Price fluctuations: pivot by month, one series per vendor
  const vendors = Array.from(
    new Set(metrics?.priceFluctuationsByVendor.map((r) => r.importSource) ?? [])
  );
  const priceMonths = Array.from(
    new Set(metrics?.priceFluctuationsByVendor.map((r) => r.month) ?? [])
  ).sort();
  const priceChartData = priceMonths.map((month) => {
    const row: Record<string, string | number> = { month: month.slice(0, 7) };
    for (const vendor of vendors) {
      const entry = metrics?.priceFluctuationsByVendor.find(
        (r) => r.month === month && r.importSource === vendor
      );
      row[vendor] = entry?.changePct ?? 0;
    }
    return row;
  });

  const priceChartConfig: ChartConfig = Object.fromEntries(
    vendors.map((v, i) => [v, { label: v, color: BRAND_COLORS[i % BRAND_COLORS.length] }])
  );

  // Order cost trend
  const orderCostConfig: ChartConfig = {
    estimatedCost: { label: "Est. Order Cost", color: "#ff7a6e" },
  };

  // Inventory donut — only priced categories
  const inventoryConfig: ChartConfig = Object.fromEntries(
    pricedCategories.map((c, i) => [
      c.category,
      { label: c.category, color: BRAND_COLORS[i % BRAND_COLORS.length] },
    ])
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
      {/* ── Welcome Header ── */}
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm font-medium">{greeting},</p>
        <h1 className="text-2xl font-serif text-foreground">
          {user?.name?.split(" ")[0] ?? "Welcome"} 👋
        </h1>
        <p className="text-muted-foreground text-sm">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* ── Stats Row (Admin only) ── */}
      {isAdmin && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total Items"
            value={totalItems}
            icon={<Package size={18} />}
            color="bg-muted text-foreground"
          />
          <StatCard
            label="Count Sessions"
            value={totalSessions}
            icon={<ClipboardList size={18} />}
            color="bg-secondary text-secondary-foreground"
          />
          <StatCard
            label="Below Par"
            value={belowParCount}
            icon={<TrendingDown size={18} />}
            color={belowParCount > 0 ? "bg-destructive/10 text-destructive" : "bg-accent/20 text-accent"}
          />
          <StatCard
            label="Current Stock"
            value={`$${totalCurrentStockValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
            icon={<DollarSign size={18} />}
            color="bg-primary/10 text-primary"
            isText
          />
        </div>
      )}

      {/* ── Analytics Charts (Admin only) ── */}
      {isAdmin && (
        <div className="space-y-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <BarChart3 size={16} />
            Analytics
          </h2>

          {metricsLoading ? (
            <div className="grid grid-cols-1 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-card rounded-2xl border border-border p-5 h-48 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5">

              {/* ── Chart 1: Inventory Value by Category (Donut) ── */}
              <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
                <div className="mb-4">
                  <h3 className="font-semibold text-foreground">Inventory Value by Category</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Based on latest count session
                  </p>
                  {/* ── Three-figure summary ── */}
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div className="bg-muted/40 rounded-xl p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-0.5">Current Stock</p>
                      <p className="text-sm font-bold text-foreground">${totalCurrentStockValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                    </div>
                    <div className="bg-muted/40 rounded-xl p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-0.5">Full Par Value</p>
                      <p className="text-sm font-bold text-foreground">${totalFullParValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                    </div>
                    <div className="bg-destructive/10 rounded-xl p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-0.5">Gap to Full Par</p>
                      <p className="text-sm font-bold text-destructive">${totalGapToFullPar.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                    </div>
                  </div>
                </div>
                {pricedCategories.length === 0 ? (
                  <EmptyChart message="No inventory data yet. Import items with prices to see this chart." />
                ) : (
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="w-full sm:w-56 h-56 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pricedCategories}
                            dataKey="totalValue"
                            nameKey="category"
                            cx="50%"
                            cy="50%"
                            innerRadius="55%"
                            outerRadius="80%"
                            paddingAngle={2}
                          >
                            {pricedCategories.map((entry, i) => (
                              <Cell
                                key={entry.category}
                                fill={BRAND_COLORS[i % BRAND_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number) =>
                              [`$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, "Value"]
                            }
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-2 w-full">
                      {pricedCategories.map((entry, i) => (
                        <div key={entry.category} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: BRAND_COLORS[i % BRAND_COLORS.length] }}
                            />
                            <span className="text-sm text-foreground truncate">{entry.category}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-sm font-semibold text-foreground">
                              ${(entry.currentStockValue ?? entry.totalValue).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1">
                              / ${(entry.fullParValue ?? entry.totalValue).toLocaleString("en-US", { maximumFractionDigits: 0 })} par
                            </span>
                          </div>
                        </div>
                      ))}
                      {totalUnpricedItems > 0 && (
                        <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                          {totalUnpricedItems} item{totalUnpricedItems !== 1 ? "s" : ""} have no price set and are excluded from this chart.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Chart 2: Estimated Order Cost Trend (Bar) ── */}
              <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
                <div className="mb-4">
                  <h3 className="font-semibold text-foreground">Estimated Order Cost Trend</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Monthly estimated cost based on items below par at each count session
                  </p>
                </div>
                {(metrics?.orderCostTrend.length ?? 0) === 0 ? (
                  <EmptyChart message="No count sessions yet. Complete a count to see order cost trends." />
                ) : (
                  <ChartContainer config={orderCostConfig} className="h-52 w-full aspect-auto">
                    <BarChart data={metrics!.orderCostTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: string) => {
                          const [yr, mo] = v.split("-");
                          return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(mo) - 1]} ${yr?.slice(2)}`;
                        }}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
                        width={52}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value) =>
                              `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                            }
                          />
                        }
                      />
                      <Bar dataKey="estimatedCost" fill="#ff7a6e" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                )}
              </div>

              {/* ── Chart 3: Price Fluctuations by Distributor (Line) ── */}
              <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
                <div className="mb-4">
                  <h3 className="font-semibold text-foreground">Item Price Fluctuations by Distributor</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Average monthly price change % per distributor over the last 12 months
                  </p>
                </div>
                {priceChartData.length === 0 ? (
                  <EmptyChart message="No price history yet. Import a vendor spreadsheet to track price changes." />
                ) : (
                  <ChartContainer config={priceChartConfig} className="h-56 w-full aspect-auto">
                    <LineChart data={priceChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: string) => {
                          const [yr, mo] = v.split("-");
                          return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(mo) - 1]} ${yr?.slice(2)}`;
                        }}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}%`}
                        width={48}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value) => `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(1)}%`}
                          />
                        }
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                      />
                      {vendors.map((vendor, i) => (
                        <Line
                          key={vendor}
                          type="monotone"
                          dataKey={vendor}
                          stroke={BRAND_COLORS[i % BRAND_COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      ))}
                    </LineChart>
                  </ChartContainer>
                )}
              </div>

            </div>
          )}
        </div>
      )}

      {/* ── Latest Count Session ── */}
      {latestSession && (
        <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Latest Count
            </p>
            <span
              className={cn(
                "text-xs font-semibold px-2 py-0.5 rounded-full",
                latestSession.completedAt
                  ? "bg-accent/20 text-accent"
                  : "bg-secondary text-secondary-foreground"
              )}
            >
              {latestSession.completedAt ? "Completed" : "In Progress"}
            </span>
          </div>
          <p className="font-semibold text-foreground">
            {latestSession.name ?? "Inventory Count"}
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date(latestSession.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
          <Link href="/count">
            <button className="mt-3 w-full btn-big bg-primary text-primary-foreground flex items-center justify-center gap-2">
              {latestSession.completedAt ? "Start New Count" : "Continue Count"}
              <ChevronRight size={18} />
            </button>
          </Link>
        </div>
      )}

      {/* ── Quick Actions ── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Quick Actions
        </h2>

        <div className="grid grid-cols-1 gap-3">
          <QuickActionCard
            href="/count"
            icon={<ClipboardList size={24} />}
            title="Count Sheet"
            description="Enter current stock for all items"
            iconBg="bg-primary"
            primary
          />
          <QuickActionCard
            href="/catering"
            icon={<Calculator size={24} />}
            title="Catering Calculator"
            description="Check stock for large orders"
            iconBg="bg-accent"
          />
          {isAdmin && (
            <>
              <QuickActionCard
                href="/orders"
                icon={<ShoppingCart size={24} />}
                title="Order Dashboard"
                description={
                  belowParCount > 0
                    ? `${belowParCount} items below par — action needed`
                    : "All items at or above par"
                }
                iconBg="bg-ring"
                badge={belowParCount > 0 ? belowParCount : undefined}
              />
              <QuickActionCard
                href="/catalog"
                icon={<Package size={24} />}
                title="Item Catalog"
                description="Add, edit, or import items"
                iconBg="bg-muted-foreground/60"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-40 flex flex-col items-center justify-center text-center gap-2">
      <TrendingUp size={32} className="text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
  isText,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  isText?: boolean;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border p-3 shadow-sm text-center">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-2", color)}>
        {icon}
      </div>
      <p className={cn("font-bold text-foreground", isText ? "text-base" : "text-xl")}>{value}</p>
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
    </div>
  );
}

function QuickActionCard({
  href,
  icon,
  title,
  description,
  iconBg,
  primary,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  iconBg: string;
  primary?: boolean;
  badge?: number;
}) {
  return (
    <Link href={href}>
      <div
        className={cn(
          "flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 active:scale-[0.98] cursor-pointer card-hover",
          primary
            ? "bg-primary text-primary-foreground border-primary shadow-md"
            : "bg-card text-foreground border-border shadow-sm"
        )}
      >
        <div
          className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
            primary ? "bg-white/20" : iconBg
          )}
        >
          <span className="text-white">{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("font-semibold text-base", primary ? "text-primary-foreground" : "text-foreground")}>
            {title}
          </p>
          <p
            className={cn(
              "text-sm mt-0.5 truncate",
              primary ? "text-primary-foreground/70" : "text-muted-foreground"
            )}
          >
            {description}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {badge !== undefined && badge > 0 && (
            <span className="w-6 h-6 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center">
              {badge}
            </span>
          )}
          <ChevronRight
            size={20}
            className={primary ? "text-primary-foreground/70" : "text-muted-foreground"}
          />
        </div>
      </div>
    </Link>
  );
}
