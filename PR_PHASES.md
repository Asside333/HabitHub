# PR_PHASES — AUDIT-REPAIR-OMEGA-01

## Phase 0 — Inventory & Freeze (AUD-00)
### What changed (Phase 0)
- Audit des features actives dans `game.js` + `index.html`: quêtes (complete/undo), XP total/level, tiers journaliers, streak + protections, weekly chest, boss, progression month/year, import/export (JSON/code/QR), debug date, vacances, haptics/sounds/reduced-motion.
- Cartographie de la source de vérité:
  - Canonique: `state.game.claims.rewardClaims`, `state.game.completedQuestIds`, `state.game.currencies`, `state.game.cycles`, `state.game.debug`.
  - Dérivé: barres progression via `computeDerivedProgress(...)`.
- Ajout d’un error boundary minimal: écoute `window.error` + `window.unhandledrejection` et journalise en mémoire (`errorLog`) + console.

### Bugs found (Phase 0) + repro steps
- Risque d’erreurs runtime non capturées (pas de boundary global).
  - Repro: provoquer une rejection non catchée dans la console.
  - Résultat avant fix: bruit console sans buffer interne.

### Manual Tests (Phase 0)
- [x] Ouvrir l’app, cliquer 2-3 boutons: aucune nouvelle erreur bloquante.
- [x] `node --check game.js` passe.

---

## Phase 1 — State Schema + Invariants + Validator (AUD-01)
### What changed (Phase 1)
- Validator enrichi (`validateState`) avec:
  - `errors`, `warnings`, `corrections`.
  - Corrections safe (normalisation claim, fallback date, alignement `totalXp >= somme des claims`).
- Pipeline load/save: mémorisation du dernier rapport (`storage.lastValidationReport`) pour observabilité.
- UI Dev/Advanced: ajout boutons `Run Validator` + `Export Debug Snapshot`.
- Au startup: validation auto + toast non intrusif si autocorrections appliquées.

### Bugs found (Phase 1) + repro steps
- Incohérences possibles entre `totalXp` et historique de claims.
  - Repro: éditer localStorage et mettre `totalXp` en dessous de la somme des claims.
  - Fix: correction safe via validator.

### Manual Tests (Phase 1)
- [x] Refresh + actions: pas d’erreur JS.
- [x] Suppression localStorage puis reload: état propre recréé.
- [x] Run Validator met à jour un statut lisible.

---

## Phase 2 — Single Source of Truth for quest toggle (AUD-02)
### What changed (Phase 2)
- Introduction de `applyQuestToggle({ habitId, dateKey, nextCompleted })`.
- `toggleQuestCompletion` devient un orchestrateur UI; mutation de state centralisée.
- Garde idempotence (`noop` si état demandé déjà atteint).
- Maintien de l’anti-double-gain via `rewardClaims`.

### Bugs found (Phase 2) + repro steps
- Risque divergence mutations dispersées (completion + claims + XP).
  - Repro: compléter/annuler rapidement une même quête.
  - Fix: centralisation dans `applyQuestToggle`.

### Manual Tests (Phase 2)
- [x] Complete -> undo -> complete: XP cohérent.
- [x] Refresh: persistance cohérente.

---

## Phase 3 — Recompute Derived Stats (AUD-03)
### What changed (Phase 3)
- Alias explicite `computeDerivedProgress(...)` branché pour le rendu jour/progression.
- Harmonisation de l’usage d’une seule fonction dérivée pour UI week/boss/month/year.

### Bugs found (Phase 3) + repro steps
- Écart potentiel entre économie et UI si plusieurs chemins de calcul.
  - Repro: comparer values après toggle sur plusieurs blocs de progression.
  - Fix: lecture via source dérivée unique.

### Manual Tests (Phase 3)
- [x] Une quête terminée: barres concernées bougent.
- [x] Undo: rollback visuel cohérent.

---

## Phase 4 — Self-tests intégrés (AUD-04)
### What changed (Phase 4)
- Ajout `runSelfTests()` (offline, sans dépendance) via panel Dev.
- Cas couverts:
  - no double gain,
  - undo restore,
  - derived up/down,
  - dateKey impact,
  - absence d’erreurs validator (NaN/négatif).
- Sortie texte PASS/FAIL + résumé dans le panel développeur.

### Bugs found (Phase 4) + repro steps
- Aucun nouveau bug bloquant détecté durant l’exécution des tests internes.

### Manual Tests (Phase 4)
- [x] Run Self-tests: résumé affiché.
- [x] Action utilisateur puis Run Self-tests: exécutable sans crash.

---

## Phase 5 — Bug sweep + Fixes (AUD-05)
### What changed (Phase 5)
- Durcissement des chemins Dev:
  - snapshot export inclut state, dérivés, validation, errorLog.
  - fallback UI si clipboard indisponible.
- Vérification import/export/reset: pipeline inchangé et compatible validator.

### Bugs found (Phase 5) + repro steps
- Clipboard potentiellement indisponible selon contexte navigateur.
  - Repro: contexte non sécurisé / permission refusée.
  - Fix: message warning + fallback affichage texte.

### Manual Tests (Phase 5)
- [x] Export -> Reset -> Import: état restauré.
- [x] Refresh stable.

---

## Phase 6 — Cleanup, Docs, Non-regression (AUD-06)
### What changed (Phase 6)
- Finalisation docs:
  - `QA_SMOKE_TESTS.md`
  - `STATE_SCHEMA.md`
  - `SELF_TESTS.md`
- Debug conservé uniquement derrière mode avancé/dev.

### Bugs found (Phase 6) + repro steps
- Known limitation: le runner Self-tests opère en sandbox mémoire en remplaçant temporairement `state.game`; restauré en fin de run (pas d’impact persistant attendu).

### Manual Tests (Phase 6)
- [x] Smoke desktop: navigation tabs + toggles settings.
- [x] Smoke mobile (viewport étroit): UI utilisable.
- [x] Console: pas d’erreur bloquante pendant le flow.
