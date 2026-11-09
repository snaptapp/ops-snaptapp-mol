/** AI auto-triage panel: dry-run preview and audited auto-resolution of unambiguous reports. */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge, Button, Card, CardLabel, CardTitle } from "@/index";
import { ErrorNote } from "@/admin/AdminShell";
import { runModQueueAutoTriage } from "@/lib/admin/report-copilot.functions";
import { AUTO_TRIAGE_BATCH_LIMIT } from "@/lib/admin/mod-triage";

export function AutoTriagePanel() {
  const queryClient = useQueryClient();
  const triage = useServerFn(runModQueueAutoTriage);
  const mutation = useMutation({
    mutationFn: (dryRun: boolean) => triage({ data: { dryRun } }),
    onSuccess: (result) => {
      if (!result.dryRun) queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
  const result = mutation.data;
  return (
    <Card>
      <CardLabel>AI AUTO-TRIAGE</CardLabel>
      <CardTitle>Clear the easy reports</CardTitle>
      <p className="admin-muted">
        Checks up to {AUTO_TRIAGE_BATCH_LIMIT} pending reports against live web search. Only reports with 2+ independent agreeing sources,
        no conflicts and high confidence are resolved. Everything else stays here for you.
      </p>
      <div className="admin-toolbar">
        <Button variant="ghost" disabled={mutation.isPending} onClick={() => mutation.mutate(true)}>
          {mutation.isPending && mutation.variables === true ? "Checking…" : "Preview (dry run)"}
        </Button>
        <Button
          disabled={mutation.isPending}
          onClick={() => {
            if (window.confirm("Let AI resolve the unambiguous pending reports? Every action is audited.")) mutation.mutate(false);
          }}
        >
          {mutation.isPending && mutation.variables === false ? "Triaging…" : "Auto-triage & fix"}
        </Button>
      </div>
      {mutation.error ? <ErrorNote error={mutation.error} /> : null}
      {result ? (
        <div>
          <p>
            <strong>{result.dryRun ? "Dry run" : "Run complete"}:</strong> checked {result.checked},{" "}
            {result.dryRun ? "would resolve" : "resolved"} {result.autoResolved}, left for you {result.leftForAdmin}
            {result.errors ? `, failed ${result.errors}` : ""}.
            {result.remaining ? ` ${result.remaining} not checked within this request; run again to continue.` : ""}
          </p>
          <ul className="admin-list">
            {result.items.map((item) => (
              <li key={item.reportId}>
                <Badge tone={item.outcome === "error" ? "red" : item.outcome === "left_for_admin" ? "amber" : "lime"}>
                  {item.outcome === "auto_resolved"
                    ? "AUTO-RESOLVED BY AI"
                    : item.outcome === "would_resolve"
                      ? "WOULD AUTO-RESOLVE"
                      : item.outcome === "error"
                        ? "REVIEW FAILED"
                        : "NEEDS ADMIN REVIEW"}
                </Badge>{" "}
                <strong>{item.topic}</strong> — {item.claimStatement}
                <div className="admin-muted">
                  {item.action ? `${item.action}${item.correctedNumber != null ? ` → ${item.correctedNumber}` : ""} · ` : ""}
                  {item.verdict} ({item.confidence}) · {item.reason}
                </div>
                {item.sources.length ? (
                  <div className="admin-muted">
                    {item.sources.slice(0, 5).map((s) => (
                      <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                        {s.title || s.url}{" "}
                      </a>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

