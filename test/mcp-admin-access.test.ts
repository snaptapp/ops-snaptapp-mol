import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ToolContext } from "@lovable.dev/mcp-js";
import { requireMcpAdmin } from "../src/lib/mcp/access";

const { authorize } = vi.hoisted(() => ({ authorize: vi.fn() }));
vi.mock("../src/lib/admin/cloud-auth.server", () => ({ cloudAdminForToken: (token: string) => authorize(token) }));
const context = (authenticated: boolean, token: string | null) => ({
  isAuthenticated: () => authenticated, getToken: () => token,
}) as ToolContext;

describe("MCP admin authorization", () => {
  beforeEach(() => authorize.mockReset());
  it("denies anonymous calls before touching privileged helpers", async () => {
    await expect(requireMcpAdmin(context(false, null))).rejects.toThrow("Sign in");
    expect(authorize).not.toHaveBeenCalled();
  });
  it("rechecks live role access on every verified OAuth call", async () => {
    authorize.mockResolvedValue({ user: { uid: "admin" } });
    const ctx = context(true, "verified-oauth-token");
    await requireMcpAdmin(ctx);
    await requireMcpAdmin(ctx);
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(authorize).toHaveBeenCalledWith("verified-oauth-token");
  });
  it("fails closed when the live role check denies or is unavailable", async () => {
    authorize.mockImplementation(() => { throw new Error("private provider details"); });
    const result = await requireMcpAdmin(context(true, "token")).then(() => "allowed", () => "denied");
    expect(result).toBe("denied");
  });
});