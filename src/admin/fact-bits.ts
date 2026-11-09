import { QUANTITY_KINDS, type QuantityKind } from "../../shared/fact-lifecycle-contract.gen";
import type { fetchFacts } from "@/lib/admin/content.functions";

export type Fact = Awaited<ReturnType<typeof fetchFacts>>["facts"][number];


/** The `quantity_kind` values the editor offers: the contract's closed set
 * (Requirement 9.5, derived) plus the empty-string "auto" sentinel. */
export const QUANTITY_KIND_OPTIONS = ["", ...QUANTITY_KINDS] as const;

/** Display label for a `quantity_kind` option. The empty string is the DDM
 * "auto" sentinel; every contract kind renders as its own identifier so no
 * `quantity_kind` value is restated as a literal here (Requirement 9.9). */
export function quantityKindLabel(kind: (typeof QUANTITY_KIND_OPTIONS)[number]): string {
  return kind === "" ? "auto (classify from unit)" : kind;
}

/** The single user-facing admission message shared by create and import paths. */
export const PENDING_ADMISSION_COPY =
  "Saved as pending; the nightly Foundry audit promotes it.";

/** Make the authority boundary explicit wherever a pending row is surfaced. */
export const PENDING_PROMOTION_COPY =
  "Pending facts are admission candidates only. The Foundry audit is the only promoter to active; admin controls cannot approve them, and pending facts are not served or exported.";

export interface CorrectedReplacementResult {
  original: Fact;
  replacement: Fact;
}

export function normalizeSurpriseFactor(value: number | null | undefined): number {
  if (value === null || value === undefined) return 2;
  if (value > 3) return value >= 8 ? 3 : value >= 5 ? 2 : value >= 3 ? 1 : 0;
  return Math.min(3, Math.max(0, Math.round(value)));
}
