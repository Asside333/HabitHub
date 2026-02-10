# PR Phases — SIMPLIFY + SLOW LEVELING + DISABLE GOLD

## Phase 0 — Audit & points d’accroche

### What changed
- Added an explicit code map to de-risk the refactor before functional edits.

### Anchor map
- Level curve + progress computation:
  - `xpForNextLevel(level)` in `game.js`
  - `computeLevelProgress(totalXp)` in `game.js`
  - `computeLevelProgressAtLevel(totalXp, level)` in `game.js`
  - `xpNeededToReachLevel(level)` in `game.js`
  - `PROGRESSION` defaults in `data.js` (`BASE_XP`, `GROWTH`)
- XP hero bar reads level/xp from:
  - `renderXpHeroBar()` in `game.js`
  - `renderStats()` in `game.js`
  - UI nodes in `index.html` (`#xp-hero-title`, `#xp-hero-text`, `#xp-hero-bar`, `#xp-hero-remaining`, `#level-badge`)
- Gold display + computation:
  - `isGoldEnabled()`, `formatRewardText()`, `applyGoldVisibility()` in `game.js`
  - reward engine in `computeEffectiveReward()` and `getRewardPreviewFromEffort()` in `game.js`
  - claim normalization/rollback paths use `goldGranted` in `sanitizeRewardClaims()` + reward claim helpers in `game.js`
  - UI nodes in `index.html` (`#gold-value`, `#gold-stat-card`, economy gold controls)
- “Too many settings” zones:
  - `renderSettingsTab()` in `game.js`
  - settings handlers in `setupEventHandlers()` in `game.js`
  - settings sections in `index.html` (economy tuning, audit, developer section, reset actions)

### Manual Tests (Phase 0)
- Open app.
- Complete 1 quest.
- Undo 1 quest.
- Check no console errors.

### Done criteria met
- yes

---

## Phase 1 — Slower leveling curve

### What changed
- Added a dedicated `levelingConfig` in `data.js` with a slower base threshold (`baseXpToLevel2: 120`) and smooth growth (`growth: 1.3`).
- Updated level math to read from `LEVELING_CONFIG` via `getLevelingConfig()` and `xpForNextLevel()`.
- Kept no-level-down behavior by preserving `max(currentLevel, computedLevel)`.
- Clarified XP labels to show `XP du niveau : current / needed` + `Reste` on hero and level bars.

### Manual Tests (Phase 1)
- Completed 2 medium quests: level remained 1 with new curve.
- Simulated extra claims to cross threshold: level-up triggered and UI stayed consistent.
- Undid a completed quest: XP bar moved backward without level regression bug.

### Done criteria met
- yes

---

## Phase 2 — Disable Gold (flagged)

### What changed
- Added a reversible config feature flag in `data.js`: `features.goldEnabled: false`.
- Forced economy gold defaults OFF (`goldEnabledDefault: false`, `goldEnabled: false`) while keeping storage compatibility fields.
- Updated runtime checks in `game.js` so gold is enabled only if feature + economy are both ON.
- Enforced gold OFF in settings/apply path (`applyEconomySettingsToConfig` and overrides) so legacy settings cannot reactivate it.
- Hidden all gold-facing UI controls/cards/sort option and switched visible reward messaging to XP-only.

### Manual Tests (Phase 2)
- Completed a quest: XP changed, no visible gold stat/chip/control in UI.
- Opened settings: no visible gold controls.
- Refreshed page: no gold UI reappeared.

### Done criteria met
- yes

---

## Phase 3 — UI simplification

### What changed
- Simplified **Aujourd’hui**: hid dense progression block and kept focus on hero XP + quest list.
- Added a single CTA `Voir progression` on home to access the dense dashboard tab.
- Simplified **Réglages** by hiding advanced economy/data/developer controls from normal UI.
- Kept critical toggles visible: reduce motion, vibrations, sounds, and vacation mode.

### Manual Tests (Phase 3)
- Aujourd’hui: complete/undo still works with simplified layout.
- Progression tab opens via nav and via `Voir progression` CTA; bars render without NaN.
- Remaining settings toggles persist after refresh.

### Done criteria met
- yes

---

## Phase 4 — Hardening + smoke tests

### What changed
- Removed remaining dead gold UI pieces (today gold stat card, gold sort option, settings gold controls) while preserving engine compatibility fields.
- Hardened settings/runtime bindings with null-safe guards so removed UI nodes cannot break rendering or handlers.
- Kept event log cap behavior intact (bounded by `eventLogMaxEntries`) and ensured reward/event UI stays XP-only.
- Verified mobile rendering and no horizontal overflow during interaction smoke flow.

### Manual Tests (Phase 4)
1. Aujourd’hui: compléter 2 quêtes → XP augmente + barre XP bouge.
2. Annuler 1 quête → rollback exact, barre recule.
3. Progression: barres affichées avec valeurs cohérentes (pas NaN).
4. Réglages: reduce motion ON/OFF, effet immédiat.
5. Refresh page → persistance OK.
6. Aucune mention Gold visible dans l’UI.

### Done criteria met
- yes
