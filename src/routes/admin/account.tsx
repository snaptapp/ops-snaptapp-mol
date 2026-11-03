import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { UserIdentity } from "@supabase/supabase-js";
import { Badge, Button, Card, CardTitle } from "@/index";
import { supabase } from "@/integrations/supabase/client";
import { PageHead } from "@/admin/AdminShell";
import { lovable } from "@/integrations/lovable";
import { linkErrorMessage, PENDING_LINK_KEY, type PendingLink } from "@/lib/account-linking";

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
    // Finish a pending connect: same account means it linked; a different account means it didn't.
    const raw = window.sessionStorage.getItem(PENDING_LINK_KEY);
    if (!raw) return;
    window.sessionStorage.removeItem(PENDING_LINK_KEY);
    const pending = JSON.parse(raw) as PendingLink;
    const { data: userData } = await supabase.auth.getUser();
    const label = PROVIDERS.find((p) => p.id === pending.provider)?.label ?? pending.provider;
    if (userData.user && userData.user.id !== pending.userId) {
      setError(linkErrorMessage("different_account", userData.user.email ?? "", label, pending.email));
      await supabase.auth.signOut();
      return;
    }
    const linked = (data?.identities ?? []).some((i) => i.provider === pending.provider);
    if (linked) setNotice(`${label} is now connected.`);
    else setError(linkErrorMessage("not_linked", "", label, pending.email));
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function link(provider: "google" | "apple" | "microsoft" | "lovable") {
    setBusy(provider); setError(null); setNotice(null);
    const label = PROVIDERS.find((p) => p.id === (provider === "microsoft" ? "azure" : provider))?.label ?? provider;
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("You're signed out. Sign in again first.");
      const pending: PendingLink = { provider: provider === "microsoft" ? "azure" : provider, userId: data.user.id, email: data.user.email ?? "" };
      window.sessionStorage.setItem(PENDING_LINK_KEY, JSON.stringify(pending));
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: new URL("/auth?next=/admin/account", window.location.origin).href,
      });
      if (result.error) {
        window.sessionStorage.removeItem(PENDING_LINK_KEY);
        setError(linkErrorMessage("provider", result.error.message, label));
        setBusy(null);
        return;
      }
      if (!result.redirected) { await load(); setBusy(null); }
    } catch (e) {
      window.sessionStorage.removeItem(PENDING_LINK_KEY);
      setError(linkErrorMessage("provider", e instanceof Error ? e.message : String(e), label));
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
        <p className="admin-auth-copy">Connect every way you want to sign in to this admin account.</p>
        <p className="admin-auth-copy">Connect works when the Google, Apple, Microsoft or Lovable account uses the same email as this admin account ({"you'll"} sign in with it once).</p>
        {error ? <p className="admin-error" role="alert">{error}</p> : null}
        {notice ? <p className="admin-auth-notice" role="status">{notice}</p> : null}
        <ul className="admin-account-methods">
          {PROVIDERS.map((p) => {
            const identity = identities.find((i) => i.provider === p.id);
            return (
              <li key={p.id}>
                <span>{p.label}</span>
                {identity ? <Badge tone="lime">CONNECTED</Badge> : <Badge>NOT CONNECTED</Badge>}
                {p.id === "email" ? null : identity ? (
                  <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void unlink(identity)}>DISCONNECT</Button>
                ) : (
                  <Button size="sm" disabled={busy !== null} onClick={() => void link(p.id === "azure" ? "microsoft" : p.id)}>{busy === p.id ? "CONNECTING…" : "CONNECT"}</Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
