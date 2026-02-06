# HabitHub — MVP offline

Mini application front-end (HTML/CSS/JS) jouable hors ligne avec:

- Liste de quêtes.
- Stats XP / Gold.
- Bouton **Terminer** qui crédite les récompenses.
- Sauvegarde automatique dans `localStorage`.
- Bouton **Reset** pour revenir à zéro.

## Lancer

Ouvre simplement `index.html` dans un navigateur.

## Tests manuels

1. Ouvrir `index.html`: vérifier `XP = 0`, `Gold = 0` et que les boutons **Terminer** sont cliquables.
2. Cliquer sur **Terminer** pour la première quête: vérifier que XP/Gold augmentent immédiatement.
3. Rafraîchir la page (F5): vérifier que les valeurs sont conservées et que la quête complétée reste désactivée.
4. Cliquer sur **Restart** (confirmer la boîte de dialogue): vérifier que XP/Gold reviennent à 0 et que toutes les quêtes redeviennent actives.
5. Recliquer sur **Terminer** pour la même quête: vérifier que XP/Gold augmentent à nouveau.
