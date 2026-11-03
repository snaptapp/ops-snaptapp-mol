import { ToolError, type ToolContext } from "@lovable.dev/mcp-js";

export async function requireMcpAdmin(ctx: ToolContext) {
  const token = ctx.getToken();
  if (!ctx.isAuthenticated() || !token) throw new ToolError("Sign in with an admin account.");
  const { cloudAdminForToken } = await import("@/lib/admin/cloud-auth.server");
  return cloudAdminForToken(token).catch(() => {
    throw new ToolError("A confirmed, currently authorized admin account is required.");
  });
}