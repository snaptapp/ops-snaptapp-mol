/**
 * Fact bank + moderation write path. Server-only: every export assumes the
 * caller has already been authorized with `requireAdmin()`.
 *
 * Read/query, admission, observability, and duplicate-discovery layers live
 * in focused sibling modules; this module keeps fact edits, bulk updates,
 * lifecycle transitions, moderation resolution, and report maintenance, and
 * re-exports the extracted surface so existing importers are unchanged.
 */
import { z } from "zod";
import {
  factId,
  normalizeKey,
  runQuery,
  runTransaction,
  type FirestoreDoc,
} from "../firebase/firestore.server";
import { type PreparedAuditEntry } from "../firebase/audit.server";
import { type AdminUser } from "../firebase/verify.server";
import { isNonDuplicateFlag } from "./quality-flags";
import {
  runPerItemBatch,
  type BatchItemOutcome,
  type BatchMutationResult,
} from "./batch-mutation-semantics";
import { PENDING_FACT_ORIGINS, type PendingFact } from "./fact-admission";
import {
  QUANTITY_KINDS as CONTRACT_QUANTITY_KINDS,
  STATUS_TRANSITIONS,
  type FactStatus,
} from "../../../shared/fact-lifecycle-contract.gen";
import {
  appendQualityReview,
  buildQualityReview,
  currentFindingIds,
  DISPUTE_CLEAR_PATHS,
  MATERIAL_EDIT_KEYS,
  MATERIAL_INVALIDATION_PATHS,
  materialEditHold,
} from "./quality-review";
import {
  asJsonRecord,
  asPlainRecord,
  auditAt,
  mergedFactDoc,
  requireUpdateTime,
  stagePreparedAudit,
} from "./fact-doc-utils.server";
import { buildAdmissionFact, type ImportFactInput } from "./fact-import.server";
import { canonicalExplanation, toFact, type FactRecord } from "./fact-records.server";
import {
  asSources,
  CATEGORIES,
  CONTENT_RATINGS,
  FACT_STATUSES,
  PENDING_ADMISSION_COPY,
  STATUS,
} from "./content-shared.server";

export {
  areFactsDuplicateCandidates,
  ENGLISH_STOP_WORDS,
  extractEntityTokens,
  normalizeQuestion,
} from "./duplicate-candidates.server";

export * from "./content-shared.server";
export * from "./fact-doc-utils.server";
export * from "./fact-records.server";
export * from "./report-records.server";
export * from "./report-duplicates.server";
export * from "./fact-import.server";
export * from "./bank-observability.server";

export interface FactEditInput {
  id: string;
  subject?: string;
  category?: string;
  sub_category?: string;
  angle?: string;
  true_number?: number;
  unit?: string;
  claim_template?: string;
  /** Canonical reveal copy; `context` remains a legacy input alias. */
  explanation?: string;
  context?: string;
  question?: string;
  surprise_factor?: number;
  difficulty_hint?: string;
  content_rating?: string;
  source_urls?: string[];
  quantity_kind?: string;
  plausible_min?: string;
  plausible_max?: string;
}

// Semantic inputs the DDM consumes. When any of them change, the stored
// derivation blocks and input fingerprint are invalidated so the next
// precompute backfill regenerates under the corrected semantics rather than
// shipping a stale block.
const SEMANTIC_EDIT_KEYS: (keyof FactEditInput)[] = [
  "true_number",
  "unit",
  "claim_template",
  "surprise_factor",
  "quantity_kind",
  "plausible_min",
  "plausible_max",
];

/** The persisted fields that make a fact's identity deterministic. */
export type FactIdentityField = "subject" | "angle";

/**
 * A request tried to change a fact's identity through the ordinary edit path.
 * Subject and angle are part of the document's deterministic identity: changing
 * either would also require a new canonical key and document id. Corrections
 * must create a replacement instead, so this error is raised before any write.
 */
export class FactIdentityChangeError extends Error {
  readonly factId: string;
  readonly field: FactIdentityField;
  readonly current: string;
  readonly requested: string;

  constructor(factId: string, field: FactIdentityField, current: string, requested: string) {
    super(
      `Fact identity change rejected for fact ${factId}: ${field} is immutable ` +
        `(current "${current}", requested "${requested}").`,
    );
    this.name = "FactIdentityChangeError";
    this.factId = factId;
    this.field = field;
    this.current = current;
    this.requested = requested;
  }
}

/**
 * Identity fields may still be present in a legacy or full-form edit payload,
 * but only an exact stored value is a no-op. This comparison intentionally
 * happens after the current document read and before constructing any patch so
 * no caller path can re-key the fact or write an adjacent taxonomy document.
 */
function assertFactIdentityUnchanged(input: FactEditInput, existing: FactRecord): void {
  if (input.subject !== undefined && input.subject !== existing.subject) {
    throw new FactIdentityChangeError(input.id, "subject", existing.subject, input.subject);
  }
  if (input.angle !== undefined && input.angle !== existing.angle) {
    throw new FactIdentityChangeError(input.id, "angle", existing.angle, input.angle);
  }
}

/** Optional transaction-scoped audit input accepted by ordinary fact mutations. */
export interface FactMutationOptions {
  audit?: PreparedAuditEntry;
  /** Compatibility alias for callers that name the prebuilt entry explicitly. */
  auditEntry?: PreparedAuditEntry;
}

/**
 * A prepared entry can be passed directly, or wrapped in mutation options. The
 * direct form keeps the server module convenient for internal callers while the
 * wrapper makes the transaction contract explicit at server-function seams.
 */
export type FactMutationAudit = PreparedAuditEntry | FactMutationOptions;

function resolveAuditEntry(value: FactMutationAudit | undefined): PreparedAuditEntry | undefined {
  if (value === undefined) return undefined;
  if ("id" in value && "data" in value) return value;
  return value.audit ?? value.auditEntry;
}

/**
 * Build the patch + invalidation for one fact edit against the transaction's
 * current snapshot. Shared by `updateFact` and the report-resolution edit
 * actions so a fix carried through moderation invalidates readiness exactly
 * like a direct portal edit.
 *
 * Material edits (any fingerprinted field) atomically revoke the approval
 * minted for the old revision: `quality_receipt` and the stored
 * `content_fingerprint` are deleted, stale lint evidence is cleared, and a
 * `quality_hold` records that the current revision awaits a fresh audit.
 * `verified_at`/`verifier_model` are never written and are left as historical
 * auditor metadata; the receipt, not the timestamp, is the live approval.
 * `quality_hold` is never deleted here: only a new receipt clears it.
 */
