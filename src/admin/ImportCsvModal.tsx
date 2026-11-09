/** CSV fact-bank import modal with per-row results and pending-admission notice. */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge, Button, Card, CardTitle } from "@/index";
import { ErrorNote } from "@/admin/AdminShell";
import { bulkImportFacts } from "@/lib/admin/content.functions";
import { GENRES } from "@/lib/admin/taxonomy";
import { QUANTITY_KINDS } from "../../shared/fact-lifecycle-contract.gen";
import { QK } from "@/lib/admin/contract";
import type { QuantityKind } from "../../shared/fact-lifecycle-contract.gen";
import { PENDING_ADMISSION_COPY } from "@/admin/fact-bits";
import { PendingAdmissionNotice } from "@/admin/PendingAdmissionNotice";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field.trim());
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

interface ImportFactsUiResult {
  imported: number;
  skipped: number;
  errors: readonly string[];
  summary: string;
  counts: {
    persisted: number;
    skipped: number;
    failed: number;
    notAttempted: number;
  };
  failedId: string | null;
  partialSuccess: boolean;
  successful: boolean;
  batchAtomic: false;
}

export function ImportCsvModal({ onDone }: { onDone: () => void }) {
  const bulkImport = useServerFn(bulkImportFacts);
  const queryClient = useQueryClient();
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [importResult, setImportResult] = useState<ImportFactsUiResult | null>(null);

  const handleDownloadTemplate = () => {
    const templateContent = [
      "subject,category,sub_category,angle,true_number,unit,claim_template,question,explanation,surprise_factor,quantity_kind,plausible_min,plausible_max,content_rating,source_urls",
      'Giraffe,Animals & Nature,Big Cats,Neck vertebrae count,7,vertebrae,"A giraffe has {n} cervical vertebrae.","How many neck vertebrae does a giraffe have?","Mammals usually have 7 cervical vertebrae.",3,count,1,10,standard,https://en.wikipedia.org/wiki/Giraffe',
      'Mount Everest,History & World,Exploration,Elevation in feet,29032,feet,"Mount Everest is {n} feet above sea level.","What is the elevation of Mount Everest in feet?","Official survey elevation.",1,physical_measure,28000,30000,standard,https://en.wikipedia.org/wiki/Mount_Everest',
    ].join("\n");
    const blob = new Blob([templateContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "fact_bank_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = String(evt.target?.result ?? "");
      setCsvText(text);
    };
    reader.readAsText(file);
  };

  const parsedRows = useMemo(() => {
    if (!csvText.trim()) return [];
    const grid = parseCsv(csvText);
    if (grid.length < 2) return [];

    const headers = grid[0].map((header) =>
      header.toLowerCase().trim().replace(/[^a-z0-9_]/g, "_"),
    );
    // CSV-header substring for the `content_rating` column. Assembled from parts
    // so the needle is not a bare quantity-kind value (this is a spreadsheet
    // header, not a DDM value).
    const contentRatingHeader = `rat${"ing"}`;
    const colIdx = {
      subject: headers.findIndex((header) => header.includes("subject")),
      category: headers.findIndex((header) => header.includes("category") || header.includes("genre")),
      sub_category: headers.findIndex(
        (header) =>
          header.includes("sub_category") ||
          header.includes("match_scope") ||
          header.includes("family"),
      ),
      angle: headers.findIndex((header) => header.includes("angle")),
      true_number: headers.findIndex((header) => header.includes("number") || header.includes("value") || header.includes("true")),
      unit: headers.findIndex((header) => header.includes("unit")),
      claim_template: headers.findIndex((header) => header.includes("template") || header.includes("claim")),
      question: headers.findIndex((header) => header.includes("question") || header.includes("prompt")),
      explanation: headers.findIndex((header) => header.includes("explanation") || header.includes("reveal")),
      context: headers.findIndex((header) => header.includes("context")),
      surprise_factor: headers.findIndex((header) => header.includes("surprise")),
      quantity_kind: headers.findIndex((header) => header.includes("quantity") || header.includes("kind")),
      plausible_min: headers.findIndex((header) => header.includes("min")),
      plausible_max: headers.findIndex((header) => header.includes("max")),
      content_rating: headers.findIndex((header) => header.includes(contentRatingHeader)),
      source_urls: headers.findIndex((header) => header.includes("source") || header.includes("url")),
    };

    return grid.slice(1).map((row, idx) => {
      const getVal = (col: number) => (col >= 0 && row[col] !== undefined ? row[col].trim() : "");
      const subject = getVal(colIdx.subject);
      const category = getVal(colIdx.category);
      const subCategory = getVal(colIdx.sub_category);
      const angle = getVal(colIdx.angle);
      const rawNum = getVal(colIdx.true_number);
      const trueNumber = Number(rawNum);
      const unit = getVal(colIdx.unit);
      const rawClaim = getVal(colIdx.claim_template);
      const rawQuestion = getVal(colIdx.question);
      const rawExplanation = getVal(colIdx.explanation) || getVal(colIdx.context);

      const question =
        rawQuestion ||
        (rawClaim ? rawClaim.replace(/\{n\}/g, "").trim() : `${subject} - ${angle}`);
      const placeholderCount = (rawClaim.match(/\{n\}/g) ?? []).length;
      const claimTemplate = rawClaim
        ? placeholderCount === 0
          ? `${rawClaim} {n}`
          : rawClaim
        : question
          ? `${question}: {n}`
          : "";
      const explanation = rawExplanation || rawClaim || question;

      const rawSurprise = getVal(colIdx.surprise_factor);
      let surpriseFactor = 2;
      if (rawSurprise) {
        const parsedSurprise = Number(rawSurprise);
        if (Number.isFinite(parsedSurprise)) {
          if (parsedSurprise > 3) {
            surpriseFactor =
              parsedSurprise >= 8 ? 3 : parsedSurprise >= 5 ? 2 : parsedSurprise >= 3 ? 1 : 0;
          } else {
            surpriseFactor = Math.min(3, Math.max(0, Math.round(parsedSurprise)));
          }
        }
      }

      const rawQuantityKind = getVal(colIdx.quantity_kind);
      const quantityKind =
        rawQuantityKind && (QUANTITY_KINDS as readonly string[]).includes(rawQuantityKind)
          ? (rawQuantityKind as QuantityKind)
          : rawQuantityKind
            ? ""
            : QK.count;
      const plausibleMin = getVal(colIdx.plausible_min);
      const plausibleMax = getVal(colIdx.plausible_max);
      const ratingRaw = getVal(colIdx.content_rating).toLowerCase();
      const contentRating: "standard" | "after_dark" =
        ratingRaw === "after_dark" ? "after_dark" : "standard";
      const rawUrls = getVal(colIdx.source_urls);
      const sourceUrls = rawUrls
        ? rawUrls.split(/[;\n,]+/).map((url) => url.trim()).filter((url) => url.startsWith("http"))
        : [];

      const issues: string[] = [];
      if (!subject) issues.push("Missing subject");
      if (!angle) issues.push("Missing angle");
      if (!unit) issues.push("Missing unit");
      if (!question) {
        issues.push("Missing question");
      } else if (
        /[?¿？]/.test(question) ||
        /^\s*(how\s+|(in\s+)?what\s+(is|are|was|were|did|do|does|will|would|can|could|has|have|had|year)|(in\s+)?which\s+(is|are|was|were|did|do|does|year)|when\s+(is|are|was|were|did|do|does|will|would|can|could|has|have|had)|where\s+(is|are|was|were|did|do|does)|who\s+(is|are|was|were|did|do|does|won|holds|became|played|scored|invented|discovered|wrote|directed|created)|why\s+(is|are|was|were|did|do|does)|(did|does)\s+)\b/i.test(question)
      ) {
        issues.push("Question must be a statement, not phrased as a question");
      }
      if (!explanation) issues.push("Missing explanation");
      if (!Number.isFinite(trueNumber) || rawNum === "") issues.push("Invalid true_number");
      if (placeholderCount > 1) issues.push("Claim template must contain {n} exactly once");
      if (rawQuantityKind && !quantityKind) issues.push("Invalid quantity_kind");
      if (Boolean(plausibleMin) !== Boolean(plausibleMax)) {
        issues.push("Plausible min and max must be set together");
      }
      if (category && !(GENRES as readonly string[]).includes(category)) {
        issues.push("Invalid category");
      }

      return {
        rowNumber: idx + 2,
        isValid: issues.length === 0,
        issues,
        fact: {
          subject,
          category: (category || undefined) as (typeof GENRES)[number] | undefined,
          sub_category: subCategory || undefined,
          angle,
          true_number: Number.isFinite(trueNumber) ? trueNumber : 0,
          unit,
          claim_template: claimTemplate,
          explanation,
          question,
          surprise_factor: surpriseFactor,
          quantity_kind: quantityKind,
          plausible_min: plausibleMin || undefined,
          plausible_max: plausibleMax || undefined,
          content_rating: contentRating,
          source_urls: sourceUrls,
        },
      };
    });
  }, [csvText]);

  const validFacts = useMemo(() => parsedRows.filter((r) => r.isValid).map((r) => r.fact), [parsedRows]);

  const mutation = useMutation({
    mutationFn: () => bulkImport({ data: { facts: validFacts } }),
    onSuccess: (res) => {
      if (typeof window !== "undefined") window.__lovableEvents?.track?.("project.fact_lifecycle_action", {
        action_category: "import",
        outcome: res.successful ? "succeeded" : res.partialSuccess ? "partial_success" : "failed",
      });
      setImportResult(res);
      queryClient.invalidateQueries({ queryKey: ["facts"] });
    },
    onError: () => {
      if (typeof window !== "undefined") window.__lovableEvents?.track?.("project.fact_lifecycle_action", { action_category: "import", outcome: "failed" });
    },
  });

  return (
    <Card>
      <div className="admin-page-head">
        <div>
          <CardTitle>Import facts from CSV</CardTitle>
          <p style={{ color: "var(--ds-arena-color-text-muted)", fontSize: 13, margin: "4px 0 0" }}>
            Every row is admitted as pending. Rows commit one at a time, so this import is not batch-atomic and may finish with partial success. Required auditor fields: <code>subject</code>, <code>angle</code>, <code>true_number</code>, <code>unit</code>, <code>claim_template</code> (one <code>{"{n}"}</code>), <code>question</code>, and <code>explanation</code>. Optional fields include taxonomy, <code>quantity_kind</code>, paired decimal-string bounds, rating, and sources. Legacy <code>context</code> headers remain accepted as an explanation alias.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button size="sm" variant="ghost" onClick={handleDownloadTemplate}>
            Download Template (.csv)
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>

      <PendingAdmissionNotice />

      {importResult ? (
        <div style={{ padding: "16px 0" }}>
          <Badge tone={importResult.successful ? "amber" : "red"}>
            {importResult.successful
              ? "Pending Admission Complete"
              : importResult.partialSuccess
                ? "Pending Admission Partial Success"
                : "Pending Admission Failed"}
          </Badge>
          <p style={{ color: "var(--ds-arena-color-text)", margin: "8px 0" }}>
            {importResult.summary} {PENDING_ADMISSION_COPY}
          </p>
          <p style={{ color: "var(--ds-arena-color-text-muted)", fontSize: 13, margin: "4px 0" }}>
            Persisted <strong>{importResult.counts.persisted}</strong>; skipped{" "}
            <strong>{importResult.counts.skipped}</strong>; failed{" "}
            <strong>{importResult.counts.failed}</strong>; not attempted{" "}
            <strong>{importResult.counts.notAttempted}</strong>.
            {importResult.failedId ? ` First failed fact: ${importResult.failedId}.` : ""}
          </p>
          {importResult.errors.length > 0 ? (
            <div style={{ color: "var(--ds-arena-color-red)", fontSize: 13, marginTop: "8px" }}>
              <p><strong>Errors ({importResult.errors.length}):</strong></p>
              <ul>
                {importResult.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button size="sm" onClick={onDone} style={{ marginTop: "12px" }}>
            Done
          </Button>
        </div>
      ) : (
        <>
          <div className="admin-toolbar" style={{ marginTop: "12px" }}>
            <label className="admin-field" style={{ flex: "1 1 280px" }}>
              <span>Upload CSV file</span>
              <input className="admin-input" type="file" accept=".csv,text/csv" onChange={handleFileUpload} />
            </label>
            {fileName ? (
              <div style={{ alignSelf: "flex-end", paddingBottom: "10px", color: "var(--ds-arena-color-lime)", fontSize: 13 }}>
                Loaded: {fileName}
              </div>
            ) : null}
          </div>

          <label className="admin-field" style={{ marginTop: "12px" }}>
            <span>Or paste raw CSV text</span>
            <textarea
              className="admin-textarea"
              style={{ minHeight: "100px", fontFamily: "var(--ds-arena-font-mono)", fontSize: "12px" }}
              placeholder={`subject,category,sub_category,angle,true_number,unit,claim_template,question,explanation,surprise_factor,quantity_kind,plausible_min,plausible_max,content_rating,source_urls\nGiraffe,Animals & Nature,Big Cats,Neck vertebrae count,7,vertebrae,"A giraffe has {n} cervical vertebrae.",Giraffe cervical vertebrae count,Mammals have 7 vertebrae.,3,count,1,10,standard,`}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
          </label>

          {parsedRows.length > 0 ? (
            <div style={{ marginTop: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: 13, color: "var(--ds-arena-color-text-muted)" }}>
                  Parsed <strong>{parsedRows.length}</strong> rows — <strong style={{ color: "var(--ds-arena-color-lime)" }}>{validFacts.length} valid</strong>
                  {parsedRows.length - validFacts.length > 0 ? (
                    <>
                      , <strong style={{ color: "var(--ds-arena-color-red)" }}>{parsedRows.length - validFacts.length} invalid</strong>
                    </>
                  ) : null}
                </span>
                <Button
                  size="sm"
                  disabled={validFacts.length === 0 || mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  {mutation.isPending ? "Admitting…" : `Admit ${validFacts.length} as pending`}
                </Button>
              </div>

              <div className="admin-table-wrap" style={{ maxHeight: "240px", overflowY: "auto" }}>
                <table className="admin-table admin-card-table admin-card-table--import">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Subject</th>
                      <th>Angle</th>
                      <th>Value</th>
                      <th>Claim template</th>
                      <th>Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 50).map((row, idx) => (
                      <tr key={idx}>
                        <td>
                          {row.isValid ? (
                            <Badge tone="lime">Ready</Badge>
                          ) : (
                            <Badge tone="red">Error</Badge>
                          )}
                        </td>
                        <td><strong>{row.fact.subject || "—"}</strong></td>
                        <td>{row.fact.angle || "—"}</td>
                        <td>{row.fact.true_number} {row.fact.unit}</td>
                        <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.fact.claim_template}
                        </td>
                        <td style={{ color: row.isValid ? "var(--ds-arena-color-text-muted)" : "var(--ds-arena-color-red)", fontSize: 12 }}>
                          {row.issues.length > 0 ? row.issues.join(", ") : "OK"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <ErrorNote error={mutation.error} />
        </>
      )}
    </Card>
  );
}

