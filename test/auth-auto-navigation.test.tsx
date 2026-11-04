import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  user: null as { email: string } | null,
  ready: true,
  search: {} as { access?: string; next?: string },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ ...options, useSearch: () => harness.search }),
  useNavigate: () => vi.fn(),
  Navigate: "auto-navigation",
  Link: "a",
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (value: unknown) => [value, vi.fn()],
}));
vi.mock("@/admin/auth", () => ({ useAdminAuth: () => ({ user: harness.user, ready: harness.ready, signOutAdmin: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));
vi.mock("@/integrations/lovable/index", () => ({ lovable: { auth: {} } }));
vi.mock("@/index", () => ({ Button: "button", Card: "section", CardTitle: "h2" }));
import { Route } from "@/routes/auth";

function render() {
  return (Route as unknown as { component: () => { type: unknown; props: Record<string, unknown> } }).component();
}
describe("automatic portal entry", () => {
  beforeEach(() => {
    harness.user = { email: "admin@example.test" };
    harness.ready = true;
    harness.search = {};
  });
  it("sends a signed-in account straight to /admin with history replacement", () => {
    expect(render()).toMatchObject({ type: "auto-navigation", props: { to: "/admin", replace: true } });
  });
  it("preserves the requested page after sign-in", () => {
    harness.search = { next: "/admin/analytics" };
    expect(render()).toMatchObject({ type: "auto-navigation", props: { to: "/admin/analytics" } });
  });
  it("does not redirect denied accounts back into an access-check loop", () => {
    harness.search = { access: "denied" };
    expect(render().type).toBe("main");
  });
  it("waits for the session before navigating", () => {
    harness.ready = false;
    expect(render().type).toBe("main");
  });
  it("keeps signed-out accounts on the sign-in screen", () => {
    harness.user = null;
    expect(render().type).toBe("main");
  });
});