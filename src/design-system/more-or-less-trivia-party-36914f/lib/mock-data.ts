export type Pace = "fast" | "normal" | "relaxed";

export const PACES: { id: Pace; label: string; hint: string; seconds: number }[] = [
  { id: "fast", label: "Fast", hint: "7s — frantic reflexes", seconds: 7 },
  { id: "normal", label: "Normal", hint: "12s — balanced read", seconds: 12 },
  { id: "relaxed", label: "Relaxed", hint: "30s — accessible thinking", seconds: 30 },
];

export type Fact = {
  id: string;
  question: string;
  presented: number;
  trueNumber: number;
  unit: string;
  context: string;
};

export const MOCK_DECK: Fact[] = [
  {
    id: "giraffe-heart",
    question: "Weight of an adult giraffe's heart",
    presented: 53,
    trueNumber: 25,
    unit: "pounds",
    context:
      "A giraffe's heart weighs about 25 lb and pumps blood nearly 6 feet straight up to the brain.",
  },
  {
    id: "cheetah-sprint",
    question: "A cheetah's top sprint speed",
    presented: 40,
    trueNumber: 70,
    unit: "mph",
    context: "Cheetahs hit roughly 70 mph, but only hold it for about 20 seconds.",
  },
  {
    id: "blue-whale-tongue",
    question: "Weight of a blue whale's tongue",
    presented: 900,
    trueNumber: 5400,
    unit: "pounds",
    context: "The tongue alone weighs as much as a small elephant — around 2.7 tons.",
  },
  {
    id: "iss-orbits",
    question: "Orbits the ISS completes around Earth each day",
    presented: 22,
    trueNumber: 16,
    unit: "orbits",
    context: "The station laps the planet every 92 minutes, so the crew sees 16 sunrises a day.",
  },
  {
    id: "octopus-hearts",
    question: "Number of hearts in a common octopus",
    presented: 1,
    trueNumber: 3,
    unit: "hearts",
    context: "Two pump blood through the gills and one pumps it to the rest of the body.",
  },
];

export const TRENDING_DECKS = [
  "Horseflies",
  "Space Records",
  "Apex Predators",
  "Fast Food Stats",
  "Box Office Bombs",
];

export const VERSUS_TOPICS = [
  "Space Records",
  "Deadliest Animals",
  "Mega Roller Coasters",
  "Supercars & Speed",
];

export type Tier = {
  id: string;
  eyebrow: string;
  title: string;
  state: "completed" | "active" | "locked";
  value?: number;
  max?: number;
};

export const TIERS: Tier[] = [
  { id: "t1", eyebrow: "Tier 1 • Completed", title: "Starter Pack", state: "completed" },
  { id: "t2", eyebrow: "Tier 2 • 6/10 games", title: "Getting Warm", state: "active", value: 6, max: 10 },
  { id: "t3", eyebrow: "Tier 3 • Locked", title: "Trivia Machine", state: "locked" },
  { id: "t4", eyebrow: "Tier 4 • Locked", title: "Vault Master", state: "locked" },
];

export const LEADERBOARD = [
  { rank: 1, name: "Marisol Reyes", score: "4,820" },
  { rank: 2, name: "Dev Kapoor", score: "4,415" },
  { rank: 3, name: "Tony T.", score: "4,180" },
  { rank: 4, name: "Hannah Lindqvist", score: "3,960" },
  { rank: 5, name: "Owen Brady", score: "3,712" },
];

export const RECENT_RUNS = [
  { id: "r1", topic: "Deep Sea Creatures", result: "5 / 5", points: "+620", tone: "lime" as const },
  { id: "r2", topic: "Supercars & Speed", result: "3 / 5", points: "+280", tone: "amber" as const },
  { id: "r3", topic: "Cutthroat", result: "11 streak", points: "+1,040", tone: "purple" as const },
  { id: "r4", topic: "Box Office Bombs", result: "2 / 5", points: "+140", tone: "red" as const },
];
