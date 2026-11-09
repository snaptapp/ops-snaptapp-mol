/** Inline fact editor: field edits, lifecycle transitions, and corrected-replacement handoff. */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge, Button, Card, CardTitle } from "@/index";
import { ErrorNote, FactStatusBadge, InfoTip, adminAuthorizedTargetsFor } from "@/admin/AdminShell";
import { changeFactStatus, saveFact } from "@/lib/admin/content.functions";
import { fetchSubjects } from "@/lib/admin/ops.functions";
import { GENRES } from "@/lib/admin/taxonomy";
import { STATUS } from "@/lib/admin/contract";
import type { FormEvent } from "react";
import type { FactStatus, QuantityKind } from "../../shared/fact-lifecycle-contract.gen";
import { PendingAdmissionNotice } from "@/admin/PendingAdmissionNotice";
import { QUANTITY_KIND_OPTIONS, normalizeSurpriseFactor, quantityKindLabel, type CorrectedReplacementResult, type Fact } from "@/admin/fact-bits";
import { CorrectedReplacementForm } from "./CorrectedReplacementForm";

/**
 * For each declared fact status, the admin-authorized transition target from
 * `from` when one exists, else `undefined`. The values are the actual status
 * strings the shared contract's transition table declares — never a literal
 * written here (Requirement 9.9). Keys are bare identifiers, so a truthy entry
 * both gates its control and supplies the target status to the mutation. An
 * unknown persisted status is not a declared transition source, so every entry
 * is `undefined` and the editor offers no status-change control for it
 * (Requirements 9.3, 9.4, 9.8, 9.10).
 */
function authorizedStatusTargets(from: string): Record<FactStatus, FactStatus | undefined> {
  const targets: Record<FactStatus, FactStatus | undefined> = {
    active: undefined,
    pending: undefined,
    disputed: undefined,
    retired: undefined,
  };
  for (const target of adminAuthorizedTargetsFor(from)) targets[target] = target;
  return targets;
}

