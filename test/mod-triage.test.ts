import { describe, expect, it } from "vitest";
import { autoTriageDecision } from "../src/lib/admin/mod-triage";

const src = (url: string, stance: "supports" | "contradicts" = "supports", conflicting = false) =>
  ({ url, title: url, excerpts: [], stance, conflicting });
const review = (over: Record<string, unknown> = {}) => ({
  verdict: "reject" as const,
  confidence: "high" as const,
  sources: [src("https://a.org/x"), src("https://b.org/y")],
  policy: { needsReview: false } as never,
  ...over,
}) as never;
const rec = (action: string | null = "reject", apply = true) => ({ apply, action: action as never, reason: "r" });

describe("auto-triage decision gate", () => {
  it("auto-resolves with 2 independent agreeing sources at high confidence", () => {
    expect(autoTriageDecision(review(), rec()).auto).toBe(true);
  });
  it("leaves single-source reports for a human", () => {
    expect(autoTriageDecision(review({ sources: [src("https://a.org/1"), src("https://www.a.org/2")] }), rec()).auto).toBe(false);
  });
  it("leaves conflicting sources for a human", () => {
    expect(autoTriageDecision(review({ sources: [src("https://a.org"), src("https://b.org", "contradicts")] }), rec()).auto).toBe(false);
  });
  it("leaves medium confidence for a human", () => {
    expect(autoTriageDecision(review({ confidence: "medium" }), rec()).auto).toBe(false);
  });
  it("never auto-edits fact text", () => {
    expect(autoTriageDecision(review(), rec("edit_fact")).auto).toBe(false);
  });
  it("respects a blocked recommendation", () => {
    expect(autoTriageDecision(review(), rec("reject", false)).auto).toBe(false);
  });
});
