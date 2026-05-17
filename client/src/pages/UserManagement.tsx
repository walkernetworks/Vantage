import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Crown,
  ShieldOff,
  UserCheck,
  UserMinus,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UserManagement() {
  const { user: me } = useAuth();
  const utils = trpc.useUtils();

  const { data: users = [], isLoading } = trpc.adminUsers.list.useQuery();

  const setRoleMutation = trpc.adminUsers.setRole.useMutation({
    onSuccess: () => {
      utils.adminUsers.list.invalidate();
      toast.success("Role updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const setActiveMutation = trpc.adminUsers.setActive.useMutation({
    onSuccess: (_, vars) => {
      utils.adminUsers.list.invalidate();
      toast.success(vars.isActive ? "User reactivated" : "User deactivated");
    },
    onError: (e) => toast.error(e.message),
  });

  const isBusy = setRoleMutation.isPending || setActiveMutation.isPending;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif text-foreground">User Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create accounts for your team and manage their access levels here.
        </p>
      </div>

      {/* How it works callout */}
      <div className="bg-secondary border border-border rounded-2xl p-4 text-sm text-foreground space-y-1">
        <p className="font-semibold">How access works</p>
        <p>
          Use <strong>Add User</strong> to create an account for a new team member. Set their role to
          <strong>Admin</strong> (full access) or <strong>Employee</strong> (Count Sheet + Catering only).
          Deactivated accounts are blocked from signing in.
        </p>
      </div>

      {/* Stats row */}
      {!isLoading && users.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card rounded-2xl border border-border p-3 shadow-sm text-center">
            <p className="text-2xl font-bold text-foreground">{users.length}</p>
            <p className="text-xs text-muted-foreground font-medium">Total</p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-3 shadow-sm text-center">
            <p className="text-2xl font-bold text-primary">{users.filter((u) => u.role === "admin").length}</p>
            <p className="text-xs text-muted-foreground font-medium">Admins</p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-3 shadow-sm text-center">
            <p className="text-2xl font-bold text-accent">{users.filter((u) => u.isActive).length}</p>
            <p className="text-xs text-muted-foreground font-medium">Active</p>
          </div>
        </div>
      )}

      {/* User list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-2xl skeleton" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Users size={48} className="mx-auto text-muted-foreground/40" />
          <div>
            <p className="font-semibold text-foreground">No users yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Users appear here after they sign in for the first time.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => {
            const isMe = user.id === me?.id;
            const isAdmin = user.role === "admin";

            return (
              <div
                key={user.id}
                className={cn(
                  "bg-card rounded-2xl border shadow-sm p-4 transition-opacity",
                  !user.isActive && "opacity-60",
                  user.isActive ? "border-border" : "border-dashed border-border"
                )}
              >
                {/* Top row: avatar + name + badges */}
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div
                    className={cn(
                      "w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold shrink-0",
                      isAdmin
                        ? "bg-primary text-primary-foreground"
                        : "bg-accent text-accent-foreground"
                    )}
                  >
                    {user.name?.charAt(0)?.toUpperCase() ?? "?"}
                  </div>

                  {/* Name / email / meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground leading-tight">
                        {user.name ?? "Unknown"}
                        {isMe && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
                        )}
                      </p>
                      {/* Role badge */}
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full",
                          isAdmin
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "bg-muted text-muted-foreground border border-border"
                        )}
                      >
                        {isAdmin ? <Crown size={10} /> : <UserCheck size={10} />}
                        {isAdmin ? "Admin" : "Employee"}
                      </span>
                      {/* Active badge */}
                      {!user.isActive && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                          <XCircle size={10} />
                          Deactivated
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {user.email ?? "No email on file"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last sign-in: {timeAgo(user.lastSignedIn)}
                    </p>
                  </div>
                </div>

                {/* Action row */}
                {!isMe && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                    {/* Role toggle */}
                    <button
                      disabled={isBusy}
                      onClick={() =>
                        setRoleMutation.mutate({
                          userId: user.id,
                          role: isAdmin ? "user" : "admin",
                        })
                      }
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors active:scale-95",
                        isAdmin
                          ? "bg-muted text-foreground border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                          : "bg-primary/10 text-primary border-primary/20 hover:bg-primary hover:text-primary-foreground"
                      )}
                    >
                      {isAdmin ? (
                        <>
                          <ShieldOff size={13} />
                          Demote to Employee
                        </>
                      ) : (
                        <>
                          <Crown size={13} />
                          Promote to Admin
                        </>
                      )}
                    </button>

                    {/* Active toggle */}
                    <button
                      disabled={isBusy}
                      onClick={() =>
                        setActiveMutation.mutate({
                          userId: user.id,
                          isActive: !user.isActive,
                        })
                      }
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors active:scale-95",
                        user.isActive
                          ? "bg-muted text-foreground border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                          : "bg-accent/20 text-accent border-accent/30 hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      {user.isActive ? (
                        <>
                          <UserMinus size={13} />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={13} />
                          Reactivate
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Self-row note */}
                {isMe && (
                  <p className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground italic">
                    This is your account — role and status cannot be changed by yourself.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
