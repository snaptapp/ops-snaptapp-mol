// Load the brand fonts by adding the links exported in ARENA_FONT_LINKS to your document head.
import "./design-system/theme/tokens.css";
import "./design-system/more-or-less-trivia-party-36914f/styles.css";

export const ARENA_FONT_LINKS = [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap",
  },
] as const;

export { cn } from "./design-system/lib/cn";
export { Button, Badge, Card, CardTitle, CardLabel } from "@/design-system/more-or-less-trivia-party-36914f";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./design-system/components/Button";
export type { BadgeProps, BadgeTone } from "./design-system/components/Badge";
export type { CardProps, CardVariant, CardTitleProps, CardLabelProps } from "./design-system/components/Card";
