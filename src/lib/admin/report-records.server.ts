/**
 * trivia_reports record mapping and read queries: `toReport`,
 * `listReports`, `getReport`, and `findFactForReport`.
 */
import {
  getDoc,
  normalizeKey,
  runQuery,
  type FirestoreDoc,
  type Json,
} from "../firebase/firestore.server";
import {
  LINT_ENFORCEMENTS,
  LINT_SEVERITIES,
  type LintEnforcement,
  type LintSeverity,
} from "../../../shared/fact-lint-catalog.gen";
import { canonicalExplanation, toFact, type FactRecord } from "./fact-records.server";
import { asBool, asSources, firstStr } from "./content-shared.server";

export interface ReportRecord {
  id: string;
  topic: string;
  initialTopic?: string;
  claimStatement: string;
  explanation: string;
  presentedNumber: number | null;
  trueNumber: number | null;
  unit: string;
  reason: string;
  feedbackText: string;
  reporterUid: string;
  status: string;
  createdAt: string | null;
  resolutionNote: string | null;
  questionId?: string;
  reportSource?: string;
  factId?: string;
  factPreviousStatus?: string;
  telemetryDays?: number | null;
  playerGuess?: string;
  isPlayerCorrect?: boolean | null;
  ombudsmanVerdict?: string;
  ombudsmanAgreed?: boolean | null;
  ombudsmanRuling?: string;
  ombudsmanSources: string[];
  ombudsmanArbiter?: "gemini" | "edge_worker" | "unspecified";
  qualityFlags?: string[];
  lintFindings?: {
    id: string;
    severity?: LintSeverity;
    enforcement?: LintEnforcement;
    detail?: string;
    docIds?: string[];
  }[];
  lintRulesRevision?: string;
  duplicateFactIds?: string[];
}

function asNum(value: Json | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Parse the structured lint findings persisted by `foundry -lint-apply`.
 * Entries missing a non-empty `id` are dropped; everything else is passed
 * through verbatim because the producer owns finding semantics.
 */
function asLintFindings(value: Json | undefined): ReportRecord["lintFindings"] {
  if (!Array.isArray(value)) return undefined;
  const severities = new Set<string>(LINT_SEVERITIES);
  const enforcements = new Set<string>(LINT_ENFORCEMENTS);
  const findings: NonNullable<ReportRecord["lintFindings"]> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, Json>;
    const id = typeof row["id"] === "string" ? row["id"].trim() : "";
    if (!id) continue;
    const docIds = Array.isArray(row["docIds"])
      ? row["docIds"].filter((v): v is string => typeof v === "string" && v.trim() !== "")
      : undefined;
    findings.push({
      id,
      severity: severities.has(row["severity"] as string) ? (row["severity"] as LintSeverity) : undefined,
      enforcement: enforcements.has(row["enforcement"] as string) ? (row["enforcement"] as LintEnforcement) : undefined,
      detail: typeof row["detail"] === "string" ? row["detail"] : undefined,
      docIds: docIds && docIds.length ? docIds : undefined,
    });
  }
  return findings.length ? findings : undefined;
}

