const QUESTS = [
  { id: "water", name: "Boire 1L d'eau", xp: 10, gold: 5 },
  { id: "walk", name: "Marcher 20 minutes", xp: 20, gold: 10 },
  { id: "read", name: "Lire 15 minutes", xp: 15, gold: 8 },
];

const INITIAL_STATE = {
  xp: 0,
  gold: 0,
  completedQuestIds: [],
};

const UI_CONFIG = {
  countUpDurationMs: 320,
  toastDurationMs: 1800,
  confettiDurationMs: 820,
  confettiPieces: 16,
  questPopDurationMs: 320,
  questGlowDurationMs: 540,
};
