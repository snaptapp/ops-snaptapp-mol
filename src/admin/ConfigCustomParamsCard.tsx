import { Badge, Button, Card, CardTitle } from "@/index";
import { type ConfigFormState } from "@/admin/config-shared";

export function ConfigCustomParamsCard({ form }: { form: ConfigFormState }) {
  const {
    customParameters,
    handleUpdateCustomParamValue,
    handleRemoveCustomParam,
    newParamKey,
    setNewParamKey,
    newParamType,
    setNewParamType,
    newParamValue,
    setNewParamValue,
    newParamDesc,
    setNewParamDesc,
    handleAddCustomParam,
  } = form;

  return (
          <Card>
            <div style={{ marginBottom: "16px" }}>
              <CardTitle>Additional Parameters (Dynamic)</CardTitle>
              <p style={{ color: "var(--ds-arena-color-text-muted)", fontSize: 14, margin: "4px 0 0" }}>
                Inspect and configure custom parameters stored in the Remote Config template. Any new keys added here are preserved and immediately delivered to client apps.
              </p>
            </div>

            {Object.keys(customParameters).length === 0 ? (
              <p style={{ color: "var(--ds-arena-color-text-muted)", fontSize: "13px", fontStyle: "italic", marginBottom: "16px" }}>
                No custom parameters currently defined in the Remote Config template.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
                {Object.entries(customParameters).map(([key, item]) => (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: "6px",
                      border: "1px solid var(--ds-arena-color-border)",
                      background: "var(--ds-arena-color-surface)",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: "220px" }}>
                      <code style={{ fontSize: "13px", color: "var(--ds-arena-color-primary, #a3e635)" }}>{key}</code>
                      <Badge tone="neutral">{item.valueType ?? "STRING"}</Badge>
                      {item.description && (
                        <span style={{ fontSize: "12px", color: "var(--ds-arena-color-text-muted)" }}>
                          ({item.description})
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "200px" }}>
                      <input
                        className="admin-input"
                        type="text"
                        value={item.value}
                        onChange={(e) => handleUpdateCustomParamValue(key, e.target.value)}
                        style={{ height: "36px", minHeight: "36px" }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomParam(key)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--ds-arena-color-danger, #ef4444)",
                          cursor: "pointer",
                          fontSize: "13px",
                          padding: "4px 8px",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Custom Parameter Form */}
            <div
              style={{
                padding: "14px",
                borderRadius: "8px",
                background: "var(--ds-arena-color-surface-sunken)",
                border: "1px dashed var(--ds-arena-color-border)",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>
                + Add Custom Parameter
              </div>
              <div className="admin-responsive-grid" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 2fr 2fr auto", gap: "8px", alignItems: "center" }}>
                <input
                  className="admin-input"
                  type="text"
                  placeholder="Key (e.g. min_app_version)"
                  value={newParamKey}
                  onChange={(e) => setNewParamKey(e.target.value)}
                  style={{ height: "38px", minHeight: "38px" }}
                />
                <select
                  className="admin-select"
                  value={newParamType}
                  onChange={(e) => setNewParamType(e.target.value as "STRING" | "BOOLEAN" | "NUMBER" | "JSON")}
                  style={{ height: "38px", minHeight: "38px" }}
                >
                  <option value="STRING">STRING</option>
                  <option value="BOOLEAN">BOOLEAN</option>
                  <option value="NUMBER">NUMBER</option>
                  <option value="JSON">JSON</option>
                </select>
                <input
                  className="admin-input"
                  type="text"
                  placeholder="Default value"
                  value={newParamValue}
                  onChange={(e) => setNewParamValue(e.target.value)}
                  style={{ height: "38px", minHeight: "38px" }}
                />
                <input
                  className="admin-input"
                  type="text"
                  placeholder="Description (optional)"
                  value={newParamDesc}
                  onChange={(e) => setNewParamDesc(e.target.value)}
                  style={{ height: "38px", minHeight: "38px" }}
                />
                <Button className="admin-config-add-button" onClick={handleAddCustomParam} disabled={!newParamKey.trim()}>
                  Add
                </Button>
              </div>
            </div>
          </Card>
  );
}
