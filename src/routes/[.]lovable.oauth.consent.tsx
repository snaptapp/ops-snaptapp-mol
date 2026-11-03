import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/admin/auth";
import { getAdminSession } from "@/lib/admin/session.functions";
import { Button, Card, CardTitle } from "@/index";
import "@/admin/admin.css";

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ authorization_id: typeof s["authorization_id"] === "string" ? s["authorization_id"] : "" }),
  head: () => ({ meta: [
    { title: "More or Less — Connect an Agent" },
    { name: "description", content: "Review read-only agent access to More or Less operations." },
    { property: "og:title", content: "More or Less — Connect an Agent" },
    { property: "og:description", content: "Approve or deny protected agent access to your admin account." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("This connection request is missing its authorization ID.");
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error("Unable to check your sign-in. Please try again.");
    if (!data.session) throw redirect({ to: "/auth", search: { next: location.pathname + location.searchStr + location.hash } });
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.searchStr).get("authorization_id");
    if (!id) throw new Error("This connection request is invalid.");
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
    if (error) throw new Error("This connection request expired or could not be loaded. Restart the connection from your agent.");
    const immediate = data && "redirect_url" in data ? data.redirect_url : undefined;
    if (immediate) throw redirect({ href: immediate });
    return data;
  },
  errorComponent: ({ error }) => <main className="admin-signin"><Card><CardTitle>CONNECTION UNAVAILABLE</CardTitle><p role="alert">{error.message}</p><a href="/auth">RETURN TO SIGN IN</a></Card></main>,
  component: Consent,
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const { user, signOutAdmin } = useAdminAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = details && "client" in details ? details.client : null;
  const scopes = details && "scope" in details && typeof details.scope === "string" ? details.scope.split(" ") : [];
  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (approve) await getAdminSession();
      const result = approve ? await supabase.auth.oauth.approveAuthorization(authorization_id) : await supabase.auth.oauth.denyAuthorization(authorization_id);
      if (result.error) throw result.error;
      const target = result.data?.redirect_url;
      if (!target) throw new Error("No return address was received. Restart the connection from your agent.");
      window.location.assign(target);
    } catch {
      setError(approve ? "Approval failed. Confirm your account has admin access, then try again." : "Cancellation failed. Please try again.");
      setBusy(false);
    }
  }
  return <main className="admin-signin"><Card>
    <CardTitle>CONNECT {client?.name ?? "AGENT"} TO MORE OR LESS</CardTitle>
    <p>{user?.email}</p>
    <p>{client?.name ?? "This agent"} can read fact-bank status and daily-pack summaries as you.</p>
    <p>{details && "redirect_uri" in details ? details.redirect_uri : ""}</p>
    <ul>{scopes.filter(Boolean).map((scope) => <li key={scope}>{scope === "email" ? "Share your email address" : scope === "profile" ? "Share your basic profile" : scope === "openid" ? "Verify your identity" : `Additional permission requested: ${scope}`}</li>)}</ul>
    <p>Only current admins can use these tools. App permissions still apply; no changes can be made.</p>
    {error ? <p className="admin-error" role="alert">{error}</p> : null}
    <div className="admin-toolbar">
      <Button disabled={busy} onClick={() => void decide(true)}>APPROVE CONNECTION</Button>
      <Button variant="ghost" disabled={busy} onClick={() => void decide(false)}>CANCEL CONNECTION</Button>
      <Button variant="ghost" disabled={busy} onClick={() => void signOutAdmin().then(() => window.location.reload())}>SWITCH ACCOUNT</Button>
    </div>
  </Card></main>;
}