import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { UserIdentity } from "@supabase/supabase-js";
import { Badge, Button, Card, CardTitle } from "@/index";
import { supabase } from "@/integrations/supabase/client";
import { PageHead } from "@/admin/AdminShell";
import { linkErrorMessage, matchesSignInProvider, PENDING_LINK_KEY } from "@/lib/account-linking";

export const Route = createFileRoute("/admin/account")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Account Settings — More or Less Admin" },
      { name: "description", content: "Connect sign-in methods to your More or Less admin account." },
      { property: "og:title", content: "Account Settings — More or Less Admin" },
      { property: "og:description", content: "Manage connected sign-in methods." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

const PROVIDERS = [
  { id: "email", label: "Email & password" },
  { id: "google", label: "Google" },
  { id: "apple", label: "Apple" },
  { id: "azure", label: "Microsoft" },
  { id: "lovable", label: "Lovable" },
] as const;

function AccountPage() {
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.auth.getUserIdentities();
    if (err) setError(linkErrorMessage("load", err.message));
    else setIdentities(data?.identities ?? []);
    // Discard legacy sign-in-as-link markers; never sign out the current account.
    window.sessionStorage.removeItem(PENDING_LINK_KEY);
  }, []);

  useEffect(() => {
    void load();
    const { data } = supabase.auth.onAuthStateChange(() => { window.setTimeout(() => void load(), 0); });
    return () => data.subscription.unsubscribe();
  }, [load]);

  async function link(provider: "google" | "apple" | "microsoft" | "lovable") {
    setBusy(provider); setError(null); setNotice(null);
    const label = PROVIDERS.find((p) => p.id === (provider === "microsoft" ? "azure" : provider))?.label ?? provider;
    try {
      if (provider === "lovable") {
        setError("Lovable supports sign-in, but connecting it to another existing account isn't available. Your current sign-in hasn't changed.");
        return;
      }
      // Check the real linking endpoint without navigating or replacing the session.
      // Managed OAuth's signInWithOAuth is not a link operation.
      const { error: linkError } = await supabase.auth.linkIdentity({
        provider: provider === "microsoft" ? "azure" : provider,
        options: { skipBrowserRedirect: true, redirectTo: new URL("/auth", window.location.origin).href },
      });
      setError(linkError
        ? linkErrorMessage("provider", linkError.message, label)
        : `${label} account linking through managed sign-in isn't available yet. Your current sign-in hasn't changed.`);
    } catch (e) {
      setError(linkErrorMessage("provider", e instanceof Error ? e.message : String(e), label));
    } finally {
      setBusy(null);
    }
  }

  async function unlink(identity: UserIdentity) {
    if (identities.length < 2) { setError("Keep at least one sign-in method connected."); return; }
    setBusy(identity.provider); setError(null); setNotice(null);
    const { error: err } = await supabase.auth.unlinkIdentity(identity);
    if (err) setError(linkErrorMessage("unlink", err.message));
    else setNotice("Sign-in method disconnected.");
    await load();
    setBusy(null);
  }

  return (
    <>
      <PageHead title="ACCOUNT SETTINGS" />
      <Card>
        <CardTitle>SIGN-IN METHODS</CardTitle>
        <p className="admin-auth-copy">Additional account linking is currently unavailable. Your existing connected methods still work for sign-in.</p>
        {error ? <p className="admin-error" role="alert">{error}</p> : null}
        {notice ? <p className="admin-auth-notice" role="status">{notice}</p> : null}
        <ul className="admin-account-methods">
          {PROVIDERS.map((p) => {
            const identity = identities.find((i) => matchesSignInProvider(i.provider, p.id));
            return (
              <li key={p.id}>
                <span>{p.label}</span>
                {identity ? <Badge tone="lime">CONNECTED</Badge> : <Badge>NOT CONNECTED</Badge>}
                {p.id === "email" ? null : identity ? (
                  <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void unlink(identity)}>DISCONNECT</Button>
                ) : (
                  <Button size="sm" disabled={busy !== null} onClick={() => void link(p.id === "azure" ? "microsoft" : p.id)}>{busy === (p.id === "azure" ? "microsoft" : p.id) ? "CHECKING…" : "CONNECT"}</Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
