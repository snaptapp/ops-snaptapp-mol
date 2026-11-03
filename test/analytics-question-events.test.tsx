import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const harness = vi.hoisted(() => ({ flag: vi.fn(), refetch: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => [initial, vi.fn()],
  useEffect: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => queryKey[0] === "question-telemetry"
    ? { data: [{ questionId: "private-question-id", claim: "Private question text", kind: "fact", answered: 30, accuracy: 0.2, skipRate: 0.1 }], refetch: harness.refetch }
    : queryKey[0] === "analytics"
      ? { data: { total: 30, byMode: [], byLobby: [], byVerified: [], byCategory: [] } }
      : {},
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/admin/ops.functions", () => ({
  fetchGameAnalytics: vi.fn(), fetchLaunchAnalytics: vi.fn(), fetchQuestionTelemetry: vi.fn(), flagQuestionTelemetry: harness.flag,
}));
vi.mock("@/lib/admin/site-analytics.functions", () => ({ fetchSearchConsole: vi.fn() }));
vi.mock("@/admin/AdminShell", () => ({ ErrorNote: "div", PageHead: "div" }));
vi.mock("@/index", () => ({ Badge: "span", Button: "button", Card: "div", CardLabel: "span", CardTitle: "h2" }));
import { Route } from "@/routes/admin/analytics";

type Props = { children?: unknown; onClick?: () => Promise<void> };
function findAction(tree: unknown): ReactElement<Props> | undefined {
  if (Array.isArray(tree)) {
    for (const child of tree) { const found = findAction(child); if (found) return found; }
    return;
  }
  if (!tree || typeof tree !== "object" || !("props" in tree)) return;
  const element = tree as ReactElement<Props>;
  if (element.type === "button" && String(element.props.children).trim() === "Flag for review") return element;
  return findAction(element.props.children);
}
function action() {
  const tree = (Route as unknown as { component: () => unknown }).component();
  const button = findAction(tree);
  if (!button?.props.onClick) throw new Error("Question flag action missing");
  return button.props.onClick;
}

describe("question flag analytics", () => {
  const track = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    harness.flag.mockResolvedValue({ reportId: "private-report", alreadyReviewed: false });
    harness.refetch.mockResolvedValue({});
    vi.stubGlobal("window", { __lovableEvents: { track } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it("records only category and successful outcome after the request completes", async () => {
    let finish: (() => void) | undefined;
    harness.flag.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const run = action()();
    expect(track).not.toHaveBeenCalled();
    finish?.();
    await run;
    expect(track.mock.calls).toEqual([["project.analytics_question_flagged", { action_category: "flag_for_review", outcome: "succeeded" }]]);
    expect(harness.refetch).toHaveBeenCalledOnce();
  });
  it("records only category and failed outcome on rejection", async () => {
    harness.flag.mockRejectedValue(new Error("Private content or player details"));
    await action()();
    expect(track.mock.calls).toEqual([["project.analytics_question_flagged", { action_category: "flag_for_review", outcome: "failed" }]]);
    expect(harness.refetch).not.toHaveBeenCalled();
  });
  it("does not misclassify a saved flag when refreshing fails", async () => {
    harness.refetch.mockRejectedValue(new Error("Refresh failed"));
    await action()();
    expect(track.mock.calls).toEqual([["project.analytics_question_flagged", { action_category: "flag_for_review", outcome: "succeeded" }]]);
  });
  it("does not emit on render", () => { action(); expect(track).not.toHaveBeenCalled(); });
  it("still refreshes without the injected tracking runtime", async () => {
    vi.stubGlobal("window", {});
    await action()();
    expect(harness.refetch).toHaveBeenCalledOnce();
  });
  it("still refreshes if tracking throws", async () => {
    track.mockImplementation(() => { throw new Error("Tracking unavailable"); });
    await action()();
    expect(harness.refetch).toHaveBeenCalledOnce();
  });
});