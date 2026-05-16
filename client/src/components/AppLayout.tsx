import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  ChevronRight,
  ClipboardList,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  User,
  Users,
  X,
} from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  description: string;
  hidden?: boolean;
}

const navItems: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: <BookOpen size={22} />,
    description: "Overview & quick stats",
  },
  {
    href: "/count",
    label: "Counts & History",
    icon: <ClipboardList size={22} />,
    description: "Enter counts & view history",
  },
  {
    href: "/catering",
    label: "Catering Calc",
    icon: <ShoppingCart size={22} />,
    description: "Check order shortfalls",
    hidden: true, // tabled for now
  },
  {
    href: "/catalog",
    label: "Item Catalog",
    icon: <Package size={22} />,
    adminOnly: true,
    description: "Manage inventory items",
  },
  {
    href: "/orders",
    label: "Order Dashboard",
    icon: <ShoppingCart size={22} />,
    adminOnly: true,
    description: "Below-par vendor orders",
  },
  {
    href: "/par-levels",
    label: "Par Levels",
    icon: <SlidersHorizontal size={22} />,
    adminOnly: true,
    description: "Set reorder thresholds",
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: <Users size={22} />,
    adminOnly: true,
    description: "Manage accounts & roles",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: <Settings size={22} />,
    adminOnly: true,
    description: "Categories, vendors, storage",
  },
];

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/"; },
    onError: () => toast.error("Logout failed"),
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto" />
          <p className="text-muted-foreground font-medium">Loading Beignets & Brew…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center space-y-8 animate-in">
          <div className="space-y-3">
            <div className="mx-auto w-72 max-w-full">
              <img
                src="/manus-storage/BBLogo-Cropped_d8c3a53e.png"
                alt="Beignets & Brew"
                className="w-full h-auto object-contain"
              />
            </div>
            <p className="text-muted-foreground mt-1">Inventory & Ordering System</p>
          </div>
          <div className="space-y-3">
            <a
              href={getLoginUrl()}
              className="btn-big w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:opacity-90 shadow-md"
            >
              Sign In to Continue
              <ChevronRight size={18} />
            </a>
            <p className="text-xs text-muted-foreground">Secure login via Manus OAuth</p>
          </div>
        </div>
      </div>
    );
  }

  const isAdmin = user?.role === "admin";
  const visibleNav = navItems.filter((item) => !item.hidden && (!item.adminOnly || isAdmin));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top Header ── */}
      <header className="sticky top-0 z-40 bg-card border-b border-border shadow-sm safe-top">
        <div className="flex items-center justify-between h-20 px-4">
          {/* Left: hamburger + logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-xl hover:bg-muted transition-colors active:scale-95"
              aria-label="Open menu"
            >
              <Menu size={24} className="text-foreground" />
            </button>
            <Link href="/" className="flex items-center">
              <img
                src="/manus-storage/BBLogo-Cropped_d8c3a53e.png"
                alt="Beignets & Brew"
                className="h-16 w-auto object-contain"
                style={{ maxWidth: "220px" }}
              />
            </Link>
          </div>

          {/* Right: user dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-muted transition-colors active:scale-95"
              aria-label="User menu"
            >
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-primary-foreground">
                  {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
                </span>
              </div>
              <div className="hidden sm:flex flex-col items-start leading-tight">
                <span className="text-sm font-semibold text-foreground max-w-[120px] truncate">
                  {user?.name ?? "Employee"}
                </span>
                {isAdmin && (
                  <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">Admin</span>
                )}
              </div>
              <ChevronRight
                size={16}
                className={cn(
                  "text-muted-foreground transition-transform duration-200 hidden sm:block",
                  dropdownOpen && "rotate-90"
                )}
              />
            </button>

            {/* Dropdown panel */}
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-card border border-border rounded-2xl shadow-lg overflow-hidden z-50 animate-in">
                {/* User info header */}
                <div className="px-4 py-3 border-b border-border bg-muted/40">
                  <p className="text-sm font-semibold text-foreground truncate">{user?.name ?? "Employee"}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
                  {isAdmin && (
                    <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground uppercase tracking-wide">
                      Admin
                    </span>
                  )}
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <Link
                    href="/account"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <User size={16} className="text-muted-foreground shrink-0" />
                    Account Settings
                  </Link>

                  {isAdmin && (
                    <Link
                      href="/admin/users"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Users size={16} className="text-muted-foreground shrink-0" />
                      User Management
                    </Link>
                  )}

                  {isAdmin && (
                    <Link
                      href="/settings"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Settings size={16} className="text-muted-foreground shrink-0" />
                      App Settings
                    </Link>
                  )}
                </div>

                <div className="border-t border-border py-1">
                  <button
                    onClick={() => { setDropdownOpen(false); logoutMutation.mutate(); }}
                    disabled={logoutMutation.isPending}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut size={16} className="shrink-0" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Mobile Sidebar Overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar Drawer ── */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-72 bg-card shadow-lg flex flex-col transition-transform duration-300 ease-out safe-top",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <img
              src="/manus-storage/BBLogo-Cropped_d8c3a53e.png"
              alt="Beignets & Brew"
              className="h-24 w-auto object-contain"
              style={{ maxWidth: "210px" }}
            />
            <p className="text-xs text-muted-foreground truncate">{user?.name ?? "Employee"}</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-xl hover:bg-muted transition-colors shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {visibleNav.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-150",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground hover:bg-muted active:scale-98"
                )}
              >
                <span className={isActive ? "text-primary-foreground" : "text-muted-foreground"}>
                  {item.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{item.label}</p>
                  <p
                    className={cn(
                      "text-xs truncate",
                      isActive ? "text-primary-foreground/70" : "text-muted-foreground"
                    )}
                  >
                    {item.description}
                  </p>
                </div>
                {isActive && <ChevronRight size={16} className="text-primary-foreground/70 shrink-0" />}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-border safe-bottom">
          <button
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-colors active:scale-97"
          >
            <LogOut size={20} />
            <span className="font-semibold text-sm">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Bottom Tab Bar (Mobile) ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border safe-bottom md:hidden">
        <div className="flex items-center justify-around h-16 px-2">
          {visibleNav.slice(0, 5).map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-150 min-w-0",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <span className={cn("transition-transform", isActive && "scale-110")}>
                  {item.icon}
                </span>
                <span className="text-[10px] font-semibold truncate max-w-[56px] text-center leading-none">
                  {item.label.split(" ")[0]}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className="flex-1 pb-20 md:pb-6">
        <div className="animate-in">{children}</div>
      </main>
    </div>
  );
}
