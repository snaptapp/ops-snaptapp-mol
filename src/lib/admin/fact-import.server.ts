/**
 * Fact admission: builds the pending fact_bank payload shared by manual
 * creation and CSV import, and imports rows as independent audited
 * transactions (never batch-atomic).
 */
import type { PreparedAuditEntry } from "../firebase/audit.server";
import { factId, normalizeKey, runTransaction } from "../firebase/firestore.server";
import {
  runPerItemBatch,
  type BatchItemOutcome,
  type BatchMutationResult,
} from "./batch-mutation-semantics";
import { QK } from "./contract";
import {
  buildPendingFact,
  PENDING_FACT_ORIGINS,
  type PendingFact,
  type PendingFactInput,
  type PendingFactOrigin,
} from "./fact-admission";
import type { QuantityKind } from "./content-shared.server";
import { stagePreparedAudit } from "./fact-doc-utils.server";

export interface ImportFactInput {
  subject: string;
  category?: string | null;
  sub_category?: string | null;
  angle: string;
  true_number: number;
  unit: string;
  claim_template?: string;
  context?: string | null;
  explanation?: string | null;
  question?: string;
  surprise_factor?: number;
  quantity_kind?: QuantityKind | "";
  plausible_min?: string | null;
  plausible_max?: string | null;
  number_pinned?: boolean;
  pinned_reason?: string | null;
  source_urls?: readonly string[];
  origin?: PendingFactOrigin;
  difficulty_hint?: "casual" | "medium" | "hard";
  content_rating?: "standard" | "after_dark";
}

function pendingCategory(value: string | null | undefined): PendingFactInput["category"] {
  return value?.trim() ? (value as PendingFactInput["category"]) : null;
}

function pendingQuantityKind(value: QuantityKind | "" | undefined): QuantityKind {
  return value === undefined || value === "" ? QK.count : value;
}

function pendingText(value: string | null | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

/** Build the one fact-bank payload that either manual admission path may persist. */
export function buildAdmissionFact(
  input: ImportFactInput,
  origin: PendingFactOrigin,
  timestamp = new Date().toISOString(),
): PendingFact {
  const question = pendingText(input.question, `${input.subject} - ${input.angle}`.trim());
  const claim = pendingText(input.claim_template, `${question}: {n}`);
  const claimTemplate = claim.includes("{n}") ? claim : `${claim} {n}`;
  return buildPendingFact({
    subject: input.subject,
    category: pendingCategory(input.category),
    sub_category: input.sub_category ?? null,
    angle: input.angle,
    true_number: input.true_number,
    unit: input.unit,
    claim_template: claimTemplate,
    question,
    explanation: pendingText(input.explanation, pendingText(input.context, question)),
    source_urls: input.source_urls ?? [],
    surprise_factor: input.surprise_factor ?? 2,
    quantity_kind: pendingQuantityKind(input.quantity_kind),
    ...(input.plausible_min !== undefined ? { plausible_min: input.plausible_min } : {}),
    ...(input.plausible_max !== undefined ? { plausible_max: input.plausible_max } : {}),
    ...(input.number_pinned !== undefined ? { number_pinned: input.number_pinned } : {}),
    ...(input.pinned_reason !== undefined ? { pinned_reason: input.pinned_reason } : {}),
    ...(input.content_rating !== undefined ? { content_rating: input.content_rating } : {}),
    origin,
  });
}

export interface ImportFactAuditContext {
  readonly id: string;
  readonly index: number;
  readonly input: ImportFactInput;
}

/**
 * Builds the one audit entry that may commit with a CSV row. The server-function
 * boundary allocates its identity before the per-fact transaction starts, so a
 * transaction retry stages the same audit document id.
 */
export type ImportFactAuditFactory = (context: ImportFactAuditContext) => PreparedAuditEntry;

/** Canonical per-item import result plus the legacy counters consumed by the CSV UI. */
export type ImportFactsResult = Omit<BatchMutationResult, "operation"> & {
  readonly operation: "import";
  /** Number of facts committed with their audit entry. */
  readonly imported: number;
  /** Number of duplicate identities intentionally left unchanged. */
  readonly skipped: number;
  /** Human-readable failures aligned with `items[].index`. */
  readonly errors: readonly string[];
  /** Stable user-facing explanation of the non-atomic batch outcome. */
  readonly summary: string;
};

function importSummary(result: BatchMutationResult): string {
  const persisted = result.counts.persisted;
  const skipped = result.counts.skipped;
  const failed = result.counts.failed;
  const failedId = result.failedId ? ` at ${result.failedId}` : "";
  if (failed === 0) {
    return (
      `Imported ${persisted} fact(s) and skipped ${skipped} duplicate(s). ` +
      "Rows commit independently; this import is not batch-atomic."
    );
  }
  return (
    `Imported ${persisted} fact(s), skipped ${skipped} duplicate(s), and failed ${failed} row(s)${failedId}. ` +
    "Later rows were still attempted independently; this import is not batch-atomic."
  );
}

/**
 * Import CSV rows in input order with one fact-plus-audit transaction per row.
 * A duplicate is a skipped item and receives no audit. Every persisted item has
 * exactly one audit staged in the same transaction, while a row failure never
 * rolls back an earlier committed row.
 */
export async function importFactsBatch(
  facts: ImportFactInput[],
  auditFor: ImportFactAuditFactory,
): Promise<ImportFactsResult> {
  const prepared: Array<{ id: string; input: ImportFactInput; audit: PreparedAuditEntry }> = [];
  for (let index = 0; index < facts.length; index += 1) {
    const input = facts[index];
    const id = await factId(normalizeKey(input.subject), normalizeKey(input.angle));
    prepared.push({ id, input, audit: auditFor({ id, index, input }) });
  }

  const result = await runPerItemBatch(
    "import",
    prepared.map((entry) => entry.id),
    async (id, index): Promise<BatchItemOutcome> => {
      const entry = prepared[index];
      if (!entry) {
        return {
          status: "failed",
          failure: { code: "missing_import_entry", message: `Missing prepared import entry ${id}` },
        };
      }
      try {
        // Duplicate detection and both writes share this transaction. If another
        // writer creates the identity after our read, Firestore aborts and retries
        // the callback; the retry then observes the existing fact and skips it.
        const pendingFact = buildAdmissionFact(entry.input, PENDING_FACT_ORIGINS[1]);
        return await runTransaction(async (tx): Promise<BatchItemOutcome> => {
          const existing = await tx.get(`fact_bank/${id}`);
          if (existing) {
            return { status: "skipped", reason: "identity already exists" };
          }
          tx.set(`fact_bank/${id}`, pendingFact);
          stagePreparedAudit(tx, entry.audit);
          return { status: "persisted", auditCommitted: true };
        });
      } catch (error) {
        return {
          status: "failed",
          failure: {
            code: "item_execution_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  );

  const errors = result.items.flatMap((item) => {
    if (item.status !== "failed") return [];
    const input = facts[item.index];
    const label = input ? `${input.subject} / ${input.angle}` : item.id;
    return [`${label} (${item.id}): ${item.failure?.message ?? "Import failed"}`];
  });

  return {
    ...result,
    operation: "import",
    imported: result.counts.persisted,
    skipped: result.counts.skipped,
    errors,
    summary: importSummary(result),
  };
}

