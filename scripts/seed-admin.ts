/**
 * Seed an admin account so a freshly-pushed staging database is usable
 * without hand-written SQL.
 *
 *   pnpm seed:admin <email> [password] [name]
 *
 * Idempotent: if the account already exists it is promoted to admin (and
 * its password reset when one is supplied) rather than failing.
 *
 * Guard: refuses to run unless the target database name contains "staging".
 * Pass --force to override — production has real accounts and should not be
 * seeded.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { createLocalUser, getDb, getRawPool, getUserByEmail } from "../server/db";

const BCRYPT_ROUNDS = 12; // matches auth.register / auth.changePassword

const args = process.argv.slice(2).filter((a) => a !== "--force");
const force = process.argv.includes("--force");
const [email, passwordArg, nameArg] = args;

function databaseName(url: string): string {
  // mysql://user:pass@host:4000/dbname?ssl=...
  return url.split("/").pop()?.split("?")[0] ?? "";
}

function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

async function main() {
  if (!email) {
    throw new Error("Usage: pnpm seed:admin <email> [password] [name] [--force]");
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Export it, or add it to .env, before seeding.");
  }

  const dbName = databaseName(url);
  if (!dbName.includes("staging") && !force) {
    throw new Error(
      `Refusing to seed "${dbName}": the database name does not contain "staging".\n` +
        "This guard exists so production is never seeded. Re-run with --force if you are certain."
    );
  }
  if (force && !dbName.includes("staging")) {
    console.warn(`[seed] --force: seeding non-staging database "${dbName}"`);
  }

  const db = await getDb();
  if (!db) {
    throw new Error(`Could not build a connection to "${dbName}". Check DATABASE_URL.`);
  }

  // mysql2 pools connect lazily, so getDb() succeeds even against an
  // unreachable host — the failure would otherwise surface much later as a
  // raw query dump. Probe once here and report it plainly instead.
  try {
    await db.execute(sql`select 1`);
  } catch (error) {
    // drizzle wraps driver errors as "Failed query: ..." and keeps the real
    // cause (ECONNREFUSED, access denied, unknown database) on .cause.
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    throw new Error(
      `Could not connect to "${dbName}": ${cause instanceof Error ? cause.message : String(cause)}\n` +
        "Check DATABASE_URL — note that a bad connection string fails silently in the " +
        "app itself, where it looks like a wrong password rather than a database error."
    );
  }

  const password = passwordArg ?? generatePassword();
  const generated = !passwordArg;
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const existing = await getUserByEmail(email);
  if (existing) {
    await db
      .update(users)
      .set({
        role: "admin",
        isActive: true,
        ...(passwordArg ? { passwordHash, mustResetPassword: false } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));

    console.log(`[seed] promoted existing user #${existing.id} (${email}) to admin`);
    if (passwordArg) console.log("[seed] password reset to the supplied value");
    else console.log("[seed] password left unchanged (pass one as the 2nd argument to reset it)");
  } else {
    const created = await createLocalUser({
      name: nameArg ?? "Admin",
      email,
      passwordHash,
      role: "admin",
    });
    if (!created) throw new Error("Failed to create the admin account.");

    console.log(`[seed] created admin #${created.id} (${email}) in "${dbName}"`);
    console.log(`[seed] password: ${generated ? password + "   <- generated, save it now" : "(as supplied)"}`);
  }

  console.log("[seed] sign out and back in if you were already logged in — the role is baked into the session cookie.");
}

main()
  .catch((error) => {
    console.error(`[seed] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getRawPool()?.end();
  });
