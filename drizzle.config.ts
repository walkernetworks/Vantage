import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

// TiDB Cloud Serverless requires TLS — inject ssl param if not already present
const sep = connectionString.includes("?") ? "&" : "?";
const url = connectionString.includes("ssl=")
  ? connectionString
  : connectionString + sep + 'ssl={"rejectUnauthorized":true}';

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: { url },
});
