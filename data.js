const QUESTS = [
  { id: "water", name: "Boire 1L d'eau", xp: 10, gold: 5 },
  { id: "walk", name: "Marcher 20 minutes", xp: 20, gold: 10 },
  { id: "read", name: "Lire 15 minutes", xp: 15, gold: 8 },
];

const INITIAL_STATE = {
  xp: 0,
  totalXp: 0,
  level: 1,
  gold: 0,
  completedQuestIds: [],
};

const PROGRESSION = {
  BASE_XP: 50,
  GROWTH: 1.25,
  LEVEL_UP_GOLD_BASE_BONUS: 10,
  LEVEL_UP_GOLD_PER_LEVEL: 2,
};

const UI_CONFIG = {
  countUpDurationMs: 320,
  toastDurationMs: 1800,
  confettiDurationMs: 820,
  confettiPieces: 16,
  questPopDurationMs: 320,
  questGlowDurationMs: 540,
  questToggleCooldownMs: 260,
};
