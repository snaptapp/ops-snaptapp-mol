/**
 * fact_bank record mapping and read queries: `toFact`, `listFacts`,
 * `exportFacts`, `getFact`, and the shared scan/filter/sort pipeline.
 * Firestore has no substring index, so taxonomy, free-text, and surprise
 * filters run in memory over every server-matched document.
 */
import {
  getDoc,
  normalizeKey,
  runQuery,
  runQueryPage,
  type FirestoreDoc,
  type Json,
  type QueryFilter,
} from "../firebase/firestore.server";
import { parseDerivationBlock, type FactDerivationBlock } from "./daily-blitz";
import { parseQuantitySpec, type QuantitySpec } from "./fact-admission";
import {
  asBool,
  firstStr,
  num,
  STATUS,
  str,
  type FactStatus,
} from "./content-shared.server";
import { isQualityReviewRecord } from "./fact-doc-utils.server";
import type { QualityReviewRecord } from "./quality-review";

export interface FactRecord {
  id: string;
  subject: string;
  subject_key: string;
  angle: string;
  angle_key: string;
  true_number: number | null;
  unit: string;
  claim_template: string;
  context: string;
  question: string;
  surprise_factor: number | null;
  difficulty_hint: string | null;
  content_rating: string;
  // Derived from the shared contract (Requirement 9.1). The `string & {}` arm
  // keeps a persisted value absent from the contract representable verbatim
  // (Requirement 9.10) while the `FactStatus` arm carries the declared union.
  status: FactStatus | (string & {});
  previous_true_number: number | null;
  retired_reason: string | null;
  source_urls: string[];
  verifier_model: string;
  verified_at: string | null;
  served_count: number;
  last_served_at: string | null;
  category: string | null;
  derivation: FactDerivationBlock | null;
  quantity_kind: string;
  plausible_min: string | null;
  plausible_max: string | null;
  number_token: string;
  /** Canonical exact decimal truth token stamped by the Foundry decode path. */
  true_number_token: string;
  /** Proposed or approved quantity spec; the auditor owns its approval. */
  quantity_spec: QuantitySpec | null;
  as_of_year: number | null;
  quality_flags: string[];
  disputed_reason: string | null;
  disputed_at: string | null;
  lint_findings: Json[];
  lint_rules_revision: string | null;
  /** Stored content fingerprint stamped by a Go pipeline write; "" when absent. */
  content_fingerprint: string;
  /** Auditor-owned approval bound to a specific revision; revoked on material edits. */
  quality_receipt: { audit_id: string; content_fingerprint: string } | null;
  /** Present when the stored approval was revoked pending a fresh audit. */
  quality_hold: { audit_id: string; checked_at: string; reason: string } | null;
  quality_reviews: QualityReviewRecord[];
  number_pinned: boolean;
  pinned_reason: string | null;
  updateTime?: string;
}

/**
 * Read the canonical reveal copy while accepting the legacy context field.
 * The canonical field wins whenever it contains text; empty legacy values are
 * ignored so a partially migrated document remains readable.
 */
export function canonicalExplanation(
  data: Record<string, Json>,
  legacyAliases: readonly string[] = [],
): string {
  return firstStr(data, ["explanation", ...legacyAliases, "context"]);
}