export function FactEditor({
  fact,
  onDone,
  onReplacementCommitted,
}: {
  fact: Fact;
  onDone: () => void;
  onReplacementCommitted?: (result: CorrectedReplacementResult) => void;
}) {
  const save = useServerFn(saveFact);
  const status = useServerFn(changeFactStatus);
  const getSubjects = useServerFn(fetchSubjects);
  const queryClient = useQueryClient();

  const subjectsQuery = useQuery({
    queryKey: ["taxonomy_subjects_datalist"],
    queryFn: () => getSubjects({ data: {} }),
    staleTime: 60_000,
  });

  const normalizedSurprise = normalizeSurpriseFactor(fact.surprise_factor);
  const selectedDistractor =
    fact.derivation?.distractors.find((d) => d.surprise_factor === normalizedSurprise)
    ?? fact.derivation?.distractors[0];

  const [form, setForm] = useState({
    category: fact.category || "",
    sub_category: "",
    true_number: fact.true_number === null ? "" : String(fact.true_number),
    unit: fact.unit ?? "",
    question: fact.question ?? "",
    context: fact.context ?? "",
    surprise_factor: String(normalizedSurprise),
    content_rating: fact.content_rating || "standard",
    source_urls: (fact.source_urls || []).join("\n"),
    quantity_kind: fact.quantity_kind || "",
    plausible_min: fact.plausible_min ?? "",
    plausible_max: fact.plausible_max ?? "",
  });
  const [replacementOpen, setReplacementOpen] = useState(false);

  const matchedSubject = useMemo(() => {
    const subject = fact.subject.trim();
    if (!subject) return null;
    const sub = subject.toLowerCase();
    return (
      subjectsQuery.data?.subjects.find(
        (s) =>
          s.subject.toLowerCase() === sub ||
          s.aliases.some((a) => a.toLowerCase() === sub),
      ) ?? null
    );
  }, [fact.subject, subjectsQuery.data?.subjects]);

  const effectiveCategory = form.category || matchedSubject?.category || "General";

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["facts"] });

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: fact.id,
          // Subject and angle are immutable identity fields. They are displayed
          // below for context, but deliberately omitted from the ordinary edit
          // payload so this editor cannot express a re-key.
          category: effectiveCategory,
          sub_category: form.sub_category || matchedSubject?.sub_category || undefined,
          true_number: Number(form.true_number),
          unit: form.unit,
          claim_template: form.question ? `${form.question}: {n}` : `${fact.subject}: {n}`,
          explanation: form.context,
          question: form.question,
          surprise_factor: Number(form.surprise_factor),
          content_rating: form.content_rating as "standard" | "after_dark",
          source_urls: form.source_urls.split("\n").map((v) => v.trim()).filter(Boolean),
          quantity_kind: form.quantity_kind as QuantityKind | "",
          plausible_min: form.plausible_min,
          plausible_max: form.plausible_max,
        },
      }),
    onSuccess: async () => {
      if (typeof window !== "undefined") window.__lovableEvents?.track?.("project.fact_lifecycle_action", { action_category: "edit", outcome: "succeeded" });
      await invalidate();
      onDone();
    },
    onError: () => {
      if (typeof window !== "undefined") window.__lovableEvents?.track?.("project.fact_lifecycle_action", { action_category: "edit", outcome: "failed" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (next: FactStatus) =>
      status({
        data: {
          id: fact.id,
          status: next,
        },
      }),
    onSuccess: async (_result, next) => {
      if (typeof window !== "undefined") window.__lovableEvents?.track?.("project.fact_lifecycle_action", {
        action_category: next === STATUS.retired ? "retire" : next === STATUS.disputed ? "dispute" : next === STATUS.active ? "reactivate" : "lifecycle_transition",
        outcome: "succeeded",
      });
      await invalidate();
    },
    onError: (_error, next) => {
      if (typeof window !== "undefined") window.__lovableEvents?.track?.("project.fact_lifecycle_action", {
        action_category: next === STATUS.retired ? "retire" : next === STATUS.disputed ? "dispute" : next === STATUS.active ? "reactivate" : "lifecycle_transition",
        outcome: "failed",
      });
    },
  });

  // Which status-change controls the editor offers, decided at runtime from the
  // shared contract's transition table (Requirements 9.3, 9.4, 9.8). An unknown
  // persisted status is not a declared transition source, so every entry is
  // false and no status-change control is offered for it (Requirement 9.10).
  const canTransitionTo = authorizedStatusTargets(fact.status);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!window.confirm("Save changes to this fact?")) return;
    saveMutation.mutate();
  }

  return (
    <Card>
      <form onSubmit={submit} style={{ display: "grid", gap: "var(--ds-arena-space-4)" }}>
        <div className="admin-page-head">
          <CardTitle>Edit fact</CardTitle>
          <FactStatusBadge status={fact.status} />
        </div>
        <p style={{ fontFamily: "var(--ds-arena-font-mono)", fontSize: 12, color: "var(--ds-arena-color-text-muted)" }}>
          {fact.id}
        </p>

        <p
          id="fact-identity-note"
          role="note"
          style={{
            margin: 0,
            padding: "12px 14px",
            border: "1px solid var(--ds-arena-color-border)",
            borderLeft: "3px solid var(--ds-arena-color-lime)",
            borderRadius: "var(--ds-arena-radius-md)",
            background: "var(--ds-arena-color-surface)",
            color: "var(--ds-arena-color-text-muted)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: "var(--ds-arena-color-text)" }}>
            Subject and angle are immutable identity fields.
          </strong>{" "}
          They are read-only after creation. Corrections create a replacement fact rather than re-keying
          the original document. The replacement carries the corrected identity, while the original keeps
          its identity.
        </p>

        {fact.status === STATUS.pending ? <PendingAdmissionNotice /> : null}

        <div className="admin-grid">
          <label className="admin-field" htmlFor="fact-identity-subject">
            <span>
              Subject (read-only identity) <Badge tone="neutral">Identity</Badge>{" "}
              <InfoTip text="This subject is fixed after creation. A correction uses a replacement fact instead of re-keying this record." />
            </span>
            <input
              id="fact-identity-subject"
              className="admin-input"
              value={fact.subject}
              readOnly
              aria-readonly="true"
              aria-describedby="fact-identity-note"
            />
            {matchedSubject ? (
              <span style={{ fontSize: 11, color: "var(--ds-arena-color-lime)", marginTop: 2 }}>
                ✓ Linked to: <strong>{matchedSubject.category}</strong> › {matchedSubject.sub_category}
              </span>
            ) : fact.subject ? (
              <span style={{ fontSize: 11, color: "var(--ds-arena-color-text-muted)", marginTop: 2 }}>
                ℹ️ Will be classified under <strong>{effectiveCategory}</strong>
              </span>
            ) : null}
          </label>
          <label className="admin-field">
            <span>
              Genre <InfoTip text="Genre for this trivia question. Match scope and playlists live on the topic." />
            </span>
            <select
              className="admin-select"
              value={effectiveCategory}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {GENRES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field" htmlFor="fact-identity-angle">
            <span>
              Angle (read-only identity) <Badge tone="neutral">Identity</Badge>{" "}
              <InfoTip text="This angle is fixed after creation. A correction uses a replacement fact instead of re-keying this record." />
            </span>
            <input
              id="fact-identity-angle"
              className="admin-input"
              value={fact.angle}
              readOnly
              aria-readonly="true"
              aria-describedby="fact-identity-note"
            />
          </label>
          <label className="admin-field">
            <span>True number</span>
            <input
              className="admin-input"
              type="number"
              step="any"
              value={form.true_number}
              onChange={(e) => setForm({ ...form, true_number: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>Unit</span>
            <input
              className="admin-input"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>
              Surprise factor <InfoTip text="Scale of 0–3 gauging how shocking the number is (0: Obvious/common knowledge, 1: Mildly surprising, 2: Very surprising, 3: Mind-blowing intuition trap)." />
            </span>
            <select
              className="admin-select"
              value={form.surprise_factor}
              onChange={(e) => setForm({ ...form, surprise_factor: e.target.value })}
            >
              <option value="0">0 · Obvious (Common knowledge)</option>
              <option value="1">1 · Mildly surprising</option>
              <option value="2">2 · Very surprising</option>
              <option value="3">3 · Mind-blowing (Intuition trap)</option>
            </select>
          </label>
          <label className="admin-field">
            <span>Content rating</span>
            <select
              className="admin-select"
              value={form.content_rating}
              onChange={(e) => setForm({ ...form, content_rating: e.target.value })}
            >
              <option value="standard">standard</option>
              <option value="after_dark">after_dark</option>
            </select>
          </label>
          <label className="admin-field">
            <span>
              Quantity kind{" "}
              <InfoTip text="DDM semantic kind. Leave on auto to classify from the unit. Use 'year' for calendar-year answers, 'physical_measure' for physical domains." />
            </span>
            <select
              className="admin-select"
              value={form.quantity_kind}
              onChange={(e) => setForm({ ...form, quantity_kind: e.target.value })}
            >
              {QUANTITY_KIND_OPTIONS.map((kind) => (
                <option key={kind || "auto"} value={kind}>
                  {quantityKindLabel(kind)}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>
              Plausible min{" "}
              <InfoTip text="Optional domain floor hint for distractor bounds (e.g. '0'). Both bounds must be set together; clearing regenerates defaults." />
            </span>
            <input
              className="admin-input"
              value={form.plausible_min}
              onChange={(e) => setForm({ ...form, plausible_min: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>
              Plausible max{" "}
              <InfoTip text="Optional domain ceiling hint (e.g. '158.3' for NFL passer rating, '110' for punt yards). Both bounds must be set together." />
            </span>
            <input
              className="admin-input"
              value={form.plausible_max}
              onChange={(e) => setForm({ ...form, plausible_max: e.target.value })}
            />
          </label>
        </div>

        <label className="admin-field">
          <span>
            Question / Prompt{" "}
            <InfoTip text="The numberless statement or phrase shown on the game card (e.g. 'Giraffe cervical vertebrae count' or 'Career touchdowns'). Must always be a statement, never phrased as a question." />
          </span>
          <input
            className="admin-input"
            value={form.question}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
          />
        </label>
        <label className="admin-field">
          <span>
            Reveal explanation{" "}
            <InfoTip text="The canonical explanation revealed after a guess. Legacy context remains readable and editable through this compatibility field." />
          </span>
          <textarea
            className="admin-textarea"
            value={form.context}
            onChange={(e) => setForm({ ...form, context: e.target.value })}
          />
        </label>
        <label className="admin-field">
          <span>
            Source URLs (one per line){" "}
            <InfoTip text="Listed URLs are citation candidates. Source support is decided by auditor evidence assertions on the fact's revision, not by URL presence." />
          </span>
          <textarea
            className="admin-textarea"
            value={form.source_urls}
            onChange={(e) => setForm({ ...form, source_urls: e.target.value })}
          />
        </label>

        <dl className="admin-kv">
          <dt>Previous number</dt>
          <dd>{fact.previous_true_number ?? "—"}</dd>
          <dt>Verified stamp</dt>
          <dd>
            {fact.verified_at ?? "—"} {fact.verifier_model ? `· ${fact.verifier_model}` : ""}
            <div style={{ fontSize: 11, color: "var(--ds-arena-color-text-muted)" }}>
              Historical audit time, not current readiness. Readiness is the live quality receipt on the
              current revision.
            </div>
          </dd>
          <dt>Served</dt>
          <dd>
            {fact.served_count} {fact.last_served_at ? `· last ${fact.last_served_at}` : ""}
          </dd>
          <dt>Retired reason</dt>
          <dd>{fact.retired_reason ?? "—"}</dd>
          <dt>Quality flags</dt>
          <dd>
            {fact.quality_flags.length ? (
              <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                {fact.quality_flags.map((flag) => (
                  <Badge key={flag} tone="red">{flag}</Badge>
                ))}
              </span>
            ) : (
              "—"
            )}
          </dd>
          <dt>Disputed reason</dt>
          <dd>{fact.disputed_reason ?? "—"}</dd>
          <dt>Number pinned</dt>
          <dd>
            {fact.number_pinned
              ? `yes — ${fact.pinned_reason ?? "hand-verified"}`
              : "—"}
          </dd>
        </dl>

        {fact.true_number !== null ? (
          <div style={{ background: "var(--ds-arena-color-surface)", padding: 12, borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ fontSize: 13 }}>DDM Derivation</strong>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ds-arena-color-text-muted)" }}>
                  {fact.derivation?.distractors?.length
                    ? `${fact.derivation.distractors.length} precomputed distractors (${fact.derivation.quantity_kind})`
                    : "Live derivation"}
                </p>
              </div>
              <Link
                to="/admin/audit"
                search={{
                  tab: "derivation",
                  true: String(fact.true_number),
                  unit: fact.unit ?? "",
                  surprise: String(fact.surprise_factor ?? 2),
                  kind: fact.derivation?.quantity_kind,
                  side: selectedDistractor?.side,
                  trap: fact.derivation?.trap_direction,
                  pmin: fact.derivation?.plausible_min,
                  pmax: fact.derivation?.plausible_max,
                  presented: selectedDistractor?.presented_number,
                  topic: fact.subject,
                }}
                style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }}
                target="_blank"
                rel="noreferrer"
              >
                🔬 Inspect in DDM Auditor ↗
              </Link>
            </div>
          </div>
        ) : null}

        <ErrorNote error={saveMutation.error ?? statusMutation.error} />
        <div className="admin-row-actions">
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
          {replacementOpen || canTransitionTo.retired ? (
            <Button
              type="button"
              variant="daily"
              disabled={!replacementOpen && (saveMutation.isPending || statusMutation.isPending)}
              aria-expanded={replacementOpen}
              aria-controls="corrected-replacement-form"
              onClick={() => {
                if (replacementOpen) {
                  setReplacementOpen(false);
                  return;
                }
                if (!canTransitionTo.retired) return;
                setReplacementOpen(true);
              }}
            >
              {replacementOpen ? "Close corrected replacement" : "Create corrected replacement"}
            </Button>
          ) : null}
          {/* Each control renders only when the fact's current status has an
              admin-authorized transition to that target. An unknown persisted
              status authorizes none, so it can be viewed but not transitioned
              (Requirements 9.8, 9.10). Target statuses are supplied to the
              mutation via the contract-derived helper, never a literal here. */}
          {canTransitionTo.active && fact.status !== STATUS.pending ? (
            <Button
              type="button"
              variant="daily"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate(canTransitionTo.active!)}
            >
              Verify &amp; approve
            </Button>
          ) : null}
          {canTransitionTo.disputed ? (
            <Button
              type="button"
              variant="skip"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate(canTransitionTo.disputed!)}
            >
              Mark disputed
            </Button>
          ) : null}
          {canTransitionTo.retired ? (
            <Button
              type="button"
              variant="danger"
              disabled={statusMutation.isPending}
              onClick={() => {
                if (window.confirm("Retire this fact? It stops being served.")) {
                  statusMutation.mutate(canTransitionTo.retired!);
                }
              }}
            >
              Retire
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onDone}>
            Close
          </Button>
        </div>
      </form>
      {replacementOpen ? (
        <CorrectedReplacementForm
          fact={fact}
          onDone={() => setReplacementOpen(false)}
          onCommitted={onReplacementCommitted}
        />
      ) : null}
    </Card>
  );
}

