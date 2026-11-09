/**
 * Duplicate-candidate discovery for moderation reports: recorded IDs,
 * same-batch sibling reports, and subject-key queries.
 */
import { getDoc, normalizeKey, patchDoc, runQuery } from "../firebase/firestore.server";
import { areFactsDuplicateCandidates } from "./duplicate-candidates.server";
import { toFact, type FactRecord } from "./fact-records.server";
import type { ReportRecord } from "./report-records.server";
import { isDuplicateFlag } from "./quality-flags";

type DuplicateRefFact = Parameters<typeof areFactsDuplicateCandidates>[0];

function isDuplicateReportRecord(record: ReportRecord): boolean {
  const reason = record.reason?.toLowerCase() ?? "";
  return (
    Boolean(record.qualityFlags?.some(isDuplicateFlag)) ||
    reason.includes("duplicate_question") ||
    reason.includes("conflicting_answer")
  );
}

function reportRefFact(factId: string | undefined, record: ReportRecord): DuplicateRefFact {
  return {
    id: factId,
    question: record.claimStatement,
    claim_template: record.claimStatement,
    subject: record.topic,
    subject_key: normalizeKey(record.topic || ""),
  };
}

async function backfillDuplicateIds(report: ReportRecord, duplicates: Map<string, FactRecord>): Promise<void> {
  const mergedIds = Array.from(new Set([...(report.duplicateFactIds || []), ...duplicates.keys()]));
  await patchDoc(`trivia_reports/${report.id}`, { duplicateFactIds: mergedIds }).catch(() => {});
}

/** Adds the normalized first two words of `text`, when it has at least two. */
function addLeadingPairKey(keys: Set<string>, text: string): void {
  const words = text.trim().split(/\s+/);
  if (words.length >= 2) keys.add(normalizeKey(`${words[0]} ${words[1]}`));
}

function candidateSubjectKeys(primaryFact: FactRecord): Set<string> {
  const keys = new Set<string>();
  const subjectKey = primaryFact.subject_key || normalizeKey(primaryFact.subject);
  if (subjectKey) keys.add(subjectKey);

  // Also extract candidate keys from angle or question (e.g. Stevie Wonder in Grammy Awards)
  if (primaryFact.angle) {
    keys.add(normalizeKey(primaryFact.angle));
    addLeadingPairKey(keys, primaryFact.angle);
  }
  if (primaryFact.question) {
    addLeadingPairKey(keys, primaryFact.question);
  }
  return keys;
}

/** State shared by the duplicate lookup steps: the report under review and the duplicates found so far. */
type DuplicateLookup = {
  report: ReportRecord;
  primaryId: string | undefined;
  duplicates: Map<string, FactRecord>;
};

/** A fact ID still worth checking: non-empty, not the primary fact, and not already found. */
function isNewDuplicateId(lookup: DuplicateLookup, factId: string): boolean {
  return Boolean(factId) && factId !== lookup.primaryId && !lookup.duplicates.has(factId);
}

/** The fact ID a batch sibling points at, when that sibling is an unaccounted-for duplicate report. */
function batchSiblingFactId(lookup: DuplicateLookup, other: ReportRecord): string | null {
  if (other.id === lookup.report.id) return null;
  const factId = other.factId?.trim();
  if (!factId) return null;
  if (!isNewDuplicateId(lookup, factId)) return null;
  return isDuplicateReportRecord(other) ? factId : null;
}

/** Loads a fact by ID, returning it only when it is a duplicate candidate of `refFact`. */
async function loadMatchingFact(factId: string, refFact: DuplicateRefFact): Promise<FactRecord | null> {
  const doc = await getDoc(`fact_bank/${factId}`);
  if (!doc) return null;
  const fact = toFact(doc);
  return areFactsDuplicateCandidates(refFact, fact) ? fact : null;
}

async function linkSiblingToPrimary(sibling: ReportRecord, primaryId: string): Promise<void> {
  const mergedIds = Array.from(new Set([...(sibling.duplicateFactIds || []), primaryId]));
  await patchDoc(`trivia_reports/${sibling.id}`, { duplicateFactIds: mergedIds }).catch(() => {});
}

