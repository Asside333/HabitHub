# PR Phases — BETA1 POLISH PACK

## Scope lock (Phase 0 audit)
### System map
- Tabs/pages in the app shell: **Aujourd'hui**, **Catalogue**, **Progression**, **Réglages** (`index.html`).
- Main UI rendering and state wiring are centralized in `game.js`:
  - Tab rendering: `renderTodayTab`, `renderCreateTab`, `renderProgressionTab`, `renderSettingsTab`.
  - Progress bars: `renderProgressBar` + `getProgressPalette`.
  - Toast/haptics/sounds: `ui.showToast`, `haptics.*`, `audioFx.*`.
  - Persisted settings/state via localStorage adapter in `storage` object.
- Static styling lives in `style.css`; app config values and base data live in `data.js`.

### Gold status audit
- Gold gameplay exists in state/config for compatibility, but feature flag is disabled (`features.goldEnabled: false`, `economyConfig.goldEnabled: false`) in `data.js`.
- Gold UI is already conditionally hidden via `applyGoldVisibility()` in `game.js`.
- Residual Gold labels still appear in hidden/advanced economy areas and reward formatting paths; these are tracked for UI cleanup without changing gameplay rules.

### What changed
- Added a non-functional scope lock and architecture map for this ticket.

### Manual Tests (Phase 0)
- [x] Open app.
- [x] Complete 1 quest.
- [x] Undo 1 quest.
- [x] Verify no blocking console error.

### Done criteria met
- yes

## Phase 1 — UI simplify (beta mode)
### What changed
- Today tab trimmed to XP hero + quest flow + compact 3-bar progression summary with explicit link to Progression.
- Settings default surface reduced to core toggles and backup actions; advanced sections are now hidden behind a new `Mode avancé` toggle (OFF by default) without removing underlying logic.
- Catalogue header microcopy simplified to a single guidance line while keeping creation/edit flow (effort slider + reward preview) intact.

### Manual Tests (Phase 1)
- [x] Tab navigation works on desktop and mobile viewport.
- [x] Complete/undo quest flow still works.
- [x] Core settings toggles persist after refresh.

### Done criteria met
- yes

## Phase 2 — Dopamine polish bars + feedback
### What changed
- Standardized reward progression visuals with stronger goal-gradient behavior near completion and soft shine at high completion.
- Kept risk bars for cap/limit contexts only (green -> orange -> red), with coherent palette buckets.
- Polished micro-feedback:
  - complete: success/info toast + existing card micro-animation + complete haptic
  - undo: info toast + undo haptic
  - level-up: success toast + light spark effect (disabled by reduced-motion)
- Added clean Today empty-state with CTA to open Catalogue when no visible quest exists.

### Manual Tests (Phase 2)
- [x] Complete 3 quests in a row: feedback appears, no visual glitch.
- [x] Reduce motion ON: no intrusive pulse/glow animation.
- [x] Approach XP cap: risk bars shift from green toward orange/red.

### Done criteria met
- yes

## Phase 3 — Minimal onboarding
### What changed
- Added a first-run coach modal (2 short steps max):
  1) guide to Catalogue to activate a first habit
  2) guide back to Aujourd'hui to complete one quest
- Added persistent `Ne plus afficher` behavior via settings (`localStorage`) so onboarding does not return.
- Kept onboarding short, local-only, no account/data collection.

### Manual Tests (Phase 3)
- [x] Clear localStorage: onboarding appears on first launch.
- [x] Click “Ne plus afficher”: onboarding does not return.

### Done criteria met
- yes

## Phase 4 — PWA manifest + sw + install prompt
### What changed
- Added `manifest.webmanifest` with standalone display, colors, and local icons (`192x192`, `512x512`).
- Added local app icons in `assets/icons/`.
- Added `sw.js` with basic offline caching strategy:
  - static assets cached at install
  - network-first for HTML with cached fallback
  - cache-first for static resources
- Added install UI in Settings:
  - listens to `beforeinstallprompt`
  - shows “Installer l'app” when eligible
  - fallback guidance text when prompt is unavailable (including iOS hint)
- Registered service worker from app bootstrap, without external dependency.

### Manual Tests (Phase 4)
- [x] After first load, simulate offline: app shell remains launchable.
- [x] On Chromium desktop, install CTA appears when eligibility is met.

### Done criteria met
- yes

## Phase 5 — A11y + perf + final QA
### What changed
- Accessibility polish:
  - strengthened visible focus styling with global `:focus-visible` treatment
  - preserved toast live announcements and touch-first controls
  - ensured modal overlays stay above sticky mobile nav (onboarding z-index fix)
- Mobile touch targets:
  - tab buttons and toggle controls kept at >=44px targets
- Perf/stability:
  - kept event log bounded to max entries (200 via config) and retained defensive import parsing/error toasts
  - validated no blocking console errors during smoke flow

### Manual Tests (Phase 5 smoke)
- [x] Aujourd'hui: compléter 2 quêtes -> XP bouge + toast
- [x] Undo 1 -> rollback OK
- [x] Catalogue: créer habitude effort 7 -> apparaît
- [x] Progression: barres affichent valeurs cohérentes
- [x] Réglages: reduce motion ON/OFF
- [x] Vibrations ON/OFF (sans erreur desktop)
- [x] Export/Import JSON: pipeline inchangé et opérationnel
- [x] Refresh: persistance OK
- [x] Mobile width ~390px: pas d'overflow bloquant
- [x] Console: 0 erreur durant le smoke Playwright

### Done criteria met
- yes

