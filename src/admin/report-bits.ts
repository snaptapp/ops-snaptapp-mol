import type { fetchReports } from "@/lib/admin/content.functions";
import type { runReportCopilot } from "@/lib/admin/report-copilot.functions";

export type Entry = Awaited<ReturnType<typeof fetchReports>>[number];

/**
 * Firestore revisions of the fact documents an admin reviewed, sent with the
 * moderation action so the transaction can abort when any of them changed.
 * Facts without a stored `updateTime` cannot be bound and are skipped. The
 * first non-empty revision per fact id wins: callers prepend the revisions
 * captured at review time so refreshed props or a manual lookup cannot
 * overwrite the version the reviewer actually saw.
 */
export function factRevisions(
  facts: ReadonlyArray<{ id: string; updateTime?: string | null } | null | undefined>,
): Array<{ id: string; updateTime: string }> {
  const seen = new Map<string, string>();
  for (const fact of facts) {
    if (fact?.updateTime && !seen.has(fact.id)) {
      seen.set(fact.id, fact.updateTime);
    }
  }
  return [...seen.entries()].map(([id, updateTime]) => ({ id, updateTime }));
}

export type CopilotResult = Awaited<ReturnType<typeof runReportCopilot>>;

export const COPILOT_VERDICTS: Record<CopilotResult["verdict"], { label: string; tone: "lime" | "red" | "amber" | "purple" | "neutral" }> = {
  uphold_fact: { label: "Uphold fact", tone: "lime" },
  fix_number: { label: "Fix number", tone: "amber" },
  edit_fact: { label: "Edit fact", tone: "purple" },
  retire_fact: { label: "Retire fact", tone: "red" },
  resolve_duplicate: { label: "Resolve duplicate", tone: "amber" },
  add_to_bank: { label: "Add to fact bank", tone: "purple" },
  resolve_as_is: { label: "Accept as-is", tone: "lime" },
  reject: { label: "Reject report", tone: "neutral" },
  unclear: { label: "Unclear", tone: "neutral" },
};


/**
 * Adds the revision of each fact id not already tracked. Earlier revisions win,
 * so a candidate first shown (or manually looked up) keeps the version the
 * reviewer saw even when a later refetch reports a newer one. Returns the same
 * array when nothing new was added.
 */
export function trackFirstSeenRevisions(
  tracked: ReadonlyArray<{ id: string; updateTime: string }>,
  incoming: ReadonlyArray<{ id: string; updateTime?: string | null } | null | undefined>,
): ReadonlyArray<{ id: string; updateTime: string }> {
  const known = new Set(tracked.map((f) => f.id));
  const added = factRevisions(incoming).filter((f) => !known.has(f.id));
  return added.length > 0 ? [...tracked, ...added] : tracked;
}
