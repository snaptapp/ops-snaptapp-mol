import { Button, Card, CardTitle } from "@/index";
import { type ConfigFormState } from "@/admin/config-shared";

export function ConfigEmailAllowlistCard({ form }: { form: ConfigFormState }) {
  const {
    allowedEmails,
    handleRemoveEmail,
    newEmailInput,
    setNewEmailInput,
    handleAddEmail,
  } = form;

  return (
          <Card>
            <div style={{ marginBottom: "16px" }}>
              <CardTitle>Runtime Access &amp; Email Allowlist</CardTitle>
              <p style={{ color: "var(--ds-arena-color-text-muted)", fontSize: 14, margin: "4px 0 0" }}>
                Addresses or domain suffixes (e.g. <code>@snaptapp.us</code>) granted runtime testing access in live builds.
              </p>
            </div>

            {/* Email Chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
              {allowedEmails.length === 0 ? (
                <span style={{ color: "var(--ds-arena-color-text-muted)", fontSize: "13px", fontStyle: "italic" }}>
                  No extra runtime email allowlist configured. Only build-time defines apply.
                </span>
              ) : (
                allowedEmails.map((email, idx) => (
                  <span
                    key={`${email}-${idx}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 12px",
                      background: "var(--ds-arena-color-surface)",
                      borderRadius: "20px",
                      border: "1px solid var(--ds-arena-color-border)",
                      fontSize: "13px",
                      fontFamily: "var(--ds-arena-font-mono)",
                    }}
                  >
                    <span>{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveEmail(idx)}
                      aria-label={`Remove ${email}`}
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
                ))
              )}
            </div>

            {/* Add Email Input */}
            <div style={{ display: "flex", gap: "8px", maxWidth: "450px" }}>
              <input
                className="admin-input"
                type="text"
                placeholder="Add email or domain suffix (e.g. @company.com)"
                value={newEmailInput}
                onChange={(e) => setNewEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddEmail();
                  }
                }}
              />
              <Button className="admin-config-add-button" onClick={handleAddEmail}>Add</Button>
            </div>
          </Card>
  );
}
