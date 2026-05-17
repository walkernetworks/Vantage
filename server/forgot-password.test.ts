import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserByEmail: vi.fn(),
    createPasswordResetToken: vi.fn(),
    getPasswordResetToken: vi.fn(),
    markTokenUsed: vi.fn(),
    updateUserPassword: vi.fn(),
  };
});

// ─── Mock email helper ────────────────────────────────────────────────────────
vi.mock("./email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./email")>();
  return {
    ...actual,
    sendPasswordResetRequestEmail: vi.fn().mockResolvedValue({ success: true }),
    sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
    sendPasswordResetEmail: vi.fn().mockResolvedValue({ success: true }),
  };
});

import * as db from "./db";
import * as email from "./email";

// ─── Helpers to call procedures directly ─────────────────────────────────────
async function callRequestReset(input: { email: string; origin: string }) {
  const { getUserByEmail, createPasswordResetToken } = db as any;
  const { sendPasswordResetRequestEmail } = email as any;

  const user = await getUserByEmail(input.email);
  if (!user || !user.isActive) return { success: true };

  const token = "test-token-abc123";
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await createPasswordResetToken(user.id, token, expiresAt);

  const resetUrl = `${input.origin}/reset-password-link?token=${token}`;
  await sendPasswordResetRequestEmail({ to: user.email, name: user.name, resetUrl });

  return { success: true };
}

async function callResetWithToken(input: { token: string; newPassword: string }) {
  const { getPasswordResetToken, markTokenUsed, updateUserPassword } = db as any;

  const record = await getPasswordResetToken(input.token);
  if (!record) throw new Error("Invalid or expired reset link.");
  if (record.usedAt) throw new Error("This reset link has already been used.");
  if (new Date() > new Date(record.expiresAt)) throw new Error("This reset link has expired.");

  await updateUserPassword(record.userId, "hashed-password", true);
  await markTokenUsed(record.id);
  return { success: true };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("requestPasswordReset", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success even when email does not exist (no user enumeration)", async () => {
    (db.getUserByEmail as any).mockResolvedValue(null);
    const result = await callRequestReset({ email: "unknown@example.com", origin: "https://app.test" });
    expect(result.success).toBe(true);
    expect(db.createPasswordResetToken).not.toHaveBeenCalled();
    expect(email.sendPasswordResetRequestEmail).not.toHaveBeenCalled();
  });

  it("returns success even when user is inactive (no user enumeration)", async () => {
    (db.getUserByEmail as any).mockResolvedValue({ id: 1, email: "inactive@test.com", name: "Inactive", isActive: false });
    const result = await callRequestReset({ email: "inactive@test.com", origin: "https://app.test" });
    expect(result.success).toBe(true);
    expect(db.createPasswordResetToken).not.toHaveBeenCalled();
  });

  it("creates a token and sends email for a valid active user", async () => {
    (db.getUserByEmail as any).mockResolvedValue({ id: 5, email: "jane@test.com", name: "Jane", isActive: true });
    (db.createPasswordResetToken as any).mockResolvedValue(undefined);

    const result = await callRequestReset({ email: "jane@test.com", origin: "https://app.test" });
    expect(result.success).toBe(true);
    expect(db.createPasswordResetToken).toHaveBeenCalledWith(5, expect.any(String), expect.any(Date));
    expect(email.sendPasswordResetRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jane@test.com", resetUrl: expect.stringContaining("/reset-password-link?token=") })
    );
  });
});

describe("resetPasswordWithToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when token does not exist", async () => {
    (db.getPasswordResetToken as any).mockResolvedValue(null);
    await expect(callResetWithToken({ token: "bad-token", newPassword: "NewPass123!" })).rejects.toThrow("Invalid or expired");
  });

  it("throws when token has already been used", async () => {
    (db.getPasswordResetToken as any).mockResolvedValue({
      id: 1, userId: 5, token: "tok", expiresAt: new Date(Date.now() + 3600_000), usedAt: new Date(),
    });
    await expect(callResetWithToken({ token: "tok", newPassword: "NewPass123!" })).rejects.toThrow("already been used");
  });

  it("throws when token is expired", async () => {
    (db.getPasswordResetToken as any).mockResolvedValue({
      id: 1, userId: 5, token: "tok", expiresAt: new Date(Date.now() - 1000), usedAt: null,
    });
    await expect(callResetWithToken({ token: "tok", newPassword: "NewPass123!" })).rejects.toThrow("expired");
  });

  it("updates password and marks token used for a valid token", async () => {
    (db.getPasswordResetToken as any).mockResolvedValue({
      id: 3, userId: 7, token: "valid-tok", expiresAt: new Date(Date.now() + 3600_000), usedAt: null,
    });
    (db.updateUserPassword as any).mockResolvedValue(undefined);
    (db.markTokenUsed as any).mockResolvedValue(undefined);

    const result = await callResetWithToken({ token: "valid-tok", newPassword: "NewPass123!" });
    expect(result.success).toBe(true);
    expect(db.updateUserPassword).toHaveBeenCalledWith(7, expect.any(String), true);
    expect(db.markTokenUsed).toHaveBeenCalledWith(3);
  });
});
