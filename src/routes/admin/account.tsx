import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { UserIdentity } from "@supabase/supabase-js";
import { Badge, Button, Card, CardTitle } from "@/index";
import { supabase } from "@/integrations/supabase/client";
import { PageHead } from "@/admin/AdminShell";

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

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.auth.getUserIdentities();
    if (err) setError(err.message);
    else setIdentities(data?.identities ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function link(provider: string) {
    setBusy(provider); setError(null);
    const { error: err } = await supabase.auth.linkIdentity({
      provider: provider as "google",
      options: { redirectTo: `${window.location.origin}/admin/account` },
    });
    if (err) { setError(`Couldn’t connect: ${err.message}`); setBusy(null); }
  }

  async function unlink(identity: UserIdentity) {
    if (identities.length < 2) { setError("Keep at least one sign-in method connected."); return; }
    setBusy(identity.provider); setError(null);
    const { error: err } = await supabase.auth.unlinkIdentity(identity);
    if (err) setError(err.message);
    await load();
    setBusy(null);
  }

  return (
    <>
      <PageHead title="ACCOUNT SETTINGS" />
      <Card>
        <CardTitle>SIGN-IN METHODS</CardTitle>
        <p className="admin-auth-copy">Connect every way you want to sign in to this admin account.</p>
        {error ? <p className="admin-error" role="alert">{error}</p> : null}
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
                  <Button size="sm" disabled={busy !== null} onClick={() => void link(p.id)}>{busy === p.id ? "CONNECTING…" : "CONNECT"}</Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