/** Step 1: duplicate IDs already recorded on the report, kept only when they validate. */
async function collectRecordedDuplicates(lookup: DuplicateLookup, primaryFact: FactRecord | null): Promise<void> {
  const validDupIds: string[] = [];
  let hadInvalid = false;
  for (const dupId of lookup.report.duplicateFactIds ?? []) {
    if (!isNewDuplicateId(lookup, dupId)) continue;
    const doc = await getDoc(`fact_bank/${dupId}`);
    if (!doc) continue;

    const fact = toFact(doc);
    if (primaryFact && !areFactsDuplicateCandidates(primaryFact, fact)) {
      hadInvalid = true;
      continue;
    }
    lookup.duplicates.set(dupId, fact);
    validDupIds.push(dupId);
  }
  // Clean up corrupted duplicateFactIds in Firestore if invalid IDs were stored
  if (hadInvalid) {
    await patchDoc(`trivia_reports/${lookup.report.id}`, { duplicateFactIds: validDupIds }).catch(() => {});
  }
}

/** Step 2: other pending duplicate reports in the same batch that point at a matching fact. */
async function collectBatchDuplicates(
  lookup: DuplicateLookup,
  refFact: DuplicateRefFact,
  allReports: ReportRecord[],
): Promise<void> {
  let newDuplicatesFound = false;
  for (const other of allReports) {
    const otherFactId = batchSiblingFactId(lookup, other);
    if (!otherFactId) continue;
    if (!areFactsDuplicateCandidates(refFact, reportRefFact(otherFactId, other))) continue;

    const fact = await loadMatchingFact(otherFactId, refFact);
    if (!fact) continue;
    lookup.duplicates.set(otherFactId, fact);
    newDuplicatesFound = true;
    if (lookup.primaryId) await linkSiblingToPrimary(other, lookup.primaryId);
  }

  if (newDuplicatesFound) {
    await backfillDuplicateIds(lookup.report, lookup.duplicates);
  }
}

/** Adds the fact_bank documents under one subject key that duplicate `primaryFact`. */
async function collectQueriedKey(
  key: string,
  primaryFact: FactRecord,
  duplicates: Map<string, FactRecord>,
): Promise<void> {
  const docs = await runQuery({
    collection: "fact_bank",
    filters: [{ field: "subject_key", op: "EQUAL", value: key }],
    limit: 100,
  });
  for (const d of docs) {
    if (d.id === primaryFact.id || duplicates.has(d.id)) continue;
    const candidate = toFact(d);
    if (areFactsDuplicateCandidates(primaryFact, candidate)) {
      duplicates.set(d.id, candidate);
    }
  }
}

/** Step 3: query fact_bank by candidate subject key, stopping at the first key with a match. */
async function collectQueriedDuplicates(lookup: DuplicateLookup, primaryFact: FactRecord): Promise<void> {
  for (const key of candidateSubjectKeys(primaryFact)) {
    if (!key) continue;
    await collectQueriedKey(key, primaryFact, lookup.duplicates);
    if (lookup.duplicates.size > 0) {
      // Backfill on the report doc so future loads hit step 1 immediately
      await backfillDuplicateIds(lookup.report, lookup.duplicates);
      return;
    }
  }
}

/** Best-effort lookup for other facts that duplicate or collide with this report. */
export async function findDuplicateFactsForReport(
  report: ReportRecord,
  primaryFact: FactRecord | null,
  allReports?: ReportRecord[],
): Promise<FactRecord[]> {
  const lookup: DuplicateLookup = {
    report,
    primaryId: primaryFact?.id ?? report.factId?.trim(),
    duplicates: new Map<string, FactRecord>(),
  };

  await collectRecordedDuplicates(lookup, primaryFact);

  // Later steps only run for duplicate-flagged reports that have found nothing yet.
  if (!isDuplicateReportRecord(report) || lookup.duplicates.size > 0) {
    return Array.from(lookup.duplicates.values());
  }

  if (allReports?.length) {
    await collectBatchDuplicates(lookup, primaryFact ?? reportRefFact(lookup.primaryId, report), allReports);
  }

  if (lookup.duplicates.size === 0 && primaryFact) {
    await collectQueriedDuplicates(lookup, primaryFact);
  }

  return Array.from(lookup.duplicates.values());
}

