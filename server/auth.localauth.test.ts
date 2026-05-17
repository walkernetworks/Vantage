/**
 * Tests for local email+password auth procedures:
 * - auth.register: creates user, sets session cookie
 * - auth.login: verifies credentials, sets session cookie
 *
 * These tests mock db helpers to avoid real DB calls.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "../shared/const";

// ─── Mock db helpers ──────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserByEmail: vi.fn(),
    createLocalUser: vi.fn(),
  };
});

// ─── Mock localAuth.signLocalSession ─────────────────────────────────────────
vi.mock("./_core/localAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_core/localAuth")>();
  return {
    ...actual,
    signLocalSession: vi.fn().mockResolvedValue("mock-jwt-token"),
    authenticateLocalRequest: vi.fn(),
  };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as dbModule from "./db";

type SetCookieCall = { name: string; value: string; options: Record<string, unknown> };

function createPublicContext(): { ctx: TrpcContext; setCookieCalls: SetCookieCall[] } {
  const setCookieCalls: SetCookieCall[] = [];
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        setCookieCalls.push({ name, value, options });
      },
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
  return { ctx, setCookieCalls };
}

describe("auth.register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new user and sets session cookie", async () => {
    const mockUser = {
      id: 42,
      name: "Test User",
      email: "test@example.com",
      role: "user" as const,
      openId: null,
      passwordHash: "hashed",
      loginMethod: "email",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    vi.mocked(dbModule.getUserByEmail).mockResolvedValue(undefined);
    vi.mocked(dbModule.createLocalUser).mockResolvedValue(mockUser);

    const { ctx, setCookieCalls } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.register({
      name: "Test User",
      email: "test@example.com",
      password: "password123",
    });

    expect(result.success).toBe(true);
    expect(result.user?.email).toBe("test@example.com");
    expect(setCookieCalls).toHaveLength(1);
    expect(setCookieCalls[0]?.name).toBe(COOKIE_NAME);
    expect(setCookieCalls[0]?.value).toBe("mock-jwt-token");
  });

  it("throws CONFLICT if email already exists", async () => {
    const existingUser = {
      id: 1,
      name: "Existing",
      email: "existing@example.com",
      role: "user" as const,
      openId: null,
      passwordHash: "hashed",
      loginMethod: "email",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    vi.mocked(dbModule.getUserByEmail).mockResolvedValue(existingUser);

    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.register({
        name: "Another User",
        email: "existing@example.com",
        password: "password123",
      })
    ).rejects.toThrow(TRPCError);
  });
});

describe("auth.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws UNAUTHORIZED if user not found", async () => {
    vi.mocked(dbModule.getUserByEmail).mockResolvedValue(undefined);

    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({ email: "nobody@example.com", password: "pass" })
    ).rejects.toThrow(TRPCError);
  });

  it("throws UNAUTHORIZED if user has no passwordHash", async () => {
    const userWithoutHash = {
      id: 1,
      name: "No Hash",
      email: "nohash@example.com",
      role: "user" as const,
      openId: "oauth-user",
      passwordHash: null,
      loginMethod: "manus",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    vi.mocked(dbModule.getUserByEmail).mockResolvedValue(userWithoutHash as any);

    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({ email: "nohash@example.com", password: "pass" })
    ).rejects.toThrow(TRPCError);
  });
});
