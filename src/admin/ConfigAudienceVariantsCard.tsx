import { Badge, Button, Card, CardTitle } from "@/index";
import { PRESET_CONDITIONS, reorder, type ConfigFormState } from "@/admin/config-shared";

export function ConfigAudienceVariantsCard({ form }: { form: ConfigFormState }) {
  const {
    handleAddPresetVariant,
    variants,
    draggedVariantCardIndex,
    dragOverVariantCardIndex,
    setDraggedVariantCardIndex,
    setDragOverVariantCardIndex,
    setVariants,
    handleMoveVariantUp,
    handleMoveVariantDown,
    handleRemoveVariant,
    handleUpdateVariant,
    draggedVariantTopic,
    dragOverVariantTopic,
    setDraggedVariantTopic,
    setDragOverVariantTopic,
    handleRemoveVariantTopic,
    newVariantTopicInputs,
    setNewVariantTopicInputs,
    handleAddVariantTopic,
  } = form;

  return (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <CardTitle>Audience Overrides &amp; A/B Tests</CardTitle>
                <p style={{ color: "var(--ds-arena-color-text-muted)", fontSize: 14, margin: "4px 0 0" }}>
                  Tailored topic lists based on platform, country, or random percentage splits.
                </p>
              </div>

              {/* Add Variant Preset Menu */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "var(--ds-arena-color-text-muted)", alignSelf: "center" }}>
                  + Add override:
                </span>
                {PRESET_CONDITIONS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleAddPresetVariant(preset)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: "1px solid var(--ds-arena-color-border)",
                      background: "var(--ds-arena-color-surface)",
                      color: "var(--ds-arena-color-text)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Evaluation priority callout */}
            <div
              style={{
                padding: "10px 14px",
                marginBottom: "16px",
                borderRadius: "8px",
                background: "rgba(59, 130, 246, 0.08)",
                border: "1px solid rgba(59, 130, 246, 0.25)",
                fontSize: "13px",
                color: "var(--ds-arena-color-text)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>ℹ️</span>
              <span>
                <strong>Evaluation Priority:</strong> Overrides are evaluated from <strong>top to bottom</strong>. The first rule that evaluates to true for a given player wins. Drag cards or use the <strong>↑ Up</strong> / <strong>↓ Down</strong> buttons to prioritize specific overrides (e.g. platform targets) over broad percentage splits.
              </span>
            </div>

            {variants.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--ds-arena-color-text-muted)", background: "var(--ds-arena-color-surface-sunken)", borderRadius: "8px" }}>
                No active overrides. All players receive the default topic rotation. Click an override preset above to start an A/B split or platform test.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {variants.map((variant, vIdx) => {
                  const isCardDragging = draggedVariantCardIndex === vIdx;
                  const isCardDragOver = dragOverVariantCardIndex === vIdx;
                  const isFirst = vIdx === 0;
                  const isLast = vIdx === variants.length - 1;

                  return (
                    <div
                      key={`${variant.conditionName}-${vIdx}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/variant-card-index", vIdx.toString());
                        e.dataTransfer.effectAllowed = "move";
                        setDraggedVariantCardIndex(vIdx);
                      }}
                      onDragEnd={() => {
                        setDraggedVariantCardIndex(null);
                        setDragOverVariantCardIndex(null);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverVariantCardIndex !== vIdx) {
                          setDragOverVariantCardIndex(vIdx);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverVariantCardIndex === vIdx) {
                          setDragOverVariantCardIndex(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const fromStr = e.dataTransfer.getData("text/variant-card-index");
                        if (fromStr !== "") {
                          const fromIdx = parseInt(fromStr, 10);
                          if (!isNaN(fromIdx) && fromIdx !== vIdx) {
                            setVariants(reorder(variants, fromIdx, vIdx));
                          }
                        }
                        setDraggedVariantCardIndex(null);
                        setDragOverVariantCardIndex(null);
                      }}
                      style={{
                        border: `1px solid ${isCardDragOver ? "var(--ds-arena-color-primary, #a3e635)" : "var(--ds-arena-color-border)"}`,
                        borderRadius: "8px",
                        padding: "16px",
                        background: isCardDragOver
                          ? "var(--ds-arena-color-surface-raised)"
                          : "var(--ds-arena-color-surface)",
                        opacity: isCardDragging ? 0.4 : 1,
                        transition: "border-color 0.15s ease, background 0.15s ease",
                      }}
                    >
                      {/* Card Header with Priority & Reorder Controls */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span
                            style={{
                              cursor: "grab",
                              color: "var(--ds-arena-color-text-muted)",
                              fontSize: "16px",
                              padding: "2px 4px",
                            }}
                            title="Drag card to re-order priority"
                          >
                            ⠿
                          </span>
                          <Badge tone={isFirst ? "lime" : "neutral"}>
                            {isFirst ? "PRIORITY #1 (FIRST MATCH WINS)" : `PRIORITY #${vIdx + 1}`}
                          </Badge>
                          <strong style={{ fontSize: "15px" }}>{variant.conditionName}</strong>
                        </div>

                        {/* Actions: Move Up / Down & Delete */}
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <button
                            type="button"
                            disabled={isFirst}
                            onClick={() => handleMoveVariantUp(vIdx)}
                            title="Move up in evaluation priority"
                            style={{
                              padding: "4px 8px",
                              borderRadius: "4px",
                              border: "1px solid var(--ds-arena-color-border)",
                              background: isFirst ? "transparent" : "var(--ds-arena-color-surface-sunken)",
                              color: isFirst ? "var(--ds-arena-color-text-muted)" : "var(--ds-arena-color-text)",
                              cursor: isFirst ? "not-allowed" : "pointer",
                              fontSize: "12px",
                              opacity: isFirst ? 0.4 : 1,
                            }}
                          >
                            ↑ Move Up
                          </button>
                          <button
                            type="button"
                            disabled={isLast}
                            onClick={() => handleMoveVariantDown(vIdx)}
                            title="Move down in evaluation priority"
                            style={{
                              padding: "4px 8px",
                              borderRadius: "4px",
                              border: "1px solid var(--ds-arena-color-border)",
                              background: isLast ? "transparent" : "var(--ds-arena-color-surface-sunken)",
                              color: isLast ? "var(--ds-arena-color-text-muted)" : "var(--ds-arena-color-text)",
                              cursor: isLast ? "not-allowed" : "pointer",
                              fontSize: "12px",
                              opacity: isLast ? 0.4 : 1,
                            }}
                          >
                            ↓ Move Down
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveVariant(vIdx)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--ds-arena-color-danger, #ef4444)",
                              cursor: "pointer",
                              fontSize: "13px",
                              marginLeft: "8px",
                            }}
                          >
                            Delete Override
                          </button>
                        </div>
                      </div>

                      <div className="admin-responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px", marginBottom: "12px" }}>
                        <div className="admin-field">
                          <label>Condition Name</label>
                          <input
                            className="admin-input"
                            type="text"
                            value={variant.conditionName}
                            onChange={(e) => handleUpdateVariant(vIdx, { conditionName: e.target.value })}
                          />
                        </div>
                        <div className="admin-field">
                          <label>Expression rule (e.g. percent &lt;= 50, device.os == 'ios')</label>
                          <input
                            className="admin-input"
                            type="text"
                            value={variant.expression}
                            onChange={(e) => handleUpdateVariant(vIdx, { expression: e.target.value })}
                          />
                        </div>
                      </div>

                      {/* Variant Topic Chips (Draggable) */}
                      <div style={{ marginTop: "12px" }}>
                        <label style={{ fontSize: 13, color: "var(--ds-arena-color-text-muted)", display: "block", marginBottom: "8px" }}>
                          Topics for this audience ({variant.topics.length}) — <em>drag chips to re-order:</em>
                        </label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                          {variant.topics.map((topic, tIdx) => {
                            const isTopicDragging =
                              draggedVariantTopic?.vIdx === vIdx && draggedVariantTopic?.tIdx === tIdx;
                            const isTopicDragOver =
                              dragOverVariantTopic?.vIdx === vIdx && dragOverVariantTopic?.tIdx === tIdx;

                            return (
                              <span
                                key={`${topic}-${tIdx}`}
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  e.dataTransfer.setData("text/variant-topic", `${vIdx}:${tIdx}`);
                                  e.dataTransfer.effectAllowed = "move";
                                  setDraggedVariantTopic({ vIdx, tIdx });
                                }}
                                onDragEnd={(e) => {
                                  e.stopPropagation();
                                  setDraggedVariantTopic(null);
                                  setDragOverVariantTopic(null);
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  e.dataTransfer.dropEffect = "move";
                                  if (dragOverVariantTopic?.vIdx !== vIdx || dragOverVariantTopic?.tIdx !== tIdx) {
                                    setDragOverVariantTopic({ vIdx, tIdx });
                                  }
                                }}
                                onDragLeave={(e) => {
                                  e.stopPropagation();
                                  if (dragOverVariantTopic?.vIdx === vIdx && dragOverVariantTopic?.tIdx === tIdx) {
                                    setDragOverVariantTopic(null);
                                  }
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const dataStr = e.dataTransfer.getData("text/variant-topic");
                                  if (dataStr) {
                                    const [srcV, srcT] = dataStr.split(":").map(Number);
                                    if (srcV === vIdx && srcT !== tIdx && !isNaN(srcT)) {
                                      const updatedTopics = reorder(variant.topics, srcT, tIdx);
                                      const updatedVariants = [...variants];
                                      updatedVariants[vIdx] = { ...variant, topics: updatedTopics };
                                      setVariants(updatedVariants);
                                    }
                                  }
                                  setDraggedVariantTopic(null);
                                  setDragOverVariantTopic(null);
                                }}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  padding: "4px 10px",
                                  background: isTopicDragOver
                                    ? "var(--ds-arena-color-surface-raised)"
                                    : "var(--ds-arena-color-surface-sunken)",
                                  borderRadius: "16px",
                                  border: `1px solid ${isTopicDragOver ? "var(--ds-arena-color-primary, #a3e635)" : "var(--ds-arena-color-border)"}`,
                                  fontSize: "13px",
                                  cursor: "grab",
                                  opacity: isTopicDragging ? 0.4 : 1,
                                  transform: isTopicDragOver ? "scale(1.05)" : "none",
                                  transition: "transform 0.15s ease, border-color 0.15s ease",
                                  userSelect: "none",
                                }}
                              >
                                <span style={{ color: "var(--ds-arena-color-text-muted)", fontSize: "10px" }}>⠿</span>
                                {topic}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveVariantTopic(vIdx, tIdx)}
                                  style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "var(--ds-arena-color-text-muted)",
                                    cursor: "pointer",
                                    padding: "0 2px",
                                    lineHeight: 1,
                                  }}
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                        </div>

                        <div style={{ display: "flex", gap: "8px", maxWidth: "350px" }}>
                          <input
                            className="admin-input"
                            type="text"
                            placeholder="Add topic for this variant"
                            value={newVariantTopicInputs[vIdx] ?? ""}
                            onChange={(e) =>
                              setNewVariantTopicInputs({ ...newVariantTopicInputs, [vIdx]: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddVariantTopic(vIdx);
                              }
                            }}
                          />
                          <Button className="admin-config-add-button" onClick={() => handleAddVariantTopic(vIdx)}>Add</Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
  );
}
