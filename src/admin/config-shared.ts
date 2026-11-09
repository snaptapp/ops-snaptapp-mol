import type { Dispatch, SetStateAction } from "react";
import type { CustomParamEntry } from "@/lib/firebase/remote_config.server";
import type { ModeVisibility } from "@/lib/admin/mode-visibility";

export interface VariantItem {
  conditionName: string;
  expression: string;
  tagColor: string;
  topics: string[];
}

export const PRESET_CONDITIONS = [
  {
    label: "50% A/B Split (Variant B)",
    name: "ab_split_50",
    expression: "percent <= 50",
    color: "purple",
  },
  {
    label: "20% Experimental Rollout",
    name: "rollout_20",
    expression: "percent <= 20",
    color: "amber",
  },
  {
    label: "iOS Platform Target",
    name: "ios_players",
    expression: "device.os == 'iOS'",
    color: "lime",
  },
  {
    label: "Android Platform Target",
    name: "android_players",
    expression: "device.os == 'android'",
    color: "neutral",
  },
  {
    label: "United Kingdom Target",
    name: "uk_players",
    expression: "device.country in ['GB']",
    color: "purple",
  },
];

export const DEFAULT_CURATED_TOPICS = [
  "Cheetahs",
  "Milk",
  "Grandma",
  "iPhones",
  "Roller Coasters",
  "Black Holes",
  "Hot Dogs",
  "Taylor Swift",
  "Ancient Rome",
  "Coffee",
  "Dinosaurs",
  "LEGO Bricks",
  "Mount Everest",
  "Electric Cars",
  "Superheroes",
];

export function reorder<T>(list: T[], startIndex: number, endIndex: number): T[] {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
}

type ParamType = "STRING" | "BOOLEAN" | "NUMBER" | "JSON";
type DragTopic = { vIdx: number; tIdx: number };

export interface ConfigFormState {
  enableInterstitialAds: boolean;
  setEnableInterstitialAds: Dispatch<SetStateAction<boolean>>;
  interstitialAdFrequency: number;
  setInterstitialAdFrequency: Dispatch<SetStateAction<number>>;
  enableRewardedAds: boolean;
  setEnableRewardedAds: Dispatch<SetStateAction<boolean>>;
  enableBannerAds: boolean;
  setEnableBannerAds: Dispatch<SetStateAction<boolean>>;
  modeVisibility: ModeVisibility;
  setModeVisibility: Dispatch<SetStateAction<ModeVisibility>>;
  allowedEmails: string[];
  setAllowedEmails: Dispatch<SetStateAction<string[]>>;
  newEmailInput: string;
  setNewEmailInput: Dispatch<SetStateAction<string>>;
  handleAddEmail: () => void;
  handleRemoveEmail: (index: number) => void;
  defaultTopics: string[];
  setDefaultTopics: Dispatch<SetStateAction<string[]>>;
  newDefaultTopic: string;
  setNewDefaultTopic: Dispatch<SetStateAction<string>>;
  draggedDefaultTopicIndex: number | null;
  setDraggedDefaultTopicIndex: Dispatch<SetStateAction<number | null>>;
  dragOverDefaultTopicIndex: number | null;
  setDragOverDefaultTopicIndex: Dispatch<SetStateAction<number | null>>;
  handleAddDefaultTopic: () => void;
  handleRemoveDefaultTopic: (index: number) => void;
  variants: VariantItem[];
  setVariants: Dispatch<SetStateAction<VariantItem[]>>;
  newVariantTopicInputs: Record<number, string>;
  setNewVariantTopicInputs: Dispatch<SetStateAction<Record<number, string>>>;
  draggedVariantCardIndex: number | null;
  setDraggedVariantCardIndex: Dispatch<SetStateAction<number | null>>;
  dragOverVariantCardIndex: number | null;
  setDragOverVariantCardIndex: Dispatch<SetStateAction<number | null>>;
  draggedVariantTopic: DragTopic | null;
  setDraggedVariantTopic: Dispatch<SetStateAction<DragTopic | null>>;
  dragOverVariantTopic: DragTopic | null;
  setDragOverVariantTopic: Dispatch<SetStateAction<DragTopic | null>>;
  handleAddVariantTopic: (variantIndex: number) => void;
  handleRemoveVariantTopic: (variantIndex: number, topicIndex: number) => void;
  handleAddPresetVariant: (preset: (typeof PRESET_CONDITIONS)[number]) => void;
  handleRemoveVariant: (index: number) => void;
  handleMoveVariantUp: (index: number) => void;
  handleMoveVariantDown: (index: number) => void;
  handleUpdateVariant: (index: number, partial: Partial<VariantItem>) => void;
  customParameters: Record<string, CustomParamEntry>;
  setCustomParameters: Dispatch<SetStateAction<Record<string, CustomParamEntry>>>;
  newParamKey: string;
  setNewParamKey: Dispatch<SetStateAction<string>>;
  newParamValue: string;
  setNewParamValue: Dispatch<SetStateAction<string>>;
  newParamType: ParamType;
  setNewParamType: Dispatch<SetStateAction<ParamType>>;
  newParamDesc: string;
  setNewParamDesc: Dispatch<SetStateAction<string>>;
  handleAddCustomParam: () => void;
  handleRemoveCustomParam: (key: string) => void;
  handleUpdateCustomParamValue: (key: string, value: string) => void;
}
