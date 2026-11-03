import { useState, type FormEvent } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAdminAuth } from "@/admin/auth";
import { Button, Card, CardTitle } from "@/index";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { oauthReturnPath } from "@/lib/oauth-return-path";
import "@lovable.dev/cloud-auth-js/styles.css";
import "@/admin/admin.css";
import "@/admin/auth.css";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { access?: string; next?: string } => ({
    access: search["access"] === "denied" ? "denied" : undefined,
    next: typeof search["next"] === "string" ? oauthReturnPath(search["next"]) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "More or Less — Admin Sign In" },
      {
        name: "description",
        content: "Sign up or sign in with an admin team account for the More or Less ops portal.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "More or Less — Admin Sign In" },
      { property: "og:description", content: "Sign in to your More or Less admin team account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "sign-in" | "forgot-password";

function AuthPage() {
  const navigate = useNavigate();
  const { user, ready, signOutAdmin } = useAdminAuth();
  const { access, next } = Route.useSearch();
  const returnTo = next && next !== "/" ? next : "/admin";
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "forgot-password") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setNotice("If an account exists for this email, you’ll receive a password reset link. Check your inbox and spam folder.");
        return;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        try {
          window.__lovableEvents?.track?.("project.admin_auth_completed", {
            mode: "sign_in", outcome: "authenticated", method: "email_password",
          });
        } catch { /* Analytics must not interrupt sign-in. */ }
      }
      await navigate({ href: returnTo, replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLovableSignIn(provider: "lovable" | "google" | "apple" | "microsoft" = "lovable") {
    setBusy(true);
    setError(null);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: new URL(next ? returnTo : "/auth", window.location.origin).href });
      if (result.error) throw result.error;
      if (result.redirected) return;
      try {
        window.__lovableEvents?.track?.("project.admin_auth_completed", {
          mode: "sign_in", outcome: "authenticated", method: provider,
        });
      } catch { /* Analytics must not interrupt sign-in. */ }
      await navigate({ href: returnTo, replace: true });
    } catch {
      setError("We couldn’t complete that sign-in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOutAdmin();
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <main className="admin-signin"><p>Loading…</p></main>;

  if (user) {
    return (
      <main className="admin-signin">
        <Card className="admin-auth-panel">
          <div className="admin-auth-brand">
            <img
              src="/more-or-less-icon.png"
              alt="More or Less"
            />
            <div>
              <CardTitle>MORE OR LESS</CardTitle>
              <p className="admin-auth-copy">
                {user.email}
              </p>
            </div>
          </div>
          <section className="admin-auth-status" aria-labelledby="auth-status-title">
            <p className="ds-label">{access === "denied" ? "ACCESS NOT GRANTED" : "SIGNED IN"}</p>
            <h1 id="auth-status-title">{access === "denied" ? "You’re signed in. Access is next." : "Ready for the portal."}</h1>
            <p className="admin-auth-copy">{access === "denied"
              ? "This account needs an admin role. An existing admin can grant access from Team accounts. If access was just granted, check again."
              : "Your account is connected. Continue to the admin portal."}</p>
          </section>
          <div className="admin-auth-actions">
            <Link to={returnTo} className="ds-button ds-button--primary ds-button--md ds-focusable">
              {access === "denied" ? "CHECK ACCESS AGAIN" : "OPEN ADMIN PORTAL"}
            </Link>
            <Button type="button" variant="ghost" onClick={() => void handleSignOut()} disabled={busy}>
              {busy ? "Signing out…" : "Use a different account"}
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="admin-signin">
      <Card className="admin-auth-panel">
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="admin-auth-brand">
            <img
              src="/more-or-less-icon.png"
              alt="More or Less"
            />
            <div>
              <CardTitle>
                {mode === "sign-in" ? "More or Less — Admin" : "Reset your password"}
              </CardTitle>
              <p className="admin-auth-copy">
                {mode === "sign-in"
                  ? "Sign in with your admin team account."
                  : "Enter your account email to receive a reset link."}
              </p>
            </div>
          </div>
          <div className="admin-field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="admin-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          {mode === "sign-in" ? <div className="admin-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="admin-input"
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div> : null}
          {error ? <p className="admin-error" role="alert">{error}</p> : null}
          {notice ? (
            <p className="admin-auth-notice" role="status">
              {notice}
            </p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy
              ? mode === "sign-in"
                ? "Signing in…"
                : "Sending reset link…"
              : mode === "sign-in"
                ? "Sign in"
                : "Send reset link"}
          </Button>
          {mode === "sign-in" ? <div className="admin-auth-providers">
            <button type="button" className="lovable-auth-button" disabled={busy} onClick={() => void handleLovableSignIn()}>Continue with Lovable</button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void handleLovableSignIn("google")}>Continue with Google</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void handleLovableSignIn("apple")}>Continue with Apple</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void handleLovableSignIn("microsoft")}>Continue with Microsoft</Button>
          </div> : null}
          <Button variant="ghost"
            type="button"
            disabled={busy}
            onClick={() => {
              setMode(mode === "sign-in" ? "forgot-password" : "sign-in");
              setError(null);
              setNotice(null);
            }}
          >
            {mode === "sign-in" ? "Forgot Password" : "Back to sign in"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
