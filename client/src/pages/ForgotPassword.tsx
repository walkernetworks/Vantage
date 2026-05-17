import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { logoDataUrl } from "@/lib/logo";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const requestReset = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => setSubmitted(true),
    // Never surface errors — always show the same success state to prevent user enumeration
    onError: () => setSubmitted(true),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    requestReset.mutate({ email: email.trim(), origin: window.location.origin });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8 animate-in fade-in duration-300">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-64 max-w-full">
            <img src={logoDataUrl} alt="Beignets & Brew" className="w-full h-auto object-contain" />
          </div>
          <p className="text-muted-foreground text-sm">Inventory & Ordering System</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl shadow-md p-6 space-y-5">
          {submitted ? (
            <div className="space-y-4 text-center">
              {/* Success envelope icon */}
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <svg
                  className="h-7 w-7 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Check your email</h1>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  If an account exists for <strong>{email}</strong>, you'll receive a password reset
                  link shortly. The link expires in 1 hour.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Didn't receive it? Check your spam folder or{" "}
                <button
                  onClick={() => setSubmitted(false)}
                  className="text-primary hover:underline font-medium"
                >
                  try again
                </button>
                .
              </p>
              <Link
                href="/login"
                className="block text-sm text-primary font-medium hover:underline mt-2"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              <div>
                <h1 className="text-xl font-bold text-foreground">Forgot password?</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Enter your email and we'll send you a reset link.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-sm font-medium text-foreground">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm transition-shadow"
                  />
                </div>

                <button
                  type="submit"
                  disabled={requestReset.isPending}
                  className="w-full py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                >
                  {requestReset.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                      Sending…
                    </span>
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </form>

              <p className="text-center text-sm text-muted-foreground">
                Remember your password?{" "}
                <Link href="/login" className="text-primary font-medium hover:underline">
                  Sign In
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
