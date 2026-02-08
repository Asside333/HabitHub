const BASE_QUESTS = [
  { id: "water", title: "Boire 1L d'eau", xp: 10, gold: 5, icon: "water", createdAt: 1 },
  { id: "walk", title: "Marcher 20 minutes", xp: 20, gold: 10, icon: "walk", createdAt: 2 },
  { id: "read", title: "Lire 15 minutes", xp: 15, gold: 8, icon: "book", createdAt: 3 },
];

const ICON_OPTIONS = ["water", "walk", "book", "gym", "meditation", "cleanup", "work", "music"];

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
