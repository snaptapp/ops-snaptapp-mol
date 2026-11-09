import { Badge, Card, CardTitle } from "@/index";
import { type ConfigFormState } from "@/admin/config-shared";

export function ConfigAdsCard({ form }: { form: ConfigFormState }) {
  const {
    enableInterstitialAds,
    setEnableInterstitialAds,
    interstitialAdFrequency,
    setInterstitialAdFrequency,
    enableRewardedAds,
    setEnableRewardedAds,
    enableBannerAds,
    setEnableBannerAds,
  } = form;

  return (
          <Card>
            <div style={{ marginBottom: "16px" }}>
              <CardTitle>Ad Monetization &amp; Delivery</CardTitle>
              <p style={{ color: "var(--ds-arena-color-text-muted)", fontSize: 14, margin: "4px 0 0" }}>
                Runtime monetization flags enforced by the mobile app. Ad-free purchasers are automatically exempt.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginBottom: "16px" }}>
              {/* Interstitial Ads Toggle */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid var(--ds-arena-color-border)",
                  background: "var(--ds-arena-color-surface)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>Interstitial Ads</span>
                  <Badge tone={enableInterstitialAds ? "lime" : "neutral"}>
                    {enableInterstitialAds ? "ENABLED" : "DISABLED"}
                  </Badge>
                </div>
                <p style={{ fontSize: "13px", color: "var(--ds-arena-color-text-muted)", margin: 0, flex: 1 }}>
                  Display full-screen ads between finished game rounds on mobile devices.
                </p>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", marginTop: "4px" }}>
                  <input
                    type="checkbox"
                    checked={enableInterstitialAds}
                    onChange={(e) => setEnableInterstitialAds(e.target.checked)}
                    style={{ width: "16px", height: "16px", accentColor: "var(--ds-arena-color-lime)" }}
                  />
                  <span>Enable interstitial ads</span>
                </label>
              </div>

              {/* Interstitial Frequency */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid var(--ds-arena-color-border)",
                  background: "var(--ds-arena-color-surface)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>Interstitial Frequency</span>
                  <Badge tone="purple">{interstitialAdFrequency} Rounds</Badge>
                </div>
                <p style={{ fontSize: "13px", color: "var(--ds-arena-color-text-muted)", margin: 0, flex: 1 }}>
                  Number of completed rounds or packs required between displaying an interstitial ad.
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                  <input
                    className="admin-input"
                    type="number"
                    min={1}
                    max={50}
                    value={interstitialAdFrequency}
                    onChange={(e) => setInterstitialAdFrequency(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{ maxWidth: "120px" }}
                  />
                  <span style={{ fontSize: "13px", color: "var(--ds-arena-color-text-muted)" }}>rounds / ad</span>
                </div>
              </div>

              {/* Rewarded Ads Toggle */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid var(--ds-arena-color-border)",
                  background: "var(--ds-arena-color-surface)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>Rewarded Video Ads</span>
                  <Badge tone={enableRewardedAds ? "lime" : "neutral"}>
                    {enableRewardedAds ? "ENABLED" : "DISABLED"}
                  </Badge>
                </div>
                <p style={{ fontSize: "13px", color: "var(--ds-arena-color-text-muted)", margin: 0, flex: 1 }}>
                  Allow players to watch opt-in rewarded video ads to revive in Cutthroat sudden-death mode.
                </p>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", marginTop: "4px" }}>
                  <input
                    type="checkbox"
                    checked={enableRewardedAds}
                    onChange={(e) => setEnableRewardedAds(e.target.checked)}
                    style={{ width: "16px", height: "16px", accentColor: "var(--ds-arena-color-lime)" }}
                  />
                  <span>Enable rewarded ads</span>
                </label>
              </div>

              {/* Banner Ads Toggle */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid var(--ds-arena-color-border)",
                  background: "var(--ds-arena-color-surface)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>Banner Ads</span>
                  <Badge tone={enableBannerAds ? "lime" : "neutral"}>
                    {enableBannerAds ? "ENABLED" : "DISABLED"}
                  </Badge>
                </div>
                <p style={{ fontSize: "13px", color: "var(--ds-arena-color-text-muted)", margin: 0, flex: 1 }}>
                  Display banner ads on eligible non-gameplay screens.
                </p>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", marginTop: "4px" }}>
                  <input
                    type="checkbox"
                    checked={enableBannerAds}
                    onChange={(e) => setEnableBannerAds(e.target.checked)}
                    style={{ width: "16px", height: "16px", accentColor: "var(--ds-arena-color-lime)" }}
                  />
                  <span>Enable banner ads</span>
                </label>
              </div>
            </div>
          </Card>
  );
}
