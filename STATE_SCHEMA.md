# STATE_SCHEMA

Version de schéma persisté: `v: 1` (envelope `schemaVersion` côté localStorage).

## Source of truth
- Clé de sauvegarde unique: `habitrpg.save`.
- Envelope persistée:
  - `schemaVersion` (number)
  - `updatedAt` (ISO string)
  - `state` (object)

## State canonique (`state.game`)
- `v`: version interne de state.
- `currencies`:
  - `xp` (>=0)
  - `gold` (>=0)
  - `totalXp` (>=0)
  - `tokens` (>=0)
- `daily`:
  - `dateKey` (ISO date ou `null`)
  - `objectivesCompleted` (>=0)
  - `tier` (`none|bronze|silver|gold`)
  - `tierBonusGoldApplied` (>=0)
  - `vacationMode` (bool)
- `progress`:
  - `level` (>=1)
  - `streak` (>=0)
  - `lastActiveDate` (ISO date ou `null`)
  - `lastTier` (tier)
  - `streakShield` (0..1)
  - `restDaysUsedByWeek` (map)
  - `vacationDaysRemaining` (>=0)
  - `lastShieldRefillMonth` (key ou `null`)
- `quests`:
  - `completedQuestIds` (string[])
- `claims`:
  - `rewardClaims` (map `dateKey:habitId -> claim`)
  - `tierClaims` (object)
  - `chestClaims` (object)
- `logs.eventLog` (liste bornée)
- `debug`:
  - `useDebugDate` (bool)
  - `debugDate` (ISO date ou `null`)
- `cycles`:
  - `weekly`, `monthly`, `yearly`, archives, streak boss, inventaires cosmétiques

## Champs dérivés
- `xp`, `gold`, `totalXp`, `level`, `completedQuestIds` existent aussi en alias legacy au niveau racine de `state.game`.
- Les métriques d’UI (jour/semaine/boss/mois/année) sont dérivées par `computeDerivedProgress(state, dateKey)` et ne doivent pas devenir source canonique.

## Invariants principaux
- Pas de NaN / infini / négatif sur les numériques de progression.
- Pas de double-gain pour une même clé claim (`dateKey:habitId`).
- Undo rollbacke le claim exact de l’action/date.
- Les calculs datés utilisent `activeDateKey` (debug date si activée).
- `totalXp >= somme des xpGranted dans rewardClaims`.

## Validation / migration
- Pipeline load: `load -> migrate -> validate -> auto-correct safe -> save`.
- En cas de payload invalide/corrompu: backup + reset safe.
