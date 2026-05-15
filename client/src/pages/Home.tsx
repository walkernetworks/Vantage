import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Beer,
  Calculator,
  ChevronRight,
  ClipboardList,
  Package,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: allItems } = trpc.items.list.useQuery(undefined);
  const { data: sessions } = trpc.counts.listSessions.useQuery();
  const { data: belowPar } = trpc.orders.getBelowPar.useQuery(undefined, {
    enabled: isAdmin,
  });

  const totalItems = allItems?.length ?? 0;
  const totalSessions = sessions?.length ?? 0;
  const belowParCount = belowPar?.length ?? 0;

  const latestSession = sessions?.[0];

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
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
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Items"
            value={totalItems}
            icon={<Package size={18} />}
            color="bg-blue-50 text-blue-700"
          />
          <StatCard
            label="Sessions"
            value={totalSessions}
            icon={<ClipboardList size={18} />}
            color="bg-amber-50 text-amber-700"
          />
          <StatCard
            label="Below Par"
            value={belowParCount}
            icon={<TrendingDown size={18} />}
            color={belowParCount > 0 ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}
          />
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
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
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
            color="bg-amber-500"
            primary
          />
          <QuickActionCard
            href="/catering"
            icon={<Calculator size={24} />}
            title="Catering Calculator"
            description="Check stock for large orders"
            color="bg-teal-600"
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
                color="bg-blue-600"
                badge={belowParCount > 0 ? belowParCount : undefined}
              />
              <QuickActionCard
                href="/alcohol"
                icon={<Beer size={24} />}
                title="Alcohol Module"
                description="Manage categories 100 & 130"
                color="bg-purple-600"
              />
              <QuickActionCard
                href="/catalog"
                icon={<Package size={24} />}
                title="Item Catalog"
                description="Add, edit, or import items"
                color="bg-slate-600"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border p-3 shadow-sm text-center">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-2", color)}>
        {icon}
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
    </div>
  );
}

function QuickActionCard({
  href,
  icon,
  title,
  description,
  color,
  primary,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
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
            primary ? "bg-white/20" : color
          )}
        >
          <span className={primary ? "text-primary-foreground" : "text-white"}>{icon}</span>
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
