/** Deployed-versus-Firestore bank observability panel for the Content page. */
import { Badge, Card, CardTitle } from "@/index";
import { ErrorNote } from "@/admin/AdminShell";
import { FACT_STATUSES } from "../../shared/fact-lifecycle-contract.gen";
import type { BankObservability } from "@/lib/admin/content.server";

const HYDRATION_EXPLANATION =
  "Firestore changes go live only after export, hydration PR merge, and Worker deployment.";

const EXPORTED_DELTA_DEFINITION =
  "Firestore active lifecycle count minus deployed fact_count; export filters can make the populations differ.";
function signedDelta(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

export function BankObservabilityPanel({
  data,
  isLoading = false,
  error = null,
}: {
  data?: BankObservability;
  isLoading?: boolean;
  error?: unknown;
}) {
  return (
    <Card>
      <div style={{ display: "grid", gap: "var(--ds-arena-space-3)" }}>
        <div className="admin-page-head">
          <div>
            <CardTitle>Deployed vs Firestore</CardTitle>
            <p style={{ margin: "4px 0 0", color: "var(--ds-arena-color-text-muted)", fontSize: 13 }}>
              Source lifecycle state and the exact bank embedded in the current Game Worker.
            </p>
          </div>
          {data?.deployed.state === "known" ? (
            <Badge tone="lime">Deployed</Badge>
          ) : data ? (
            <Badge tone="amber">Unknown / stale</Badge>
          ) : (
            <Badge tone="neutral">Checking</Badge>
          )}
        </div>

        {isLoading ? <p className="admin-empty">Checking deployed bank version…</p> : null}
        <ErrorNote error={error} />

        {data ? (
          <div
            role="status"
            aria-live="polite"
            style={{ display: "grid", gap: "var(--ds-arena-space-3)" }}
          >
            {data.deployed.state === "known" ? (
              <dl
                className="admin-kv"
                style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}
              >
                <div><dt>Deployed bank_version</dt><dd><code>{data.deployed.bankVersion}</code></dd></div>
                <div><dt>Deployed fact_count</dt><dd>{data.deployed.factCount}</dd></div>
                <div><dt>Deployed ddm_version</dt><dd><code>{data.deployed.ddmVersion}</code></dd></div>
                <div>
                  <dt>Exported vs Firestore delta</dt>
                  <dd>{data.exportedDelta === null ? "Unknown" : signedDelta(data.exportedDelta)}</dd>
                </div>
              </dl>
            ) : (
              <div
                role="note"
                style={{
                  padding: "12px 14px",
                  border: "1px solid var(--ds-arena-color-border)",
                  borderLeft: "3px solid var(--ds-arena-color-amber)",
                  borderRadius: "var(--ds-arena-radius-md)",
                  color: "var(--ds-arena-color-text-muted)",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: "var(--ds-arena-color-text)" }}>
                  Deployed bank version unknown or stale.
                </strong>{" "}
                {data.deployed.reason} No deployed version is shown because the endpoint could not be
                verified; the exported delta is unknown.
              </div>
            )}

            <div>
              <strong style={{ fontSize: 13 }}>Firestore lifecycle counts</strong>
              <dl
                className="admin-kv"
                style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
              >
                {FACT_STATUSES.map((status) => (
                  <div key={status}>
                    <dt>{status}</dt>
                    <dd>{data.firestore.lifecycle[status]}</dd>
                  </div>
                ))}
                <div><dt>Total</dt><dd>{data.firestore.total}</dd></div>
              </dl>
            </div>

            <p style={{ margin: 0, color: "var(--ds-arena-color-text-muted)", fontSize: 12 }}>
              <strong>Delta definition.</strong> {data.exportedDeltaDefinition || EXPORTED_DELTA_DEFINITION}
            </p>
          </div>
        ) : null}

        <p
          role="note"
          style={{
            margin: 0,
            padding: "10px 12px",
            borderLeft: "3px solid var(--ds-arena-color-lime)",
            background: "var(--ds-arena-color-surface)",
            color: "var(--ds-arena-color-text-muted)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: "var(--ds-arena-color-text)" }}>Hydration path.</strong>{" "}
          {HYDRATION_EXPLANATION} Firestore itself is never the live serving source.
        </p>
      </div>
    </Card>
  );
}

