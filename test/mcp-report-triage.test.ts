import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModerationQueueItem } from "@/lib/admin/ops-moderation.server";
import { projectReport, triageExternalReviews } from "@/lib/mcp/reports.server";
import { externalReviewSchema, triageInputSchema } from "@/lib/mcp/triage-schema";
import { AUTO_TRIAGE_BATCH_LIMIT } from "@/lib/admin/mod-triage";

const mocks = vi.hoisted(() => ({ load: vi.fn(), act: vi.fn() }));
vi.mock("@/lib/admin/ops-moderation.server", async (original) => ({
  ...await original<typeof import("@/lib/admin/ops-moderation.server")>(),
  loadPendingItem: mocks.load, moderationAct: mocks.act,
}));
const actor = { uid: "verified-admin", email: null, name: null, isClaimAdmin: false };
const item: ModerationQueueItem = {
  report: { id: "r1", topic: "Speed", claimStatement: "Speed is 70 mph", explanation: "",
    trueNumber: 70, presentedNumber: 40, unit: "mph", reason: "Wrong", feedbackText: "private feedback",
    status: "pending_review", createdAt: null, qualityFlags: [], duplicateFactIds: [], ombudsmanVerdict: null, factId: "f1" },
  fact: { id: "f1", subject: "Cheetah", angle: "Speed", question: "Cheetah speed", claim_template: "Speed is {n} mph",
    true_number: 70, unit: "mph", status: "active", quality_flags: [], context: "", source_urls: [], as_of_year: null },
  duplicates: [], buttons: [{ action: "fix_number", label: "Fix" }, { action: "reject", label: "Reject" }],
};
async function review() {
  return externalReviewSchema.parse({ reportId: "r1", expectedSnapshot: (await projectReport(item)).snapshot,
    verdict: "fix_number", confidence: "high", correctedNumber: 65, rationale: "Both sources state 65 mph.",
    sources: ["a.org", "b.org"].map((host) => ({ url: `https://${host}/speed`, title: host,
      excerpts: ["Top speed is 65 mph."], value: 65, unit: "mph", stance: "supports" })) });
}
describe("external MCP triage safeguards", () => {
  beforeEach(() => { mocks.load.mockReset().mockResolvedValue(item); mocks.act.mockReset().mockResolvedValue({ ok: true }); });
  it("raises the batch capacity from 10 to 50", async () => {
    expect(AUTO_TRIAGE_BATCH_LIMIT).toBe(50);
    expect(triageInputSchema.reviews.safeParse(Array.from({ length: 50 }, () => awaitValue)).success).toBe(false);
    const input = await review();
    expect(triageInputSchema.reviews.safeParse(Array(50).fill(input)).success).toBe(true);
    expect(triageInputSchema.reviews.safeParse(Array(51).fill(input)).success).toBe(false);
  });
  it("defaults to a no-write dry run", async () => {
    expect(triageInputSchema.dryRun.parse(undefined)).toBe(true);
    const result = await triageExternalReviews([await review()], true, false, actor);
    expect(result.results[0]?.outcome).toBe("would_resolve");
    expect(mocks.act).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation before a live batch", async () => {
    await expect(triageExternalReviews([await review()], false, false, actor)).rejects.toThrow("confirmation");
    expect(mocks.act).not.toHaveBeenCalled();
  });
  it("applies through moderation with the verified caller and evidence audit", async () => {
    expect((await triageExternalReviews([await review()], false, true, actor)).results[0]?.outcome).toBe("resolved");
    expect(mocks.act).toHaveBeenCalledWith(expect.objectContaining({ correctedNumber: 65,
      copilot: expect.objectContaining({ origin: "external-mcp", sources: expect.arrayContaining([expect.objectContaining({ value: 65 })]) }) }), actor);
  });
  it("leaves conflicting evidence for an admin", async () => {
    const input = await review(); input.sources[1].value = 66;
    expect((await triageExternalReviews([input], false, true, actor)).results[0]?.outcome).toBe("left_for_admin");
    expect(mocks.act).not.toHaveBeenCalled();
  });
  it("blocks a stale report snapshot", async () => {
    const input = await review(); mocks.load.mockResolvedValue({ ...item, fact: { ...item.fact, true_number: 80 } });
    expect((await triageExternalReviews([input], false, true, actor)).results[0]?.reason).toContain("changed");
    expect(mocks.act).not.toHaveBeenCalled();
  });
  it("blocks same-domain evidence", async () => {
    const input = await review(); input.sources[1].url = "https://www.a.org/other";
    expect((await triageExternalReviews([input], false, true, actor)).results[0]?.outcome).toBe("left_for_admin");
    expect(mocks.act).not.toHaveBeenCalled();
  });
  it("excludes free-form player feedback from context", async () => {
    expect(JSON.stringify(await projectReport(item))).not.toContain("private feedback");
  });
  it("stops before writes when the client cancels", async () => {
    const controller = new AbortController(); controller.abort();
    const result = await triageExternalReviews([await review()], false, true, actor, { signal: controller.signal, progress: vi.fn() });
    expect(result.unprocessedReportIds).toEqual(["r1"]);
    expect(mocks.act).not.toHaveBeenCalled();
  });
});