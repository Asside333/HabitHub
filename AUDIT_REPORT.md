# Audit & Stabilisation Report — HabitHub

## Résumé des améliorations

- Renforcement des garde-fous runtime (assertion d'état en dev, clamp sur points critiques XP/Gold/version).
- Organisation du JavaScript en sections explicites pour lecture débutant-friendly.
- Nettoyage CSS léger (suppression de bruit, réduction du risque d'overflow mobile, cohérence reduce-motion).
- Durcissement stockage/migration (placeholder de migration versionnée, normalisation de version `state.v`).
- Micro-perf de rendu: certains flux métier rerendent maintenant uniquement l'onglet actif.

---

## Journal par phase

### Phase 1 — Audit + Safety rails
**What changed**
- Ajout de `assertState(gameState)` (dev-only) pour détecter NaN/non-finies, champs obligatoires absents, négatifs interdits sur XP/Gold.
- Utilisation de `clamp()` sur des zones critiques de normalisation/persistance (`xp`, `gold`, `totalXp`, `v`).
- Validation d'état à l'initialisation et avant écriture `localStorage`.

**Manual Tests (Phase 1)**
- [x] Ouvrir l'app: pas d'erreur JS bloquante.
- [x] Terminer 1 quête puis annuler: état visuel cohérent.
- [x] Vérifier console: pas d'exception runtime hors manip volontaire.

**Done criteria met:** yes

### Phase 2 — JS organization + dead code trim
**What changed**
- Ajout de sections lisibles dans `game.js`:
  - Config access
  - State persistence
  - Selectors/getters
  - Reward engine
  - UI render
  - Event handlers
- Nettoyage de bruit (espaces/lignes superflues) sans changer la mécanique.

**Manual Tests (Phase 2)**
- [x] Navigation onglets Aujourd'hui / Créer / Réglages.
- [x] Action Terminer / Annuler toujours opérationnelle.
- [x] Sauvegarde toujours déclenchée après mutation.

**Done criteria met:** yes

### Phase 3 — CSS cleanup + responsive fixes
**What changed**
- Nettoyage de styles redondants/espaces morts.
- Durcissement mobile: labels nav tronqués proprement, largeur max nav mobile, padding bas ajusté.
- Cohérence reduce-motion: suppression transitions de progress bars quand motion réduite.

**Manual Tests (Phase 3)**
- [x] Largeur mobile (~390px): pas d'overflow horizontal détecté.
- [x] Navigation basse visible et utilisable.
- [x] Mode reduce-motion: animations/transitions fortement réduites.

**Done criteria met:** yes

### Phase 4 — Storage hardening + migrations + perf
**What changed**
- Migration versionnée centralisée:
  - `migrateStateVersion(state, fromVersion)`
  - placeholder v1→v1 noop explicite.
- Chargement save plus robuste (`schemaVersion` bornée).
- `state.v` toujours normalisé.
- Micro-perf: sur certains chemins (claim/toggle), rendu limité à l'onglet actif.

**Manual Tests (Phase 4)**
- [x] Refresh: persistance intacte.
- [x] Suppression localStorage: recréation état initial OK.
- [x] Pas de corruption silencieuse observée après reload.

**Done criteria met:** yes

### Phase 5 — Rapport final + backlog + smoke test
**What changed**
- Ajout de ce rapport consolidé.
- Backlog priorisé (ci-dessous).
- Checklist smoke test post-merge standardisée.

**Manual Tests (Phase 5)**
- [x] Exécution smoke test manuel (10 actions) validée.

**Done criteria met:** yes

---

## Backlog priorisé (ce qu'il reste à faire)

### P0 (fiabilité)
1. Ajouter un bandeau UI explicite en cas de save corrompu + reset safe automatique visible.
2. Ajouter export/import JSON versionné avec validation stricte + rollback en cas d'import invalide.
3. Ajouter un mini test scripté (smoke navigateur) exécutable localement avant release.

### P1 (UX / Android)
1. Préparer PWA:
   - `manifest.webmanifest`
   - `service-worker.js`
   - icônes locales.
2. Vérifier tap targets minimum sur tous boutons denses (catalogue/settings).
3. Ajouter fallback visuel quand vibration/audio non disponibles.

### P2 (maintenabilité)
1. Extraire progressivement en modules `core/`, `features/`, `ui/` sans casser mécanique.
2. Ajouter validateurs dédiés config `data.js` (structure + bornes).
3. Documenter conventions de migration de schéma (v2+).

---

## Smoke Test post-merge (10 actions max)

1. Aujourd'hui: terminer 2 quêtes → XP/Gold augmentent.
2. Annuler 1 quête → rollback correct.
3. Vérifier barre XP hero: ratio/texte cohérents.
4. Réglages: reduce motion ON puis OFF.
5. Réglages: vibrations ON/OFF (sans erreur console).
6. Créer: ajouter une habitude, choisir icône, sauvegarder.
7. Catalogue: masquer puis réafficher une quête seed.
8. Refresh page: état persiste.
9. Reset progression: confirmer puis état réinitialisé.
10. Mobile (~390px): bottom nav visible et pas d'overflow horizontal.