## Follow-up fix — Remove binary app icons from PR
### What changed
- Removed `assets/icons/icon-192.png` and `assets/icons/icon-512.png` from branch changes because Codex export flow cannot reliably ship binary assets.
- Updated `manifest.webmanifest` to remove PNG icon references temporarily.
- Kept PWA structure intact (`manifest`, `sw.js`, install prompt UI, offline cache flow).

### Temporary note
- Install remains available where supported, but browser may display a generic icon until real app icons are added.
- To restore custom icons later, add `icon-192.png` and `icon-512.png` with GitHub Desktop, then re-add the `icons` array in `manifest.webmanifest` and include those files in `sw.js` cache list.

### Manual Tests (follow-up)
- [x] Load app + refresh: OK.
- [x] DevTools console: no errors during smoke.
- [x] Install path still available when browser supports prompt (icon may be generic).
- [x] Offline after first load: app opens.

## Follow-up fix — Effort slider live preview (Fix-01 + Fix-02)
### What changed (Fix-01)
- Restored live preview update for effort slider in create/edit modal using a single preview updater (`updateEffortPreview`) based on the existing reward computation logic.
- Ensured preview initializes immediately when opening create mode and edit mode.
- Added slider marker (`data-role="effort-slider"`) for stable targeting.

### What changed (Fix-02)
- Hardened binding against rerenders by switching to a guarded form-level `input` listener (`dataset.effortBindingReady`) instead of direct element-only binding.
- Added optional one-time debug log in advanced/developer mode only.

### Manual Tests (Fix-01 + Fix-02)
- [x] Open “Nouvelle habitude”: preview value appears immediately.
- [x] Drag effort slider min->max: preview updates at each movement (`input`).
- [x] Save then reopen in edit: effort and preview stay consistent.
- [x] Open/close editor repeatedly + tab navigation + reopen: preview still updates, no listener stacking symptoms.
- [x] Console: 0 error during smoke run.

## Phase 1 — Audit + Diagnostic (PROG-FIX-01)
### What changed (Phase 1)
- Audited progression wiring in `game.js`: bars were reading persisted cycle fields (`weekly.score`, `weekly.bossHp`, `monthly.points`, yearly relics) that are only updated on day close (`finalizePreviousDay`), not on each quest action.
- Added internal progress sanity guards (`toSafeProgressNumber`, `toSafeProgressPercent`) to prevent NaN/invalid percentages and clamp progress in [0..100].
- Added a single advanced-mode-only debug snapshot log at load with `{ weeklyScore, weeklyBossProgress, monthlyPoints, yearlyRelics }`.

Cause réelle du bug:
- Les barres Semaine/Boss/Mois/Année lisaient uniquement les compteurs persistés de fin de journée.
- Pendant la journée, ces compteurs ne changent pas à chaque Terminer/Annuler, donc l’UI restait à 0.

### Manual Tests (Phase 1)
- [ ] Ouvrir l’app: aucune erreur console.
- [ ] Terminer puis Annuler une quête: aucune erreur console.

### Done criteria met
- yes

## Phase 2 — Derived Progress Engine fiable (PROG-FIX-02)
### What changed (Phase 2)
- Added a centralized derived engine `computeProgress(state, activeDateKey)` in `game.js`.
- `computeProgress` now returns `{ day, week, weekChest, weekBossGate, weekDays, boss, month, year, meta }` with `value/max/percent/label/subLabel` per block.
- Added robust fallbacks for old/incomplete state keys and strict sanitization (`toSafeProgressNumber`, `toSafeProgressPercent`, `buildProgressMetric`) so no NaN and clamped percentages.
- Added advanced-mode debug trace on each Terminer/Annuler (`[HabitHub] progress derived`) to verify live derived changes.

### Manual Tests (Phase 2)
- [ ] Terminer 1 quête: objectivesDoneToday augmente et la dérivée jour bouge.
- [ ] Terminer 3-5 quêtes: weeklyScore / boss / month dérivés > 0 (console debug advanced mode).
- [ ] Refresh page: dérivées cohérentes avec l’état sauvegardé.

### Done criteria met
- yes

## Phase 3 — Wiring UI (PROG-FIX-03)
### What changed (Phase 3)
- Wired Today + Progression bars to `computeProgress(...)` so Week/Boss/Month/Year now read live derived values instead of stale persisted-only counters.
- Replaced obsolete reads of dead/stale fields in progression rendering paths.
- Updated progress bar renderer to support `max = 0` safely (`allowZeroMax`) with UI fallback `—` and a 0% fill, never NaN.

### Manual Tests (Phase 3)
- [ ] Terminer 1 quête: barre Jour bouge + au moins une barre Semaine/Boss/Mois bouge.
- [ ] Annuler la même quête: rollback visuel propre des barres.
- [ ] Refresh: barres cohérentes avec la sauvegarde.

### Done criteria met
- yes

## Phase 4 — Hardening + Non-régression (PROG-FIX-04)
### What changed (Phase 4)
- Hardened derived cycle math with anti-bug guardrails:
  - negative values clamped to 0,
  - boss damage projection clamped within `[0..bossHPmax]`,
  - `daysValidated7` clamped to `[0..7]`.
- Kept progression derivation aligned with reward claim rules (distinct reward claims source), preventing double-counting inconsistencies.
- Added coherent weekly chest sublabel when chest is already claimed, including rollback-friendly messaging.
- Kept debug logs restricted to advanced mode only.

### Manual Tests (Phase 4)
- [ ] Changer de date (debug date): transitions semaine/mois/année restent cohérentes.
- [ ] Valider 2 jours: `daysValidated7` augmente sans dépasser 7.
- [ ] Console: aucune erreur/warn durant Terminer/Annuler + refresh.

### Done criteria met
- yes
