import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, Card, CardTitle } from "@/index";
import { supabase } from "@/integrations/supabase/client";
import "@/admin/admin.css";
import "@/admin/auth.css";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [
    { title: "More or Less — Reset Password" },
    { name: "description", content: "Securely reset your More or Less admin account password." },
    { property: "og:title", content: "More or Less — Reset Password" },
    { property: "og:description", content: "Set a new password for your More or Less admin account." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [recovery, setRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const isRecoveryLink = new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) setRecovery(true);
    });
    if (isRecoveryLink) {
      void supabase.auth.getUser().then(({ data: identity, error: identityError }) => {
        if (!identityError && identity.user) setRecovery(true);
      });
    }
    return () => data.subscription.unsubscribe();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!recovery) return;
    if (password !== confirmation) { setError("Passwords don’t match."); return; }
    setBusy(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSaved(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn’t update your password. Please try again.");
    } finally { setBusy(false); }
  }
  return <main className="admin-signin"><Card className="admin-auth-panel">
    <div className="admin-auth-brand"><img src="/more-or-less-icon.png" alt="More or Less" /><CardTitle>RESET PASSWORD</CardTitle></div>
    {saved ? <p className="admin-auth-notice" role="status">Your password has been updated.</p> : recovery ?
      <form onSubmit={(event) => void submit(event)}>
        <div className="admin-field"><label htmlFor="new-password">New password</label><input className="admin-input" id="new-password" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
        <div className="admin-field"><label htmlFor="confirm-password">Confirm password</label><input className="admin-input" id="confirm-password" type="password" autoComplete="new-password" minLength={6} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
        {error ? <p className="admin-error" role="alert">{error}</p> : null}
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save new password"}</Button>
      </form> : <p className="admin-auth-copy" role="status">Open the reset link from your email to set a new password. If it has expired, request a new link from Forgot Password.</p>}
    <Link to="/auth" className="ds-button ds-button--primary ds-button--md ds-focusable">BACK TO SIGN IN</Link>
  </Card></main>;
}