function buildFactEditPlan(
  currentDoc: FirestoreDoc,
  input: FactEditInput,
  now: string,
): {
  patch: Record<string, unknown>;
  deletePaths: string[] | undefined;
  semanticChanged: boolean;
  materialChanged: boolean;
} {
  const existing = toFact(currentDoc);
  const patch: Record<string, unknown> = {};
  // Subject and angle are deliberately absent: even an exact-value payload is
  // a no-op, and the persisted canonical keys/document id remain untouched.
  if (input.explanation !== undefined) {
    patch["explanation"] = input.explanation;
  } else if (input.context !== undefined) {
    patch["context"] = input.context;
    patch["explanation"] = input.context;
  }
  const assignable: (keyof FactEditInput)[] = [
    "category",
    "unit",
    "claim_template",
    "context",
    "question",
    "surprise_factor",
    "difficulty_hint",
    "content_rating",
    "source_urls",
    "quantity_kind",
    "plausible_min",
    "plausible_max",
  ];
  for (const key of assignable) {
    if (input[key] !== undefined) patch[key] = input[key];
  }

  // Changing the value preserves the old one for the reveal-diff history.
  const trueNumberChanged =
    input.true_number !== undefined && input.true_number !== existing.true_number;
  if (trueNumberChanged) {
    patch["previous_true_number"] = existing.true_number;
    patch["number_changed_at"] = now;
    patch["number_change_source"] = "admin_portal";
    patch["true_number"] = input.true_number;
  }

  // Semantic edits invalidate the stored derivation: delete the precomputed
  // blocks and input fingerprint so the next backfill regenerates under the
  // corrected semantics instead of exporting a stale block.
  const semanticChanged = SEMANTIC_EDIT_KEYS.some((key) => {
    if (input[key] === undefined) return false;
    const next = input[key];
    const prev = existing[key as keyof FactRecord];
    return String(next ?? "") !== String(prev ?? "");
  });

  // Material edits (any fingerprinted field) revoke the approval bound to
  // the old revision. `context` and `explanation` are the same canonical
  // field; comparing the written value against the stored explanation keeps
  // the legacy alias from slipping past the check.
  const materialChanged = MATERIAL_EDIT_KEYS.some((key) => {
    const written =
      key === "explanation"
        ? (patch["explanation"] ?? (key in input ? input[key] : undefined))
        : key === "context"
          ? patch["explanation"]
          : patch[key];
    if (written === undefined) return false;
    const prev =
      key === "explanation" || key === "context"
        ? existing.context
        : (existing[key as keyof FactRecord] as unknown);
    if (Array.isArray(written) || Array.isArray(prev)) {
      return JSON.stringify(written ?? null) !== JSON.stringify(prev ?? null);
    }
    return String(written ?? "") !== String(prev ?? "");
  });

  const deletePaths: string[] = semanticChanged
    ? ["derivation", "precomputed_derivation", "derivation_input_fingerprint"]
    : [];
  if (trueNumberChanged) {
    // The canonical token is a projection of the value, stamped by the
    // Foundry decode path. A raw-number correction cannot restamp it, so the
    // stale token is deleted atomically with the write rather than left to
    // trip true_number_token_mismatch on the next lint pass.
    deletePaths.push("true_number_token");
  }
  if (materialChanged) {
    deletePaths.push(...MATERIAL_INVALIDATION_PATHS);
    patch["quality_hold"] = materialEditHold({
      auditId: "admin_edit",
      reason: "Material fact edit: stored approval revoked pending a fresh audit",
      now,
    });
  }

  return {
    patch,
    deletePaths: deletePaths.length > 0 ? deletePaths : undefined,
    semanticChanged,
    materialChanged,
  };
}

/**
 * Apply one ordinary fact edit under an exact transaction CAS.
 * `auditInput`, when supplied, is staged in the same transaction and must be
 * prepared before the call so its identity survives transaction retries.
 */
export async function updateFact(
  input: FactEditInput,
  auditInput?: FactMutationAudit,
): Promise<FactRecord> {
  const audit = resolveAuditEntry(auditInput);
  const updatedAt = new Date().toISOString();

  return runTransaction(async (tx) => {
    // The fact read is inside the transaction callback. A contention retry
    // therefore rebuilds the decision from a fresh snapshot and fresh CAS token.
    const currentDoc = await tx.get(`fact_bank/${input.id}`);
    if (!currentDoc) throw new Error(`Fact ${input.id} not found`);
    const existing = toFact(currentDoc);
    assertFactIdentityUnchanged(input, existing);

    const { patch, deletePaths } = buildFactEditPlan(currentDoc, input, updatedAt);

    // Read the taxonomy document before queueing any write. This keeps the
    // subject-side linkage in the same transaction as the fact mutation when a
    // category is assigned, and derives its key only from the persisted fact.
    let subjectPath: string | null = null;
    let subjectDoc: FirestoreDoc | null = null;
    if (input.category && existing.subject) {
      const subject = existing.subject.trim();
      subjectPath = `fact_subjects/${normalizeKey(subject)}`;
      subjectDoc = await tx.get(subjectPath);
    }

    const hasFactChange = Object.keys(patch).length > 0 || deletePaths !== undefined;
    if (hasFactChange || audit !== undefined) {
      patch["updated_at"] = updatedAt;
      tx.update(`fact_bank/${input.id}`, patch, {
        updateTime: requireUpdateTime(currentDoc),
        ...(deletePaths ? { deletePaths } : {}),
      });
    }

    if (subjectPath !== null && subjectDoc !== null && input.category) {
      const subjectPatch: Record<string, unknown> = { category: input.category };
      if (input.sub_category) subjectPatch["sub_category"] = input.sub_category;
      tx.update(subjectPath, subjectPatch, {
        ...(subjectDoc.updateTime ? { updateTime: subjectDoc.updateTime } : {}),
      });
    } else if (subjectPath !== null && input.category) {
      const subject = existing.subject.trim();
      const subjectKey = normalizeKey(subject);
      tx.set(subjectPath, {
        subject,
        subject_key: subjectKey,
        category: input.category,
        ...(input.sub_category ? { sub_category: input.sub_category } : {}),
        aliases: [],
        playlist_ids: [],
        createdAt: updatedAt,
      });
    }

    if (audit !== undefined) {
      stagePreparedAudit(tx, auditAt(audit, currentDoc, input));
    }

    return toFact(mergedFactDoc(currentDoc, patch, deletePaths));
  });
}

/* ------------------------------- bulk update -------------------------------- */

/** Smallest batch `bulkUpdateFacts` accepts in one invocation. */
export const BULK_UPDATE_MIN_BATCH = 1;
/** Largest batch `bulkUpdateFacts` accepts in one invocation. */
export const BULK_UPDATE_MAX_BATCH = 200;

/**
 * The `quantity_kind` values the fact editor accepts: the contract's closed set
 * (Requirement 9.5, derived — never restated) plus the empty-string "auto"
 * sentinel that asks the DDM to classify the kind from the unit.
 */
export const QUANTITY_KIND_OPTIONS = [...CONTRACT_QUANTITY_KINDS, ""] as const;
export type QuantityKindOption = (typeof QUANTITY_KIND_OPTIONS)[number];

/**
 * The declared fact-edit schema. Mirrors the `editInput` validator the
 * `saveFact` / `bulkUpdateFacts` server functions apply, so a batch that
 * reaches this module by any other route is held to the same shape.
 */
export const factEditSchema = z.object({
  id: z.string().min(1),
  subject: z.string().optional(),
  category: z.union([z.enum(CATEGORIES), z.literal("")]).optional(),
  sub_category: z.string().optional(),
  angle: z.string().optional(),
  true_number: z.number().optional(),
  unit: z.string().optional(),
  claim_template: z.string().optional(),
  explanation: z.string().optional(),
  context: z.string().optional(),
  question: z.string().optional(),
  surprise_factor: z.number().int().min(0).max(3).optional(),
  content_rating: z.enum(CONTENT_RATINGS).optional(),
  source_urls: z.array(z.string()).optional(),
  quantity_kind: z.enum(QUANTITY_KIND_OPTIONS).optional(),
  plausible_min: z.string().optional(),
  plausible_max: z.string().optional(),
});

export type BulkUpdateResult = Omit<BatchMutationResult, "operation" | "failedId"> & {
  readonly operation: "bulk-update";
  /** Number of edits persisted. */
  readonly count: number;
  /** Fact ids persisted, in application order. */
  readonly editedIds: string[];
  /** Set only when the batch stopped early: the fact whose edit did not persist. */
  readonly failedId?: string;
};

