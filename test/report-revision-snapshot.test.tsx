import { createElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { factRevisions, trackFirstSeenRevisions } from "@/admin/report-bits";
import { ReportCard } from "@/admin/ReportCard";
import { BulkDuplicateHub } from "@/admin/BulkDuplicateHub";

// Persistent hook slots let direct component invocations behave like repeated
// renders of the same mounted instance: useState initializers run once and
// later invocations observe the values captured by earlier ones.
const reactHarness = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  resetCursor() {
    this.cursor = 0;
  },
}));

const serverHarness = vi.hoisted(() => ({
  mutationOptions: [] as Array<{
    mutationFn?: (params: unknown) => Promise<unknown>;
    onSuccess?: () => void;
  }>,
  actCalls: [] as Array<{ data: Record<string, unknown> }>,
  copilotCalls: [] as Array<{ data: Record<string, unknown> }>,
  copilotReview: null as null | Record<string, unknown>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (init: unknown) => {
      const index = reactHarness.cursor;
      reactHarness.cursor += 1;
      if (!(index in reactHarness.slots)) {
        reactHarness.slots[index] =
          typeof init === "function" ? (init as () => unknown)() : init;
      }
      const set = (value: unknown) => {
        reactHarness.slots[index] =
          typeof value === "function"
            ? (value as (previous: unknown) => unknown)(reactHarness.slots[index])
            : value;
      };
      return [reactHarness.slots[index], set];
    },
  };
});

vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: { mutationFn?: (params: unknown) => Promise<unknown> }) => {
    serverHarness.mutationOptions.push(options);
    return { data: undefined, error: null, isPending: false, mutate: vi.fn() };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
  useQuery: () => ({ data: [], error: null, isLoading: false, isFetching: false }),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFn: unknown) => serverFn,
}));

vi.mock("@/index", () => ({
  Badge: (props: { children?: ReactNode }) => createElement("span", null, props.children),
  Button: (props: { children?: ReactNode; onClick?: () => void }) =>
    createElement("button", { onClick: props.onClick }, props.children),
  Card: (props: { children?: ReactNode }) => createElement("div", null, props.children),
  CardTitle: (props: { children?: ReactNode }) => createElement("h3", null, props.children),
  CardLabel: (props: { children?: ReactNode }) => createElement("label", null, props.children),
}));

vi.mock("@/admin/AdminShell", () => ({
  ErrorNote: () => null,
  statusTone: () => "neutral",
}));

vi.mock("@/admin/LintFindings", () => ({
  LintFindings: () => null,
}));

vi.mock("@/lib/admin/duplicate-resolution", () => ({
  isDuplicateDecisionSafe: () => ({ safe: true, reasons: [] }),
}));

vi.mock("@/lib/admin/content.functions", () => ({
  actOnReport: vi.fn(async (input: { data: Record<string, unknown> }) => {
    serverHarness.actCalls.push(input);
    return input.data;
  }),
  fetchFact: vi.fn(async () => null),
}));

vi.mock("@/lib/admin/report-copilot.functions", () => ({
  runReportCopilot: vi.fn(async (input: { data: Record<string, unknown> }) => {
    serverHarness.copilotCalls.push(input);
    return serverHarness.copilotReview;
  }),
  fetchReportAudit: vi.fn(async () => []),
}));

type Entry = Parameters<typeof ReportCard>[0]["entry"];
type HubEntries = Parameters<typeof BulkDuplicateHub>[0]["entries"];

const REV_OLD_FACT = "2026-01-01T00:00:00.000Z";
const REV_OLD_DUP = "2026-01-01T00:00:01.000Z";
const REV_NEW_FACT = "2026-01-02T00:00:00.000Z";
const REV_NEW_DUP = "2026-01-02T00:00:01.000Z";

