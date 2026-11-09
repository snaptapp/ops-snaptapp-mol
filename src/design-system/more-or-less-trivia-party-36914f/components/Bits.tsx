import { motion } from "motion/react";
import { ChevronLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PACES, type Pace } from "@/design-system/more-or-less-trivia-party-36914f/lib/mock-data";
import { FLICK, useHaptics, useMotionPrefs } from "@/design-system/more-or-less-trivia-party-36914f/lib/motion";

const MotionLink = motion.create(Link);

export function BackLink({ to }: { to: string }) {
  const { press } = useMotionPrefs();
  const haptic = useHaptics();
  return (
    <MotionLink
      to={to}
      className="icon-button ds-focusable"
      aria-label="Back"
      onClick={() => haptic("tick")}
      {...press}
    >
      <ChevronLeft size={20} />
    </MotionLink>
  );
}

export function PaceSelector({
  value,
  onChange,
}: {
  value: Pace;
  onChange: (p: Pace) => void;
}) {
  const { press } = useMotionPrefs();
  const haptic = useHaptics();
  return (
    <div className="segmented" role="group" aria-label="Pace">
      {PACES.map((pace) => (
        <motion.button
          key={pace.id}
          type="button"
          aria-pressed={value === pace.id}
          onClick={() => {
            haptic("tick");
            onChange(pace.id);
          }}
          className="segmented__item ds-focusable"
          {...press}
        >
          {value === pace.id ? (
            <motion.span
              layoutId="pace-indicator"
              className="segmented__indicator"
              transition={FLICK}
            />
          ) : null}
          <span className="segmented__title">{pace.label}</span>
          <span className="segmented__hint">{pace.hint}</span>
        </motion.button>
      ))}
    </div>
  );
}

export function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  const { press } = useMotionPrefs();
  const haptic = useHaptics();
  return (
    <motion.button
      type="button"
      aria-pressed={selected}
      onClick={() => {
        haptic("tick");
        onClick();
      }}
      className="chip ds-focusable"
      {...press}
    >
      {label}
    </motion.button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  const haptic = useHaptics();
  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        haptic("tick");
        onChange(!checked);
      }}
      className="toggle ds-focusable"
      whileTap={{ scale: 0.94 }}
      transition={FLICK}
    >
      <motion.span layout className="toggle__knob" transition={FLICK} />
    </motion.button>
  );
}

/** Skeleton placeholder matching the focal-card + list rhythm of a screen. */
export function ScreenSkeleton({ blocks = 4 }: { blocks?: number }) {
  return (
    <div className="screen__body" aria-busy="true" aria-label="Loading">
      {Array.from({ length: blocks }, (_, i) => (
        <div key={i} className={i === 0 ? "skeleton skeleton--focal" : "skeleton"} />
      ))}
    </div>
  );
}

/** Consistent empty state: icon, title, body copy, optional action. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">{icon}</span>
      <h3 className="section-title">{title}</h3>
      <p className="muted">{body}</p>
      {action}
    </div>
  );
}

export function Tappable({
  children,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const { pressSurface } = useMotionPrefs();
  const haptic = useHaptics();
  return (
    <motion.button
      type="button"
      onClick={() => {
        haptic("tick");
        onClick?.();
      }}
      aria-label={ariaLabel}
      className="mode-card ds-focusable"
      style={{ background: "none", border: "none", padding: 0, color: "inherit" }}
      {...pressSurface}
    >
      {children}
    </motion.button>
  );
}
