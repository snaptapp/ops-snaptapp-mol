import { ToolError } from "@lovable.dev/mcp-js";
import type { AdminUser } from "@/lib/firebase/verify.server";
import { listReports } from "@/lib/admin/content.server";
import { loadPendingItem, moderationAct, recommendModerationAction, reviewedFactRevisions, type ModerationQueueItem } from "@/lib/admin/ops-moderation.server";
import { applySourcePolicy, type CopilotReview } from "@/lib/admin/report-copilot.server";
import { autoTriageDecision } from "@/lib/admin/mod-triage";
import { externalReviewSchema, type ExternalReview } from "./triage-schema";

/** Omit player identities and free-form player feedback from the remote catalog. */
export async function projectReport(item: ModerationQueueItem) {
  const { report, fact, duplicates, buttons } = item;
  const summary = {
    report: { id: report.id, topic: report.topic, claimStatement: report.claimStatement,
      trueNumber: report.trueNumber, presentedNumber: report.presentedNumber, unit: report.unit,
      status: report.status, qualityFlags: report.qualityFlags },
    fact: fact ? { ...fact, quality_flags: [...fact.quality_flags], source_urls: [...fact.source_urls] } : null,
    duplicates: duplicates.map((candidate) => ({ ...candidate, quality_flags: [...candidate.quality_flags], source_urls: [...candidate.source_urls] })),
    actions: buttons.map(({ action, requires }) => ({ action, requires: requires ?? [] })),
  };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(summary)));
  const snapshot = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { ...summary, snapshot };
}

export async function pendingReports(limit: number, offset: number) {
  const reports = await listReports({ status: "pending_review", limit: limit + 1, offset });
  const items = [];
  for (const report of reports.slice(0, limit)) items.push(await projectReport(await loadPendingItem(report.id)));
  return { items, nextOffset: reports.length > limit ? offset + items.length : null };
}

/** No server model call: the external assistant supplies its own web-search evidence. */
export async function triageExternalReviews(
  reviews: ExternalReview[], dryRun: boolean, confirmApply: boolean, actor: AdminUser,
  control?: { signal: AbortSignal; progress: (completed: number) => Promise<void> },
) {
  if (!dryRun && !confirmApply) throw new ToolError("Explicit confirmation is required before applying resolutions.");
  if (new Set(reviews.map((review) => review.reportId)).size !== reviews.length) throw new ToolError("Submit each report only once per batch.");
  const results: Array<{ reportId: string; outcome: string; action: string | null; reason: string }> = [];
  const deadline = Date.now() + 20_000;
  for (const raw of reviews) {
    if (control?.signal.aborted || Date.now() >= deadline) break;
    const input = externalReviewSchema.parse(raw);
    try {
      const item = await loadPendingItem(input.reportId);
      if ((await projectReport(item)).snapshot !== input.expectedSnapshot) throw new Error("Report or fact changed; fetch and review it again.");
      const sources = input.sources.map((source) => ({ ...source, excerpts: [...source.excerpts], conflicting: false }));
      const target = input.correctedNumber ?? item.fact?.true_number ?? item.report.trueNumber;
      const policy = applySourcePolicy(sources, target, input.confidence, {
        unit: item.fact?.unit ?? item.report.unit,
        period: item.fact?.as_of_year != null ? String(item.fact.as_of_year) : undefined,
      });
      const review: CopilotReview = {
        verdict: input.verdict, confidence: policy.confidence, rationale: input.rationale,
        suggested: { true_number: input.correctedNumber }, sources, policy: policy.policy, model: "external-assistant",
      };
      const recommendation = recommendModerationAction(review, item.buttons);
      const decision = autoTriageDecision(review, recommendation);
      if (target == null || !Number.isFinite(target)) decision.auto = false;
      if (decision.auto && !dryRun && recommendation.action) {
        if (control?.signal.aborted) break;
        await moderationAct({ reportId: input.reportId, action: recommendation.action,
          expectedFacts: reviewedFactRevisions(item),
          correctedNumber: recommendation.correctedNumber, note: `External MCP review: ${input.rationale}`,
          copilot: { verdict: review.verdict, confidence: review.confidence, score: review.policy.score,
            needsReview: review.policy.needsReview, sources, warnings: review.policy.reasons,
            rationale: input.rationale, origin: "external-mcp" },
        }, actor);
      }
      results.push({ reportId: input.reportId, outcome: decision.auto ? (dryRun ? "would_resolve" : "resolved") : "left_for_admin",
        action: recommendation.action, reason: target == null ? "A finite comparison target is required." : decision.reason });
    } catch (error) {
      results.push({ reportId: input.reportId, outcome: "error", action: null, reason: error instanceof Error ? error.message : "Review failed; no resolution confirmed." });
    }
    await control?.progress(results.length);
  }
  return { dryRun, evidenceOrigin: "External assistant supplied; not independently fetched by this server.", results,
    unprocessedReportIds: reviews.slice(results.length).map((review) => review.reportId) };
}