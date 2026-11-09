/** Corrected-fact replacement form: builds the pending replacement payload and commits it as one audited mutation. */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button, Card } from "@/index";
import { ErrorNote, FactStatusBadge, InfoTip } from "@/admin/AdminShell";
import { createCorrectedReplacement } from "@/lib/admin/content.functions";
import { GENRES } from "@/lib/admin/taxonomy";
import type { FormEvent } from "react";
import type { QuantityKind } from "../../shared/fact-lifecycle-contract.gen";
import { PENDING_ADMISSION_COPY, PENDING_PROMOTION_COPY, QUANTITY_KIND_OPTIONS, normalizeSurpriseFactor, quantityKindLabel, type CorrectedReplacementResult, type Fact } from "@/admin/fact-bits";

type ReplacementFormState = {
  subject: string;
  category: string;
  sub_category: string;
  angle: string;
  true_number: string;
  unit: string;
  claim_template: string;
  explanation: string;
  question: string;
  surprise_factor: string;
  quantity_kind: QuantityKind | "";
  plausible_min: string;
  plausible_max: string;
  content_rating: "standard" | "after_dark";
  source_urls: string;
  number_pinned: boolean;
  pinned_reason: string;
  reason: string;
};

function replacementClaimTemplate(
  claim: string,
  question: string,
  subject: string,
  angle: string,
): string {
  const value = claim.trim() || question.trim() || `${subject} — ${angle}`;
  return value.includes("{n}") ? value : `${value} {n}`;
}

function initialReplacementForm(fact: Fact): ReplacementFormState {
  return {
    subject: fact.subject,
    category: fact.category || "",
    sub_category: "",
    angle: fact.angle,
    true_number: fact.true_number === null ? "" : String(fact.true_number),
    unit: fact.unit || "",
    claim_template: replacementClaimTemplate(
      fact.claim_template,
      fact.question,
      fact.subject,
      fact.angle,
    ),
    explanation: fact.context || fact.question || "",
    question: fact.question || "",
    surprise_factor: String(normalizeSurpriseFactor(fact.surprise_factor)),
    quantity_kind: (fact.quantity_kind || "") as QuantityKind | "",
    plausible_min: fact.plausible_min || "",
    plausible_max: fact.plausible_max || "",
    content_rating: fact.content_rating === "after_dark" ? "after_dark" : "standard",
    source_urls: (fact.source_urls || []).join("\n"),
    number_pinned: fact.number_pinned,
    pinned_reason: fact.pinned_reason || "",
    reason: "",
  };
}

/**
 * Immutable correction path for an existing fact. The original is retired and a
 * fresh canonical fact is admitted as pending in one server transaction; this
 * component never sends a status or verification field to the replacement.
 */