function makeEntry(updateTimes: {
  fact: string;
  dup: string;
}): Entry {
  return {
    report: {
      id: "rep_1",
      status: "pending_review",
      topic: "Seeded Topic",
      claimStatement: "Seeded claim",
      factId: "fact_a",
      duplicateFactIds: ["fact_b"],
      qualityFlags: ["duplicate_question"],
      trueNumber: 70,
      presentedNumber: 60,
      unit: "mph",
      reason: "looks wrong",
      feedbackText: "",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    fact: {
      id: "fact_a",
      status: "active",
      subject: "Seeded",
      subject_key: "seeded",
      angle: "Reveal",
      angle_key: "reveal",
      question: "Seeded question?",
      claim_template: "Seeded claim {n}",
      true_number: 70,
      unit: "mph",
      context: "",
      source_urls: [],
      quality_flags: ["duplicate_question"],
      updateTime: updateTimes.fact,
    },
    duplicateFacts: [
      {
        id: "fact_b",
        status: "active",
        subject: "Seeded",
        subject_key: "seeded",
        angle: "Alt",
        angle_key: "alt",
        question: "Seeded alt?",
        claim_template: "Seeded alt {n}",
        true_number: 71,
        unit: "mph",
        context: "",
        source_urls: [],
        quality_flags: ["duplicate_question"],
        updateTime: updateTimes.dup,
      },
    ],
  } as unknown as Entry;
}

const DUPLICATE_REVIEW = {
  verdict: "resolve_duplicate",
  confidence: "high",
  rationale: "Candidates are duplicates; fact_b is the stronger record.",
  suggested: { true_number: 71 },
  duplicateResolution: {
    action: "keep_one",
    keepFactId: "fact_b",
    retireFactIds: ["fact_a"],
    reason: "Higher quality score wins the collision.",
  },
  sources: [],
  policy: {
    needsReview: false,
    reasons: [],
    modelConfidence: "high",
    score: 90,
    factors: [],
    uncalibrated: true,
  },
  model: "test-model",
};

function* walkElements(node: unknown): Generator<Record<string, unknown>> {
  if (node === null || node === undefined || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) yield* walkElements(child);
    return;
  }
  const element = node as { props?: Record<string, unknown> };
  if (!element.props) return;
  yield element as Record<string, unknown>;
  yield* walkElements(element.props["children"]);
}

function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object") {
    const element = node as { props?: { children?: unknown } };
    return textOf(element.props?.children);
  }
  return "";
}

function findClickHandler(root: ReactNode, labelMatch: RegExp): (() => unknown) | undefined {
  for (const element of walkElements(root)) {
    const props = element["props"] as { onClick?: unknown; children?: unknown };
    if (typeof props.onClick === "function" && labelMatch.test(textOf(props.children))) {
      return props.onClick as () => unknown;
    }
  }
  return undefined;
}

function invoke<P>(component: (props: P) => ReactElement | null, props: P): ReactElement | null {
  reactHarness.resetCursor();
  return component(props);
}

