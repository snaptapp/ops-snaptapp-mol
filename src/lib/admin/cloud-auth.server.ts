import { createClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";
import { AuthError, type AdminUser } from "@/lib/firebase/verify.server";

export interface CloudIdentity { id: string; email?: string; email_confirmed_at?: string }

/** Auth validates identity; a protected role row, never user metadata, grants access. */
export async function authorizeCloudAdmin(
  token: string,
  verify: (token: string) => Promise<CloudIdentity | null>,
  hasRole: (uid: string) => Promise<boolean>,
): Promise<AdminUser> {
  if (!token) throw new AuthError("Not signed in");
  const user = await verify(token);
  if (!user || !user.email_confirmed_at) throw new AuthError("Sign in with a confirmed account");
  if (!(await hasRole(user.id))) throw new AuthError("This account has not been granted admin access", 401);
  return { uid: user.id, email: user.email ?? null, name: null, isClaimAdmin: false };
}

export async function requireCloudAdmin() {
  const header = getRequestHeader("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new AuthError("Not signed in");
  // Public build-time config is also available on the canonical Worker. Never
  // use the service-role key to authorize a caller or trust decoded JWT claims.
  const url = process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new AuthError("Cloud sign-in is not configured");
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const user = await authorizeCloudAdmin(token, async (bearer) => {
    const { data, error } = await client.auth.getUser(bearer);
    if (error) return null;
    return data.user;
  }, async (uid) => {
    const { data, error } = await client.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
    if (error) throw new AuthError("Unable to verify admin access");
    return data?.role === "admin";
  });
  return { user, client };
}