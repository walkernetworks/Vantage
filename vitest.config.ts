import { defineConfig } from "vitest/config";
import path from "path";

// Pin the suite to UTC so date-sensitive specs behave the same on a
// developer's machine as they do in CI and on Render.
process.env.TZ = "UTC";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
  },
});
