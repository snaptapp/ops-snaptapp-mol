import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "./middleware";
import type { AdminUserRecord } from "./roles.server";
import { adminEmailSchema, onboardAdmin } from "./admin-onboarding";

interface PortalAdminRow { uid: string; email: string | null; email_verified: boolean; created_at: string | null; last_sign_in_at: string | null; is_admin: boolean }

export const addAdminByEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((data) => z.object({ email: adminEmailSchema }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: roster, error: rosterError } = await context.cloud.rpc("portal_admin_users");
    if (rosterError) throw new Error("Unable to verify the team roster");
    const { logAdminAction } = await import("@/lib/firebase/audit.server");
    return onboardAdmin(data.email, {
      find: async (email) => ((roster ?? []) as PortalAdminRow[]).find((row) => row.email?.toLowerCase() === email)?.uid ?? null,
      create: async (email) => {
        if (!process.env["SUPABASE_URL"] || !process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
          throw new Error("New account creation is not configured on this host. Existing accounts can still be granted access from Team accounts.");
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // No shared temporary password: only the recipient can set one by email recovery.
        const { data: account, error } = await supabaseAdmin.auth.admin.createUser({ email, email_confirm: true });
        if (error || !account.user) throw new Error("Couldn’t create this account. If it already exists, refresh Team accounts and try again.");
        return account.user.id;
      },
      grant: async (uid) => {
        const { error } = await context.cloud.rpc("set_portal_admin_role", { target_uid: uid, make_admin: true });
        if (error) throw new Error("Account exists, but admin access could not be granted. Refresh Team accounts and try again.");
      },
      audit: async (uid) => {
        await logAdminAction(context.user, { action: "grant_admin", targetType: "user", targetId: uid, details: `${context.user.email ?? context.user.uid} granted admin access to ${data.email}` });
      },
    });
  });

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { data, error } = await context.cloud.rpc("portal_admin_users");
    if (error) throw new Error("Unable to load team accounts");
    return ((data ?? []) as PortalAdminRow[]).map((record): AdminUserRecord => ({
      uid: record.uid, email: record.email, displayName: null,
      emailVerified: record.email_verified, disabled: false, mfaEnrolled: false,
      isAdmin: record.is_admin, createdAt: record.created_at, lastSignInAt: record.last_sign_in_at,
    }));
  });

export const setAdminRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((data) => z.object({ uid: z.string().uuid().min(1), admin: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const caller = context.user;
    if (caller.uid === data.uid && !data.admin) {
      throw new Error("You cannot revoke your own admin access");
    }
    const { logAdminAction } = await import("@/lib/firebase/audit.server");
    const { error } = await context.cloud.rpc("set_portal_admin_role", { target_uid: data.uid, make_admin: data.admin });
    if (error) throw new Error(error.message);
    await logAdminAction(caller, {
      action: data.admin ? "grant_admin" : "revoke_admin",
      targetType: "user",
      targetId: data.uid,
      details: `${caller.email ?? caller.uid} ${data.admin ? "granted" : "revoked"} admin for ${data.uid}`,
    });
    return { uid: data.uid, isAdmin: data.admin };
  });

export const fetchAuditLogEntries = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { listAuditLogs } = await import("@/lib/firebase/audit.server");
    return listAuditLogs(100);
  });