function toReport(doc: FirestoreDoc): ReportRecord {
  const d = doc.data;
  const sources = [
    ...asSources(d["ombudsmanSources"]),
    ...asSources(d["groundingSources"]),
    ...asSources(d["citations"]),
  ].filter((source, index, all) => all.indexOf(source) === index);

  const ruling =
    firstStr(d, ["ombudsmanRuling", "ombudsman_ruling", "ruling"]) || "";
  const explicitArbiter = firstStr(d, ["ombudsmanArbiter", "ombudsman_arbiter", "arbiter"]).toLowerCase();
  let arbiter: "gemini" | "edge_worker" | "unspecified" = "unspecified";
  if (explicitArbiter === "gemini" || explicitArbiter === "vertex" || explicitArbiter === "google") {
    arbiter = "gemini";
  } else if (
    explicitArbiter === "edge_worker" ||
    explicitArbiter === "edge" ||
    explicitArbiter === "worker"
  ) {
    arbiter = "edge_worker";
  } else if (
    sources.some((s) => /google|vertex|gemini/i.test(s)) ||
    /gemini|vertex|google search grounding/i.test(ruling)
  ) {
    arbiter = "gemini";
  } else if (sources.some((s) => /edge/i.test(s)) || /edge ombudsman/i.test(ruling)) {
    arbiter = "edge_worker";
  }

  const rawVerdict = firstStr(d, ["ombudsmanVerdict", "ombudsman_verdict", "verdict"]);
  const agreedFlag = asBool(d["ombudsmanAgreed"]) ?? asBool(d["ombudsman_agreed"]);
  const agreed =
    agreedFlag !== null
      ? agreedFlag
      : rawVerdict === "DEBUNKED_AND_EVICTED" || rawVerdict === "AMBIGUOUS_UNIT"
        ? true
        : rawVerdict === "VERIFIED_CANONICAL"
          ? false
          : null;

  return {
    id: doc.id,
    topic: firstStr(d, ["topic", "questionTopic", "question_topic"]),
    initialTopic: firstStr(d, ["initialTopic", "initial_topic", "selectedTopic", "category"]) || undefined,
    claimStatement: firstStr(d, ["claimStatement", "claim_statement", "claim", "question"]),
    explanation: canonicalExplanation(d, ["reveal"]),
    presentedNumber: asNum(d["presentedNumber"]) ?? asNum(d["presented_number"]),
    trueNumber: asNum(d["trueNumber"]) ?? asNum(d["true_number"]),
    unit: firstStr(d, ["unit"]),
    reason: firstStr(d, ["reason", "disputeReason", "dispute_reason"]),
    feedbackText: firstStr(d, ["feedbackText", "feedback_text", "feedback"]),
    reporterUid: firstStr(d, ["reporterUid", "reporter_uid", "uid"]),
    status: firstStr(d, ["status"]) || "pending_review",
    createdAt: typeof d["createdAt"] === "string" ? d["createdAt"] : typeof d["created_at"] === "string" ? d["created_at"] : null,
    resolutionNote: typeof d["resolutionNote"] === "string" ? d["resolutionNote"] : null,
    questionId: firstStr(d, ["questionId", "question_id"]) || undefined,
    reportSource: firstStr(d, ["reportSource", "report_source"]) || undefined,
    factId: firstStr(d, ["factId", "fact_id"]) || undefined,
    factPreviousStatus: firstStr(d, ["factPreviousStatus", "fact_previous_status"]) || undefined,
    telemetryDays: asNum(d["telemetryDays"]) ?? asNum(d["telemetry_days"]),
    playerGuess: firstStr(d, ["playerGuess", "player_guess", "guess", "choice"]) || undefined,
    isPlayerCorrect: asBool(d["isPlayerCorrect"]) ?? asBool(d["is_player_correct"]),
    ombudsmanVerdict: rawVerdict || undefined,
    ombudsmanAgreed: agreed,
    ombudsmanRuling: ruling || undefined,
    ombudsmanSources: sources,
    ombudsmanArbiter: arbiter,
    qualityFlags: asSources(d["qualityFlags"]).length
      ? asSources(d["qualityFlags"])
      : asSources(d["quality_flags"]),
    lintFindings: asLintFindings(d["lintFindings"] ?? d["lint_findings"]),
    lintRulesRevision:
      typeof d["lintRulesRevision"] === "string"
        ? d["lintRulesRevision"]
        : typeof d["lint_rules_revision"] === "string"
          ? d["lint_rules_revision"]
          : undefined,
    duplicateFactIds: asSources(d["duplicateFactIds"]).length
      ? asSources(d["duplicateFactIds"])
      : asSources(d["duplicate_fact_ids"]),
  };
}

export async function listReports(input: { status?: string; limit?: number; offset?: number }) {
  const docs = await runQuery({
    collection: "trivia_reports",
    filters: input.status ? [{ field: "status", op: "EQUAL", value: input.status }] : [],
    limit: input.limit ?? 100,
    offset: input.offset,
  });
  const reports = docs.map(toReport);
  reports.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return reports;
}

export async function getReport(id: string): Promise<ReportRecord | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;
  const doc = await getDoc(`trivia_reports/${trimmed}`);
  return doc ? toReport(doc) : null;
}

/** Best-effort match from a report back to its fact-bank record. */
export async function findFactForReport(report: ReportRecord): Promise<FactRecord | null> {
  // 0. Direct match for signed-telemetry reports (fact:<docId> question ids).
  const directId =
    report.factId?.trim() ||
    (report.questionId?.startsWith("fact:")
      ? report.questionId.slice("fact:".length).trim()
      : "");
  if (directId) {
    const direct = await getDoc(`fact_bank/${directId}`);
    if (direct) return toFact(direct);
  }

  const topicKey = normalizeKey(report.topic);
  if (!topicKey) return null;

  // 1. Try matching by subject_key
  const subjectDocs = await runQuery({
    collection: "fact_bank",
    filters: [{ field: "subject_key", op: "EQUAL", value: topicKey }],
    limit: 20,
  });
  if (subjectDocs.length > 0) {
    const facts = subjectDocs.map(toFact);
    const exact = facts.find((fact) => fact.true_number === report.trueNumber);
    return exact ?? facts[0];
  }

  // 2. Try matching by angle_key
  const angleDocs = await runQuery({
    collection: "fact_bank",
    filters: [{ field: "angle_key", op: "EQUAL", value: topicKey }],
    limit: 20,
  });
  if (angleDocs.length > 0) {
    const facts = angleDocs.map(toFact);
    const exact = facts.find((fact) => fact.true_number === report.trueNumber);
    return exact ?? facts[0];
  }

  return null;
}

