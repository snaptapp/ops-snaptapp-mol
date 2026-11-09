/**
 * Shared Firestore document helpers for fact_bank writes and audit staging.
 * The edit, lifecycle, import, and moderation paths all apply the same JSON
 * coercion, verification-metadata stripping, revision merging, and audit
 * precondition handling through this module.
 */
import type {
  FirestoreDoc,
  FirestoreTransaction,
  Json,
} from "../firebase/firestore.server";
import type { PreparedAuditEntry } from "../firebase/audit.server";
import {
  QUALITY_REVIEW_KINDS,
  QUALITY_REVIEW_SCHEMA,
  type QualityReviewRecord,
} from "./quality-review";

export function asJson(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => asJson(entry));
  if (typeof value === "object") {
    const output: { [key: string]: Json } = {};
    for (const [key, entry] of Object.entries(value)) output[key] = asJson(entry);
    return output;
  }
  return null;
}

export function asJsonRecord(value: object): Record<string, Json> {
  const output: Record<string, Json> = {};
  for (const [key, entry] of Object.entries(value)) output[key] = asJson(entry);
  return output;
}

/** Spread a typed object into a plain record without asserting its shape:
 *  preserves entries verbatim (including absent optional fields left
 *  undefined) so Firestore writes see exactly the original object. */
export function asPlainRecord(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value));
}

export function isQualityReviewRecord(value: unknown): value is QualityReviewRecord {
  if (value === null || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  if (r["schema_version"] !== QUALITY_REVIEW_SCHEMA) return false;
  for (const key of [
    "review_id",
    "fact_id",
    "actor",
    "actor_role",
    "reason",
    "lint_rules_revision",
    "content_fingerprint",
    "update_time",
    "created_at",
  ]) {
    if (typeof r[key] !== "string") return false;
  }
  const isStringArray = (entry: unknown): entry is string[] =>
    Array.isArray(entry) && entry.every((item) => typeof item === "string");
  return (
    QUALITY_REVIEW_KINDS.some((kind) => kind === r["kind"]) &&
    isStringArray(r["reviewed_fields"]) &&
    isStringArray(r["finding_ids"])
  );
}

export function mergedFactDoc(
  current: FirestoreDoc,
  patch: Record<string, unknown>,
  deletePaths?: readonly string[],
): FirestoreDoc {
  const data: Record<string, Json> = { ...current.data };
  for (const [key, value] of Object.entries(patch)) data[key] = asJson(value);
  for (const path of deletePaths ?? []) delete data[path];
  return { ...current, data };
}

export function withoutVerificationMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => withoutVerificationMetadata(entry));
  if (value === null || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "verified_at" || key === "verifier_model") continue;
    output[key] = withoutVerificationMetadata(entry);
  }
  return output;
}

export function auditAt(
  prepared: PreparedAuditEntry,
  current: FirestoreDoc,
  after?: unknown,
): PreparedAuditEntry {
  const data: Record<string, unknown> = {
    ...prepared.data,
    before: current.data,
  };
  if (after !== undefined) data["after"] = withoutVerificationMetadata(after);
  return { id: prepared.id, data };
}

export function stagePreparedAudit(
  tx: FirestoreTransaction,
  prepared: PreparedAuditEntry,
): void {
  tx.set(`admin_audit_logs/${prepared.id}`, prepared.data);
}

export function requireUpdateTime(doc: FirestoreDoc): string {
  if (doc.updateTime === undefined || doc.updateTime === "") {
    throw new Error(`Fact ${doc.id} cannot be updated without an exact updateTime precondition`);
  }
  return doc.updateTime;
}
