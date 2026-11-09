import { Button, Card, CardTitle } from "@/index";
import { DEFAULT_CURATED_TOPICS, reorder, type ConfigFormState } from "@/admin/config-shared";

export function ConfigDefaultTopicsCard({ form }: { form: ConfigFormState }) {
  const {
    setDefaultTopics,
    defaultTopics,
    draggedDefaultTopicIndex,
    dragOverDefaultTopicIndex,
    setDraggedDefaultTopicIndex,
    setDragOverDefaultTopicIndex,
    handleRemoveDefaultTopic,
    newDefaultTopic,
    setNewDefaultTopic,
    handleAddDefaultTopic,
  } = form;

  return (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <CardTitle>Default Topic Rotation (All Players)</CardTitle>
                <p style={{ color: "var(--ds-arena-color-text-muted)", fontSize: 14, margin: "4px 0 0" }}>
                  These suggestions cycle on the Solo Config screen when no targeted override applies. <strong>Drag &amp; drop chips to re-order the rotation sequence.</strong>
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => setDefaultTopics(DEFAULT_CURATED_TOPICS)}
              >
                Reset to default 15
              </Button>
            </div>

            {/* Draggable Chips Container */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
              {defaultTopics.map((topic, index) => {
                const isDragging = draggedDefaultTopicIndex === index;
                const isDragOver = dragOverDefaultTopicIndex === index;

                return (
                  <span
                    key={`${topic}-${index}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", index.toString());
                      e.dataTransfer.effectAllowed = "move";
                      setDraggedDefaultTopicIndex(index);
                    }}
                    onDragEnd={() => {
                      setDraggedDefaultTopicIndex(null);
                      setDragOverDefaultTopicIndex(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverDefaultTopicIndex !== index) {
                        setDragOverDefaultTopicIndex(index);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverDefaultTopicIndex === index) {
                        setDragOverDefaultTopicIndex(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromStr = e.dataTransfer.getData("text/plain");
                      if (fromStr !== "") {
                        const fromIndex = parseInt(fromStr, 10);
                        if (!isNaN(fromIndex) && fromIndex !== index) {
                          setDefaultTopics(reorder(defaultTopics, fromIndex, index));
                        }
                      }
                      setDraggedDefaultTopicIndex(null);
                      setDragOverDefaultTopicIndex(null);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 12px",
                      background: isDragOver
                        ? "var(--ds-arena-color-surface-raised)"
                        : "var(--ds-arena-color-surface)",
                      borderRadius: "20px",
                      border: `1px solid ${isDragOver ? "var(--ds-arena-color-primary, #a3e635)" : "var(--ds-arena-color-border)"}`,
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: "grab",
                      opacity: isDragging ? 0.4 : 1,
                      transform: isDragOver ? "scale(1.05)" : "none",
                      transition: "transform 0.15s ease, border-color 0.15s ease, background 0.15s ease",
                      userSelect: "none",
                    }}
                  >
                    <span style={{ color: "var(--ds-arena-color-text-muted)", fontSize: "11px", letterSpacing: "1px" }}>
                      ⠿
                    </span>
                    {topic}
                    <button
                      type="button"
                      onClick={() => handleRemoveDefaultTopic(index)}
                      aria-label={`Remove ${topic}`}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--ds-arena-color-text-muted)",
                        cursor: "pointer",
                        padding: "0 2px",
                        fontSize: "14px",
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>

            {/* Add Topic Input */}
            <div style={{ display: "flex", gap: "8px", maxWidth: "400px" }}>
              <input
                className="admin-input"
                type="text"
                placeholder="New topic (e.g. Formula 1)"
                value={newDefaultTopic}
                onChange={(e) => setNewDefaultTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddDefaultTopic();
                  }
                }}
              />
              <Button className="admin-config-add-button" onClick={handleAddDefaultTopic}>Add</Button>
            </div>
          </Card>
  );
}
