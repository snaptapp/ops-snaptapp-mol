import { useCallback } from "react";
import { useReducedMotion } from "motion/react";
import type { TargetAndTransition, Transition, Variants } from "motion/react";

/**
 * Arena motion scale. Four tiers only — everything in the app picks one of
 * these so timing reads as a single system rather than per-screen choices.
 */
const EASE_OUT: [number, number, number, number] = [0.2, 0.8, 0.2, 1];
const EASE_IN_OUT: [number, number, number, number] = [0.5, 0, 0.2, 1];

/** 120ms — state flips: toggles, chips, segmented items. */
export const FLICK: Transition = { duration: 0.12, ease: EASE_OUT };
/** 180ms — presses and small reveals. */
export const SNAP: Transition = { duration: 0.18, ease: EASE_OUT };
/** 320ms — screen and card entrances. */
export const SETTLE: Transition = { duration: 0.32, ease: EASE_OUT };
/** 520ms — hero / reward moments. */
export const SWEEP: Transition = { duration: 0.52, ease: EASE_IN_OUT };

/** Physical arcade spring — the "button under a thumb" feel. */
export const POP: Transition = { type: "spring", stiffness: 520, damping: 26, mass: 0.7 };
/** Softer spring for larger surfaces that shouldn't overshoot as hard. */
export const GLIDE: Transition = { type: "spring", stiffness: 320, damping: 30, mass: 0.9 };

/** Stagger step shared by every list in the app. */
export const STAGGER = 0.045;

/* ---------- press feedback ---------- */

/** Standard press feedback for anything tappable. */
export const pressable = {
  whileHover: { scale: 1.015 },
  whileTap: { scale: 0.96, y: 2 },
  whileFocus: { scale: 1.015 },
  transition: POP,
} as const;

/** Heavier press for full-width primary actions with a hard bottom shadow. */
export const pressableHard = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.985, y: 3 },
  transition: POP,
} as const;

/** Press for large surfaces (mode cards, tiles) — subtler travel. */
export const pressableSurface = {
  whileHover: { scale: 1.008, y: -2 },
  whileTap: { scale: 0.985, y: 1 },
  transition: GLIDE,
} as const;

/* ---------- entrances ---------- */

export const screenVariants: Variants = {
  initial: { opacity: 0, y: 14, scale: 0.995 },
  animate: { opacity: 1, y: 0, scale: 1, transition: SETTLE },
  exit: { opacity: 0, y: -10, scale: 0.995, transition: SNAP },
};

export const listVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: STAGGER, delayChildren: 0.04 } },
  exit: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
};

export const itemVariants: Variants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: SETTLE },
  exit: { opacity: 0, y: -6, transition: FLICK },
};

/** Reveal that lands with a bit of weight — result banners, codes, rewards. */
export const popVariants: Variants = {
  initial: { opacity: 0, scale: 0.86 },
  animate: { opacity: 1, scale: 1, transition: POP },
  exit: { opacity: 0, scale: 0.94, transition: SNAP },
};

/** Sheets and drawers. */
export const sheetVariants: Variants = {
  initial: { y: "100%" },
  animate: { y: 0, transition: GLIDE },
  exit: { y: "100%", transition: SNAP },
};

/** Wrong-answer shake. */
export const shake: TargetAndTransition = {
  x: [0, -10, 9, -6, 4, 0],
  transition: { duration: 0.42, ease: EASE_OUT },
};

/** Correct-answer pulse. */
export const pulse: TargetAndTransition = {
  scale: [1, 1.06, 1],
  transition: { duration: 0.36, ease: EASE_OUT },
};

/* ---------- reduced motion + haptics ---------- */

/**
 * Returns props that neutralise transform-based feedback when the user
 * prefers reduced motion, while keeping opacity cues intact.
 */
export function useMotionPrefs() {
  const reduced = useReducedMotion();
  return {
    reduced: Boolean(reduced),
    press: reduced ? { transition: FLICK } : pressable,
    pressHard: reduced ? { transition: FLICK } : pressableHard,
    pressSurface: reduced ? { transition: FLICK } : pressableSurface,
    stagger: reduced ? 0 : STAGGER,
  };
}

/**
 * Light haptic tick on supported devices; silently no-ops elsewhere so the
 * same call site works on desktop.
 */
export function useHaptics() {
  return useCallback((pattern: "tick" | "confirm" | "error" = "tick") => {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    const map = { tick: 8, confirm: [10, 40, 18], error: [24, 50, 24] } as const;
    try {
      navigator.vibrate(map[pattern] as number | number[]);
    } catch {
      /* unsupported */
    }
  }, []);
}
