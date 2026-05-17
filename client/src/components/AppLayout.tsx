import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import { logoDataUrl } from "@/lib/logo";
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
    onSuccess: () => {
      window.location.href = "/login";
    },
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
    // Redirect to login page
    window.location.href = "/login";
    return null;
  }

  // Force password reset for users with mustResetPassword flag
  if ((user as any)?.mustResetPassword && location !== "/reset-password") {
    window.location.href = "/reset-password";
    return null;
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
                src={logoDataUrl}
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
            </button>

            {/* Dropdown menu */}
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-card border border-border rounded-2xl shadow-lg overflow-hidden z-50 animate-in slide-in-from-top-2 duration-150">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
                <div className="py-1">
                  <Link
                    href="/account"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <User size={16} className="text-muted-foreground" />
                    Account Settings
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin/users"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Users size={16} className="text-muted-foreground" />
                      User Management
                    </Link>
                  )}
                  {isAdmin && (
                    <Link
                      href="/settings"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Settings size={16} className="text-muted-foreground" />
                      App Settings
                    </Link>
                  )}
                </div>
                <div className="border-t border-border py-1">
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      logoutMutation.mutate();
                    }}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-muted transition-colors w-full text-left"
                  >
                    <LogOut size={16} />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Sidebar Drawer ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Drawer */}
          <div className="relative z-10 w-72 max-w-[85vw] bg-card h-full flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex flex-col items-center w-full gap-1">
                <img
                  src={logoDataUrl}
                  alt="Beignets & Brew"
                  className="h-24 w-auto object-contain"
                  style={{ maxWidth: "200px" }}
                />
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-xl hover:bg-muted transition-colors shrink-0"
                aria-label="Close menu"
              >
                <X size={20} className="text-muted-foreground" />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
              {visibleNav.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-4 px-4 py-3 rounded-xl transition-all",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    <span className={isActive ? "text-primary-foreground" : "text-muted-foreground"}>
                      {item.icon}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-sm">{item.label}</span>
                      <span className={cn("text-xs truncate", isActive ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {item.description}
                      </span>
                    </div>
                    {isActive && <ChevronRight size={16} className="ml-auto shrink-0 text-primary-foreground/70" />}
                  </Link>
                );
              })}
            </nav>

            {/* User info at bottom */}
            <div className="border-t border-border px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary-foreground">
                    {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{user?.name ?? "Employee"}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
                </div>
                <button
                  onClick={() => logoutMutation.mutate()}
                  className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"
                  aria-label="Sign out"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom Nav (mobile) ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border safe-bottom md:hidden">
        <div className="flex items-center justify-around px-2 py-2">
          {visibleNav.slice(0, 5).map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-0",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className={cn("transition-transform", isActive && "scale-110")}>
                  {item.icon}
                </span>
                <span className="text-[10px] font-medium truncate max-w-[56px]">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className="flex-1 pb-20 md:pb-0">
        {children}
      </main>
    </div>
  );
}
