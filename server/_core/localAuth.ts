/**
 * Local email+password authentication module.
 * Replaces Manus OAuth. Uses HS256 JWT cookies signed with JWT_SECRET.
 * Session payload: { userId, email, name, role }
 */

import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import { ForbiddenError } from "@shared/_core/errors";
import * as db from "../db";
import { ENV } from "./env";

export type LocalSessionPayload = {
  userId: number;
  email: string;
  name: string;
  role: "user" | "admin";
};

function getSessionSecret() {
  return new TextEncoder().encode(ENV.cookieSecret || "fallback-dev-secret");
}

function parseCookies(cookieHeader: string | undefined): Map<string, string> {
  if (!cookieHeader) return new Map();
  return new Map(Object.entries(parseCookieHeader(cookieHeader)));
}

export async function signLocalSession(
  payload: LocalSessionPayload,
  expiresInMs = ONE_YEAR_MS
): Promise<string> {
  const issuedAt = Date.now();
  const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
  const secretKey = getSessionSecret();

  return new SignJWT({
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(secretKey);
}

export async function verifyLocalSession(
  cookieValue: string | undefined | null
): Promise<LocalSessionPayload | null> {
  if (!cookieValue) return null;
  try {
    const secretKey = getSessionSecret();
    const { payload } = await jwtVerify(cookieValue, secretKey, {
      algorithms: ["HS256"],
    });
    const { userId, email, name, role } = payload as Record<string, unknown>;
    if (
      typeof userId !== "number" ||
      typeof email !== "string" ||
      typeof name !== "string" ||
      (role !== "user" && role !== "admin")
    ) {
      return null;
    }
    return { userId, email, name, role };
  } catch {
    return null;
  }
}

export async function authenticateLocalRequest(req: Request) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionCookie = cookies.get(COOKIE_NAME);
  const session = await verifyLocalSession(sessionCookie);

  if (!session) {
    throw ForbiddenError("Invalid session cookie");
  }

  const user = await db.getUserById(session.userId);
  if (!user) {
    throw ForbiddenError("User not found");
  }
  if (user.isActive === false) {
    throw ForbiddenError("Account deactivated. Contact an admin.");
  }

  return user;
}
