import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, KeyRound, Eye, EyeOff } from "lucide-react";

type User = {
  id: number;
  name: string | null;
  email: string | null;
  role: "user" | "admin";
  isActive: boolean;
  createdAt: Date;
};

export default function UserManagement() {
  const utils = trpc.useUtils();

  const { data: users = [], isLoading } = trpc.adminUsers.list.useQuery();

  // ── Add User dialog state ──────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [showNewPw, setShowNewPw] = useState(false);

  // ── Reset Password dialog state ────────────────────────────────────────────
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPassword, setResetPw] = useState("");
  const [showResetPw, setShowResetPw] = useState(false);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createUserMutation = trpc.adminUsers.createUser.useMutation({
    onSuccess: (data) => {
      toast.success(`Account created for ${data.user?.name ?? newEmail}`);
      utils.adminUsers.list.invalidate();
      setAddOpen(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("user");
    },
    onError: (err) => toast.error(err.message || "Failed to create user"),
  });

  const resetPasswordMutation = trpc.adminUsers.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("Password updated successfully");
      setResetTarget(null);
      setResetPw("");
    },
    onError: (err) => toast.error(err.message || "Failed to reset password"),
  });

  const setRoleMutation = trpc.adminUsers.setRole.useMutation({
    onSuccess: () => utils.adminUsers.list.invalidate(),
    onError: (err) => toast.error(err.message || "Failed to update role"),
  });

  const setActiveMutation = trpc.adminUsers.setActive.useMutation({
    onSuccess: () => utils.adminUsers.list.invalidate(),
    onError: (err) => toast.error(err.message || "Failed to update status"),
  });

  function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim() || !newPassword) return;
    createUserMutation.mutate({
      name: newName.trim(),
      email: newEmail.trim(),
      password: newPassword,
      role: newRole,
    });
  }

  function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget || !resetPassword) return;
    resetPasswordMutation.mutate({ userId: resetTarget.id, newPassword: resetPassword });
  }

  const admins = users.filter((u) => u.role === "admin" && u.isActive).length;
  const employees = users.filter((u) => u.role === "user" && u.isActive).length;
  const inactive = users.filter((u) => !u.isActive).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create accounts for your team and manage their access levels here.
          </p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="shrink-0 flex items-center gap-2"
        >
          <UserPlus size={16} />
          Add User
        </Button>
      </div>

      {/* How it works callout */}
      <div className="bg-secondary border border-border rounded-2xl p-4 text-sm text-foreground space-y-1">
        <p className="font-semibold">How access works</p>
        <p>
          Use <strong>Add User</strong> to create an account for a new team member. Set their role to{" "}
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
            <p className="text-2xl font-bold text-foreground">{admins}</p>
            <p className="text-xs text-muted-foreground font-medium">Admins</p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-3 shadow-sm text-center">
            <p className="text-2xl font-bold text-foreground">{employees}</p>
            <p className="text-xs text-muted-foreground font-medium">Employees</p>
          </div>
        </div>
      )}

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
          {users.map((user) => (
            <div
              key={user.id}
              className={`bg-card rounded-2xl border border-border p-4 shadow-sm transition-opacity ${
                !user.isActive ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground truncate">
                      {user.name ?? "(no name)"}
                    </span>
                    <Badge
                      variant={user.role === "admin" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {user.role === "admin" ? "Admin" : "Employee"}
                    </Badge>
                    {!user.isActive && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">
                    {user.email ?? "—"}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {/* Reset Password */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs flex items-center gap-1"
                    onClick={() => {
                      setResetTarget(user as User);
                      setResetPw("");
                      setShowResetPw(false);
                    }}
                  >
                    <KeyRound size={12} />
                    Reset PW
                  </Button>

                  {/* Promote / Demote */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={setRoleMutation.isPending}
                    onClick={() =>
                      setRoleMutation.mutate({
                        userId: user.id,
                        role: user.role === "admin" ? "user" : "admin",
                      })
                    }
                  >
                    {user.role === "admin" ? "Demote" : "Promote"}
                  </Button>

                  {/* Activate / Deactivate */}
                  <Button
                    variant={user.isActive ? "destructive" : "outline"}
                    size="sm"
                    className="text-xs"
                    disabled={setActiveMutation.isPending}
                    onClick={() =>
                      setActiveMutation.mutate({ userId: user.id, isActive: !user.isActive })
                    }
                  >
                    {user.isActive ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {inactive > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {inactive} inactive account{inactive !== 1 ? "s" : ""} hidden from stats
        </p>
      )}

      {/* ── Add User Dialog ──────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-name">Full Name</Label>
              <Input
                id="new-name"
                placeholder="Jane Smith"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-email">Email</Label>
              <Input
                id="new-email"
                type="email"
                placeholder="jane@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPw ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowNewPw((v) => !v)}
                  tabIndex={-1}
                >
                  {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-role">Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as "user" | "admin")}>
                <SelectTrigger id="new-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Employee — Count Sheet &amp; Catering only</SelectItem>
                  <SelectItem value="admin">Admin — Full access</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? "Creating…" : "Create Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Reset Password Dialog ────────────────────────────────────────── */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Setting a new password for <strong>{resetTarget?.name ?? resetTarget?.email}</strong>.
          </p>
          <form onSubmit={handleResetPassword} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="reset-password">New Password</Label>
              <div className="relative">
                <Input
                  id="reset-password"
                  type={showResetPw ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={resetPassword}
                  onChange={(e) => setResetPw(e.target.value)}
                  required
                  minLength={8}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowResetPw((v) => !v)}
                  tabIndex={-1}
                >
                  {showResetPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={resetPasswordMutation.isPending}>
                {resetPasswordMutation.isPending ? "Saving…" : "Update Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
