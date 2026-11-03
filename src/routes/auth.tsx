import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "More or Less — Admin Sign In" },
      {
        name: "description",
        content: "Sign up or sign in with an admin team account for the More or Less ops portal.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

type Mode = "sign-in" | "sign-up";

function AuthPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setSignedInEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedInEmail(session?.user?.email ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "sign-up") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
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
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    } finally {
      setBusy(false);
    }
  }

  if (signedInEmail) {
    return (
      <main className="admin-signin">
        <div className="admin-card">
          <h1>Signed in</h1>
          <p>
            You are signed in as <strong>{signedInEmail}</strong>.
          </p>
          <p>
            <Link to="/admin">Continue to the admin portal</Link>
          </p>
          <button
            type="button"
            className="admin-button"
            onClick={handleSignOut}
            disabled={busy}
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-signin">
      <div className="admin-card">
        <h1>{mode === "sign-in" ? "Admin sign in" : "Create admin account"}</h1>
        <p>
          {mode === "sign-in"
            ? "Sign in with your admin team account."
            : "Sign up with your team email. You will need to confirm it before signing in."}
        </p>
        <form onSubmit={handleSubmit}>
          <div className="admin-field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="admin-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? <p className="admin-error">{error}</p> : null}
          {notice ? <p className="admin-notice">{notice}</p> : null}
          <button type="submit" className="admin-button" disabled={busy}>
            {busy
              ? mode === "sign-in"
                ? "Signing in…"
                : "Creating account…"
              : mode === "sign-in"
                ? "Sign in"
                : "Sign up"}
          </button>
        </form>
        <button
          type="button"
          className="admin-reset-link"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
            setNotice(null);
          }}
        >
          {mode === "sign-in"
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