export function toFact(doc: FirestoreDoc): FactRecord {
  const d = doc.data;
  return {
    id: doc.id,
    subject: str(d["subject"]),
    subject_key: str(d["subject_key"]),
    angle: str(d["angle"]),
    angle_key: str(d["angle_key"]),
    true_number: num(d["true_number"]),
    unit: str(d["unit"]),
    claim_template: str(d["claim_template"]),
    // FactRecord keeps the legacy `context` property for existing admin
    // consumers, but its value is always the canonical explanation projection.
    context: canonicalExplanation(d),
    question: str(d["question"]),
    surprise_factor: (() => {
      const raw = num(d["surprise_factor"]);
      if (raw === null || raw === undefined) return null;
      if (raw > 3) {
        return raw >= 8 ? 3 : raw >= 5 ? 2 : raw >= 3 ? 1 : 0;
      }
      return Math.min(3, Math.max(0, Math.round(raw)));
    })(),
    content_rating: str(d["content_rating"]) || "standard",
    difficulty_hint: (() => {
      const hint = str(d["difficulty_hint"]);
      return hint || null;
    })(),
    status: str(d["status"]) || STATUS.active,
    previous_true_number: num(d["previous_true_number"]),
    retired_reason: typeof d["retired_reason"] === "string" ? d["retired_reason"] : null,
    source_urls: Array.isArray(d["source_urls"])
      ? (d["source_urls"] as Json[]).filter((v): v is string => typeof v === "string")
      : [],
    verifier_model: str(d["verifier_model"]),
    verified_at: typeof d["verified_at"] === "string" ? d["verified_at"] : null,
    served_count: num(d["served_count"]) ?? 0,
    last_served_at: typeof d["last_served_at"] === "string" ? d["last_served_at"] : null,
    category: typeof d["category"] === "string" ? d["category"] : null,
    derivation: parseDerivationBlock(d["derivation"]),
    quantity_kind: str(d["quantity_kind"]),
    plausible_min: typeof d["plausible_min"] === "string" ? d["plausible_min"] : null,
    plausible_max: typeof d["plausible_max"] === "string" ? d["plausible_max"] : null,
    number_token: str(d["number_token"]),
    true_number_token: str(d["true_number_token"]),
    quantity_spec: parseQuantitySpec(d["quantity_spec"]),
    as_of_year: num(d["as_of_year"]),
    quality_flags: Array.isArray(d["quality_flags"])
      ? (d["quality_flags"] as Json[]).filter((v): v is string => typeof v === "string")
      : [],
    disputed_reason: typeof d["disputed_reason"] === "string" ? d["disputed_reason"] : null,
    disputed_at:
      typeof d["disputed_at"] === "string"
        ? d["disputed_at"]
        : typeof d["disputedAt"] === "string"
          ? (d["disputedAt"] as string)
          : null,
    lint_findings: Array.isArray(d["lint_findings"]) ? (d["lint_findings"] as Json[]) : [],
    lint_rules_revision:
      typeof d["lint_rules_revision"] === "string" ? d["lint_rules_revision"] : null,
    content_fingerprint:
      typeof d["content_fingerprint"] === "string" ? d["content_fingerprint"] : "",
    quality_receipt:
      d["quality_receipt"] && typeof d["quality_receipt"] === "object"
        ? {
            audit_id: str((d["quality_receipt"] as Record<string, Json>)["audit_id"]),
            content_fingerprint: str(
              (d["quality_receipt"] as Record<string, Json>)["content_fingerprint"],
            ),
          }
        : null,
    quality_hold:
      d["quality_hold"] && typeof d["quality_hold"] === "object"
        ? {
            audit_id: str((d["quality_hold"] as Record<string, Json>)["audit_id"]),
            checked_at: str((d["quality_hold"] as Record<string, Json>)["checked_at"]),
            reason: str((d["quality_hold"] as Record<string, Json>)["reason"]),
          }
        : null,
    quality_reviews: Array.isArray(d["quality_reviews"])
      ? d["quality_reviews"].flatMap((entry) => (isQualityReviewRecord(entry) ? [entry] : []))
      : [],
    number_pinned: asBool(d["number_pinned"]) ?? false,
    pinned_reason: typeof d["pinned_reason"] === "string" ? d["pinned_reason"] : null,
    updateTime: doc.updateTime,
  };
}

/** Text searched by both list and export paths, including canonical explanation. */
function factSearchText(fact: FactRecord): string {
  return [fact.subject, fact.angle, fact.question, fact.claim_template, fact.context]
    .join(" ")
    .toLowerCase();
}