export function CorrectedReplacementForm({
  fact,
  onDone,
  onCommitted,
}: {
  fact: Fact;
  onDone?: () => void;
  onCommitted?: (result: CorrectedReplacementResult) => void;
}) {
  const createReplacement = useServerFn(createCorrectedReplacement);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ReplacementFormState>(() => initialReplacementForm(fact));
  const [committed, setCommitted] = useState<CorrectedReplacementResult | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  function setField<K extends keyof ReplacementFormState>(
    key: K,
    value: ReplacementFormState[K],
  ): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const mutation = useMutation<CorrectedReplacementResult>({
    mutationFn: async () => {
      const result = await createReplacement({
        data: {
          originalId: fact.id,
          replacement: {
            subject: form.subject.trim(),
            category: form.category || undefined,
            sub_category: form.sub_category.trim() || undefined,
            angle: form.angle.trim(),
            true_number: Number(form.true_number),
            unit: form.unit.trim(),
            claim_template: replacementClaimTemplate(
              form.claim_template,
              form.question,
              form.subject,
              form.angle,
            ),
            explanation: form.explanation.trim(),
            question: form.question.trim(),
            surprise_factor: Number(form.surprise_factor),
            quantity_kind: form.quantity_kind,
            plausible_min: form.plausible_min.trim() || undefined,
            plausible_max: form.plausible_max.trim() || undefined,
            content_rating: form.content_rating,
            source_urls: form.source_urls
              .split("\n")
              .map((value) => value.trim())
              .filter(Boolean),
            number_pinned: form.number_pinned,
            pinned_reason: form.pinned_reason.trim() || undefined,
          },
          reason: form.reason.trim() || undefined,
          ...(fact.updateTime ? { originalUpdateTime: fact.updateTime } : {}),
        },
      });
      return result;
    },
    onSuccess: async (result) => {
      if (typeof window !== "undefined") window.__lovableEvents?.track?.("project.fact_lifecycle_action", { action_category: "corrected_replacement", outcome: "succeeded" });
      setCommitted(result);
      await queryClient.invalidateQueries({ queryKey: ["facts"] });
      onCommitted?.(result);
    },
    onError: () => {
      if (typeof window !== "undefined") window.__lovableEvents?.track?.("project.fact_lifecycle_action", { action_category: "corrected_replacement", outcome: "failed" });
    },
  });

  const disabled = mutation.isPending || committed !== null;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (disabled) return;
    if (!window.confirm("Retire the original fact and create this replacement as pending?")) return;
    mutation.mutate();
  }

  return (
    <Card>
      <form
        id="corrected-replacement-form"
        aria-labelledby="corrected-replacement-title"
        aria-describedby="corrected-replacement-lifecycle-note"
        aria-busy={mutation.isPending}
        onSubmit={submit}
        style={{ display: "grid", gap: "var(--ds-arena-space-4)" }}
      >
        <div className="admin-page-head">
          <h3
            id="corrected-replacement-title"
            ref={titleRef}
            tabIndex={-1}
            style={{ margin: 0, fontSize: 18, lineHeight: 1.35 }}
          >
            Create corrected replacement
          </h3>
        </div>

        <div
          id="corrected-replacement-lifecycle-note"
          role="note"
          aria-label="Corrected replacement lifecycle"
          style={{
            margin: 0,
            padding: "12px 14px",
            border: "1px solid var(--ds-arena-color-border)",
            borderLeft: "3px solid var(--ds-arena-color-amber)",
            borderRadius: "var(--ds-arena-radius-md)",
            background: "var(--ds-arena-color-surface)",
            color: "var(--ds-arena-color-text-muted)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: "var(--ds-arena-color-text)" }}>
            Original retirement + pending admission.
          </strong>{" "}
          Creating this replacement starts a correction; the original will be retired when it is created. It
          does not re-key the original. The replacement enters pending Foundry admission. {PENDING_ADMISSION_COPY}{" "}
          {PENDING_PROMOTION_COPY} This action does not activate it immediately.
          The replacement must use a distinct subject and angle identity; it never overwrites the original.
          {" "}
          {PENDING_PROMOTION_COPY}
        </div>

        <div
          style={{
            display: "grid",
            gap: "var(--ds-arena-space-2)",
            padding: "12px 14px",
            border: "1px solid var(--ds-arena-color-border)",
            borderRadius: "var(--ds-arena-radius-md)",
          }}
        >
          <strong>Original fact</strong>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px 16px",
              fontSize: 13,
              overflowWrap: "anywhere",
            }}
          >
            <span>ID: <code>{fact.id}</code></span>
            <span>Status: <FactStatusBadge status={fact.status} /></span>
            <span>Identity: {fact.subject} / {fact.angle}</span>
          </div>
        </div>

        <div className="admin-grid">
          <label className="admin-field" htmlFor="corrected-replacement-subject">
            <span>
              Replacement subject <InfoTip text="The replacement keeps the original's topic by default; edit it when the corrected fact has a different subject identity." />
            </span>
            <input
              id="corrected-replacement-subject"
              className="admin-input"
              required
              disabled={disabled}
              aria-describedby="corrected-replacement-lifecycle-note"
              value={form.subject}
              onChange={(event) => setField("subject", event.target.value)}
            />
          </label>
          <label className="admin-field" htmlFor="corrected-replacement-category">
            <span>Replacement genre</span>
            <select
              id="corrected-replacement-category"
              className="admin-select"
              disabled={disabled}
              value={form.category}
              onChange={(event) => setField("category", event.target.value)}
            >
              <option value="">Unclassified</option>
              {GENRES.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
              {form.category && !(GENRES as readonly string[]).includes(form.category) ? (
                <option value={form.category}>{form.category}</option>
              ) : null}
            </select>
          </label>
          <label className="admin-field" htmlFor="corrected-replacement-match-scope">
            <span>Replacement match scope</span>
            <input
              id="corrected-replacement-match-scope"
              className="admin-input"
              disabled={disabled}
              value={form.sub_category}
              onChange={(event) => setField("sub_category", event.target.value)}
            />
          </label>
          <label className="admin-field" htmlFor="corrected-replacement-angle">
            <span>
              Replacement angle <InfoTip text="This is the replacement's immutable identity. A correction cannot re-key the original document." />
            </span>
            <input
              id="corrected-replacement-angle"
              className="admin-input"
              required
              disabled={disabled}
              aria-describedby="corrected-replacement-lifecycle-note"
              value={form.angle}
              onChange={(event) => setField("angle", event.target.value)}
            />
          </label>
          <label className="admin-field" htmlFor="corrected-replacement-true-number">
            <span>Replacement true number</span>
            <input
              id="corrected-replacement-true-number"
              className="admin-input"
              type="number"
              step="any"
              required
              disabled={disabled}
              value={form.true_number}
              onChange={(event) => setField("true_number", event.target.value)}
            />
          </label>
          <label className="admin-field" htmlFor="corrected-replacement-unit">
            <span>Replacement unit</span>
            <input
              id="corrected-replacement-unit"
              className="admin-input"
              required
              disabled={disabled}
              value={form.unit}
              onChange={(event) => setField("unit", event.target.value)}
            />
          </label>
          <label className="admin-field" htmlFor="corrected-replacement-surprise-factor">
            <span>Surprise factor</span>
            <select
              id="corrected-replacement-surprise-factor"
              className="admin-select"
              disabled={disabled}
              value={form.surprise_factor}
              onChange={(event) => setField("surprise_factor", event.target.value)}
            >
              <option value="0">0 · Obvious</option>
              <option value="1">1 · Mildly surprising</option>
              <option value="2">2 · Very surprising</option>
              <option value="3">3 · Mind-blowing</option>
            </select>
          </label>
          <label className="admin-field" htmlFor="corrected-replacement-quantity-kind">
            <span>
              Quantity kind <InfoTip text="The auditor-consumed DDM kind. Leave on auto to classify from the unit." />
            </span>
            <select
              id="corrected-replacement-quantity-kind"
              className="admin-select"
              disabled={disabled}
              value={form.quantity_kind}
              onChange={(event) => setField("quantity_kind", event.target.value as QuantityKind | "")}
            >
              {QUANTITY_KIND_OPTIONS.map((kind) => (
                <option key={kind || "auto"} value={kind}>
                  {quantityKindLabel(kind)}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field" htmlFor="corrected-replacement-plausible-min">
            <span>Plausible min</span>
            <input
              id="corrected-replacement-plausible-min"
              className="admin-input"
              disabled={disabled}
              value={form.plausible_min}
              onChange={(event) => setField("plausible_min", event.target.value)}
            />
          </label>
          <label className="admin-field" htmlFor="corrected-replacement-plausible-max">
            <span>Plausible max</span>
            <input
              id="corrected-replacement-plausible-max"
              className="admin-input"
              disabled={disabled}
              value={form.plausible_max}
              onChange={(event) => setField("plausible_max", event.target.value)}
            />
          </label>
          <label className="admin-field" htmlFor="corrected-replacement-content-rating">
            <span>Content rating</span>
            <select
              id="corrected-replacement-content-rating"
              className="admin-select"
              disabled={disabled}
              value={form.content_rating}
              onChange={(event) =>
                setField("content_rating", event.target.value as "standard" | "after_dark")
              }
            >
              <option value="standard">standard</option>
              <option value="after_dark">after_dark</option>
            </select>
          </label>
        </div>

        <label className="admin-field" htmlFor="corrected-replacement-claim-template">
          <span>
            Claim template <InfoTip text="Use exactly one {n} placeholder. The true number is never hard-coded here." />
          </span>
          <input
            id="corrected-replacement-claim-template"
            className="admin-input"
            required
            disabled={disabled}
            value={form.claim_template}
            onChange={(event) => setField("claim_template", event.target.value)}
          />
        </label>
        <label className="admin-field" htmlFor="corrected-replacement-question">
          <span>Question / Prompt</span>
          <input
            id="corrected-replacement-question"
            className="admin-input"
            required
            disabled={disabled}
            value={form.question}
            onChange={(event) => setField("question", event.target.value)}
          />
        </label>
        <label className="admin-field" htmlFor="corrected-replacement-explanation">
          <span>Reveal explanation</span>
          <textarea
            id="corrected-replacement-explanation"
            className="admin-textarea"
            required
            disabled={disabled}
            value={form.explanation}
            onChange={(event) => setField("explanation", event.target.value)}
          />
        </label>
        <label className="admin-field" htmlFor="corrected-replacement-sources">
          <span>
            Source URLs (one per line){" "}
            <InfoTip text="Listed URLs are citation candidates. Source support is decided by auditor evidence assertions on the fact's revision, not by URL presence." />
          </span>
          <textarea
            id="corrected-replacement-sources"
            className="admin-textarea"
            disabled={disabled}
            value={form.source_urls}
            onChange={(event) => setField("source_urls", event.target.value)}
          />
        </label>
        <label className="admin-field" htmlFor="corrected-replacement-reason">
          <span>Correction reason (optional)</span>
          <input
            id="corrected-replacement-reason"
            className="admin-input"
            disabled={disabled}
            placeholder="Why is this replacement being created?"
            value={form.reason}
            onChange={(event) => setField("reason", event.target.value)}
          />
        </label>
        <label className="admin-field" htmlFor="corrected-replacement-number-pinned">
          <span>Pin this number</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
            <input
              id="corrected-replacement-number-pinned"
              type="checkbox"
              disabled={disabled}
              checked={form.number_pinned}
              onChange={(event) => setField("number_pinned", event.target.checked)}
            />
            <span>Hand-verified value</span>
          </span>
        </label>
        <label className="admin-field" htmlFor="corrected-replacement-pinned-reason">
          <span>Pinned reason (optional)</span>
          <input
            id="corrected-replacement-pinned-reason"
            className="admin-input"
            disabled={disabled}
            value={form.pinned_reason}
            onChange={(event) => setField("pinned_reason", event.target.value)}
          />
        </label>

        {committed ? (
          <div
            role="status"
            aria-live="polite"
            aria-label="Corrected replacement status"
            style={{
              display: "grid",
              gap: "var(--ds-arena-space-2)",
              padding: "12px 14px",
              border: "1px solid var(--ds-arena-color-lime)",
              borderRadius: "var(--ds-arena-radius-md)",
              background: "var(--ds-arena-color-surface)",
              color: "var(--ds-arena-color-text-muted)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: "var(--ds-arena-color-text)" }}>Correction committed.</strong>
            <div>
              Original <code>{committed.original.id}</code> is{" "}
              <FactStatusBadge status={committed.original.status} />. Replacement{" "}
              <code>{committed.replacement.id}</code> is{" "}
              <FactStatusBadge status={committed.replacement.status} />.
            </div>
            <p style={{ margin: 0 }}>
              The replacement is pending Foundry admission, not active. Only the nightly Foundry audit can
              promote it after review; this action does not activate it immediately.
            </p>
          </div>
        ) : null}

        <ErrorNote error={mutation.error} />
        <div className="admin-row-actions">
          <Button type="submit" disabled={disabled}>
            {mutation.isPending
              ? "Creating replacement…"
              : committed
                ? "Replacement created"
                : "Create replacement and retire original"}
          </Button>
          <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={() => onDone?.()}>
            {committed ? "Close" : "Cancel"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

