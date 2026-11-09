import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AnswerButton,
  Badge,
  Button,
  Card,
  CardLabel,
  ResultBanner,
} from "@/design-system/more-or-less-trivia-party-36914f/design-system/more-or-less-admin-site-72d612";
import {
  FLICK,
  SNAP,
  pressable,
  pulse,
  shake,
  sheetVariants,
  useHaptics,
  useMotionPrefs,
} from "@/design-system/more-or-less-trivia-party-36914f/lib/motion";

/** Feedback states the panel walks through, in order. */
const STATES = ["rest", "hover", "press", "focus", "correct", "wrong"] as const;
type QaState = (typeof STATES)[number];

const LABEL: Record<QaState, string> = {
  rest: "Rest",
  hover: "Hover",
  press: "Press",
  focus: "Focus",
  correct: "Correct",
  wrong: "Wrong",
};

function targetFor(state: QaState, reduced: boolean) {
  if (reduced) return { opacity: state === "rest" ? 1 : 0.9 };
  switch (state) {
    case "hover":
      return { ...pressable.whileHover, transition: pressable.transition };
    case "press":
      return { ...pressable.whileTap, transition: pressable.transition };
    case "correct":
      return pulse;
    case "wrong":
      return shake;
    default:
      return { scale: 1, y: 0, x: 0, transition: SNAP };
  }
}

/** Dev-facing overlay that cycles every feedback state for visual QA. */
export function QaPanel() {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [index, setIndex] = useState(0);
  const { reduced } = useMotionPrefs();
  const haptic = useHaptics();
  const state = STATES[index] as QaState;

  useEffect(() => {
    if (!open || !playing) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % STATES.length);
    }, 1200);
    return () => window.clearInterval(id);
  }, [open, playing]);

  const animate = targetFor(state, reduced);
  const focusClass = state === "focus" ? "qa-focus" : undefined;

  return (
    <>
      <motion.button
        type="button"
        className="qa-launcher ds-focusable"
        onClick={() => {
          setOpen((v) => !v);
          haptic("tick");
        }}
        aria-expanded={open}
        {...(reduced ? { transition: FLICK } : pressable)}
      >
        QA
      </motion.button>

      <AnimatePresence>
        {open ? (
          <motion.aside
            className="qa-panel"
            aria-label="Feedback state QA panel"
            variants={sheetVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Card>
              <div className="row row--between">
                <CardLabel>Feedback QA</CardLabel>
                <Badge tone="lime">{LABEL[state]}</Badge>
              </div>

              <div className="qa-grid">
                <motion.div animate={animate} className={focusClass}>
                  <Button variant="primary">Play</Button>
                </motion.div>
                <motion.div animate={animate} className={focusClass}>
                  <Button variant="danger">Begin</Button>
                </motion.div>
                <motion.div animate={animate} className={focusClass}>
                  <Button variant="ghost" size="sm">
                    Ghost
                  </Button>
                </motion.div>
                <motion.div animate={animate} className={focusClass}>
                  <AnswerButton choice="more">More</AnswerButton>
                </motion.div>
                <motion.div animate={animate} className={focusClass}>
                  <AnswerButton choice="less">Less</AnswerButton>
                </motion.div>
                <motion.div animate={animate} className={focusClass}>
                  <AnswerButton choice="skip">Skip</AnswerButton>
                </motion.div>
              </div>

              <motion.div
                animate={state === "wrong" ? shake : state === "correct" ? pulse : { x: 0, scale: 1 }}
                className="qa-banner"
              >
                <ResultBanner outcome={state === "wrong" ? "wrong" : "correct"} />
              </motion.div>

              <div className="qa-controls">
                {STATES.map((s, i) => (
                  <motion.button
                    key={s}
                    type="button"
                    className={`qa-chip ds-focusable${i === index ? " is-active" : ""}`}
                    onClick={() => {
                      setIndex(i);
                      setPlaying(false);
                      haptic("tick");
                    }}
                    {...(reduced ? { transition: FLICK } : pressable)}
                  >
                    {LABEL[s]}
                  </motion.button>
                ))}
              </div>

              <div className="row row--between">
                <Button size="sm" variant="skip" onClick={() => setPlaying((p) => !p)}>
                  {playing ? "Pause cycle" : "Resume cycle"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </div>
            </Card>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </>
  );
}
