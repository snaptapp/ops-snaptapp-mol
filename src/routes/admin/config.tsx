import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge, Button, Card } from "@/index";
import { fetchRemoteConfigTopics, saveRemoteConfigTopics } from "@/lib/admin/config.functions";
import type { CustomParamEntry } from "@/lib/firebase/remote_config.server";
import { parseModeVisibility, type ModeVisibility } from "@/lib/admin/mode-visibility";
import {
  CONFIG_FORM_SECTION_LABELS,
  changedConfigSections,
  configFormFromServer,
  type ConfigForm,
} from "@/lib/admin/config-form";
import {
  DEFAULT_CURATED_TOPICS,
  PRESET_CONDITIONS,
  reorder,
  type ConfigFormState,
  type VariantItem,
} from "@/admin/config-shared";
import { ConfigAdsCard } from "@/admin/ConfigAdsCard";
import { ConfigModeVisibilityCard } from "@/admin/ConfigModeVisibilityCard";
import { ConfigEmailAllowlistCard } from "@/admin/ConfigEmailAllowlistCard";
import { ConfigDefaultTopicsCard } from "@/admin/ConfigDefaultTopicsCard";
import { ConfigAudienceVariantsCard } from "@/admin/ConfigAudienceVariantsCard";
import { ConfigCustomParamsCard } from "@/admin/ConfigCustomParamsCard";

