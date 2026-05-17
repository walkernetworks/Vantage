import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  UserPlus,
  ShieldCheck,
  UserX,
  UserCheck,
  KeyRound,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─── Permission definitions ───────────────────────────────────────────────────

const ALL_PERMISSIONS = [
  { key: "view_inventory",  label: "View Inventory",  description: "Can see the item catalogue" },
  { key: "edit_inventory",  label: "Edit Inventory",  description: "Can add, edit, and delete items" },
  { key: "count_sheet",     label: "Count Sheet",     description: "Can perform inventory counts" },
  { key: "place_orders",    label: "Place Orders",    description: "Can view and export order dashboards" },
  { key: "catering",        label: "Catering",        description: "Can access catering recipes and calculator" },
  { key: "reports",         label: "Reports",         description: "Can view analytics and reports" },
  { key: "settings",        label: "Settings",        description: "Can manage categories, vendors, storage areas" },
  { key: "user_management", label: "User Management", description: "Can manage users and permissions" },
] as const;

function getEffectivePermissions(role: string, permissions: string[] | null): string[] {
  if (role === "admin") return ALL_PERMISSIONS.map((p) => p.key);
  return permissions ?? [];
}

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="ml-2 p-1 rounded hover:bg-white/20 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
    </button>
  );
}

// ─── Permission toggles panel ─────────────────────────────────────────────────

