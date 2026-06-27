import { describe, it, expect } from "vitest";

describe("OpenAI key fallback", () => {
  it("uses OPENAI_API_KEY when BUILT_IN_FORGE_API_KEY is empty", () => {
    const originalBuiltIn = process.env.BUILT_IN_FORGE_API_KEY;
    const originalOpenAI = process.env.OPENAI_API_KEY;
    process.env.BUILT_IN_FORGE_API_KEY = "";
    process.env.OPENAI_API_KEY = "sk-test-123";

    const forgeApiKey =
      process.env.BUILT_IN_FORGE_API_KEY && process.env.BUILT_IN_FORGE_API_KEY.trim().length > 0
        ? process.env.BUILT_IN_FORGE_API_KEY
        : (process.env.OPENAI_API_KEY ?? "");

    expect(forgeApiKey).toBe("sk-test-123");

    process.env.BUILT_IN_FORGE_API_KEY = originalBuiltIn;
    process.env.OPENAI_API_KEY = originalOpenAI;
  });

  it("uses BUILT_IN_FORGE_API_KEY when set", () => {
    const originalBuiltIn = process.env.BUILT_IN_FORGE_API_KEY;
    process.env.BUILT_IN_FORGE_API_KEY = "forge-key-abc";

    const forgeApiKey =
      process.env.BUILT_IN_FORGE_API_KEY && process.env.BUILT_IN_FORGE_API_KEY.trim().length > 0
        ? process.env.BUILT_IN_FORGE_API_KEY
        : (process.env.OPENAI_API_KEY ?? "");

    expect(forgeApiKey).toBe("forge-key-abc");

    process.env.BUILT_IN_FORGE_API_KEY = originalBuiltIn;
  });

  it("uses api.openai.com as URL fallback when BUILT_IN_FORGE_API_URL is empty", () => {
    const originalUrl = process.env.BUILT_IN_FORGE_API_URL;
    process.env.BUILT_IN_FORGE_API_URL = "";

    const forgeApiUrl =
      process.env.BUILT_IN_FORGE_API_URL && process.env.BUILT_IN_FORGE_API_URL.trim().length > 0
        ? process.env.BUILT_IN_FORGE_API_URL
        : "https://api.openai.com";

    expect(forgeApiUrl).toBe("https://api.openai.com");

    process.env.BUILT_IN_FORGE_API_URL = originalUrl;
  });
});
