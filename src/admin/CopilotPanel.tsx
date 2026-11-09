/** AI copilot review panel for a single moderation report. */
import { Fragment } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge, Button, CardLabel } from "@/index";
import { ErrorNote } from "@/admin/AdminShell";
import { runReportCopilot } from "@/lib/admin/report-copilot.functions";
import { COPILOT_VERDICTS, type CopilotResult } from "@/admin/report-bits";

export function CopilotPanel({
  reportId,
  hasFact,
  hasDuplicates,
  duplicateCandidateIds,
  onPrefill,
  onResult,
}: {
  reportId: string;
  hasFact: boolean;
  hasDuplicates?: boolean;
  duplicateCandidateIds?: string[];
  onPrefill: (review: CopilotResult) => void;
  onResult: (review: CopilotResult) => void;
}) {
  const run = useServerFn(runReportCopilot);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => run({ data: { reportId, candidateFactIds: duplicateCandidateIds } }),
    onSuccess: (r) => {
      onResult(r);
      queryClient.invalidateQueries({ queryKey: ["report-audit", reportId] });
    },
  });
  const review = mutation.data;
  const s = review?.suggested;
  const changes = s
    ? ([
        ["True number", s.true_number],
        ["Unit", s.unit],
        ["Question", s.question],
        ["Claim template", s.claim_template],
        ["Context", s.context],
      ] as const).filter(([, v]) => v !== undefined && v !== "")
    : [];

  return (
    <section
      aria-label="Copilot review"
      style={{
        marginTop: "var(--ds-arena-space-3)",
        padding: "var(--ds-arena-space-3)",
        border: "1px solid var(--ds-arena-color-border)",
        borderInlineStart: "3px solid var(--ds-arena-color-purple)",
        borderRadius: "var(--ds-arena-radius-sm)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--ds-arena-space-2)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <CardLabel>Copilot review</CardLabel>
          {review ? (
            <>
              <Badge tone={COPILOT_VERDICTS[review.verdict].tone}>{COPILOT_VERDICTS[review.verdict].label}</Badge>
              {review.policy.needsReview ? <Badge tone="red">Needs closer review</Badge> : null}
            </>
          ) : null}
        </span>
        <Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Checking sources…" : review ? "Re-run" : "Run copilot"}
        </Button>
      </div>
      <ErrorNote error={mutation.error} />
      {review ? (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85em" }}>
            <span>{`Confidence: ${review.confidence}${review.policy.modelConfidence !== review.confidence ? ` (copilot said ${review.policy.modelConfidence})` : ""}`}</span>
            <meter min={0} max={100} low={40} high={75} optimum={100} value={review.policy.score} style={{ flex: "1 1 120px" }}>
              {review.policy.score}
            </meter>
          </label>
          <details>
            <summary style={{ cursor: "pointer", fontSize: "0.85em" }}>Why this score ({review.policy.score}/100, advisory)</summary>
            <table className="admin-table admin-card-table admin-card-table--confidence" style={{ marginTop: 6, fontSize: "0.85em" }}>
              <thead>
                <tr><th>Factor</th><th>Points</th><th>Evidence</th></tr>
              </thead>
              <tbody>
                {review.policy.factors.map((f) => (
                  <tr key={f.label}>
                    <td>{f.label}</td>
                    <td>
                      <Badge tone={f.kind === "base" ? "neutral" : f.points >= 0 ? "lime" : "red"}>
                        {f.kind === "base" ? String(f.points) : `${f.points >= 0 ? "+" : ""}${f.points}`}
                      </Badge>
                    </td>
                    <td>{f.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          {review.policy.reasons.length ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.85em", color: "var(--ds-arena-color-amber)" }}>
              {review.policy.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          ) : null}
          <p style={{ margin: 0, color: "var(--ds-arena-color-text)" }}>{review.rationale}</p>
          {review.duplicateResolution ? (
            <div
              style={{
                padding: "var(--ds-arena-space-2) var(--ds-arena-space-3)",
                background: "rgba(246, 195, 68, 0.1)",
                border: "1px solid rgba(246, 195, 68, 0.4)",
                borderRadius: "var(--ds-arena-radius-sm)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Badge tone="amber">Duplicate Recommendation</Badge>
                <strong style={{ fontSize: "0.9em", color: "#f6c344" }}>
                  {review.duplicateResolution.action === "keep_one"
                    ? `Keep Fact ${review.duplicateResolution.keepFactId ? `(${review.duplicateResolution.keepFactId})` : "winner"} & Retire other(s)`
                    : review.duplicateResolution.action === "retire_all"
                      ? "Retire all duplicate facts"
                      : "Reject report (Keep all active)"}
                </strong>
              </div>
              <div style={{ fontSize: "0.85em", color: "var(--ds-arena-color-text)" }}>
                {review.duplicateResolution.reason}
              </div>
            </div>
          ) : null}
          {changes.length ? (
            <dl className="admin-kv">
              {changes.map(([label, value]) => (
                <Fragment key={label}>
                  <dt>Suggested {label.toLowerCase()}</dt>
                  <dd>{String(value)}</dd>
                </Fragment>
              ))}
            </dl>
          ) : null}
          <div>
            <strong style={{ fontSize: "0.85em" }}>Sources</strong>
            {review.sources.length ? (
              <ul style={{ margin: "4px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                {review.sources.map((src) => (
                  <li key={src.url} style={{ fontSize: "0.9em" }}>
                    <a href={src.url} target="_blank" rel="noreferrer">{src.title}</a>
                    {src.value !== undefined ? <> <Badge>{String(src.value)}</Badge></> : null}
                    {src.conflicting ? <> <Badge tone="red">Conflicts</Badge></> : src.incomparable ? <> <Badge tone="amber">Not comparable</Badge></> : src.stance === "supports" ? <> <Badge tone="lime">Supports</Badge></> : null}
                    {src.excerpts.map((ex, i) => (
                      <blockquote
                        key={i}
                        style={{
                          margin: "4px 0 0",
                          paddingInlineStart: 8,
                          borderInlineStart: src.conflicting ? "2px solid var(--ds-arena-color-red)" : "2px solid var(--ds-arena-color-border)",
                          color: "var(--ds-arena-color-text-muted)",
                        }}
                      >
                        “{ex}”
                      </blockquote>
                    ))}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, color: "var(--ds-arena-color-text-muted)" }}>No sources returned — treat verdict as unverified.</p>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="daily" size="sm" onClick={() => onPrefill(review)}>
              Prefill Apply &amp; Resolve
            </Button>
            <span style={{ fontSize: "0.8em", color: "var(--ds-arena-color-text-muted)" }}>
              {review.policy.needsReview
                ? "Low confidence: verify each source before saving. "
                : ""}
              {hasDuplicates
                ? "Prefills duplicate winner and resolution details below. Review and apply."
                : hasFact
                  ? "Fills the editor only. Review every field, then save."
                  : "Fills the corrected number and note. Nothing is saved until you act."}
            </span>
          </div>
        </>
      ) : null}
    </section>
  );
}


