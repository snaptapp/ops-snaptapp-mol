import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "./middleware";

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { requireCloudAdmin } = await import("./cloud-auth.server");
    const { client } = await requireCloudAdmin();
    const { data, error } = await client.rpc("portal_admin_users");
    if (error) throw new Error("Unable to load team accounts");
    return (data ?? []).map((record) => ({
      uid: record.uid, email: record.email, displayName: null,
      emailVerified: record.email_verified, disabled: false, mfaEnrolled: false,
      isAdmin: record.is_admin, createdAt: record.created_at, lastSignInAt: record.last_sign_in_at,
    }));
  });

export const setAdminRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((data) => z.object({ uid: z.string().uuid(), admin: z.boolean() }).parse(data))
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
