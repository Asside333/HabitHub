window.HRPG = window.HRPG || {};

HRPG.CONFIG = {
  quests: [
    { id: "water", title: "Boire 1L d'eau", xp: 10, gold: 5, icon: "water", createdAt: 1 },
    { id: "walk", title: "Marcher 20 minutes", xp: 20, gold: 10, icon: "walk", createdAt: 2 },
    { id: "read", title: "Lire 15 minutes", xp: 15, gold: 8, icon: "book", createdAt: 3 },
  ],
  icons: ["water", "walk", "book", "gym", "meditation", "cleanup", "work", "music"],
  initialState: {
    xp: 0,
    totalXp: 0,
    level: 1,
    gold: 0,
    completedQuestIds: [],
  },
  progression: {
    BASE_XP: 50,
    GROWTH: 1.25,
    LEVEL_UP_GOLD_BASE_BONUS: 10,
    LEVEL_UP_GOLD_PER_LEVEL: 2,
  },
  ui: {
    countUpDurationMs: 320,
    toastDurationMs: 1800,
    confettiDurationMs: 820,
    confettiPieces: 16,
    questPopDurationMs: 320,
    questGlowDurationMs: 540,
    questToggleCooldownMs: 260,
  },
};

// Compat temporaire : conserve les alias globaux existants pour éviter toute casse
// durant la migration progressive vers HRPG.CONFIG.
const BASE_QUESTS = HRPG.CONFIG.quests;
const ICON_OPTIONS = HRPG.CONFIG.icons;
const INITIAL_STATE = HRPG.CONFIG.initialState;
const PROGRESSION = HRPG.CONFIG.progression;
const UI_CONFIG = HRPG.CONFIG.ui;
