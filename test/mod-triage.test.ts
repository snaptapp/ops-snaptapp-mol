import { describe, expect, it } from "vitest";
import { autoTriageDecision, isWikipediaUrl, needsWikipediaReplacement } from "../src/lib/admin/mod-triage";

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
  it("blocks auto-resolve when a contradicting source is Wikipedia", () => {
    const sources = [src("https://en.wikipedia.org/wiki/X"), src("https://league.org/y", "contradicts")];
    const decision = autoTriageDecision(review({ sources }), rec());
    expect(decision.auto).toBe(false);
    expect(decision.reason).toContain("non-Wikipedia replacement");
  });
  it("blocks auto-resolve when a Wikipedia source is flagged conflicting", () => {
    const sources = [src("https://a.org/1"), src("https://en.m.wikipedia.org/wiki/X", "supports", true)];
    expect(autoTriageDecision(review({ sources }), rec()).auto).toBe(false);
  });
  it("never counts Wikipedia as support toward the minimum", () => {
    const sources = [src("https://en.wikipedia.org/wiki/X"), src("https://league.org/y")];
    const decision = autoTriageDecision(review({ sources }), rec());
    expect(decision.auto).toBe(false);
    expect(decision.reason).toContain("Wikipedia cannot count as evidence");
  });
  it("does not let Wikipedia plus one primary source reach the minimum", () => {
    const sources = [src("https://en.wikipedia.org/wiki/X"), src("https://en.m.wikipedia.org/wiki/Y"), src("https://league.org/y")];
    expect(autoTriageDecision(review({ sources }), rec()).auto).toBe(false);
  });
  it("accepts two primary sources even when Wikipedia is also listed", () => {
    const sources = [src("https://en.wikipedia.org/wiki/X"), src("https://league.org/y"), src("https://stats.com/z")];
    expect(autoTriageDecision(review({ sources }), rec()).auto).toBe(true);
  });
  it("does not trigger the Wikipedia rule without a contradiction", () => {
    const sources = [src("https://en.wikipedia.org/wiki/X"), src("https://league.org/y")];
    expect(autoTriageDecision(review({ sources }), rec()).reason).not.toContain("replacement source");
  });
  it("does not trigger on a contradiction between non-Wikipedia sources", () => {
    const sources = [src("https://a.org/1"), src("https://b.org/2", "contradicts")];
    expect(needsWikipediaReplacement(sources)).toBe(false);
  });
  it("matches wikipedia hosts but not look-alike domains", () => {
    expect(isWikipediaUrl("https://en.wikipedia.org/wiki/X")).toBe(true);
    expect(isWikipediaUrl("https://wikipedia.org")).toBe(true);
    expect(isWikipediaUrl("https://notwikipedia.org/x")).toBe(false);
    expect(isWikipediaUrl("https://wikipedia.org.evil.com/x")).toBe(false);
  });
  it("respects a blocked recommendation", () => {
    expect(autoTriageDecision(review(), rec("reject", false)).auto).toBe(false);
  });
});