export const Route = createFileRoute("/admin/config")({
  head: () => ({ meta: [
    { title: "Remote Config & A/B — More or Less Admin" },
    { name: "description", content: "Manage game settings and audience experiments." },
    { property: "og:title", content: "Remote Config & A/B — More or Less Admin" },
    { property: "og:description", content: "Manage game settings and audience experiments." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ConfigPage,
});

function ConfigPage() {
  const queryClient = useQueryClient();
  const fetchConfig = useServerFn(fetchRemoteConfigTopics);
  const saveConfig = useServerFn(saveRemoteConfigTopics);

  const { data, isLoading, error } = useQuery({
    queryKey: ["remote-config-topics"],
    queryFn: () => fetchConfig(),
  });

  // State: Ad Monetization
  const [enableInterstitialAds, setEnableInterstitialAds] = useState(false);
  const [interstitialAdFrequency, setInterstitialAdFrequency] = useState(3);
  const [enableRewardedAds, setEnableRewardedAds] = useState(true);
  const [enableBannerAds, setEnableBannerAds] = useState(false);

  // State: Client mode visibility
  const [modeVisibility, setModeVisibility] = useState<ModeVisibility>(() => parseModeVisibility(undefined));

  // State: Email Allowlist
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [newEmailInput, setNewEmailInput] = useState("");

  // State: Topics & Variants
  const [defaultTopics, setDefaultTopics] = useState<string[]>([]);
  const [variants, setVariants] = useState<VariantItem[]>([]);
  const [newDefaultTopic, setNewDefaultTopic] = useState("");
  const [newVariantTopicInputs, setNewVariantTopicInputs] = useState<Record<number, string>>({});

  // State: Custom / Dynamic Parameters
  const [customParameters, setCustomParameters] = useState<Record<string, CustomParamEntry>>({});
  const [newParamKey, setNewParamKey] = useState("");
  const [newParamValue, setNewParamValue] = useState("");
  const [newParamType, setNewParamType] = useState<"STRING" | "BOOLEAN" | "NUMBER" | "JSON">("STRING");
  const [newParamDesc, setNewParamDesc] = useState("");

  // Save & Status State
  const [etag, setEtag] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Drag-and-drop state for Default Topics
  const [draggedDefaultTopicIndex, setDraggedDefaultTopicIndex] = useState<number | null>(null);
  const [dragOverDefaultTopicIndex, setDragOverDefaultTopicIndex] = useState<number | null>(null);

  // Drag-and-drop state for Override Variant Cards
  const [draggedVariantCardIndex, setDraggedVariantCardIndex] = useState<number | null>(null);
  const [dragOverVariantCardIndex, setDragOverVariantCardIndex] = useState<number | null>(null);

  // Drag-and-drop state for Variant Topics
  const [draggedVariantTopic, setDraggedVariantTopic] = useState<{ vIdx: number; tIdx: number } | null>(null);
  const [dragOverVariantTopic, setDragOverVariantTopic] = useState<{ vIdx: number; tIdx: number } | null>(null);

  // Form state and the dirty check both come from configFormFromServer, so an
  // unedited form always equals its baseline.
  const applyServerConfig = useCallback((config: Parameters<typeof configFormFromServer>[0]) => {
    const form = configFormFromServer(config, DEFAULT_CURATED_TOPICS);
    setDefaultTopics(form.defaultTopics);
    setVariants(form.variants);
    setEnableInterstitialAds(form.enableInterstitialAds);
    setInterstitialAdFrequency(form.interstitialAdFrequency);
    setEnableRewardedAds(form.enableRewardedAds);
    setEnableBannerAds(form.enableBannerAds);
    setAllowedEmails(form.allowedEmails);
    setModeVisibility(form.modeVisibility);
    setCustomParameters(form.customParameters);
  }, []);

  // Populate state when data loads
  useEffect(() => {
    if (data) {
      applyServerConfig(data);
      setEtag(data.etag ?? "");
    }
  }, [data, applyServerConfig]);

  const currentForm: ConfigForm = {
    defaultTopics,
    variants,
    enableInterstitialAds,
    interstitialAdFrequency,
    enableRewardedAds,
    enableBannerAds,
    allowedEmails,
    modeVisibility,
    customParameters,
  };
  const changedSections = data
    ? changedConfigSections(currentForm, configFormFromServer(data, DEFAULT_CURATED_TOPICS))
    : [];
  const hasChanges = changedSections.length > 0;

  // Topic Handlers
  function handleAddDefaultTopic() {
    const trimmed = newDefaultTopic.trim();
    if (!trimmed) return;
    if (!defaultTopics.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setDefaultTopics([...defaultTopics, trimmed]);
    }
    setNewDefaultTopic("");
  }

  function handleRemoveDefaultTopic(index: number) {
    setDefaultTopics(defaultTopics.filter((_, i) => i !== index));
  }

  function handleAddVariantTopic(variantIndex: number) {
    const input = (newVariantTopicInputs[variantIndex] ?? "").trim();
    if (!input) return;
    const targetVariant = variants[variantIndex];
    if (!targetVariant.topics.some((t) => t.toLowerCase() === input.toLowerCase())) {
      const updatedVariants = [...variants];
      updatedVariants[variantIndex] = {
        ...targetVariant,
        topics: [...targetVariant.topics, input],
      };
      setVariants(updatedVariants);
    }
    setNewVariantTopicInputs({ ...newVariantTopicInputs, [variantIndex]: "" });
  }

  function handleRemoveVariantTopic(variantIndex: number, topicIndex: number) {
    const targetVariant = variants[variantIndex];
    const updatedVariants = [...variants];
    updatedVariants[variantIndex] = {
      ...targetVariant,
      topics: targetVariant.topics.filter((_, i) => i !== topicIndex),
    };
    setVariants(updatedVariants);
  }

  function handleAddPresetVariant(preset: (typeof PRESET_CONDITIONS)[number]) {
    let name = preset.name;
    let counter = 1;
    while (variants.some((v) => v.conditionName === name)) {
      name = `${preset.name}_${counter++}`;
    }

    setVariants([
      ...variants,
      {
        conditionName: name,
        expression: preset.expression,
        tagColor: preset.color === "amber" ? "ORANGE" : preset.color === "neutral" ? "GRAY" : preset.color.toUpperCase(),
        topics: ["Pop Music", "Video Games", "Anime"],
      },
    ]);
  }

  function handleRemoveVariant(index: number) {
    setVariants(variants.filter((_, i) => i !== index));
  }

  function handleMoveVariantUp(index: number) {
    if (index <= 0) return;
    setVariants(reorder(variants, index, index - 1));
  }

  function handleMoveVariantDown(index: number) {
    if (index >= variants.length - 1) return;
    setVariants(reorder(variants, index, index + 1));
  }

  function handleUpdateVariant(index: number, partial: Partial<VariantItem>) {
    const updated = [...variants];
    updated[index] = { ...updated[index], ...partial };
    setVariants(updated);
  }

  // Email Allowlist Handlers
  function handleAddEmail() {
    const trimmed = newEmailInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!allowedEmails.some((e) => e.toLowerCase() === trimmed)) {
      setAllowedEmails([...allowedEmails, trimmed]);
    }
    setNewEmailInput("");
  }

  function handleRemoveEmail(index: number) {
    setAllowedEmails(allowedEmails.filter((_, i) => i !== index));
  }

  // Custom Parameter Handlers
  function handleAddCustomParam() {
    const key = newParamKey.trim();
    if (!key) return;
    setCustomParameters({
      ...customParameters,
      [key]: {
        value: newParamValue,
        valueType: newParamType,
        description: newParamDesc.trim() || undefined,
      },
    });
    setNewParamKey("");
    setNewParamValue("");
    setNewParamDesc("");
  }

  function handleRemoveCustomParam(key: string) {
    const next = { ...customParameters };
    delete next[key];
    setCustomParameters(next);
  }

  function handleUpdateCustomParamValue(key: string, value: string) {
    setCustomParameters({
      ...customParameters,
      [key]: {
        ...customParameters[key],
        value,
      },
    });
  }

  // Publish
  async function handlePublish() {
    if (defaultTopics.length === 0) {
      setSaveError("Default topics cannot be empty.");
      return;
    }

    for (const v of variants) {
      if (!v.conditionName.trim()) {
        setSaveError("All variants must have a condition name.");
        return;
      }
      if (!v.expression.trim()) {
        setSaveError(`Variant "${v.conditionName}" is missing an expression.`);
        return;
      }
      if (v.topics.length === 0) {
        setSaveError(`Variant "${v.conditionName}" must have at least one topic.`);
        return;
      }
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const changedCategories = [...new Set(changedSections.map((section) =>
      section === "defaultTopics" || section === "variants" ? "topics"
        : section === "modeVisibility" ? "game_modes"
        : section === "allowedEmails" ? "access"
        : section === "customParameters" ? "custom_parameters" : "advertising",
    ))];
    try {
      window.__lovableEvents?.track?.("project.remote_config_save_attempted", { changed_categories: changedCategories, outcome: "attempted" });
    } catch { /* Analytics must not interrupt publication. */ }

    try {
      const result = await saveConfig({
        data: {
          defaultTopics,
          variants,
          enableInterstitialAds,
          interstitialAdFrequency,
          enableRewardedAds,
          enableBannerAds,
          allowedEmails,
          modeVisibility,
          customParameters,
          etag,
          baseVersionNumber: data?.versionNumber,
        },
      });
      setEtag(result.etag);
      // The published values are now the baseline, even if the refetch below
      // is slow or served stale.
      queryClient.setQueryData(["remote-config-topics"], result);
      setSaveSuccess(true);
      try {
        window.__lovableEvents?.track?.("project.remote_config_saved", { changed_categories: changedCategories, outcome: "saved" });
      } catch { /* Analytics must not interrupt a saved configuration. */ }
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to publish Remote Config");
      try {
        window.__lovableEvents?.track?.("project.remote_config_save_failed", { changed_categories: changedCategories, outcome: "failed" });
      } catch { /* Analytics must not interrupt error handling. */ }
    } finally {
      setIsSaving(false);
    }
  }

  const form: ConfigFormState = {
    enableInterstitialAds,
    setEnableInterstitialAds,
    interstitialAdFrequency,
    setInterstitialAdFrequency,
    enableRewardedAds,
    setEnableRewardedAds,
    enableBannerAds,
    setEnableBannerAds,
    modeVisibility,
    setModeVisibility,
    allowedEmails,
    setAllowedEmails,
    newEmailInput,
    setNewEmailInput,
    handleAddEmail,
    handleRemoveEmail,
    defaultTopics,
    setDefaultTopics,
    newDefaultTopic,
    setNewDefaultTopic,
    draggedDefaultTopicIndex,
    setDraggedDefaultTopicIndex,
    dragOverDefaultTopicIndex,
    setDragOverDefaultTopicIndex,
    handleAddDefaultTopic,
    handleRemoveDefaultTopic,
    variants,
    setVariants,
    newVariantTopicInputs,
    setNewVariantTopicInputs,
    draggedVariantCardIndex,
    setDraggedVariantCardIndex,
    dragOverVariantCardIndex,
    setDragOverVariantCardIndex,
    draggedVariantTopic,
    setDraggedVariantTopic,
    dragOverVariantTopic,
    setDragOverVariantTopic,
    handleAddVariantTopic,
    handleRemoveVariantTopic,
    handleAddPresetVariant,
    handleRemoveVariant,
    handleMoveVariantUp,
    handleMoveVariantDown,
    handleUpdateVariant,
    customParameters,
    setCustomParameters,
    newParamKey,
    setNewParamKey,
    newParamValue,
    setNewParamValue,
    newParamType,
    setNewParamType,
    newParamDesc,
    setNewParamDesc,
    handleAddCustomParam,
    handleRemoveCustomParam,
    handleUpdateCustomParamValue,
  };

  return (
    <div className="admin-config">
      <div className="admin-page-head">
        <div>
          <h1>Remote Config &amp; Feature Flags</h1>
          <p style={{ color: "var(--ds-arena-color-text-muted)", margin: "4px 0 0" }}>
            Configure live monetization flags, ad frequencies, email allowlists, topic suggestion rotations, and audience targeting.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {data?.versionNumber && (
            <Badge tone="neutral">Version {data.versionNumber}</Badge>
          )}
          {data?.updatedAt && (
            <span style={{ color: "var(--ds-arena-color-text-muted)", fontSize: 13 }}>
              Updated {new Date(data.updatedAt).toLocaleDateString()}
              {data.updatedBy ? ` by ${data.updatedBy}` : ""}
            </span>
          )}
          <Button
            variant="primary"
            disabled={!hasChanges || isSaving}
            onClick={handlePublish}
          >
            {isSaving ? "Publishing…" : "Publish to Remote Config"}
          </Button>
        </div>
      </div>

      {saveSuccess && (
        <div style={{ padding: "12px 16px", borderRadius: "8px", background: "rgba(34, 197, 94, 0.15)", border: "1px solid rgba(34, 197, 94, 0.3)", color: "#4ade80" }}>
          ✓ Published successfully to Firebase Remote Config! Live client apps will pick up changes on next fetch.
        </div>
      )}

      {saveError && (
        <div style={{ padding: "12px 16px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#f87171" }}>
          ⚠️ {saveError}
        </div>
      )}

      {error && (
        <div className="admin-error">
          Failed to load Remote Config: {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      {data && !data.etag && (
        <div role="note" style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(250, 204, 21, 0.1)", border: "1px solid rgba(250, 204, 21, 0.3)", color: "#fde047" }}>
          Firebase omitted the ETag. Publish uses a version-checked forced update and confirms saved values by reading them back.
        </div>
      )}

      {isLoading ? (
        <Card>
          <div style={{ padding: "32px", textAlign: "center", color: "var(--ds-arena-color-text-muted)" }}>
            Loading Remote Config template…
          </div>
        </Card>
      ) : (
        <>
          {/* Section 1: Monetization & Ad Delivery */}
          <ConfigAdsCard form={form} />

          {/* Section 1b: Client Mode Visibility */}
          <ConfigModeVisibilityCard form={form} data={data} />

          {/* Section 2: Runtime Access & Email Allowlist */}
          <ConfigEmailAllowlistCard form={form} />

          {/* Section 3: Default Topics */}
          <ConfigDefaultTopicsCard form={form} />

          {/* Section 4: Targeted Audiences & A/B Variants */}
          <ConfigAudienceVariantsCard form={form} />

          {/* Section 5: Additional / Custom Parameters (Extensible) */}
          <ConfigCustomParamsCard form={form} />

          {/* Sticky Bottom Save Bar when changes exist */}
          {hasChanges && (
            <div
              style={{
                position: "sticky",
                bottom: "20px",
                background: "var(--ds-arena-color-surface-raised)",
                padding: "16px 24px",
                borderRadius: "12px",
                border: "1px solid var(--ds-arena-color-border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
              }}
            >
              <div>
                <strong style={{ color: "var(--ds-arena-color-primary, #a3e635)" }}>Unpublished changes</strong>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--ds-arena-color-text-muted)" }}>
                  Changed: {changedSections.map((section) => CONFIG_FORM_SECTION_LABELS[section]).join(", ")}.
                  Publish to apply to live clients.
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <Button variant="ghost" disabled={isSaving} onClick={() => data && applyServerConfig(data)}>
                  Discard changes
                </Button>
                <Button
                  variant="primary"
                  disabled={isSaving}
                  onClick={handlePublish}
                >
                  {isSaving ? "Publishing…" : "Publish to Remote Config"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
