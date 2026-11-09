/** Audit-trail widget listing resolution and copilot actions for a report. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge, CardLabel } from "@/index";
import { ErrorNote } from "@/admin/AdminShell";
import { fetchReportAudit } from "@/lib/admin/report-copilot.functions";

export function ReportAuditTrail({ reportId }: { reportId: string }) {
  const [open, setOpen] = useState(false);
  const fetchAudit = useServerFn(fetchReportAudit);
  const query = useQuery({
    queryKey: ["report-audit", reportId],
    queryFn: () => fetchAudit({ data: { reportId } }),
    enabled: open,
  });
  return (
    <details
      style={{ marginTop: "var(--ds-arena-space-3)" }}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary style={{ cursor: "pointer" }}>
        <CardLabel>Audit trail</CardLabel>
      </summary>
      {query.isLoading ? <p>Loading…</p> : null}
      <ErrorNote error={query.error} />
      {query.data && query.data.length === 0 ? <p style={{ color: "var(--ds-arena-color-text-muted)" }}>No recorded actions yet.</p> : null}
      <ol style={{ margin: "6px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
        {query.data?.map((log) => {
          const after = (log.after ?? {}) as Record<string, unknown>;
          const isCopilot = log.action === "report.copilot_review";
          const sources = isCopilot && Array.isArray(after["sources"]) ? (after["sources"] as Array<Record<string, unknown>>) : [];
          const warnings = isCopilot && Array.isArray(after["warnings"]) ? (after["warnings"] as string[]) : [];
          return (
            <li key={log.id} style={{ fontSize: "0.85em" }}>
              <Badge tone={isCopilot ? "purple" : "lime"}>{isCopilot ? "Copilot" : "Resolution"}</Badge>{" "}
              <strong>{log.action.replace("report.", "")}</strong> · {log.adminEmail ?? log.adminUid} · {log.createdAt ?? ""}
              <div style={{ color: "var(--ds-arena-color-text-muted)" }}>{log.details}</div>
              {warnings.length ? (
                <div style={{ color: "var(--ds-arena-color-amber)" }}>Warnings: {warnings.join(" ")}</div>
              ) : null}
              {sources.length ? (
                <ul style={{ margin: "2px 0 0", paddingLeft: 16 }}>
                  {sources.map((src) => (
                    <li key={String(src["url"])}>
                      <a href={String(src["url"])} target="_blank" rel="noreferrer">{String(src["title"] ?? src["url"])}</a>
                      {src["conflicting"] ? <> <Badge tone="red">Conflicts</Badge></> : null}
                      {src["incomparable"] ? <> <Badge tone="amber">Not comparable</Badge></> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </details>
  );
}

