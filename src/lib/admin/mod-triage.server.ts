import { autoTriageDecision, AUTO_TRIAGE_BATCH_LIMIT } from "./mod-triage";
import { moderationAct, moderationCopilot } from "./ops-moderation.server";
import { listReports } from "./content.server";
import type { AdminUser } from "../firebase/verify.server";

export interface TriageRunItem {
  reportId: string;
  topic: string;
  claimStatement: string;
  verdict: string;
  confidence: string;
  action: string | null;
  correctedNumber: number | null;
  outcome: "auto_resolved" | "would_resolve" | "left_for_admin" | "error";
  reason: string;
  sources: Array<{ url: string; title: string }>;
}

export interface TriageRunResult {
  dryRun: boolean;
  checked: number;
  autoResolved: number;
  leftForAdmin: number;
  errors: number;
  remaining: number;
  items: TriageRunItem[];
}

/** Review pending reports with the grounded copilot; auto-resolve only unambiguous ones. */
export async function runModQueueTriage(opts: { dryRun: boolean; limit?: number; actor?: AdminUser }): Promise<TriageRunResult> {
  if (opts.limit !== undefined && (!Number.isInteger(opts.limit) || opts.limit < 1)) throw new Error("Invalid batch limit.");
  const limit = Math.min(opts.limit ?? AUTO_TRIAGE_BATCH_LIMIT, AUTO_TRIAGE_BATCH_LIMIT);
  const pending = (await listReports({ status: "pending_review", limit: 200 })).slice(0, limit);
  const items: TriageRunItem[] = [];
  const deadline = Date.now() + 45_000;

  for (const report of pending) {
    if (Date.now() >= deadline) break;
    const base = { reportId: report.id, topic: report.topic, claimStatement: report.claimStatement };
    try {
      const { review, recommendation } = await moderationCopilot(report.id, opts.actor);
      const decision = autoTriageDecision(review, recommendation);
      const item: TriageRunItem = {
        ...base,
        verdict: review.verdict,
        confidence: review.confidence,
        action: recommendation.action,
        correctedNumber: recommendation.correctedNumber ?? null,
        outcome: decision.auto ? (opts.dryRun ? "would_resolve" : "auto_resolved") : "left_for_admin",
        reason: decision.reason,
        sources: review.sources.map((s) => ({ url: s.url, title: s.title })),
      };
      if (decision.auto && !opts.dryRun && recommendation.action) {
        await moderationAct({
          reportId: report.id,
          action: recommendation.action,
          correctedNumber: recommendation.correctedNumber,
          note: `AI auto-triage: ${decision.reason}`,
          copilot: {
            verdict: review.verdict,
            confidence: review.confidence,
            score: review.policy.score,
            needsReview: review.policy.needsReview,
          },
        }, opts.actor);
      }
      items.push(item);
    } catch (error) {
      // Fail closed: any grounding or write failure leaves the report for a human.
      items.push({
        ...base,
        verdict: "unclear",
        confidence: "low",
        action: null,
        correctedNumber: null,
        outcome: "error",
        reason: error instanceof Error ? error.message : "Review failed.",
        sources: [],
      });
    }
  }

  return {
    dryRun: opts.dryRun,
    checked: items.length,
    autoResolved: items.filter((i) => i.outcome === "auto_resolved" || i.outcome === "would_resolve").length,
    leftForAdmin: items.filter((i) => i.outcome === "left_for_admin").length,
    errors: items.filter((i) => i.outcome === "error").length,
    remaining: pending.length - items.length,
    items,
  };
}
