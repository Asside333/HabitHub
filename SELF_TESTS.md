# SELF_TESTS

## Exécution
1. Ouvrir l’application.
2. Aller dans `Réglages`.
3. Activer `Mode avancé`, puis `Mode développeur`.
4. Dans la section Développeur, cliquer `Run Self-tests`.

## Couverture actuelle
- No double gain on repeat complete.
- Undo restores previous XP totals.
- Derived progress increases/decreases with toggles.
- Changing dateKey affects daily/week aggregation consistently.
- No NaN/negative anywhere after sequence (validator).

## Sortie attendue
- Affichage texte `PASS/FAIL` par test.
- Résumé final `X/Y PASS`.
- En cas d’échec: détails JSON minimaux affichés sous la ligne du test.

## Remarques
- Les self-tests n’ajoutent aucune dépendance externe.
- Les self-tests tournent en mémoire et restaurent l’état utilisateur ensuite.
