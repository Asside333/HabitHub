# QA_SMOKE_TESTS

## Desktop smoke matrix
- [ ] Ouvrir `index.html` sans erreur console.
- [ ] Today: compléter/annuler la même quête x3.
- [ ] Vérifier XP/level/tier changent de façon cohérente.
- [ ] Progression: week/boss/month/year réagissent aux toggles.
- [ ] Settings: reduced motion / sons / vibrations ON-OFF sans crash.
- [ ] Dev: debug date ON, changer date, vérifier recalcul date active.
- [ ] Import/Export: exporter JSON, reset, importer JSON, vérifier restauration.
- [ ] Run Validator: statut lisible, pas d’erreur bloquante.
- [ ] Run Self-tests: résumé PASS/FAIL affiché.

## Mobile smoke matrix (Android Chrome)
- [ ] Viewport ~360x640 lisible sans zoom.
- [ ] Boutons principaux utilisables au doigt.
- [ ] Pas de dépendance au hover.
- [ ] Tabs + panneaux réglages utilisables en portrait/paysage.
- [ ] Action de quête persiste après fermeture/réouverture navigateur.
- [ ] Aucun overflow bloquant horizontal.

## Known limitations
- Clipboard peut être indisponible pour “Export Debug Snapshot” selon contexte sécurité navigateur.
