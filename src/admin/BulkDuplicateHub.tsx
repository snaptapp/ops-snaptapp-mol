/** Hub for batch-resolving duplicate-question reports against live fact candidates. */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge, Button, Card, CardTitle } from "@/index";
import { actOnReport } from "@/lib/admin/content.functions";
import { runReportCopilot } from "@/lib/admin/report-copilot.functions";
import { isDuplicateDecisionSafe } from "@/lib/admin/duplicate-resolution";
import type { DuplicateFactCandidate } from "@/lib/admin/duplicate-resolution";
import { factRevisions, type CopilotResult, type Entry } from "@/admin/report-bits";

export function BulkDuplicateHub({ entries }: { entries: Entry[] }) {
  const queryClient = useQueryClient();
  const runCopilot = useServerFn(runReportCopilot);
  const act = useServerFn(actOnReport);

  const [evaluations, setEvaluations] = useState<
    Record<
      string,
      {
        review: CopilotResult;
        safe: boolean;
        reasons: string[];
        /** Revisions of the facts as they were when the copilot evaluated them. */
        expectedFacts: Array<{ id: string; updateTime: string }>;
      }
    >
  >({});
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalProgress, setEvalProgress] = useState<{ current: number; total: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isApplying, setIsApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ current: number; total: number } | null>(null);
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const handleEvaluateAll = async () => {
    setIsEvaluating(true);
    setApplyResult(null);
    const toEvaluate = entries.filter((e) => !evaluations[e.report.id]);
    const total = toEvaluate.length;
    let current = 0;
    setEvalProgress({ current: 0, total });

    const newEvals = { ...evaluations };
    const newSelected = new Set(selectedIds);

    for (const entry of toEvaluate) {
      current++;
      setEvalProgress({ current, total });
      try {
        const candidateFactIds = [
          ...(entry.duplicateFacts?.map((d) => d.id) ?? []),
          ...(entry.report.duplicateFactIds ?? []),
        ].filter(Boolean);

        // Bind the revisions the reviewer is about to see before the copilot
        // await; a refetch mid-evaluation must not rebind the review.
        const expectedFacts = factRevisions([entry.fact, ...(entry.duplicateFacts ?? [])]);

        const review = await runCopilot({
          data: {
            reportId: entry.report.id,
            candidateFactIds: candidateFactIds.length > 0 ? candidateFactIds : undefined,
          },
        });

        const allCandidates: DuplicateFactCandidate[] = [
          ...(entry.fact
            ? [
                {
                  id: entry.fact.id,
                  subject: entry.fact.subject,
                  angle: entry.fact.angle,
                  question: entry.fact.question,
                  claim_template: entry.fact.claim_template,
                  true_number: entry.fact.true_number,
                  unit: entry.fact.unit,
                  context: entry.fact.context,
                  source_urls: entry.fact.source_urls ?? [],
                  quality_flags: entry.fact.quality_flags ?? [],
                  status: entry.fact.status,
                  quantity_kind: entry.fact.quantity_kind,
                  surprise_factor: entry.fact.surprise_factor,
                },
              ]
            : []),
          ...(entry.duplicateFacts?.map((d) => ({
            id: d.id,
            subject: d.subject,
            angle: d.angle,
            question: d.question,
            claim_template: d.claim_template,
            true_number: d.true_number,
            unit: d.unit,
            context: d.context,
            source_urls: d.source_urls ?? [],
            quality_flags: d.quality_flags ?? [],
            status: d.status,
            quantity_kind: d.quantity_kind,
            surprise_factor: d.surprise_factor,
          })) ?? []),
        ];

        const safety = isDuplicateDecisionSafe(review, allCandidates);
        // The copilot may append server-side candidates (candidateFactIds) that
        // are not in the snapshot. Refuse bulk apply when any resolution ID has
        // no bound revision, because the transaction cannot check it.
        const resolutionIds = [
          review.duplicateResolution?.keepFactId,
          ...(review.duplicateResolution?.retireFactIds ?? []),
        ].filter((id): id is string => Boolean(id));
        const unboundReasons = resolutionIds
          .filter((id) => !expectedFacts.some((f) => f.id === id))
          .map((id) => `Fact ${id} has no reviewed revision; cannot bind it to the resolution.`);
        const reasons = [...safety.reasons, ...unboundReasons];
        const safe = reasons.length === 0;
        newEvals[entry.report.id] = {
          review,
          safe,
          reasons,
          expectedFacts,
        };

        if (safe) {
          newSelected.add(entry.report.id);
        }
      } catch (err) {
        console.error(`Failed to evaluate report ${entry.report.id}:`, err);
      }
    }

    setEvaluations(newEvals);
    setSelectedIds(newSelected);
    setIsEvaluating(false);
    setEvalProgress(null);
  };

  const safeEntries = entries.filter((e) => evaluations[e.report.id]?.safe);
  const needsReviewEntries = entries.filter(
    (e) => evaluations[e.report.id] && !evaluations[e.report.id].safe,
  );
  const unevaluatedCount = entries.filter((e) => !evaluations[e.report.id]).length;

  const toggleSelect = (reportId: string) => {
    const next = new Set(selectedIds);
    if (next.has(reportId)) next.delete(reportId);
    else next.add(reportId);
    setSelectedIds(next);
  };

  const selectAllSafe = () => {
    const next = new Set(selectedIds);
    safeEntries.forEach((e) => next.add(e.report.id));
    setSelectedIds(next);
  };

  const deselectAllSafe = () => {
    const next = new Set(selectedIds);
    safeEntries.forEach((e) => next.delete(e.report.id));
    setSelectedIds(next);
  };

  const handleBulkApply = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(
      `Apply ${selectedIds.size} safe duplicate resolution(s)? All winning facts will remain active and conflicting duplicates will be retired.`,
    );
    if (!confirmed) return;

    setIsApplying(true);
    setApplyResult(null);
    let successCount = 0;
    const toApply = entries.filter((e) => selectedIds.has(e.report.id));
    const total = toApply.length;
    setApplyProgress({ current: 0, total });

    for (let i = 0; i < toApply.length; i++) {
      const entry = toApply[i];
      setApplyProgress({ current: i + 1, total });
      const ev = evaluations[entry.report.id];
      if (!ev?.review?.duplicateResolution || !ev.expectedFacts) continue;

      const dup = ev.review.duplicateResolution;
      try {
        await act({
          data: {
            reportId: entry.report.id,
            action: "resolve_duplicate",
            keepFactId: dup.keepFactId ?? undefined,
            retireFactIds: dup.retireFactIds,
            correctedNumber: ev.review.suggested?.true_number,
            expectedFacts: factRevisions([
              ...ev.expectedFacts,
              entry.fact,
              ...(entry.duplicateFacts ?? []),
            ]),
            note: dup.reason,
            copilot: {
              verdict: ev.review.verdict,
              confidence: ev.review.confidence,
              score: ev.review.policy.score,
              needsReview: ev.review.policy.needsReview,
              prefilled: true,
            },
          },
        });
        successCount++;
      } catch (err) {
        console.error(`Failed to apply duplicate resolution for ${entry.report.id}:`, err);
      }
    }

    setIsApplying(false);
    setApplyProgress(null);
    setSelectedIds(new Set());
    setApplyResult(`Successfully applied ${successCount} of ${total} duplicate resolution(s).`);
    queryClient.invalidateQueries({ queryKey: ["reports"] });
    queryClient.invalidateQueries({ queryKey: ["facts"] });
  };

  if (entries.length === 0) return null;

  return (
    <Card
      style={{
        border: "1px solid var(--ds-arena-color-purple)",
        background: "linear-gradient(180deg, rgba(168, 85, 247, 0.05) 0%, transparent 100%)",
        marginBottom: "var(--ds-arena-space-4)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <CardTitle>⚡ Duplicate Collision Resolution Hub</CardTitle>
            <Badge tone="purple">{entries.length} pending collision(s)</Badge>
            {safeEntries.length > 0 ? (
              <Badge tone="lime">{safeEntries.length} safe to bulk apply</Badge>
            ) : null}
            {needsReviewEntries.length > 0 ? (
              <Badge tone="amber">{needsReviewEntries.length} need review</Badge>
            ) : null}
          </div>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: "0.85em",
              color: "var(--ds-arena-color-text-muted)",
            }}
          >
            Evaluates conflicting duplicate candidates, enforces tie-breaking logic (quality flags, citations, phrasing, stability), and offers 1-click bulk resolution for safe decisions.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {unevaluatedCount > 0 ? (
            <Button
              variant="daily"
              size="sm"
              disabled={isEvaluating}
              onClick={handleEvaluateAll}
            >
              {isEvaluating
                ? `Evaluating ${evalProgress?.current ?? 0}/${evalProgress?.total ?? 0}…`
                : `⚡ Evaluate All Duplicates (${unevaluatedCount} new)`}
            </Button>
          ) : null}

          {safeEntries.length > 0 ? (
            <Button
              variant="primary"
              size="sm"
              disabled={isApplying || selectedIds.size === 0}
              onClick={handleBulkApply}
            >
              {isApplying
                ? `Applying ${applyProgress?.current ?? 0}/${applyProgress?.total ?? 0}…`
                : `✨ Bulk Apply (${selectedIds.size} selected)`}
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? "Collapse Hub" : "Expand Hub"}
          </Button>
        </div>
      </div>

      {applyResult ? (
        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            background: "rgba(16, 185, 129, 0.1)",
            border: "1px solid #10b981",
            borderRadius: 6,
            color: "#10b981",
            fontSize: "0.85em",
          }}
        >
          {applyResult}
        </div>
      ) : null}

      {expanded ? (
        <div style={{ marginTop: "var(--ds-arena-space-3)", display: "flex", flexDirection: "column", gap: 12 }}>
          {safeEntries.length > 0 ? (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: "0.9em", fontWeight: 600, color: "#10b981" }}>
                  🟢 Safe Duplicate Decisions (High Confidence, Score ≥ 75, No Source Conflicts)
                </span>
                <div style={{ display: "flex", gap: 8, fontSize: "0.8em" }}>
                  <button
                    type="button"
                    style={{ background: "none", border: "none", color: "var(--ds-arena-color-purple)", cursor: "pointer" }}
                    onClick={selectAllSafe}
                  >
                    Select All Safe
                  </button>
                  <span>|</span>
                  <button
                    type="button"
                    style={{ background: "none", border: "none", color: "var(--ds-arena-color-text-muted)", cursor: "pointer" }}
                    onClick={deselectAllSafe}
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {safeEntries.map((e) => {
                  const ev = evaluations[e.report.id];
                  const dup = ev?.review?.duplicateResolution;
                  const isChecked = selectedIds.has(e.report.id);
                  return (
                    <div
                      key={e.report.id}
                      style={{
                        padding: "8px 12px",
                        border: "1px solid rgba(16, 185, 129, 0.3)",
                        borderRadius: "var(--ds-arena-radius-sm)",
                        background: isChecked ? "rgba(16, 185, 129, 0.04)" : "transparent",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(e.report.id)}
                        style={{ marginTop: 3 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <strong style={{ fontSize: "0.9em" }}>{e.report.topic || "Untitled Topic"}</strong>
                          <span style={{ fontSize: "0.8em", color: "var(--ds-arena-color-text-muted)" }}>
                            ({e.report.id})
                          </span>
                          <Badge tone="lime">Score {ev.review.policy.score}/100</Badge>
                          <span style={{ fontSize: "0.85em", color: "#10b981", fontWeight: 600 }}>
                            Keep Winner: {dup?.keepFactId ? `Fact ${dup.keepFactId}` : "Fact A"}
                          </span>
                          {dup?.retireFactIds?.length ? (
                            <span style={{ fontSize: "0.85em", color: "#ef4444" }}>
                              Retire: {dup.retireFactIds.join(", ")}
                            </span>
                          ) : null}
                          {ev.review.suggested?.true_number !== undefined ? (
                            <Badge tone="amber">
                              Corrected: {ev.review.suggested.true_number}
                            </Badge>
                          ) : null}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: "0.85em",
                            color: "var(--ds-arena-color-text-muted)",
                          }}
                        >
                          <strong>Tie-break reason:</strong> {dup?.reason}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {needsReviewEntries.length > 0 ? (
            <div style={{ marginTop: safeEntries.length > 0 ? 8 : 0 }}>
              <span style={{ fontSize: "0.9em", fontWeight: 600, color: "#f6c344" }}>
                🟡 Needs Manual Review (Does Not Meet Automated Bulk Safety Threshold)
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                {needsReviewEntries.map((e) => {
                  const ev = evaluations[e.report.id];
                  return (
                    <div
                      key={e.report.id}
                      style={{
                        padding: "8px 12px",
                        border: "1px solid rgba(246, 195, 68, 0.3)",
                        borderRadius: "var(--ds-arena-radius-sm)",
                        background: "rgba(246, 195, 68, 0.04)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <strong style={{ fontSize: "0.9em" }}>{e.report.topic}</strong>
                          <span style={{ fontSize: "0.8em", color: "var(--ds-arena-color-text-muted)" }}>
                            ({e.report.id})
                          </span>
                          <Badge tone="amber">Score {ev.review.policy.score}/100</Badge>
                          <Badge tone="neutral">Confidence: {ev.review.confidence}</Badge>
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: "0.85em",
                            color: "var(--ds-arena-color-amber)",
                          }}
                        >
                          {ev.reasons.join(" • ")}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {unevaluatedCount > 0 && Object.keys(evaluations).length === 0 ? (
            <div style={{ fontSize: "0.85em", color: "var(--ds-arena-color-text-muted)" }}>
              Click <strong>&ldquo;⚡ Evaluate All Duplicates&rdquo;</strong> above to scan candidate pairs and check which are safe to bulk apply with 1 click.
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