function asBulkUpdateResult(result: BatchMutationResult): BulkUpdateResult {
  if (result.operation !== "bulk-update") {
    throw new Error(`Unexpected batch operation: ${result.operation}`);
  }
  return {
    ...result,
    operation: "bulk-update",
    count: result.counts.persisted,
    editedIds: [...result.persistedIds],
    failedId: result.failedId ?? undefined,
  };
}

/**
 * A batch rejected before any Firestore write. `rule` names the violated
 * validation rule; `index` locates the offending edit when the rule is
 * per-edit rather than per-batch.
 */
export class BulkUpdateValidationError extends Error {
  readonly rule: string;
  readonly index: number | null;

  constructor(rule: string, message: string, index: number | null = null) {
    super(message);
    this.name = "BulkUpdateValidationError";
    this.rule = rule;
    this.index = index;
  }
}

/**
 * A persistence failure part-way through a validated batch. Carries the
 * persisted prefix so the caller can record exactly the ids that landed and
 * no more.
 */
export class BulkUpdatePartialFailureError extends Error {
  readonly failedId: string;
  readonly result: BulkUpdateResult;

  constructor(failedId: string, result: BulkUpdateResult, cause: unknown) {
    super(
      `Bulk update stopped at fact ${failedId} after persisting ${result.count} edit(s): ` +
      (cause instanceof Error ? cause.message : String(cause)),
      { cause },
    );
    this.name = "BulkUpdatePartialFailureError";
    this.failedId = failedId;
    this.result = result;
  }
}

function auditTargetsFact(audit: PreparedAuditEntry, factIdValue: string): boolean {
  return audit.data["targetId"] === factIdValue;
}