function PermissionToggles({
  userId,
  role,
  currentPermissions,
  onUpdated,
}: {
  userId: number;
  role: string;
  currentPermissions: string[] | null;
  onUpdated: () => void;
}) {
  const isAdmin = role === "admin";
  const effective = getEffectivePermissions(role, currentPermissions);

  const updatePermissions = trpc.adminUsers.updatePermissions.useMutation({
    onSuccess: () => {
      toast.success("Permissions updated");
      onUpdated();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggle = (key: string) => {
    if (isAdmin) return;
    const next = effective.includes(key)
      ? effective.filter((p) => p !== key)
      : [...effective, key];
    updatePermissions.mutate({ userId, permissions: next });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 p-3 rounded-xl bg-muted/50 border border-border">
      {ALL_PERMISSIONS.map((perm) => {
        const enabled = effective.includes(perm.key);
        return (
          <div key={perm.key} className="flex items-center justify-between gap-2 py-1">
            <div className="min-w-0">
              <p className="text-sm font-medium">{perm.label}</p>
              <p className="text-xs text-muted-foreground">{perm.description}</p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={() => toggle(perm.key)}
              disabled={isAdmin || updatePermissions.isPending}
              className="shrink-0"
            />
          </div>
        );
      })}
      {isAdmin && (
        <p className="col-span-2 text-xs text-muted-foreground italic mt-1">
          Admins automatically have all permissions.
        </p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const utils = trpc.useUtils();

  const { data: users = [], isLoading } = trpc.adminUsers.list.useQuery();

  // Expanded permission rows
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const toggleExpand = (id: number) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Create user dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState<"user" | "admin">("user");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState("");

  const createUser = trpc.adminUsers.createUser.useMutation({
    onSuccess: (data) => {
      setTempPassword(data.tempPassword);
      setCreatedName(createName);
      utils.adminUsers.list.invalidate();
      setCreateName("");
      setCreateEmail("");
      setCreateRole("user");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!createName.trim() || !createEmail.trim()) return;
    createUser.mutate({ name: createName.trim(), email: createEmail.trim(), role: createRole });
  };

  // Reset password dialog
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetUserName, setResetUserName] = useState("");
  const [resetTempPassword, setResetTempPassword] = useState<string | null>(null);

  const resetPasswordMutation = trpc.adminUsers.resetPassword.useMutation({
    onSuccess: (data) => {
      setResetTempPassword(data.tempPassword);
      utils.adminUsers.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleReset = () => {
    if (resetUserId == null) return;
    resetPasswordMutation.mutate({ userId: resetUserId });
  };

  // Role / active mutations
  const setRole = trpc.adminUsers.setRole.useMutation({
    onSuccess: () => utils.adminUsers.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const setActive = trpc.adminUsers.setActive.useMutation({
    onSuccess: () => utils.adminUsers.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const totalUsers = users.length;
  const adminCount = users.filter((u) => u.role === "admin").length;
  const employeeCount = users.filter((u) => u.role !== "admin").length;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Comfortaa, sans-serif" }}>
            Team Members
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create accounts and control what each person can access.
          </p>
        </div>
        <Button
          onClick={() => {
            setShowCreate(true);
            setTempPassword(null);
          }}
          className="gap-2"
        >
          <UserPlus size={16} />
          Add User
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Total", value: totalUsers },
          { label: "Admins", value: adminCount },
          { label: "Employees", value: employeeCount },
        ].map(({ label, value }) => (
          <div key={label} className="bg-card rounded-2xl border border-border p-4 text-center shadow-sm">
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* User list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card rounded-2xl border border-border p-4 animate-pulse h-20" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No users yet. Click <strong>Add User</strong> to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((u) => {
            const isCurrentUser = u.id === currentUser?.id;
            const isExpanded = expandedRows.has(u.id);
            return (
              <div
                key={u.id}
                className={`bg-card rounded-2xl border border-border p-4 shadow-sm transition-opacity ${
                  !u.isActive ? "opacity-50" : ""
                }`}
              >
                {/* Top row */}
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">{u.name ?? "—"}</span>
                      <Badge
                        variant={u.role === "admin" ? "default" : "secondary"}
                        className="text-xs shrink-0"
                      >
                        {u.role === "admin" ? "Admin" : "Employee"}
                      </Badge>
                      {!u.isActive && (
                        <Badge variant="destructive" className="text-xs shrink-0">
                          Inactive
                        </Badge>
                      )}
                      {(u as any).mustResetPassword && (
                        <Badge
                          variant="outline"
                          className="text-xs shrink-0 border-amber-400 text-amber-500"
                        >
                          Must Reset PW
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">{u.email}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      Last sign-in:{" "}
                      {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString() : "Never"}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleExpand(u.id)}
                      className="gap-1 text-xs"
                    >
                      Permissions
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setResetUserId(u.id);
                        setResetUserName(u.name ?? u.email ?? "user");
                        setResetTempPassword(null);
                      }}
                      className="gap-1 text-xs"
                    >
                      <KeyRound size={12} />
                      Reset PW
                    </Button>

                    {!isCurrentUser && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setRole.mutate({
                            userId: u.id,
                            role: u.role === "admin" ? "user" : "admin",
                          })
                        }
                        disabled={setRole.isPending}
                        className="gap-1 text-xs"
                      >
                        <ShieldCheck size={12} />
                        {u.role === "admin" ? "Demote" : "Promote"}
                      </Button>
                    )}

                    {!isCurrentUser && (
                      <Button
                        size="sm"
                        variant={u.isActive ? "destructive" : "outline"}
                        onClick={() =>
                          setActive.mutate({ userId: u.id, isActive: !u.isActive })
                        }
                        disabled={setActive.isPending}
                        className="gap-1 text-xs"
                      >
                        {u.isActive ? <UserX size={12} /> : <UserCheck size={12} />}
                        {u.isActive ? "Deactivate" : "Reactivate"}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Permissions panel */}
                {isExpanded && (
                  <PermissionToggles
                    userId={u.id}
                    role={u.role}
                    currentPermissions={(u as any).permissions as string[] | null}
                    onUpdated={() => utils.adminUsers.list.invalidate()}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create User Dialog ── */}
      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreate(false);
            setTempPassword(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
          </DialogHeader>

          {tempPassword ? (
            <div className="space-y-4">
              <p className="text-sm">
                Account created for <strong>{createdName}</strong>. Share this temporary password —
                they will be prompted to change it on first login.
              </p>
              <div className="flex items-center justify-between rounded-xl px-4 py-3 font-mono text-lg font-bold bg-muted border border-border">
                <span>{tempPassword}</span>
                <CopyButton text={tempPassword} />
              </div>
              <p className="text-xs text-muted-foreground">
                This password will not be shown again. Copy it now.
              </p>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setShowCreate(false);
                    setTempPassword(null);
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Full Name</Label>
                <Input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Jane Smith"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Email Address</Label>
                <Input
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Role</Label>
                <Select
                  value={createRole}
                  onValueChange={(v) => setCreateRole(v as "user" | "admin")}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Employee — limited access</SelectItem>
                    <SelectItem value="admin">Admin — full access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                A temporary password will be generated automatically. The user will be required to
                set a new password on first login.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={
                    createUser.isPending || !createName.trim() || !createEmail.trim()
                  }
                >
                  {createUser.isPending ? "Creating…" : "Create Account"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Reset Password Dialog ── */}
      <Dialog
        open={resetUserId != null}
        onOpenChange={(open) => {
          if (!open) {
            setResetUserId(null);
            setResetTempPassword(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>

          {resetTempPassword ? (
            <div className="space-y-4">
              <p className="text-sm">
                Password reset for <strong>{resetUserName}</strong>. Share this temporary password —
                they will be prompted to change it on next login.
              </p>
              <div className="flex items-center justify-between rounded-xl px-4 py-3 font-mono text-lg font-bold bg-muted border border-border">
                <span>{resetTempPassword}</span>
                <CopyButton text={resetTempPassword} />
              </div>
              <p className="text-xs text-muted-foreground">This password will not be shown again.</p>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setResetUserId(null);
                    setResetTempPassword(null);
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm">
                This will generate a new temporary password for{" "}
                <strong>{resetUserName}</strong>. They will be required to set a new password on
                next login.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResetUserId(null)}>
                  Cancel
                </Button>
                <Button onClick={handleReset} disabled={resetPasswordMutation.isPending}>
                  {resetPasswordMutation.isPending ? "Resetting…" : "Generate New Password"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
