import { PENDING_ADMISSION_COPY, PENDING_PROMOTION_COPY } from "./fact-bits";

/** Pending-admission notice shown on pending fact rows and admission forms. */
export function PendingAdmissionNotice() {
  return (
    <div
      role="note"
      aria-label="Pending fact admission"
      style={{
        margin: 0,
        padding: "12px 14px",
        border: "1px solid var(--ds-arena-color-border)",
        borderLeft: "3px solid var(--ds-arena-color-amber)",
        borderRadius: "var(--ds-arena-radius-md)",
        background: "var(--ds-arena-color-surface)",
        color: "var(--ds-arena-color-text-muted)",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <strong style={{ color: "var(--ds-arena-color-text)" }}>Pending admission.</strong>{" "}
      {PENDING_ADMISSION_COPY} {PENDING_PROMOTION_COPY}
    </div>
  );
}