beforeEach(() => {
  reactHarness.slots = [];
  reactHarness.cursor = 0;
  serverHarness.mutationOptions = [];
  serverHarness.actCalls = [];
  serverHarness.copilotCalls = [];
  serverHarness.copilotReview = DUPLICATE_REVIEW;
  vi.stubGlobal("window", { confirm: () => true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("factRevisions first-nonempty-wins", () => {
  it("keeps the first revision for a fact id and ignores later tokens", () => {
    expect(
      factRevisions([
        { id: "f1", updateTime: "rev-1" },
        { id: "f1", updateTime: "rev-2" },
        { id: "f2" },
        { id: "f2", updateTime: "rev-3" },
      ]),
    ).toEqual([
      { id: "f1", updateTime: "rev-1" },
      { id: "f2", updateTime: "rev-3" },
    ]);
  });
});

describe("trackFirstSeenRevisions", () => {
  it("keeps a manually looked-up candidate's revision when a refetch later lists it as a duplicate", () => {
    const tracked = factRevisions([{ id: "fact_a", updateTime: "rev-a1" }]);
    // Admin looks up fact_c manually at rev-c1.
    const afterManual = trackFirstSeenRevisions(tracked, [
      { id: "fact_a", updateTime: "rev-a1" },
      { id: "fact_c", updateTime: "rev-c1" },
    ]);
    // Refetch lists fact_c as a duplicate after it changed to rev-c2.
    const afterRefetch = trackFirstSeenRevisions(afterManual, [
      { id: "fact_a", updateTime: "rev-a1" },
      { id: "fact_c", updateTime: "rev-c2" },
    ]);

    expect(afterRefetch).toEqual([
      { id: "fact_a", updateTime: "rev-a1" },
      { id: "fact_c", updateTime: "rev-c1" },
    ]);
  });

  it("returns the same array when nothing new is seen", () => {
    const tracked = factRevisions([{ id: "fact_a", updateTime: "rev-a1" }]);
    expect(trackFirstSeenRevisions(tracked, [{ id: "fact_a", updateTime: "rev-a2" }])).toBe(tracked);
  });
});

describe("ReportCard post-resolution refresh", () => {
  it("waits for the refetch, then reviews the refreshed duplicate revision", async () => {
    const oldEntry = makeEntry({ fact: REV_OLD_FACT, dup: REV_OLD_DUP });
    // The resolution changes the duplicate's revision; the reported fact does not.
    const refreshedEntry = makeEntry({ fact: REV_OLD_FACT, dup: REV_NEW_DUP });

    invoke(ReportCard, { entry: oldEntry });
    serverHarness.mutationOptions.at(-1)?.onSuccess?.();

    // Stale props before the refetch: keep the revisions the reviewer saw.
    invoke(ReportCard, { entry: oldEntry });
    const mutationFn = serverHarness.mutationOptions.at(-1)?.mutationFn;
    await mutationFn!({ action: "fix_number", correctedNumber: 65 });
    expect(serverHarness.actCalls.at(-1)?.data["expectedFacts"]).toEqual([
      { id: "fact_a", updateTime: REV_OLD_FACT },
      { id: "fact_b", updateTime: REV_OLD_DUP },
    ]);

    // Refetch lands with the new duplicate revision: review starts from it.
    invoke(ReportCard, { entry: refreshedEntry });
    await serverHarness.mutationOptions.at(-1)?.mutationFn!({ action: "fix_number", correctedNumber: 65 });
    expect(serverHarness.actCalls.at(-1)?.data["expectedFacts"]).toEqual([
      { id: "fact_a", updateTime: REV_OLD_FACT },
      { id: "fact_b", updateTime: REV_NEW_DUP },
    ]);
  });
});

describe("ReportCard revision snapshot", () => {
  it("sends the reviewed revisions even after props refresh with newer updateTimes", async () => {
    const oldEntry = makeEntry({ fact: REV_OLD_FACT, dup: REV_OLD_DUP });
    const newEntry = makeEntry({ fact: REV_NEW_FACT, dup: REV_NEW_DUP });

    invoke(ReportCard, { entry: oldEntry });
    invoke(ReportCard, { entry: newEntry });

    const mutationFn = serverHarness.mutationOptions.at(-1)?.mutationFn;
    expect(mutationFn).toBeDefined();
    await mutationFn!({ action: "fix_number", correctedNumber: 65 });

    expect(serverHarness.actCalls).toHaveLength(1);
    expect(serverHarness.actCalls[0]?.data["expectedFacts"]).toEqual([
      { id: "fact_a", updateTime: REV_OLD_FACT },
      { id: "fact_b", updateTime: REV_OLD_DUP },
    ]);
  });
});

describe("BulkDuplicateHub revision snapshot", () => {
  it("applies the evaluation-time revisions after props refresh", async () => {
    const oldEntry = makeEntry({ fact: REV_OLD_FACT, dup: REV_OLD_DUP });
    const newEntry = makeEntry({ fact: REV_NEW_FACT, dup: REV_NEW_DUP });

    const firstRender = invoke(BulkDuplicateHub, { entries: [oldEntry] });
    const evaluate = findClickHandler(firstRender, /Evaluate All Duplicates/);
    expect(evaluate).toBeDefined();
    await evaluate!();
    expect(serverHarness.copilotCalls).toHaveLength(1);

    // Simulate a query refetch handing the same report id newer fact revisions.
    const secondRender = invoke(BulkDuplicateHub, { entries: [newEntry] });
    const apply = findClickHandler(secondRender, /Bulk Apply/);
    expect(apply).toBeDefined();
    await apply!();

    expect(serverHarness.actCalls).toHaveLength(1);
    expect(serverHarness.actCalls[0]?.data["expectedFacts"]).toEqual([
      { id: "fact_a", updateTime: REV_OLD_FACT },
      { id: "fact_b", updateTime: REV_OLD_DUP },
    ]);
  });
});