export interface FactListInput {
  search?: string;
  category?: string;
  family?: string;
  playlistId?: string;
  subject?: string;
  angle?: string;
  status?: string;
  contentRating?: string;
  difficulty?: string;
  surpriseFactor?: number;
  minSurprise?: number;
  sortField?: "subject" | "angle" | "true_number" | "surprise_factor" | "served_count";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

async function applyTaxonomyFilters(
  facts: FactRecord[],
  input: Pick<FactListInput, "category" | "family" | "playlistId">,
): Promise<FactRecord[]> {
  let next = facts;
  if (input.category?.trim()) {
    const cat = input.category.trim().toLowerCase();
    const matchingSubjectDocs = await runQuery({
      collection: "fact_subjects",
      filters: [{ field: "category", op: "EQUAL", value: input.category.trim() }],
      limit: 1000,
    });
    const subjectMap = new Set(
      matchingSubjectDocs.map((d) => String(d.data.subject ?? d.id).toLowerCase()),
    );
    next = next.filter(
      (f) => (f.category && f.category.toLowerCase() === cat) || subjectMap.has(f.subject.toLowerCase()),
    );
  }
  if (input.family?.trim()) {
    const family = input.family.trim().toLowerCase();
    const matchingSubjectDocs = await runQuery({
      collection: "fact_subjects",
      filters: [{ field: "sub_category", op: "EQUAL", value: input.family.trim() }],
      limit: 1000,
    });
    const subjectMap = new Set(
      matchingSubjectDocs.map((d) => String(d.data.subject ?? d.id).toLowerCase()),
    );
    next = next.filter((f) => subjectMap.has(f.subject.toLowerCase()));
  }
  if (input.playlistId?.trim()) {
    const playlist = await getDoc(`fact_playlists/${input.playlistId.trim()}`);
    const keys = Array.isArray(playlist?.data["topic_keys"])
      ? playlist.data["topic_keys"].filter((v): v is string => typeof v === "string")
      : [];
    const keySet = new Set(keys.map((k) => k.toLowerCase()));
    next = next.filter(
      (f) => keySet.has(f.subject_key.toLowerCase()) || keySet.has(normalizeKey(f.subject)),
    );
  }
  return next;
}

const FACT_SCAN_BATCH = 1000;
const FACT_SCAN_LIMIT = 10_000;

/** Structured equality filters Firestore can evaluate server-side. */
function factQueryFilters(input: FactListInput): QueryFilter[] {
  const filters: QueryFilter[] = [];
  if (input.status) filters.push({ field: "status", op: "EQUAL", value: input.status });
  if (input.contentRating) {
    filters.push({ field: "content_rating", op: "EQUAL", value: input.contentRating });
  }
  if (input.difficulty) {
    filters.push({ field: "difficulty_hint", op: "EQUAL", value: input.difficulty });
  }
  return filters;
}

/**
 * Firestore has no substring index, so taxonomy, free-text, and surprise
 * filters run in memory over every server-matched document. The scan pages
 * through `fact_bank` in batches so listings and exports cover the full match
 * set up to FACT_SCAN_LIMIT instead of silently stopping at the first 1,000
 * documents. `truncated` reports that more matches may exist beyond the cap.
 */
async function collectFactScan(
  input: FactListInput,
): Promise<{ docs: FirestoreDoc[]; truncated: boolean }> {
  const filters = factQueryFilters(input);
  const docs: FirestoreDoc[] = [];
  // Offset pagination over live reads can skip or duplicate rows when facts
  // are written mid-scan. The first page captures the server-issued snapshot
  // readTime and every later page (including the cap probe) pins it, so the
  // whole scan observes one consistent view.
  const orderBy = { field: "__name__", direction: "ASCENDING" } as const;
  let snapshotReadTime: string | undefined;
  for (;;) {
    const isFirstPage = docs.length === 0;
    const page = await runQueryPage({
      collection: "fact_bank",
      filters,
      orderBy,
      limit: FACT_SCAN_BATCH,
      offset: docs.length,
      ...(snapshotReadTime !== undefined ? { readTime: snapshotReadTime } : {}),
    });
    if (isFirstPage) {
      snapshotReadTime = page.readTime;
    }
    docs.push(...page.docs);
    if (page.docs.length < FACT_SCAN_BATCH) return { docs, truncated: false };
    if (snapshotReadTime === undefined || snapshotReadTime.length === 0) {
      throw new Error(
        "collectFactScan: fact_bank scan requires a consistent snapshot but the first page returned no readTime; refusing to continue across inconsistent reads.",
      );
    }
    if (docs.length >= FACT_SCAN_LIMIT) {
      // A full batch at the cap is ambiguous: probe once so an exact-boundary
      // result set is not reported as truncated.
      const probe = await runQueryPage({
        collection: "fact_bank",
        filters,
        orderBy,
        limit: 1,
        offset: docs.length,
        readTime: snapshotReadTime,
      });
      return { docs, truncated: probe.docs.length > 0 };
    }
  }
}

/** Applies the in-memory taxonomy, text, surprise, and sort pipeline shared by
 * the paginated listing and the complete export. */
async function filterAndSortFacts(
  docs: FirestoreDoc[],
  input: FactListInput,
): Promise<FactRecord[]> {
  let facts = docs.map(toFact);
  facts = await applyTaxonomyFilters(facts, input);
  if (input.subject?.trim()) {
    const sub = input.subject.trim().toLowerCase();
    facts = facts.filter((f) => f.subject.toLowerCase().includes(sub));
  }
  if (input.angle?.trim()) {
    const ang = input.angle.trim().toLowerCase();
    facts = facts.filter((f) => (f.angle || "").toLowerCase().includes(ang));
  }
  if (input.surpriseFactor !== undefined) {
    facts = facts.filter((f) => (f.surprise_factor ?? 2) === input.surpriseFactor);
  }
  if (input.minSurprise !== undefined) {
    facts = facts.filter((fact) => (fact.surprise_factor ?? 0) >= input.minSurprise!);
  }
  const term = input.search?.trim().toLowerCase();
  if (term) {
    facts = facts.filter((fact) => factSearchText(fact).includes(term));
  }

  const sortField = input.sortField || "subject";
  const sortDir = input.sortOrder === "desc" ? -1 : 1;
  facts.sort((a, b) => {
    let diff = 0;
    if (sortField === "subject") {
      diff = a.subject.localeCompare(b.subject) || a.angle.localeCompare(b.angle);
    } else if (sortField === "angle") {
      diff = a.angle.localeCompare(b.angle) || a.subject.localeCompare(b.subject);
    } else if (sortField === "true_number") {
      diff = (a.true_number ?? 0) - (b.true_number ?? 0);
    } else if (sortField === "surprise_factor") {
      diff = (a.surprise_factor ?? 2) - (b.surprise_factor ?? 2);
    } else if (sortField === "served_count") {
      diff = a.served_count - b.served_count;
    }
    return diff * sortDir;
  });
  return facts;
}

export async function listFacts(input: FactListInput) {
  const pageSize = Math.min(input.pageSize ?? 25, 1000);
  const page = Math.max(input.page ?? 1, 1);

  const { docs, truncated } = await collectFactScan(input);
  const facts = await filterAndSortFacts(docs, input);

  const total = facts.length;
  const start = (page - 1) * pageSize;
  return {
    facts: facts.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    windowed: truncated,
  };
}

/**
 * Complete export: returns every fact matching the filters or fails loudly.
 * A partial export is never returned, so CSV consumers cannot silently drop
 * records beyond the scan cap.
 */
export async function exportFacts(input: FactListInput): Promise<FactRecord[]> {
  const { docs, truncated } = await collectFactScan(input);
  if (truncated) {
    throw new Error(
      `exportFacts: fact_bank matches exceed the ${FACT_SCAN_LIMIT}-document scan limit; narrow the filters and retry.`,
    );
  }
  return filterAndSortFacts(docs, input);
}

export async function getFact(id: string): Promise<FactRecord | null> {
  const doc = await getDoc(`fact_bank/${id}`);
  return doc ? toFact(doc) : null;
}

