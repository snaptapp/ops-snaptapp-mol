import type { SVGProps } from "react";

/**
 * Game-specific glyphs the generic icon set doesn't cover. All are drawn on a
 * 24-unit grid with the same 2-unit stroke weight and rounded joins as the
 * rest of the app's icons, and inherit colour from the Arena token in use.
 */
type GlyphProps = SVGProps<SVGSVGElement> & { size?: number };

function Glyph({ size = 20, children, ...rest }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** MORE — stacked chevrons pointing up. */
export function MoreGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M5 13l7-7 7 7" />
      <path d="M5 19l7-7 7 7" />
    </Glyph>
  );
}

/** LESS — stacked chevrons pointing down. */
export function LessGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M5 5l7 7 7-7" />
      <path d="M5 11l7 7 7-7" />
    </Glyph>
  );
}

/** Shot clock. */
export function ClockGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2" />
      <path d="M9 2h6" />
    </Glyph>
  );
}

/** Streak flame. */
export function StreakGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 3s5 4.2 5 9a5 5 0 1 1-10 0c0-2 1-3.4 2-4.4 0 1.6.8 2.4 1.6 2.4C12 10 11 6.4 12 3z" />
    </Glyph>
  );
}

/** Versus mark. */
export function VersusGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3 5l4 9 4-9" />
      <path d="M21 5h-4l4 5-4 4h4" />
    </Glyph>
  );
}

/** Reward tier emblem. */
export function TierGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.4 6.8 19.2l1-5.9L3.5 9.2l5.9-.8z" />
    </Glyph>
  );
}

/** Skip / pass. */
export function SkipGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M5 5l8 7-8 7z" />
      <path d="M18 5v14" />
    </Glyph>
  );
}
