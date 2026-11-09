/** Moderation inbox route: player disputes matched back to the fact bank.
 * Report widgets live in src/admin/; this file keeps the route and ReportsPage. */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button, Card, CardLabel } from "@/index";
import { ErrorNote, PageHead } from "@/admin/AdminShell";
import { fetchReports, flushReports } from "@/lib/admin/content.functions";
import { isDuplicateFlag } from "@/lib/admin/quality-flags";
import { ReportCard } from "@/admin/ReportCard";
import { BulkDuplicateHub } from "@/admin/BulkDuplicateHub";
import { AutoTriagePanel } from "@/admin/AutoTriagePanel";

export { BulkDuplicateHub } from "@/admin/BulkDuplicateHub";
export { CopilotPanel } from "@/admin/CopilotPanel";
export { ReportCard } from "@/admin/ReportCard";


export const Route = createFileRoute("/admin/reports")({
  head: () => ({
    meta: [
      { title: "Moderation Inbox — More or Less Admin" },
      { name: "description", content: "Review player disputes and correct or retire facts." },
      { property: "og:title", content: "Moderation Inbox — More or Less Admin" },
      { property: "og:description", content: "Review player disputes and correct or retire facts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});
function ReportsPage() {
  const queryClient = useQueryClient();
  const list = useServerFn(fetchReports);
  const flush = useServerFn(flushReports);
  const [status, setStatus] = useState("pending_review");
  const [flushMessage, setFlushMessage] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["reports", status],
    queryFn: () => list({ data: { status: status || undefined } }),
    retry: false,
  });

  const duplicateEntries = (query.data || []).filter((entry) => {
    const isDup =
      entry.report.qualityFlags?.some(isDuplicateFlag) ||
      entry.report.reason?.toLowerCase().includes("duplicate_question") ||
      entry.report.reason?.toLowerCase().includes("conflicting_answer") ||
      Boolean(entry.fact?.quality_flags?.some(isDuplicateFlag)) ||
      (entry.duplicateFacts && entry.duplicateFacts.length > 0) ||
      Boolean(entry.report.duplicateFactIds && entry.report.duplicateFactIds.length > 0);
    return isDup && entry.report.status === "pending_review";
  });

  const flushMutation = useMutation({
    mutationFn: () => flush({ data: {} }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      setFlushMessage(`Flushed ${result.flushed} stale report(s) (checked ${result.totalChecked}).`);
    },
  });

  return (
    <>
      <PageHead
        title="Moderation inbox"
        description="Player-reported trivia disputes, matched back to the fact bank."
        actions={
          <div style={{ display: "flex", gap: "var(--ds-arena-space-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
            <label className="admin-field">
              <span>Status</span>
              <select
                className="admin-select"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="pending_review">pending_review</option>
                <option value="resolved">resolved</option>
                <option value="rejected">rejected</option>
                <option value="">All</option>
              </select>
            </label>
            <Button
              variant="ghost"
              disabled={flushMutation.isPending}
              onClick={() => {
                if (window.confirm("Sweep and auto-resolve reports for facts that are already clean/active, retired, or deleted?")) {
                  flushMutation.mutate();
                }
              }}
            >
              {flushMutation.isPending ? "Flushing…" : "Flush Stale Reports"}
            </Button>
          </div>
        }
      />
      <AutoTriagePanel />
      {flushMessage ? (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(16, 185, 129, 0.1)",
            border: "1px solid #10b981",
            borderRadius: 6,
            color: "#10b981",
            fontSize: "0.85em",
            marginBottom: 12,
          }}
        >
          {flushMessage}
        </div>
      ) : null}
      <ErrorNote error={flushMutation.error || query.error} />
      {status === "pending_review" && duplicateEntries.length > 0 ? (
        <BulkDuplicateHub entries={duplicateEntries} />
      ) : null}
      {query.isLoading ? <p className="admin-empty">Loading reports…</p> : null}
      {query.data?.length === 0 ? (
        <Card>
          <CardLabel>Inbox zero</CardLabel>
          <p style={{ color: "var(--ds-arena-color-text-muted)" }}>Nothing to review here.</p>
        </Card>
      ) : null}
      {query.data?.map((entry) => <ReportCard key={entry.report.id} entry={entry} />)}
    </>
  );
}