function bulkFailure(error: unknown): BatchItemOutcome {
  return {
    status: "failed",
    failure: {
      code: "item_execution_failed",
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

/**
 * Apply a bounded batch of fact edits with one fact-plus-audit transaction per
 * edit. The batch is deliberately not atomic: edits run in input order, the
 * first failed transaction stops the suffix, and the thrown partial-failure
 * result carries the exact persisted prefix and failed id.
 */
export async function bulkUpdateFacts(
  updates: FactEditInput[],
  audits: readonly PreparedAuditEntry[],
): Promise<BulkUpdateResult> {
  if (!Array.isArray(updates)) {
    throw new BulkUpdateValidationError(
      "batch must be an array of fact edits",
      "Bulk update rejected: batch must be an array of fact edits",
    );
  }
  if (updates.length < BULK_UPDATE_MIN_BATCH) {
    throw new BulkUpdateValidationError(
      `batch size >= ${BULK_UPDATE_MIN_BATCH}`,
      `Bulk update rejected: batch must contain at least ${BULK_UPDATE_MIN_BATCH} edit, received ${updates.length}`,
    );
  }
  if (updates.length > BULK_UPDATE_MAX_BATCH) {
    throw new BulkUpdateValidationError(
      `batch size <= ${BULK_UPDATE_MAX_BATCH}`,
      `Bulk update rejected: batch must contain at most ${BULK_UPDATE_MAX_BATCH} edits, received ${updates.length}`,
    );
  }
  if (!Array.isArray(audits) || audits.length !== updates.length) {
    throw new BulkUpdateValidationError(
      "one prepared audit per edit",
      `Bulk update rejected: expected ${updates.length} prepared audit entries, received ${Array.isArray(audits) ? audits.length : 0}`,
    );
  }
  for (let index = 0; index < updates.length; index++) {
    const parsed = factEditSchema.safeParse(updates[index]);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue.path.length > 0 ? issue.path.join(".") : "edit";
      const rule = `${field}: ${issue.message}`;
      throw new BulkUpdateValidationError(
        rule,
        `Bulk update rejected: edit at index ${index} violates the edit schema (${rule})`,
        index,
      );
    }
    const audit = audits[index];
    if (!audit || !auditTargetsFact(audit, updates[index].id)) {
      throw new BulkUpdateValidationError(
        "audit targetId matches edit id",
        `Bulk update rejected: prepared audit at index ${index} must target fact ${updates[index].id}`,
        index,
      );
    }
  }

  const firstIdentity: { current: FactIdentityChangeError | null } = { current: null };
  const firstFailure: { current: { id: string; error: unknown } | null } = { current: null };
  const result = await runPerItemBatch(
    "bulk-update",
    updates.map((update) => update.id),
    async (_id, index) => {
      try {
        await updateFact(updates[index], audits[index]);
        return { status: "persisted", auditCommitted: true } as const;
      } catch (error) {
        if (error instanceof FactIdentityChangeError && index === 0) {
          firstIdentity.current = error;
        } else {
          firstFailure.current ??= { id: updates[index].id, error };
        }
        return bulkFailure(error);
      }
    },
    "stop",
  );

  if (firstIdentity.current) throw firstIdentity.current;
  if (firstFailure.current) {
    throw new BulkUpdatePartialFailureError(
      firstFailure.current.id,
      asBulkUpdateResult(result),
      firstFailure.current.error,
    );
  }
  return asBulkUpdateResult(result);
}

/**
 * A `setFactStatus` call the shared contract does not permit. Raised before any
 * Firestore write, so the targeted document is left unchanged (Requirements
 * 9.3, 9.4). The message names both the fact's current status and the rejected
 * target status.
 */
export class FactStatusTransitionError extends Error {
  readonly factId: string;
  readonly from: string;
  readonly to: string;

  constructor(factId: string, from: string, to: string) {
    super(
      `Status change rejected for fact ${factId}: the transition from "${from}" to "${to}" ` +
      `is not admin-authorized by the shared fact-lifecycle contract.`,
    );
    this.name = "FactStatusTransitionError";
    this.factId = factId;
    this.from = from;
    this.to = to;
  }
}

/**
 * Whether the shared contract marks the current→requested status change as one
 * an admin may write. A pair the contract does not declare, or declares with
 * `adminAuthorized: false`, is not authorized; a status with no
 * admin-authorized outgoing target is displayable and filterable but has no
 * valid transition to offer and can never be written to (Requirement 9.8).
 */
function isAdminAuthorizedTransition(from: string, to: string): boolean {
  return STATUS_TRANSITIONS.some(
    (transition) =>
      transition.from === from && transition.to === to && transition.adminAuthorized,
  );
}

/**
 * The live status used when moderation reinstates a corrected fact. The value
 * comes from the generated contract's `active` member, while the transition
 * table must still prove that admins may enter and leave that status. Inferring
 * liveness from any non-terminal graph node would incorrectly select `disputed`
 * once pending → active became Foundry-only.
 */
function liveStatus(): FactStatus | null {
  const live = STATUS.active;
  const authorized = STATUS_TRANSITIONS.filter((transition) => transition.adminAuthorized);
  const hasAuthorizedTarget = authorized.some((transition) => transition.to === live);
  const hasAuthorizedSource = authorized.some((transition) => transition.from === live);
  return hasAuthorizedTarget && hasAuthorizedSource ? live : null;
}

/**
 * The status a fact currently in `from` should be reinstated to when its number
 * is corrected, or `null` when no such contract-authorized move exists (for
 * example the fact is already live, which has no self-transition).
 */
function reinstatementTargetFor(from: string): FactStatus | null {
  const target = liveStatus();
  if (target === null || from === target) return null;
  return isAdminAuthorizedTransition(from, target) ? target : null;
}

/**
 * The status patch for one contract-authorized transition, re-validated
 * against the current snapshot every call. Shared by `setFactStatus` and the
 * report-resolution paths so a reinstatement written inside a moderation
 * transaction is gated by exactly the same rules as a standalone transition.
 * Throws `FactStatusTransitionError` before any write when the contract does
 * not authorize the move; moderation can never write `pending` or `retired`
 * sources back to `active` through a stored prior status.
 */
function statusTransitionPatch(
  factIdValue: string,
  currentStatus: string,
  target: FactStatus,
  reason: string | undefined,
  now: string,
): Record<string, unknown> {
  if (!isAdminAuthorizedTransition(currentStatus, target)) {
    throw new FactStatusTransitionError(factIdValue, currentStatus, target);
  }
  const patch: Record<string, unknown> = { status: target, updated_at: now };
  if (target === STATUS.retired) {
    patch["retired_reason"] = reason ?? "Retired from admin portal";
  }
  if (target === STATUS.active) {
    // Reinstating a disputed fact clears only retirement state. Verification
    // timestamps/models are owned by the banked-fact auditor, never by this
    // admin transition path.
    patch["retired_reason"] = null;
  }
  return patch;
}

/**
 * Apply one contract-authorized lifecycle transition under an exact
 * transaction CAS. The optional prepared audit is committed with the fact and
 * is never used to grant verification authority.
 */
export async function setFactStatus(
  input: {
    id: string;
    status: (typeof FACT_STATUSES)[number];
    reason?: string;
    /** @deprecated Moderation transitions never write verifier metadata. */
    verifierModel?: string;
  },
  auditInput?: FactMutationAudit,
): Promise<FactRecord> {
  const audit = resolveAuditEntry(auditInput);
  const updatedAt = new Date().toISOString();

  return runTransaction(async (tx) => {
    // Read and revalidate on every transaction attempt. In particular, the
    // Foundry-only pending→active edge is never evaluated from a stale status.
    const currentDoc = await tx.get(`fact_bank/${input.id}`);
    if (!currentDoc) throw new Error(`Fact ${input.id} not found`);
    const existing = toFact(currentDoc);
    const patch = statusTransitionPatch(
      input.id,
      String(existing.status),
      input.status,
      input.reason,
      updatedAt,
    );

    tx.update(`fact_bank/${input.id}`, patch, {
      updateTime: requireUpdateTime(currentDoc),
    });
    if (audit !== undefined) {
      stagePreparedAudit(
        tx,
        auditAt(audit, currentDoc, {
          status: input.status,
          reason: input.reason ?? null,
        }),
      );
    }
    return toFact(mergedFactDoc(currentDoc, patch));
  });
}

/** Input for the one-fact-plus-retirement correction operation. */
export interface CorrectedReplacementInput {
  /** The immutable source document to retire. */
  originalId: string;
  /** Fields for the new fact; its subject/angle are never read from the source. */
  replacement: ImportFactInput;
  /** Human-readable reason persisted on the retired source. */
  reason?: string;
  /** Optional caller token used to reject a stale edit before any write. */
  originalUpdateTime?: string;
}

/** Both sides of a committed correction, returned after the transaction commits. */
export interface CorrectedReplacementResult {
  readonly original: FactRecord;
  readonly replacement: FactRecord;
}

export type CorrectedReplacementErrorCode =
  | "missing_original"
  | "stale_original"
  | "replacement_exists"
  | "replacement_identity_collision"
  | "missing_audit";

/** A correction rejection that is safe to surface to the moderation boundary. */
export class CorrectedReplacementError extends Error {
  override readonly name = "CorrectedReplacementError";
  readonly code: CorrectedReplacementErrorCode;
  readonly originalId: string;
  readonly replacementId?: string;

  constructor(
    code: CorrectedReplacementErrorCode,
    message: string,
    originalId: string,
    replacementId?: string,
  ) {
    super(message);
    this.code = code;
    this.originalId = originalId;
    this.replacementId = replacementId;
  }
}

/**
 * Commit a corrected fact and retire its source as one Firestore transaction.
 *
 * The source is updated with the exact `updateTime` returned by the transaction
 * read. Identity fields are intentionally absent from that patch: a correction
 * never re-keys the immutable source document. The replacement receives a fresh
 * canonical id and pending admission payload, while the prepared audit entry is
 * staged alongside both writes.
 */
export async function createCorrectedReplacement(
  input: CorrectedReplacementInput,
  auditInput?: FactMutationAudit,
): Promise<CorrectedReplacementResult> {
  const originalId = input.originalId.trim();
  if (!originalId) {
    throw new CorrectedReplacementError(
      "missing_original",
      "Corrected replacement requires an original fact id",
      input.originalId,
    );
  }

  const timestamp = new Date().toISOString();
  const origin = input.replacement.origin ?? PENDING_FACT_ORIGINS[0];
  const replacement = buildAdmissionFact(input.replacement, origin, timestamp);
  const replacementId = await factId(replacement.subject_key, replacement.angle_key);

  // A canonical id collision would turn a correction into an in-place overwrite
  // of the immutable source. Require a genuinely distinct replacement identity.
  if (replacementId === originalId) {
    throw new CorrectedReplacementError(
      "replacement_identity_collision",
      `Corrected replacement for fact ${originalId} resolves to the original document id; ` +
        "the replacement must have a distinct subject and angle identity",
      originalId,
      replacementId,
    );
  }

  const audit = resolveAuditEntry(auditInput);
  if (audit === undefined) {
    throw new CorrectedReplacementError(
      "missing_audit",
      "Corrected replacement requires one prepared audit entry",
      originalId,
      replacementId,
    );
  }

  const retirementReason = input.reason?.trim() || "Retired by corrected replacement";
  const expectedOriginalUpdateTime = input.originalUpdateTime?.trim();

  return runTransaction(async (tx) => {
    const originalDoc = await tx.get(`fact_bank/${originalId}`);
    if (!originalDoc) {
      throw new CorrectedReplacementError(
        "missing_original",
        `Fact ${originalId} not found`,
        originalId,
        replacementId,
      );
    }

    const original = toFact(originalDoc);
    if (
      expectedOriginalUpdateTime !== undefined &&
      expectedOriginalUpdateTime !== originalDoc.updateTime
    ) {
      throw new CorrectedReplacementError(
        "stale_original",
        `Fact ${originalId} changed since the correction was prepared`,
        originalId,
        replacementId,
      );
    }

    if (!isAdminAuthorizedTransition(original.status, STATUS.retired)) {
      throw new FactStatusTransitionError(originalId, original.status, STATUS.retired);
    }

    // Read the replacement path before queueing either write. A transaction
    // read plus the subsequent set is an atomic create-or-conflict boundary;
    // an existing identity must never be overwritten by a correction.
    const existingReplacement = await tx.get(`fact_bank/${replacementId}`);
    if (existingReplacement) {
      throw new CorrectedReplacementError(
        "replacement_exists",
        `A fact already exists at the canonical replacement id ${replacementId}`,
        originalId,
        replacementId,
      );
    }

    // Resolve the CAS token before queueing either write. A malformed snapshot
    // therefore cannot leave a replacement write waiting behind a thrown
    // validation error, even in a defensive transaction double.
    const originalUpdateTime = requireUpdateTime(originalDoc);
    const originalPatch: Record<string, unknown> = {
      status: STATUS.retired,
      retired_reason: retirementReason,
      updated_at: timestamp,
    };

    tx.set(`fact_bank/${replacementId}`, replacement);
    tx.update(`fact_bank/${originalId}`, originalPatch, {
      updateTime: originalUpdateTime,
    });
    stagePreparedAudit(
      tx,
      auditAt(audit, originalDoc, {
        operation: "corrected_replacement",
        originalId,
        replacementId,
        original: {
          status: STATUS.retired,
          retired_reason: retirementReason,
        },
        replacement,
      }),
    );

    return {
      original: toFact(mergedFactDoc(originalDoc, originalPatch)),
      replacement: toFact({
        id: replacementId,
        path: `fact_bank/${replacementId}`,
        data: asJsonRecord(replacement),
      }),
    };
  });
}

/** Backwards-compatible name for the correction operation. */
export const replaceFact = createCorrectedReplacement;

export async function createFact(input: ImportFactInput): Promise<FactRecord> {
  const pendingFact = buildAdmissionFact(input, input.origin ?? PENDING_FACT_ORIGINS[0]);
  const id = await factId(pendingFact.subject_key, pendingFact.angle_key);
  const factPath = `fact_bank/${id}`;
  const subjectPath = pendingFact.category
    ? `fact_subjects/${pendingFact.subject_key}`
    : null;

  return runTransaction(async (tx) => {
    // The existence check and the create are one transaction: the
    // `exists: false` precondition is the atomic create, so a concurrent
    // import can no longer slip a second document past a stale read.
    if (await tx.get(factPath)) {
      throw new Error("A fact with this subject and angle already exists");
    }
    const subjectDoc = subjectPath ? await tx.get(subjectPath) : null;

    tx.update(factPath, asPlainRecord(pendingFact), { exists: false });

    if (subjectPath) {
      const subjectPatch: Record<string, unknown> = { category: pendingFact.category };
      if (pendingFact.sub_category) subjectPatch["sub_category"] = pendingFact.sub_category;
      if (subjectDoc) {
        tx.update(subjectPath, subjectPatch, {
          ...(subjectDoc.updateTime ? { updateTime: subjectDoc.updateTime } : {}),
        });
      } else {
        tx.set(subjectPath, {
          subject: pendingFact.subject,
          subject_key: pendingFact.subject_key,
          ...subjectPatch,
          aliases: [],
          playlist_ids: [],
          // Coverage is maintained by the reconciler, not by admission.
          createdAt: pendingFact.created_at,
        });
      }
    }

    return toFact({
      id,
      path: factPath,
      data: asJsonRecord(pendingFact),
    });
  });
}

/**
 * Apply one moderation action as a single transaction: the report, the fact
 * documents it touches, any counterpart lint reports, and the staged audit
 * entry all commit together, each guarded by the update time read inside the
 * transaction. A concurrent edit therefore aborts and retries the whole
 * resolution rather than letting a stale flag list or status slip through.
 *
 * Lifecycle rules enforced here (contract-derived, never restated):
 *  - Status moves go through `statusTransitionPatch`, which re-checks the
 *    shared contract inside the transaction. Nothing restores a stored
 *    `factPreviousStatus` verbatim; `pending` and `retired` facts can never
 *    be reinstated by rejecting or resolving a report.
 *  - Material edits (`fix_number`, `edit_fact`, duplicate `correctedNumber`)
 *    revoke the stored approval via `buildFactEditPlan`: receipt and content
 *    fingerprint are deleted, lint evidence cleared, and `quality_hold` marks
 *    the revision as awaiting a fresh audit. `verified_at`/`verifier_model`
 *    stay auditor-owned. A fact reinstated to `active` here is still not
 *    playable: publication is bound to the Go export's `ready_ids` and the
 *    deployed manifest row, which require a current-revision receipt, not the
 *    lifecycle status. The hold clears only when a fresh audit mints one.
 *  - Clearing flag findings appends an append-only `quality_reviews` record
 *    bound to the revision reviewed (stored fingerprint + update time +
 *    lint rules revision). `resolve_as_is` and lint-report rejections record
 *    `finding_accepted`; corrections record `finding_cleared`.
 *  - A lint report that carries `fact_update_time` only restores a fact whose
 *    revision still matches; a stale binding resolves the report but leaves
 *    the fact untouched.
 *  - `expectedFacts` binds the exact Firestore revisions the caller reviewed;
 *    any fact write between review and commit aborts the resolution before a
 *    mutation is queued.
 */
export async function resolveReport(input: {
  reportId: string;
  action:
    | "retire_fact"
    | "fix_number"
    | "reject"
    | "resolve_only"
    | "add_to_bank"
    | "resolve_duplicate"
    | "edit_fact"
    | "resolve_as_is";
  factId?: string;
  correctedNumber?: number;
  factUpdates?: Partial<FactEditInput>;
  note?: string;
  topic?: string;
  claimStatement?: string;
  unit?: string;
  keepFactId?: string;
  retireFactId?: string;
  retireFactIds?: string[];
  /** Moderator performing the action; recorded on review records. */
  admin?: AdminUser;
  /** Prepared audit entry staged into the same transaction. */
  audit?: PreparedAuditEntry;
  /** Caller-supplied payload recorded as the staged audit's `after`. */
  auditAfter?: Record<string, unknown>;
  /** Agent resolutions must not overwrite another moderator's completed work. */
  requirePending?: boolean;
  /**
   * Firestore revisions the caller reviewed. Every listed fact document must
   * still be at that `updateTime` inside the transaction; any concurrent write
   * aborts the whole resolution instead of letting a stale review commit
   * against a newer revision. A matching revision implies the reviewed field
   * values, so no separate field comparison is needed.
   */
  expectedFacts?: ReadonlyArray<{ id: string; updateTime: string }>;
}): Promise<{ ok: true }> {
  const now = new Date().toISOString();
  const actor = input.admin?.email ?? input.admin?.uid ?? "system";

  // The add_to_bank fact is built inside the transaction, after the report is
  // read, so its explanation is the report's canonical explanation rather than
  // a moderator note. `factId` is a pure hash, safe on transaction retries.

  const result = await runTransaction<{ ok: true }>(async (tx) => {
    const reportPath = `trivia_reports/${input.reportId}`;
    const reportDoc = await tx.get(reportPath);
    if (!reportDoc) throw new Error(`Report ${input.reportId} not found`);
    const reportData = reportDoc.data;
    if (input.requirePending && reportData["status"] !== "pending_review") {
      throw new Error("Report is no longer pending; no changes were made.");
    }
    for (const expected of input.expectedFacts ?? []) {
      const current = await tx.get(`fact_bank/${expected.id}`);
      if (!current || current.updateTime !== expected.updateTime) {
        throw new Error("Fact changed since review; no changes were made.");
      }
    }
    const resolveReportDoc = (note: string, extra?: Record<string, unknown>, deletes?: string[]) => {
      tx.update(
        reportPath,
        { status: "resolved", resolutionNote: note, resolved_at: now, ...extra },
        { updateTime: requireUpdateTime(reportDoc), ...(deletes?.length ? { deletePaths: deletes } : {}) },
      );
    };
    const stageAudit = (after: unknown, before: FirestoreDoc | null = null) => {
      if (input.audit) {
        const payload =
          input.auditAfter === undefined
            ? after
            : {
                ...(typeof after === "object" && after !== null
                  ? (after as Record<string, unknown>)
                  : { result: after }),
                ...input.auditAfter,
              };
        stagePreparedAudit(tx, auditAt(input.audit, before ?? reportDoc, payload));
      }
    };

    const clearDisputeWithReview = (
      factDoc: FirestoreDoc,
      kind: "finding_accepted" | "finding_cleared",
      reason: string,
      extraDeletes: string[] = [],
    ): { patch: Record<string, unknown>; deletePaths: string[] } => {
      const findingIds = currentFindingIds(factDoc.data);
      const patch: Record<string, unknown> = {};
      const review = buildQualityReview({
        factId: factDoc.id,
        kind,
        actor,
        reason,
        findingIds,
        doc: factDoc,
        now,
      });
      patch["quality_reviews"] = appendQualityReview(factDoc.data["quality_reviews"], review);
      return { patch, deletePaths: [...DISPUTE_CLEAR_PATHS, ...extraDeletes] };
    };

    const reportBoundRevisionStale = (factDoc: FirestoreDoc): boolean => {
      // A telemetry report that wrote its own dispute binds the `disputed_at`
      // stamp it produced: the pre-write updateTime is invalidated by that
      // very commit. Lint and untouched-fact telemetry reports bind the
      // fact's updateTime revision directly.
      const boundDispute = reportData["fact_disputed_at"];
      if (typeof boundDispute === "string" && boundDispute.length > 0) {
        return factDoc.data["disputed_at"] !== boundDispute;
      }
      const bound = reportData["fact_update_time"];
      return typeof bound === "string" && bound.length > 0 && bound !== factDoc.updateTime;
    };

    // ------------------------------------------------------------------
    if (input.action === "resolve_duplicate") {
      const keepId = input.keepFactId?.trim() || null;
      const retireIds = [
        ...(input.retireFactId ? [input.retireFactId.trim()] : []),
        ...(input.retireFactIds ? input.retireFactIds.map((id) => id.trim()) : []),
      ].filter((id) => id && id !== keepId);

      const loserDocs: FirestoreDoc[] = [];
      const loserReports: (FirestoreDoc | null)[] = [];
      for (const retireId of retireIds) {
        const doc = await tx.get(`fact_bank/${retireId}`);
        if (!doc) throw new Error(`Fact ${retireId} not found`);
        loserDocs.push(doc);
        loserReports.push(await tx.get(`trivia_reports/lint_${retireId}`));
      }
      const keepDoc = keepId ? await tx.get(`fact_bank/${keepId}`) : null;
      const keepReportDoc =
        keepId && `lint_${keepId}` !== input.reportId
          ? await tx.get(`trivia_reports/lint_${keepId}`)
          : null;

      for (const doc of loserDocs) {
        const loser = toFact(doc);
        tx.update(
          `fact_bank/${doc.id}`,
          statusTransitionPatch(
            doc.id,
            String(loser.status),
            STATUS.retired,
            input.note ?? (keepId ? `Retired in favor of duplicate fact ${keepId}` : "Retired as duplicate fact"),
            now,
          ),
          { updateTime: requireUpdateTime(doc) },
        );
      }
      loserReports.forEach((loserReport, i) => {
        if (loserReport && loserReport.data["status"] === "pending_review") {
          tx.update(
            `trivia_reports/lint_${retireIds[i]}`,
            {
              status: "resolved",
              resolutionNote: `Auto-resolved: duplicate resolved via ${input.reportId}`,
              resolved_at: now,
            },
            { updateTime: requireUpdateTime(loserReport) },
          );
        }
      });

      let remainingFlags: string[] = [];
      if (keepDoc) {
        const keepFact = toFact(keepDoc);
        let patch: Record<string, unknown> = {};
        let deletePaths: string[] = [];
        if (input.correctedNumber !== undefined) {
          const plan = buildFactEditPlan(
            keepDoc,
            { id: keepDoc.id, true_number: input.correctedNumber },
            now,
          );
          patch = { ...patch, ...plan.patch };
          deletePaths = [...deletePaths, ...(plan.deletePaths ?? [])];
        }
        const currentFlags = keepFact.quality_flags;
        remainingFlags = currentFlags.filter(isNonDuplicateFlag);
        if (remainingFlags.length === 0) {
          const cleared = clearDisputeWithReview(
            keepDoc,
            "finding_cleared",
            input.note ?? "Duplicate resolved; remaining findings cleared",
          );
          patch = { ...patch, ...cleared.patch };
          deletePaths = [...deletePaths, ...cleared.deletePaths];
          if (String(keepFact.status) === STATUS.disputed) {
            patch = {
              ...patch,
              ...statusTransitionPatch(
                keepDoc.id,
                STATUS.disputed,
                STATUS.active,
                input.note ?? "Reinstated duplicate winner via moderation",
                now,
              ),
            };
          }
        } else {
          patch["quality_flags"] = remainingFlags;
          patch["disputed_reason"] = `fact_lint: ${remainingFlags.join(",")}`;
        }
        patch["updated_at"] = now;
        tx.update(`fact_bank/${keepDoc.id}`, patch, {
          updateTime: requireUpdateTime(keepDoc),
          deletePaths,
        });

        if (keepReportDoc && keepReportDoc.data["status"] === "pending_review") {
          tx.update(
            `trivia_reports/lint_${keepId}`,
            remainingFlags.length === 0
              ? {
                  status: "resolved",
                  resolutionNote: `Auto-resolved: duplicate resolved via ${input.reportId}`,
                  resolved_at: now,
                }
              : {
                  qualityFlags: remainingFlags,
                  resolutionNote: `Duplicate resolved via ${input.reportId}; remaining flags: ${remainingFlags.join(", ")}`,
                },
            { updateTime: requireUpdateTime(keepReportDoc) },
          );
        }
      }

      const defaultNote =
        remainingFlags.length > 0
          ? `Kept ${keepId} (retired ${retireIds.join(", ") || "duplicates"}; remaining flags: ${remainingFlags.join(", ")})`
          : `Kept ${keepId ?? "chosen fact"}, retired duplicate ${retireIds.join(", ") || "other"}`;
      const isKeptFactReport = Boolean(
        keepId && (input.reportId === `lint_${keepId}` || input.factId === keepId),
      );
      if (isKeptFactReport && remainingFlags.length > 0) {
        tx.update(
          reportPath,
          {
            qualityFlags: remainingFlags,
            reason: `fact_lint: ${remainingFlags.join(",")}`,
            resolutionNote: input.note ?? defaultNote,
          },
          {
            updateTime: requireUpdateTime(reportDoc),
            deletePaths: ["duplicateFactIds", "duplicate_fact_ids"],
          },
        );
      } else {
        resolveReportDoc(input.note ?? defaultNote);
      }
      stageAudit({ action: input.action, keepFactId: keepId, retireFactIds: retireIds });
      return { ok: true };
    }

    // ------------------------------------------------------------------
    if (input.action === "retire_fact") {
      const factDoc = input.factId ? await tx.get(`fact_bank/${input.factId}`) : null;
      if (factDoc) {
        const existing = toFact(factDoc);
        tx.update(
          `fact_bank/${factDoc.id}`,
          statusTransitionPatch(
            factDoc.id,
            String(existing.status),
            STATUS.retired,
            input.note ?? "Retired via player report",
            now,
          ),
          { updateTime: requireUpdateTime(factDoc) },
        );
      }
      resolveReportDoc(input.note ?? (input.factId ? "Fact retired" : "Report accepted"));
      stageAudit({ action: input.action });
      return { ok: true };
    }

    // ------------------------------------------------------------------
    if (input.action === "fix_number" || input.action === "edit_fact") {
      const factDoc = input.factId ? await tx.get(`fact_bank/${input.factId}`) : null;
      const editInput: FactEditInput | null =
        input.action === "fix_number"
          ? input.correctedNumber !== undefined
            ? { id: input.factId ?? "", true_number: input.correctedNumber }
            : null
          : input.factUpdates
            ? { id: input.factId ?? "", ...input.factUpdates }
            : null;
      if (factDoc && editInput) {
        const existing = toFact(factDoc);
        assertFactIdentityUnchanged(editInput, existing);
        const plan = buildFactEditPlan(factDoc, editInput, now);
        const cleared = clearDisputeWithReview(
          factDoc,
          "finding_cleared",
          input.note ?? "Fact corrected via moderation",
          plan.deletePaths ?? [],
        );
        let patch = { ...plan.patch, ...cleared.patch };
        const reinstateTarget = reinstatementTargetFor(String(existing.status));
        if (reinstateTarget !== null) {
          patch = {
            ...patch,
            ...statusTransitionPatch(
              factDoc.id,
              String(existing.status),
              reinstateTarget,
              input.note ?? "Fact updated and reinstated via moderation",
              now,
            ),
          };
        }
        patch["updated_at"] = now;
        tx.update(`fact_bank/${factDoc.id}`, patch, {
          updateTime: requireUpdateTime(factDoc),
          deletePaths: cleared.deletePaths,
        });
      }
      resolveReportDoc(
        input.note ??
          (input.correctedNumber !== undefined
            ? `Corrected to ${input.correctedNumber}`
            : input.action === "fix_number"
              ? "Report accepted"
              : "Fact updated and resolved via moderation"),
      );
      stageAudit({ action: input.action, edit: editInput ?? null });
      return { ok: true };
    }

    // ------------------------------------------------------------------
    if (input.action === "resolve_as_is") {
      const factDoc = input.factId ? await tx.get(`fact_bank/${input.factId}`) : null;
      if (factDoc) {
        const existing = toFact(factDoc);
        const cleared = clearDisputeWithReview(
          factDoc,
          "finding_accepted",
          input.note ?? "Accepted fact as-is via moderation",
        );
        let patch = cleared.patch;
        const reinstateTarget = reinstatementTargetFor(String(existing.status));
        if (reinstateTarget !== null) {
          patch = {
            ...patch,
            ...statusTransitionPatch(
              factDoc.id,
              String(existing.status),
              reinstateTarget,
              input.note ?? "Accepted fact as-is via moderation",
              now,
            ),
          };
        }
        patch["updated_at"] = now;
        tx.update(`fact_bank/${factDoc.id}`, patch, {
          updateTime: requireUpdateTime(factDoc),
          deletePaths: cleared.deletePaths,
        });
      }
      resolveReportDoc(input.note ?? "Report accepted: fact verified as-is");
      stageAudit({ action: input.action });
      return { ok: true };
    }

    // ------------------------------------------------------------------
    if (input.action === "add_to_bank") {
      const addToBankFact = buildAddToBankFact({
        ...input,
        reportExplanation: canonicalExplanation(reportData) || undefined,
      });
      const addToBankId = await factId(addToBankFact.subject_key, addToBankFact.angle_key);
      const factPath = `fact_bank/${addToBankId}`;
      const existingFact = await tx.get(factPath);
      if (existingFact) throw new Error("A fact with this subject and angle already exists");
      let subjectDoc: FirestoreDoc | null = null;
      const subjectPath = addToBankFact.category
        ? `fact_subjects/${addToBankFact.subject_key}`
        : null;
      if (subjectPath) subjectDoc = await tx.get(subjectPath);

      tx.update(factPath, asPlainRecord(addToBankFact), { exists: false });
      if (subjectPath) {
        const subjectPatch: Record<string, unknown> = { category: addToBankFact.category };
        if (addToBankFact.sub_category) subjectPatch["sub_category"] = addToBankFact.sub_category;
        if (subjectDoc) {
          tx.update(subjectPath, subjectPatch, {
            ...(subjectDoc.updateTime ? { updateTime: subjectDoc.updateTime } : {}),
          });
        } else {
          tx.set(subjectPath, {
            subject: addToBankFact.subject,
            subject_key: addToBankFact.subject_key,
            ...subjectPatch,
            aliases: [],
            playlist_ids: [],
            createdAt: addToBankFact.created_at,
          });
        }
      }
      const note = input.note?.trim();
      resolveReportDoc(note ? `${note} — ${PENDING_ADMISSION_COPY}` : PENDING_ADMISSION_COPY);
      stageAudit({ action: input.action, createdFactId: addToBankId });
      return { ok: true };
    }

    // ------------------------------------------------------------------
    if (input.action === "resolve_only") {
      resolveReportDoc(input.note ?? "Report accepted");
      stageAudit({ action: input.action });
      return { ok: true };
    }

    // ------------------------------------------------------------------
    // Reject: restore a fact auto-disputed by signed telemetry or fact lint,
    // but only along a contract-authorized transition. `factPreviousStatus`
    // on the report is never written back: it is metadata recorded for
    // context, and only `disputed -> active` is reachable from here, so a
    // `pending`/`retired` fact can never be reinstated through a stale or
    // forged report field.
    const storedFactId =
      typeof reportData["factId"] === "string" && reportData["factId"].trim()
        ? (reportData["factId"] as string).trim()
        : typeof reportData["questionId"] === "string" && (reportData["questionId"] as string).startsWith("fact:")
          ? ((reportData["questionId"] as string).slice("fact:".length).trim() || null)
          : null;
    const isLintSource = reportData["reportSource"] === "fact_lint";
    const isTelemetrySource = reportData["reportSource"] === "round_telemetry";
    let remainingFlags: string[] = [];
    if (storedFactId && (isLintSource || isTelemetrySource)) {
      // Read phase: every document this action may touch is read before any
      // write is queued, so the transaction applies reads-before-writes and
      // retries stay legal.
      const factDoc = await tx.get(`fact_bank/${storedFactId}`);
      const duplicateIds = isLintSource
        ? asSources(reportData["duplicateFactIds"] ?? reportData["duplicate_fact_ids"])
        : [];
      const dupDocs: (FirestoreDoc | null)[] = [];
      const dupReports: (FirestoreDoc | null)[] = [];
      for (const dupId of duplicateIds) {
        if (!dupId || dupId === storedFactId) {
          dupDocs.push(null);
          dupReports.push(null);
          continue;
        }
        dupDocs.push(await tx.get(`fact_bank/${dupId}`));
        dupReports.push(await tx.get(`trivia_reports/lint_${dupId}`));
      }

      // Write phase.
      const recordedReason = factDoc ? String(factDoc.data["disputed_reason"] ?? "") : "";
      const disputeOwnedBySource = factDoc
        ? isLintSource
          // Legacy disputes predate `disputed_reason`; a fact_lint report still
          // owns the dispute when no other owner is recorded.
          ? !recordedReason || recordedReason.startsWith("fact_lint:")
          // Symmetric guard: a telemetry report rejection cannot clear a
          // lint-owned dispute.
          : !recordedReason || recordedReason.startsWith("round_telemetry")
        : false;
      if (
        factDoc &&
        factDoc.data["status"] === STATUS.disputed &&
        disputeOwnedBySource &&
        !reportBoundRevisionStale(factDoc)
      ) {
        const currentFlags = Array.isArray(factDoc.data["quality_flags"])
          ? (factDoc.data["quality_flags"] as string[])
          : [];
        remainingFlags = isLintSource ? currentFlags.filter(isNonDuplicateFlag) : [];
        if (remainingFlags.length === 0) {
          const cleared = clearDisputeWithReview(
            factDoc,
            "finding_accepted",
            input.note ?? "Report rejected; findings dismissed",
          );
          const patch = {
            ...cleared.patch,
            ...statusTransitionPatch(
              factDoc.id,
              STATUS.disputed,
              STATUS.active,
              input.note ?? "Reinstated after rejected report",
              now,
            ),
          };
          tx.update(`fact_bank/${factDoc.id}`, patch, {
            updateTime: requireUpdateTime(factDoc),
            deletePaths: cleared.deletePaths,
          });
        } else {
          tx.update(
            `fact_bank/${factDoc.id}`,
            {
              quality_flags: remainingFlags,
              disputed_reason: `fact_lint: ${remainingFlags.join(",")}`,
              updated_at: now,
            },
            { updateTime: requireUpdateTime(factDoc) },
          );
        }
      }

      for (let i = 0; i < duplicateIds.length; i++) {
        const dupDoc = dupDocs[i];
        const dupReport = dupReports[i];
        if (!dupDoc) continue;
        let dupRemaining: string[] = [];
        if (dupDoc.data["status"] === STATUS.disputed) {
          const currentFlags = Array.isArray(dupDoc.data["quality_flags"])
            ? (dupDoc.data["quality_flags"] as string[])
            : [];
          dupRemaining = currentFlags.filter(isNonDuplicateFlag);
          if (dupRemaining.length === 0) {
            const cleared = clearDisputeWithReview(
              dupDoc,
              "finding_accepted",
              `Counterpart report ${input.reportId} rejected; findings dismissed`,
            );
            const patch = {
              ...cleared.patch,
              ...statusTransitionPatch(
                dupDoc.id,
                STATUS.disputed,
                STATUS.active,
                input.note ?? "Reinstated duplicate counterpart via moderation",
                now,
              ),
            };
            tx.update(`fact_bank/${dupDoc.id}`, patch, {
              updateTime: requireUpdateTime(dupDoc),
              deletePaths: cleared.deletePaths,
            });
          } else {
            tx.update(
              `fact_bank/${dupDoc.id}`,
              {
                quality_flags: dupRemaining,
                disputed_reason: `fact_lint: ${dupRemaining.join(",")}`,
                updated_at: now,
              },
              { updateTime: requireUpdateTime(dupDoc) },
            );
          }
        }
        if (dupReport && dupReport.data["status"] === "pending_review") {
          tx.update(
            `trivia_reports/lint_${duplicateIds[i]}`,
            dupRemaining.length === 0
              ? {
                  status: "rejected",
                  resolutionNote: input.note ?? `Auto-rejected: counterpart report ${input.reportId} rejected`,
                  resolved_at: now,
                }
              : {
                  qualityFlags: dupRemaining,
                  reason: `fact_lint: ${dupRemaining.join(",")}`,
                  resolutionNote: `Duplicate dismissed via ${input.reportId}; remaining flags: ${dupRemaining.join(", ")}`,
                },
            {
              updateTime: requireUpdateTime(dupReport),
              ...(dupRemaining.length > 0
                ? { deletePaths: ["duplicateFactIds", "duplicate_fact_ids"] }
                : {}),
            },
          );
        }
      }
    }

    if (remainingFlags.length > 0) {
      tx.update(
        reportPath,
        {
          qualityFlags: remainingFlags,
          reason: `fact_lint: ${remainingFlags.join(",")}`,
          resolutionNote: input.note ?? `Duplicate dismissed; remaining flags: ${remainingFlags.join(", ")}`,
        },
        {
          updateTime: requireUpdateTime(reportDoc),
          deletePaths: ["duplicateFactIds", "duplicate_fact_ids"],
        },
      );
    } else {
      tx.update(
        reportPath,
        {
          status: "rejected",
          resolutionNote: input.note ?? "Report rejected",
          resolved_at: now,
        },
        { updateTime: requireUpdateTime(reportDoc) },
      );
    }
    stageAudit({ action: input.action, factId: storedFactId });
    return { ok: true };
  });

  return result;
}

/**
 * Build the pending admission document for the report `add_to_bank` action.
 * The report path is admitted with the same canonical builder as manual and
 * CSV paths, but carries its own origin for auditability.
 */
function buildAddToBankFact(input: {
  topic?: string;
  claimStatement?: string;
  correctedNumber?: number;
  unit?: string;
  note?: string;
  reportExplanation?: string;
}): PendingFact {
  const subject = input.topic || "General";
  const angle = input.claimStatement || subject;
  const true_number = input.correctedNumber ?? 0;
  const unit = input.unit || "";
  const claim_template = input.claimStatement
    ? input.claimStatement.replace(new RegExp(String(true_number), "g"), "{n}")
    : `${subject}: {n} ${unit}`;
  const explanation =
    input.reportExplanation || input.note?.trim() || input.claimStatement || subject;
  return buildAdmissionFact(
    {
      subject,
      angle,
      true_number,
      unit,
      claim_template: claim_template.includes("{n}")
        ? claim_template
        : `${claim_template} {n}`,
      explanation,
      question: input.claimStatement || subject,
      surprise_factor: 2,
      content_rating: "standard",
      source_urls: [],
      origin: PENDING_FACT_ORIGINS[2],
    },
    PENDING_FACT_ORIGINS[2],
  );
}

/**
 * Reconciles and auto-resolves pending `fact_lint` moderation reports whose underlying
 * facts are already active and clean, retired, or deleted.
 */
export async function flushStaleReports(limit = 200): Promise<{
  flushed: number;
  totalChecked: number;
  details: string[];
}> {
  const now = new Date().toISOString();
  const reports = await runQuery({
    collection: "trivia_reports",
    filters: [{ field: "status", op: "EQUAL", value: "pending_review" }],
    limit,
  });

  let flushed = 0;
  let totalChecked = 0;
  const details: string[] = [];

  for (const reportDoc of reports) {
    const data = reportDoc.data;
    if (data["reportSource"] !== "fact_lint") continue;
    totalChecked++;

    const factId =
      typeof data["factId"] === "string" && data["factId"].trim()
        ? (data["factId"] as string).trim()
        : null;
    if (!factId) {
      details.push(`${reportDoc.id}: Auto-resolved: report missing factId`);
      flushed++;
      await runTransaction(async (tx) => {
        const current = await tx.get(`trivia_reports/${reportDoc.id}`);
        if (!current || current.data["status"] !== "pending_review") return;
        tx.update(
          `trivia_reports/${reportDoc.id}`,
          { status: "resolved", resolutionNote: "Auto-resolved: report missing factId", resolved_at: now },
          { updateTime: requireUpdateTime(current) },
        );
      });
      continue;
    }

    // The fact read and the report resolution share one transaction: a fact
    // re-disputed between the check and the write aborts the resolution and
    // the retried callback re-evaluates the fresh snapshot instead of
    // clearing a live dispute's report.
    const note = await runTransaction(async (tx) => {
      const current = await tx.get(`trivia_reports/${reportDoc.id}`);
      if (!current || current.data["status"] !== "pending_review") return null;
      const factDoc = await tx.get(`fact_bank/${factId}`);
      let autoNote: string | null = null;
      if (!factDoc) {
        autoNote = "Auto-resolved: underlying fact no longer exists";
      } else {
        const stat = factDoc.data["status"];
        if (stat === STATUS.retired) {
          autoNote = "Auto-resolved: underlying fact was retired";
        } else if (stat === STATUS.active) {
          const qf = Array.isArray(factDoc.data["quality_flags"])
            ? (factDoc.data["quality_flags"] as string[])
            : [];
          if (qf.length === 0) {
            autoNote = "Auto-resolved: fact is active and passes all lint rules";
          }
        }
      }
      if (!autoNote) return null;
      tx.update(
        `trivia_reports/${reportDoc.id}`,
        { status: "resolved", resolutionNote: autoNote, resolved_at: now },
        { updateTime: requireUpdateTime(current) },
      );
      return autoNote;
    });
    if (note) {
      flushed++;
      details.push(`${reportDoc.id}: ${note}`);
    }
  }

  return { flushed, totalChecked, details };
}

