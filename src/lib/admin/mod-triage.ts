/**
 * Auto-triage decision gate (pure, client-safe).
 *
 * The AI may only press a moderation button when the evidence is unambiguous.
 * Everything else stays in the human queue.
 */

import type { CopilotReview } from "./report-copilot.server";
import type { ModerationAction, ModerationRecommendation } from "./ops-moderation.server";

/** Actions the auto-triager may take on its own. Edits/duplicates/add-to-bank stay human. */
export const AUTO_TRIAGE_ACTIONS: readonly ModerationAction[] = ["reject", "resolve_as_is", "fix_number", "retire_fact"];

/** Minimum independent supporting sources for an automatic action. */
export const AUTO_TRIAGE_MIN_SOURCES = 2;

/** Maximum reports reviewed per run, so one run fits a single request. */
export const AUTO_TRIAGE_BATCH_LIMIT = 50;

export interface AutoTriageDecision {
  auto: boolean;
  reason: string;
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** True for any Wikipedia host (en.wikipedia.org, en.m.wikipedia.org, wikipedia.org). */
export function isWikipediaUrl(url: string): boolean {
  const h = host(url);
  return h === "wikipedia.org" || h.endsWith(".wikipedia.org");
}

/**
 * Wikipedia rule: when sources contradict each other and one of the disputed
 * sources is Wikipedia, the claim is not auto-resolved. Wikipedia is never the
 * tie-breaker; a non-Wikipedia replacement source must be found first.
 */
export function needsWikipediaReplacement(
  sources: Pick<CopilotReview["sources"][number], "url" | "conflicting" | "stance">[],
): boolean {
  const disputed = sources.some((s) => s.conflicting || s.stance === "contradicts");
  return disputed && sources.some((s) => isWikipediaUrl(s.url));
}

export function autoTriageDecision(
  review: Pick<CopilotReview, "verdict" | "confidence" | "sources" | "policy">,
  recommendation: Pick<ModerationRecommendation, "apply" | "action" | "reason">,
): AutoTriageDecision {
  if (!recommendation.apply || !recommendation.action) {
    return { auto: false, reason: recommendation.reason };
  }
  if (!AUTO_TRIAGE_ACTIONS.includes(recommendation.action)) {
    return { auto: false, reason: `"${recommendation.action}" always needs a human.` };
  }
  if (review.confidence !== "high" || review.policy.needsReview) {
    return { auto: false, reason: `Confidence is ${review.confidence}; only high confidence is automatic.` };
  }
  if (needsWikipediaReplacement(review.sources)) {
    return { auto: false, reason: "Sources contradict and one is Wikipedia; find a non-Wikipedia replacement source before any automatic action." };
  }
  if (review.sources.some((s) => s.conflicting || s.stance === "contradicts" || s.incomparable)) {
    return { auto: false, reason: "At least one source conflicts or cannot be compared." };
  }
  // Wikipedia is a lead, never evidence: its pages are excluded from support.
  const supporting = review.sources.filter((s) => s.stance === "supports");
  const independent = new Set(supporting.filter((s) => !isWikipediaUrl(s.url)).map((s) => host(s.url)));
  if (independent.size < AUTO_TRIAGE_MIN_SOURCES) {
    const wikiExcluded = supporting.length > independent.size && supporting.some((s) => isWikipediaUrl(s.url));
    const hint = wikiExcluded ? " Wikipedia cannot count as evidence; cite the primary source it points to." : "";
    return { auto: false, reason: `Only ${independent.size} independent supporting source(s); need ${AUTO_TRIAGE_MIN_SOURCES}.${hint}` };
  }
  return { auto: true, reason: `${independent.size} independent sources agree with high confidence.` };
}
