import { describe, it, expect } from "vitest";
import { sendWelcomeEmail } from "./email";

describe("Email helper — Resend integration", () => {
  it("sends a welcome email via Resend (delivered@resend.dev test address)", async () => {
    // Resend's special test address always accepts without domain verification
    const result = await sendWelcomeEmail({
      to: "delivered@resend.dev",
      name: "Test User",
      tempPassword: "TestPass123!",
      loginUrl: "https://getvantageapp.io/login",
    });
    // If RESEND_API_KEY is not set in this env, the helper returns success:false gracefully
    if (!process.env.RESEND_API_KEY) {
      expect(result.success).toBe(false);
      expect(result.error).toContain("not configured");
    } else {
      expect(result.success).toBe(true);
    }
  }, 15000);
});
