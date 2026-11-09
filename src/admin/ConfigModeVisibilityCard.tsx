import { Badge, Card, CardTitle } from "@/index";
import { GAME_MODES, modeVisibilityKey } from "@/lib/admin/mode-visibility";
import { type ConfigFormState } from "@/admin/config-shared";
import type { TopicSuggestionConfig } from "@/lib/firebase/remote_config.server";

export function ConfigModeVisibilityCard({ form, data }: { form: ConfigFormState; data?: Pick<TopicSuggestionConfig, "modesWithOverrides"> | null }) {
  const {
    modeVisibility,
    setModeVisibility,
  } = form;

  return (
          <Card>
            <div style={{ marginBottom: "16px" }}>
              <CardTitle>Game Mode Visibility</CardTitle>
              <p style={{ color: "var(--ds-arena-color-text-muted)", fontSize: 14, margin: "4px 0 0" }}>
                Which modes the client lists (<code>mode_&lt;id&gt;_visible</code>). Unset modes follow the client default: Solitaire only.
                Arena and Octagon also need Worker admission (<code>ARENA_ADMISSION_ENABLED</code> / <code>OCTAGON_ADMISSION_ENABLED</code>), which is a deploy-time setting.
              </p>
              {(data?.modesWithOverrides?.length ?? 0) > 0 && (
                <p role="note" style={{ color: "var(--ds-arena-color-text-muted)", fontSize: 13, margin: "8px 0 0" }}>
                  Audience overrides exist for {data?.modesWithOverrides.join(", ")}. These toggles edit the default value only; the overrides stay in place.
                </p>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
              {GAME_MODES.map((mode) => (
                <label
                  key={mode.id}
                  data-testid={`mode-visibility-${mode.id}`}
                  style={{
                    padding: "12px 16px",
                    borderRadius: "8px",
                    border: "1px solid var(--ds-arena-color-border)",
                    background: "var(--ds-arena-color-surface)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, fontSize: "14px" }}>
                      <input
                        type="checkbox"
                        checked={modeVisibility[mode.id]}
                        onChange={(e) => setModeVisibility({ ...modeVisibility, [mode.id]: e.target.checked })}
                        aria-describedby={`mode-visibility-${mode.id}-desc`}
                        style={{ width: "16px", height: "16px", accentColor: "var(--ds-arena-color-lime)" }}
                      />
                      {mode.label}
                    </span>
                    <Badge tone={modeVisibility[mode.id] ? "lime" : "neutral"}>
                      {modeVisibility[mode.id] ? "VISIBLE" : "HIDDEN"}
                    </Badge>
                  </span>
                  <span id={`mode-visibility-${mode.id}-desc`} style={{ fontSize: "13px", color: "var(--ds-arena-color-text-muted)" }}>
                    {mode.description} <code>{modeVisibilityKey(mode.id)}</code>
                  </span>
                </label>
              ))}
            </div>
          </Card>
  );
}
