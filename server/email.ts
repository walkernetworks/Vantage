/**
 * Transactional email helpers using Resend.
 * All functions are fire-and-forget safe — they catch errors internally
 * and return { success, error } so callers never throw on email failure.
 */
import { Resend } from "resend";
import { ENV } from "./_core/env";

function getClient() {
  if (!ENV.resendApiKey) return null;
  return new Resend(ENV.resendApiKey);
}

export async function sendWelcomeEmail(opts: {
  to: string;
  name: string;
  tempPassword: string;
  loginUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const client = getClient();
  if (!client) {
    console.warn("[email] RESEND_API_KEY not set — skipping welcome email");
    return { success: false, error: "Email not configured" };
  }

  const { to, name, tempPassword, loginUrl } = opts;
  const firstName = name.split(" ")[0];

  try {
    const { error } = await client.emails.send({
      from: `Beignets & Brew <${ENV.resendFromEmail}>`,
      to,
      subject: "Your Beignets & Brew account is ready",
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#fdf6f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf6f0;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#e8614a;padding:32px 40px;text-align:center;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:1px;">BEIGNETS &amp; BREW</p>
            <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.8);letter-spacing:2px;text-transform:uppercase;">Inventory &amp; Ordering System</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#1a1a1a;">Hi ${firstName},</p>
            <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;">
              An account has been created for you on the Beignets &amp; Brew Inventory &amp; Ordering System.
              Use the credentials below to sign in for the first time — you'll be asked to set a new password right away.
            </p>
            <!-- Credentials box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf6f0;border-radius:12px;margin-bottom:28px;">
              <tr>
                <td style="padding:24px;">
                  <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Your login details</p>
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:14px;color:#666;padding-right:12px;padding-bottom:8px;">Email</td>
                      <td style="font-size:14px;font-weight:600;color:#1a1a1a;padding-bottom:8px;">${to}</td>
                    </tr>
                    <tr>
                      <td style="font-size:14px;color:#666;padding-right:12px;">Temp password</td>
                      <td style="font-size:16px;font-weight:700;color:#e8614a;font-family:monospace,monospace;">${tempPassword}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            <!-- CTA button -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#e8614a;border-radius:10px;">
                  <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Sign In Now</a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:13px;color:#999;line-height:1.5;">
              If the button doesn't work, copy and paste this link into your browser:<br/>
              <a href="${loginUrl}" style="color:#e8614a;word-break:break-all;">${loginUrl}</a>
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f0e8e0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#bbb;">This email was sent by the Beignets &amp; Brew Inventory System. Please do not reply.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });

    if (error) {
      console.error("[email] Resend error sending welcome email:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error("[email] Failed to send welcome email:", err?.message ?? err);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

export async function sendPasswordResetRequestEmail(opts: {
  to: string;
  name: string;
  resetUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const client = getClient();
  if (!client) {
    console.warn("[email] RESEND_API_KEY not set — skipping password reset request email");
    return { success: false, error: "Email not configured" };
  }

  const { to, name, resetUrl } = opts;
  const firstName = name.split(" ")[0];

  try {
    const { error } = await client.emails.send({
      from: `Beignets & Brew <${ENV.resendFromEmail}>`,
      to,
      subject: "Reset your Beignets & Brew password",
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#fdf6f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf6f0;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#e8614a;padding:32px 40px;text-align:center;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:1px;">BEIGNETS &amp; BREW</p>
            <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.8);letter-spacing:2px;text-transform:uppercase;">Inventory &amp; Ordering System</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#1a1a1a;">Hi ${firstName},</p>
            <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;">
              We received a request to reset your password. Click the button below to choose a new one.
              This link expires in <strong>1 hour</strong>.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#e8614a;border-radius:10px;">
                  <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Reset My Password</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 16px;font-size:13px;color:#999;line-height:1.5;">
              If you didn't request a password reset, you can safely ignore this email — your password won't change.
            </p>
            <p style="margin:0;font-size:13px;color:#999;line-height:1.5;">
              If the button doesn't work, copy and paste this link:<br/>
              <a href="${resetUrl}" style="color:#e8614a;word-break:break-all;">${resetUrl}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f0e8e0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#bbb;">This link expires in 1 hour. Do not share it with anyone.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });

    if (error) {
      console.error("[email] Resend error sending reset request email:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error("[email] Failed to send reset request email:", err?.message ?? err);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  tempPassword: string;
  loginUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const client = getClient();
  if (!client) {
    console.warn("[email] RESEND_API_KEY not set — skipping password reset email");
    return { success: false, error: "Email not configured" };
  }

  const { to, name, tempPassword, loginUrl } = opts;
  const firstName = name.split(" ")[0];

  try {
    const { error } = await client.emails.send({
      from: `Beignets & Brew <${ENV.resendFromEmail}>`,
      to,
      subject: "Your Beignets & Brew password has been reset",
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#fdf6f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf6f0;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#e8614a;padding:32px 40px;text-align:center;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:1px;">BEIGNETS &amp; BREW</p>
            <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.8);letter-spacing:2px;text-transform:uppercase;">Inventory &amp; Ordering System</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#1a1a1a;">Hi ${firstName},</p>
            <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;">
              An administrator has reset your password. Use the temporary password below to sign in — you'll be prompted to choose a new password immediately.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf6f0;border-radius:12px;margin-bottom:28px;">
              <tr>
                <td style="padding:24px;">
                  <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;">New temporary password</p>
                  <p style="margin:0;font-size:22px;font-weight:700;color:#e8614a;font-family:monospace,monospace;letter-spacing:2px;">${tempPassword}</p>
                </td>
              </tr>
            </table>
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#e8614a;border-radius:10px;">
                  <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Sign In Now</a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:13px;color:#999;line-height:1.5;">
              If you did not expect this reset, please contact your manager immediately.<br/>
              <a href="${loginUrl}" style="color:#e8614a;word-break:break-all;">${loginUrl}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f0e8e0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#bbb;">This email was sent by the Beignets &amp; Brew Inventory System. Please do not reply.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });

    if (error) {
      console.error("[email] Resend error sending password reset email:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error("[email] Failed to send password reset email:", err?.message ?? err);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}
