/** Manual fact admission form; every save enters pending Foundry review. */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button, Card, CardTitle } from "@/index";
import { ErrorNote, InfoTip } from "@/admin/AdminShell";
import { addFact } from "@/lib/admin/content.functions";
import { fetchSubjects } from "@/lib/admin/ops.functions";
import { GENRES } from "@/lib/admin/taxonomy";
import { QK } from "@/lib/admin/contract";
import type { QuantityKind } from "../../shared/fact-lifecycle-contract.gen";
import { PendingAdmissionNotice } from "@/admin/PendingAdmissionNotice";
import { QUANTITY_KIND_OPTIONS, quantityKindLabel } from "@/admin/fact-bits";

const EMPTY_DRAFT = {
  subject: "",
  category: "",
  sub_category: "",
  angle: "",
  true_number: "",
  unit: "",
  claim_template: "",
  explanation: "",
  question: "",
  surprise_factor: "2",
  quantity_kind: QK.count,
  plausible_min: "",
  plausible_max: "",
  content_rating: "standard",
  source_urls: "",
};

export function NewFactForm({ onDone }: { onDone: () => void }) {
  const create = useServerFn(addFact);
  const getSubjects = useServerFn(fetchSubjects);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    ...EMPTY_DRAFT,
    quantity_kind: EMPTY_DRAFT.quantity_kind as QuantityKind | "",
  });

  const subjectsQuery = useQuery({
    queryKey: ["taxonomy_subjects_datalist"],
    queryFn: () => getSubjects({ data: {} }),
    staleTime: 60_000,
  });

  const matchedSubject = useMemo(() => {
    if (!form.subject?.trim()) return null;
    const sub = form.subject.trim().toLowerCase();
    return (
      subjectsQuery.data?.subjects.find(
        (s) =>
          s.subject.toLowerCase() === sub ||
          s.aliases.some((a) => a.toLowerCase() === sub),
      ) ?? null
    );
  }, [form.subject, subjectsQuery.data?.subjects]);

  const effectiveCategory = form.category || matchedSubject?.category || "General";

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          subject: form.subject,
          category: effectiveCategory,
          sub_category: form.sub_category || matchedSubject?.sub_category || undefined,
          angle: form.angle.trim(),
          true_number: Number(form.true_number),
          unit: form.unit.trim(),
          claim_template: form.claim_template.trim(),
          explanation: form.explanation.trim(),
          question: form.question.trim(),
          surprise_factor: Number(form.surprise_factor),
          quantity_kind: form.quantity_kind as QuantityKind | "",
          plausible_min: form.plausible_min.trim() || undefined,
          plausible_max: form.plausible_max.trim() || undefined,
          content_rating: form.content_rating as "standard" | "after_dark",
          source_urls: form.source_urls.split("\n").map((v) => v.trim()).filter(Boolean),
        },
      }),
    onSuccess: async () => {
      if (typeof window !== "undefined") window.__lovableEvents?.track?.("project.fact_lifecycle_action", { action_category: "create", outcome: "succeeded" });
      await queryClient.invalidateQueries({ queryKey: ["facts"] });
      setForm(EMPTY_DRAFT);
      onDone();
    },
    onError: () => {
      if (typeof window !== "undefined") window.__lovableEvents?.track?.("project.fact_lifecycle_action", { action_category: "create", outcome: "failed" });
    },
  });

  return (
    <Card>
      <datalist id="taxonomy-subjects-datalist">
        {subjectsQuery.data?.subjects.map((subject) => (
          <option key={subject.id} value={subject.subject}>
            {subject.category} › {subject.sub_category}
          </option>
        ))}
      </datalist>
      <form
        style={{ display: "grid", gap: "var(--ds-arena-space-4)" }}
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <CardTitle>New fact</CardTitle>
        <PendingAdmissionNotice />
        <div className="admin-grid">
          <label className="admin-field">
            <span>Topic</span>
            <input
              className="admin-input"
              list="taxonomy-subjects-datalist"
              placeholder="e.g. Giraffe, Taylor Swift"
              required
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
            {matchedSubject ? (
              <span style={{ fontSize: 11, color: "var(--ds-arena-color-lime)", marginTop: 2 }}>
                ✓ Linked to: <strong>{matchedSubject.category}</strong> › {matchedSubject.sub_category}
              </span>
            ) : form.subject ? (
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
          <label className="admin-field">
            <span>
              Match Scope <InfoTip text="Optional resolver scope for free-text topic matching (e.g. Football, Marine Life). Not part of the editorial hierarchy. Leave blank to resolve via genre." />
            </span>
            <input
              className="admin-input"
              placeholder="e.g. Big Cats"
              value={form.sub_category}
              onChange={(e) => setForm({ ...form, sub_category: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>
              Angle <InfoTip text="A concise 2–4 word title for this specific metric or record (e.g. 'Top Speed', 'Weeks at #1', 'Career MVP Awards'). Uniquely identifies the fact for this subject." />
            </span>
            <input
              className="admin-input"
              placeholder="e.g. Top Speed, Weeks at #1"
              required
              value={form.angle}
              onChange={(e) => setForm({ ...form, angle: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>True number</span>
            <input
              className="admin-input"
              type="number"
              step="any"
              required
              value={form.true_number}
              onChange={(e) => setForm({ ...form, true_number: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>Unit</span>
            <input
              className="admin-input"
              required
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </label>
          <label className="admin-field" style={{ gridColumn: "1 / -1" }}>
            <span>
              Claim template{" "}
              <InfoTip text="The auditor-facing claim with one {n} placeholder. The true number is never hard-coded here." />
            </span>
            <input
              className="admin-input"
              placeholder="e.g. A giraffe has {n} cervical vertebrae."
              required
              value={form.claim_template}
              onChange={(e) => setForm({ ...form, claim_template: e.target.value })}
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
            <span>
              Quantity kind{" "}
              <InfoTip text="The auditor-consumed DDM kind. Leave on auto to classify from the unit, or choose a contract value explicitly." />
            </span>
            <select
              className="admin-select"
              value={form.quantity_kind}
              onChange={(e) =>
                setForm({ ...form, quantity_kind: e.target.value as QuantityKind | "" })
              }
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
              <InfoTip text="Optional decimal-string floor hint. Set both bounds together or leave both blank." />
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
              <InfoTip text="Optional decimal-string ceiling hint. Set both bounds together or leave both blank." />
            </span>
            <input
              className="admin-input"
              value={form.plausible_max}
              onChange={(e) => setForm({ ...form, plausible_max: e.target.value })}
            />
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
        </div>
        <label className="admin-field">
          <span>
            Question / Prompt{" "}
            <InfoTip text="The numberless statement or phrase shown on the game card (e.g. 'Giraffe cervical vertebrae count' or 'Career touchdowns'). Must always be a statement, never phrased as a question." />
          </span>
          <input
            className="admin-input"
            required
            value={form.question}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
          />
        </label>
        <label className="admin-field">
          <span>
            Reveal explanation{" "}
            <InfoTip text="The canonical explanation revealed after a guess. Legacy context is accepted as a read/input alias, but new admissions persist explanation." />
          </span>
          <textarea
            className="admin-textarea"
            required
            value={form.explanation}
            onChange={(e) => setForm({ ...form, explanation: e.target.value })}
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
        <ErrorNote error={mutation.error} />
        <div className="admin-row-actions">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Save as pending"}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

