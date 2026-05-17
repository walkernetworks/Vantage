import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { LogOut, Mail, Shield, User } from "lucide-react";
import { toast } from "sonner";

export default function AccountSettings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/"; },
    onError: () => toast.error("Logout failed"),
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Account Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your profile and access information for Beignets & Brew.
        </p>
      </div>

      {/* Profile Card */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User size={18} className="text-primary" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="text-2xl font-bold text-primary-foreground">
                {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
              </span>
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">{user?.name ?? "—"}</p>
              <div className="flex items-center gap-2 mt-1">
                {isAdmin ? (
                  <Badge className="bg-primary text-primary-foreground text-xs uppercase tracking-wide">
                    Admin
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs uppercase tracking-wide">
                    Employee
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Email */}
          <div className="flex items-start gap-3">
            <Mail size={16} className="text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Email</p>
              <p className="text-sm text-foreground">{user?.email ?? "—"}</p>
            </div>
          </div>

          {/* Role */}
          <div className="flex items-start gap-3">
            <Shield size={16} className="text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Role</p>
              <p className="text-sm text-foreground capitalize">{user?.role ?? "employee"}</p>
              {isAdmin ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  You have full access to all features including item management, ordering, and user administration.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">
                  You can perform inventory counts and view the dashboard. Contact an admin to request elevated access.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Access Permissions Card */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield size={18} className="text-primary" />
            Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { label: "View Dashboard", allowed: true },
              { label: "Perform Inventory Counts", allowed: true },
              { label: "View Count History", allowed: true },
              { label: "Manage Item Catalog", allowed: isAdmin },
              { label: "View Order Dashboard", allowed: isAdmin },
              { label: "Manage Par Levels", allowed: isAdmin },
              { label: "Manage Users", allowed: isAdmin },
              { label: "App Settings", allowed: isAdmin },
            ].map(({ label, allowed }) => (
              <div key={label} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-foreground">{label}</span>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    allowed
                      ? "bg-emerald/20 text-emerald"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {allowed ? "Allowed" : "Restricted"}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Session Card */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <LogOut size={18} className="text-destructive" />
            Session
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            You are currently signed in. Signing out will end your session and redirect you to the login page.
          </p>
          <button
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors font-semibold text-sm active:scale-97"
          >
            <LogOut size={16} />
            {logoutMutation.isPending ? "Signing out…" : "Sign Out"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
