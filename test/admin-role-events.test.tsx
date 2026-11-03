import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const harness = vi.hoisted(() => ({
  update: vi.fn(), add: vi.fn(), reset: vi.fn(), invalidate: vi.fn(),
  users: [] as { uid: string; email: string; isAdmin: boolean }[],
}));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => [initial, vi.fn()],
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: harness.users }),
  useQueryClient: () => ({ invalidateQueries: harness.invalidate }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/admin/roles.functions", () => ({
  listAdminUsers: vi.fn(), setAdminRole: harness.update, addAdminByEmail: harness.add,
}));
vi.mock("@/admin/auth", () => ({ useAdminAuth: () => ({ user: { uid: "caller" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { resetPasswordForEmail: harness.reset } } }));
vi.mock("@/index", () => ({ Badge: "span", Button: "button", Card: "div" }));
import { Route } from "@/routes/admin/roles";

type ElementProps = { children?: unknown; onClick?: () => Promise<void>; onSubmit?: (event: { preventDefault: () => void }) => Promise<void> };
function findElement(tree: unknown, predicate: (element: ReactElement<ElementProps>) => boolean): ReactElement<ElementProps> | undefined {
  if (Array.isArray(tree)) {
    for (const child of tree) { const found = findElement(child, predicate); if (found) return found; }
    return;
  }
  if (!tree || typeof tree !== "object" || !("props" in tree)) return;
  const element = tree as ReactElement<ElementProps>;
  return predicate(element) ? element : findElement(element.props.children, predicate);
}
function screen() {
  const options = Route as unknown as { component: () => unknown };
  return options.component();
}
async function toggle(label: string) {
  const button = findElement(screen(), (element) => element.type === "button" && element.props.children === label);
  if (!button?.props.onClick) throw new Error("Role button missing");
  await button.props.onClick();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
async function add() {
  const form = findElement(screen(), (element) => element.type === "form");
  if (!form?.props.onSubmit) throw new Error("Add admin form missing");
  await form.props.onSubmit({ preventDefault: vi.fn() });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("successful admin role events", () => {
  const track = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    harness.users = [{ uid: "target", email: "private@example.test", isAdmin: false }];
    harness.update.mockResolvedValue({});
    harness.add.mockResolvedValue({ uid: "target", email: "private@example.test" });
    harness.reset.mockResolvedValue({ error: null });
    vi.stubGlobal("window", { confirm: () => true, location: { origin: "http://localhost:8080" }, __lovableEvents: { track } });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("emits grant only after the role request succeeds, with no personal data", async () => {
    let finish: (() => void) | undefined;
    harness.update.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const running = toggle("Make admin");
    expect(track).not.toHaveBeenCalled();
    finish?.();
    await running;
    expect(track.mock.calls).toEqual([["project.admin_role_changed", { change_type: "grant", outcome: "succeeded" }]]);
  });
  it("emits revoke after success", async () => {
    harness.users[0].isAdmin = true;
    await toggle("Revoke admin");
    expect(track.mock.calls).toEqual([["project.admin_role_changed", { change_type: "revoke", outcome: "succeeded" }]]);
  });
  it("emits nothing for a rejected role change", async () => {
    harness.update.mockRejectedValue(new Error("Private account error"));
    await toggle("Make admin");
    expect(track).not.toHaveBeenCalled();
  });
  it("emits nothing when confirmation is cancelled", async () => {
    window.confirm = () => false;
    await toggle("Make admin");
    expect(harness.update).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });
  it("records a successful onboarding grant even if the setup email fails", async () => {
    harness.reset.mockResolvedValue({ error: new Error("Delivery failed") });
    await add();
    expect(track.mock.calls).toEqual([["project.admin_role_changed", { change_type: "grant", outcome: "succeeded" }]]);
  });
  it("does not count retrying setup for an existing admin as a role change", async () => {
    harness.users[0].isAdmin = true;
    await add();
    expect(track).not.toHaveBeenCalled();
  });
  it("emits nothing for failed onboarding", async () => {
    harness.add.mockRejectedValue(new Error("Grant failed"));
    await add();
    expect(track).not.toHaveBeenCalled();
  });
});