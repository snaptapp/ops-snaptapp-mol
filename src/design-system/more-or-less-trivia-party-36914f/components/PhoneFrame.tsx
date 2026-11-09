import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useRouterState, useNavigate } from "@tanstack/react-router";
import { Play, Users, Lock, User } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { TabBar } from "@/design-system/more-or-less-trivia-party-36914f/design-system/more-or-less-admin-site-72d612";
import backdrop from "@/design-system/more-or-less-trivia-party-36914f/assets/backdrop-grid.jpg";
import { QaPanel } from "@/design-system/more-or-less-trivia-party-36914f/components/QaPanel";
import { screenVariants, useHaptics, useMotionPrefs } from "@/design-system/more-or-less-trivia-party-36914f/lib/motion";

const TABS = [
  { id: "/", label: "Play", icon: <Play size={18} /> },
  { id: "/party", label: "Party", icon: <Users size={18} /> },
  { id: "/vault", label: "Vault", icon: <Lock size={18} /> },
  { id: "/profile", label: "Profile", icon: <User size={18} /> },
];

function activeTabFor(pathname: string) {
  if (pathname.startsWith("/party")) return "/party";
  if (pathname.startsWith("/vault")) return "/vault";
  if (pathname.startsWith("/profile") || pathname.startsWith("/settings")) return "/profile";
  return "/";
}

export function PhoneFrame({
  children,
  showTabs = true,
}: {
  children: ReactNode;
  showTabs?: boolean;
}) {
  const navigate = useNavigate();
  const haptic = useHaptics();
  const { reduced } = useMotionPrefs();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeId = activeTabFor(pathname);

  // Keyboard users can jump between sections with 1–4.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const index = Number(e.key) - 1;
      const tab = TABS[index];
      if (!Number.isNaN(index) && tab) {
        e.preventDefault();
        navigate({ to: tab.id });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-stage">
        <img src={backdrop} alt="" aria-hidden="true" className="app-stage__backdrop" loading="lazy" />
        <div className="phone">
          <div className="phone__texture" aria-hidden="true" />

          <nav className="rail" aria-label="Primary">
            <span className="rail__brand">More or Less</span>
            <ul className="rail__list">
              {TABS.map((tab, i) => (
                <li key={tab.id}>
                  <button
                    type="button"
                    className={`rail__item ds-focusable${activeId === tab.id ? " rail__item--active" : ""}`}
                    aria-current={activeId === tab.id ? "page" : undefined}
                    onClick={() => {
                      haptic("tick");
                      navigate({ to: tab.id });
                    }}
                  >
                    <span className="rail__icon">{tab.icon}</span>
                    <span className="rail__label">{tab.label}</span>
                    <kbd className="rail__key">{i + 1}</kbd>
                  </button>
                </li>
              ))}
            </ul>
            <span className="rail__hint">Press 1–4 to switch</span>
          </nav>

          <div className="stagearea">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pathname}
                className="screen"
                variants={screenVariants}
                initial={reduced ? false : "initial"}
                animate="animate"
                exit="exit"
              >
                {children}
              </motion.div>
            </AnimatePresence>
            {showTabs ? (
              <TabBar
                items={TABS}
                activeId={activeId}
                onSelect={(id) => {
                  haptic("tick");
                  navigate({ to: id });
                }}
              />
            ) : null}
          </div>
        </div>
        <QaPanel />
      </div>
    </MotionConfig>
  );
}
