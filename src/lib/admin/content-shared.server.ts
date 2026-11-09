/**
 * Shared constants, contract-derived status sets, and JSON coercion helpers
 * for the admin content modules. Leaf module: every sibling content module
 * may depend on it without creating an import cycle.
 */
import type { Json } from "../firebase/firestore.server";
import { GENRES } from "./taxonomy";
import {
  FACT_STATUSES as CONTRACT_FACT_STATUSES,
  type FactStatus,
  type QuantityKind,
} from "../../../shared/fact-lifecycle-contract.gen";

// Derived from the shared contract (Requirement 9.1): the canonical status set
// is owned by Main_Repository and consumed here, so no hand-written literal list
// declares fact statuses in Admin_Repository source.
export const FACT_STATUSES = CONTRACT_FACT_STATUSES;
export type { FactStatus, QuantityKind };

// Named fact-status constants derived from the shared contract (Requirement
// 9.9): `STATUS.active === "active"`, etc. Referencing these instead of writing
// the raw literal keeps the canonical status set single-sourced in the artifact
// while the Contract_Literal_Check scan stays green. No status literal is
// written here — the keys and values both come from CONTRACT_FACT_STATUSES.
export const STATUS: { [K in FactStatus]: K } = (() => {
  const out = {} as { [K in FactStatus]: K };
  for (const value of CONTRACT_FACT_STATUSES) out[value] = value as never;
  return out;
})();
export const CONTENT_RATINGS = ["standard", "after_dark"] as const;
export const REPORT_STATUSES = ["pending_review", "resolved", "rejected"] as const;

/** User-facing copy for a report that enters the Foundry admission queue. */
export const PENDING_ADMISSION_COPY =
  "Saved as pending; the nightly Foundry audit promotes it.";

export const CATEGORIES = GENRES;

export function str(value: Json | undefined): string {
  return typeof value === "string" ? value : "";
}
export function num(value: Json | undefined): number | null {
  return typeof value === "number" ? value : null;
}

export function firstStr(data: Record<string, Json>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function asBool(value: Json | undefined): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true" || lowered === "yes") return true;
    if (lowered === "false" || lowered === "no") return false;
  }
  return null;
}

export function asSources(value: Json | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const row = item as Record<string, Json>;
        return (
          firstStr(row, ["title", "uri", "url", "source", "citation", "name"]) ||
          JSON.stringify(item)
        );
      }
      return "";
    })
    .filter(Boolean);
}
