export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // Prefer Manus built-in forge; fall back to OpenAI when running on external hosts (e.g. Render)
  forgeApiUrl:
    process.env.BUILT_IN_FORGE_API_URL && process.env.BUILT_IN_FORGE_API_URL.trim().length > 0
      ? process.env.BUILT_IN_FORGE_API_URL
      : "https://api.openai.com",
  forgeApiKey:
    process.env.BUILT_IN_FORGE_API_KEY && process.env.BUILT_IN_FORGE_API_KEY.trim().length > 0
      ? process.env.BUILT_IN_FORGE_API_KEY
      : (process.env.OPENAI_API_KEY ?? ""),
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "welcome@getvantageapp.io",
  mistralApiKey: process.env.MISTRAL_API_KEY ?? "",
};
