import { useState, type FormEvent } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAdminAuth } from "@/admin/auth";
import { Button, Card, CardTitle } from "@/index";
import { supabase } from "@/integrations/supabase/client";
import "@/admin/admin.css";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({ access: search["access"] === "denied" ? "denied" : undefined }),
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

type Mode = "sign-in" | "sign-up";

function AuthPage() {
  const navigate = useNavigate();
  const { user, ready, signOutAdmin } = useAdminAuth();
  const { access } = Route.useSearch();
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
      if (mode === "sign-up") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setNotice("Check your email to confirm your account, then sign in.");
          setMode("sign-in");
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }
      navigate({ to: "/admin", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
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
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
            <img
              src="/more-or-less-icon.png"
              alt="More or Less"
              style={{ width: "40px", height: "40px", borderRadius: "8px", objectFit: "contain" }}
            />
            <div>
              <CardTitle>Signed in</CardTitle>
              <p style={{ color: "var(--ds-arena-color-text-muted)", fontSize: 14, margin: "2px 0 0" }}>
                {user.email}
              </p>
            </div>
          </div>
          {access === "denied" ? <p className="admin-error" role="alert">Admin access is required. Ask an existing admin to grant access to your account.</p> : null}
          <p style={{ fontSize: 14 }}>
            <Link to="/admin">Continue to the admin portal</Link>
          </p>
          <Button type="button" variant="ghost" onClick={() => void handleSignOut()} disabled={busy}>
            {busy ? "Signing out…" : "Sign out"}
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="admin-signin">
      <Card>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
            <img
              src="/more-or-less-icon.png"
              alt="More or Less"
              style={{ width: "40px", height: "40px", borderRadius: "8px", objectFit: "contain" }}
            />
            <div>
              <CardTitle>
                {mode === "sign-in" ? "More or Less — Admin" : "Create team account"}
              </CardTitle>
              <p style={{ color: "var(--ds-arena-color-text-muted)", fontSize: 14, margin: "2px 0 0" }}>
                {mode === "sign-in"
                  ? "Sign in with your admin team account."
                  : "Sign up with your team email — confirm it, then sign in."}
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
          <div className="admin-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="admin-input"
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error ? <p className="admin-error">{error}</p> : null}
          {notice ? (
            <p style={{ color: "var(--ds-arena-color-primary)", fontSize: 13, margin: 0 }}>
              {notice}
            </p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy
              ? mode === "sign-in"
                ? "Signing in…"
                : "Creating account…"
              : mode === "sign-in"
                ? "Sign in"
                : "Sign up"}
          </Button>
          {mode === "sign-in" ? <Button type="button" variant="ghost" disabled={busy || !email} onClick={() => {
            setBusy(true); setError(null);
            void supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth` }).then(({ error: resetError }) => {
              if (resetError) setError(resetError.message); else setNotice("Password reset email sent — check your inbox.");
            }).finally(() => setBusy(false));
          }}>Forgot password?</Button> : null}
          <Button variant="ghost"
            type="button"
            className="admin-reset-link"
            disabled={busy}
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setError(null);
              setNotice(null);
            }}
          >
            {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
