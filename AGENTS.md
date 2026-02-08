# AGENTS.md — HabitRPG Offline (Vibe Coding)

Ce fichier est le contrat de projet. Toute contribution (humaine ou IA) doit le suivre.

## 0) Objectif en une phrase
Construire un HabitRPG jouable offline, en **HTML/CSS/JS pur**, **sans dépendances**, **modulaire**, avec **config dans `data.js`** et **sauvegarde dans `localStorage`**.

---

## 1) Contraintes NON négociables
- Offline : pas d’API, pas de CDN, pas de bibliothèques externes.
- 1 page : l’app fonctionne en ouvrant `index.html` (idéalement dans un navigateur).
- `localStorage` : toute progression doit survivre à F5.
- Config-driven : les règles et contenus viennent de `data.js` (pas de valeurs “en dur” dans la logique).
- Lisibilité > astuce : code simple, noms clairs, petits fichiers.
- Pas de “spaghetti” : UI / logique / stockage séparés.

---

## 1bis) Cible Android (objectif long terme)
L’application doit fonctionner correctement sur **téléphone Android (Chrome)** et être pensée pour devenir **installable en PWA** (Progressive Web App) dès que le projet est assez stable.

### Exigences mobile (non négociables)
- Responsive “mobile-first” : UI utilisable sur 360×640 et plus.
- Touch-first : aucune action ne doit dépendre du hover (survol souris).
- Tap targets : boutons et zones cliquables suffisamment grands (pas de micro-boutons).
- Lisibilité : tailles de texte et espacements adaptés au téléphone.
- Performance : éviter les rerenders complets inutiles, limiter les accès DOM.
- Feedback immédiat : chaque action doit produire un retour visible (et éventuellement sonore, si assets locaux).

### Contraintes techniques pour rester “PWA-ready”
- Toujours zéro dépendance externe (pas de CDN).
- Tous les assets doivent être locaux (icônes, sons éventuels).
- Architecture SPA : pas besoin de “vraies pages serveur”.
- Stockage : `localStorage` OK au début, mais `core/storage.js` doit rester un adaptateur remplaçable (pour évoluer vers IndexedDB si nécessaire).
- PWA à activer plus tard via :
  - `manifest.webmanifest`
  - `service-worker.js`
  - icônes (assets)

---

## 2) Comment utiliser ce fichier (mode débutant)
Quand tu demandes du code à l’IA, tu commences ton message par :

“Lis AGENTS.md et respecte-le strictement. Fais un petit patch. Donne-moi la liste des fichiers à créer/modifier, puis colle le code complet de chaque fichier.”

Et tu ajoutes :
- “Pas de dépendances”
- “Compatible offline”
- “Config dans data.js”
- “Sauvegarde localStorage”
- “Mobile-first Android (touch + responsive), PWA-ready”

---

## 3) Structure de projet (recommandée)
Tu peux commencer simple, mais vise cette structure :

/ (racine)
- index.html
- styles.css
- data.js
- app.js
- core/
  - state.js        (état en mémoire + fonctions de mise à jour)
  - storage.js      (load/save/migrate/import/export)
  - utils.js        (fonctions pures utiles)
  - validate.js     (validation config + garde-fous)
- features/
  - quests.js       (logique quêtes)
  - stats.js        (xp/level/gp/hp)
  - boss.js         (boss battles si présent)
  - shop.js         (boutique/inventaire si présent)
- ui/
  - dom.js          (références DOM + cache)
  - render.js       (rendu UI)
  - events.js       (handlers + event delegation)

Règle :
- `features/` = règles du jeu
- `ui/` = affichage & clics
- `core/` = état, stockage, utilitaires

---

## 4) Convention “namespace” (pour éviter les imports cassés offline)
Pas besoin de bundler. On utilise un objet global unique :

- `window.HRPG = window.HRPG || {};`
- Chaque fichier ajoute ses fonctions dans `HRPG`.

Aucun autre global.

---

## 5) data.js : la règle d’or
`data.js` doit être éditable par un non-dev.

- Contient : quêtes de départ, paramètres XP, niveaux, items shop, bosses, labels UI, etc.
- Ne contient PAS : accès DOM, accès localStorage, logique compliquée.

Exemple attendu (conceptuel) :
- `HRPG.CONFIG = { ... }`
  - `progression` (courbe XP)
  - `quests` (liste de quêtes)
  - `questTypes` (daily/weekly/oneShot…)
  - `shop` (items, coûts, effets)
  - `bosses` (hp, rewards)
  - `ui` (titres, textes)

---

## 6) Persistance localStorage (obligatoire)
- Une seule clé : `habitrpg.save`
- Le save est versionné :
  - `schemaVersion` (number)
  - `updatedAt` (ISO string)
  - `state` (object)

Règles :
- Toute action qui change l’état déclenche un `save()`.
- Si le save est invalide/corrompu : reset safe + message UI.
- Si `schemaVersion` ancien : migration automatique.

---

## 7) Style de code (simple et strict)
- Indentation : 2 espaces.
- Pas de code “magique”.
- Fonctions courtes (idéalement < 30 lignes).
- Nommage :
  - variables/fonctions : `camelCase`
  - constantes : `UPPER_SNAKE_CASE`
- Pas de logique métier dans les handlers DOM.
- Limiter les `querySelector` (mettre en cache dans `ui/dom.js`).
- Préférer des fonctions pures (sans effets de bord).

---

## 8) Règles de patch (important pour vibe coding)
Chaque ajout doit être livré en “petit patch” :
1) Qu’est-ce que ça ajoute (1 phrase)
2) Quels fichiers changent
3) Code complet des fichiers concernés
4) Comment tester (3 à 6 checks)

Interdits :
- Gros refactor sans besoin
- Mélange UI + logique + storage dans le même fichier
- Hardcode de valeurs qui devraient venir de `data.js`

---

## 9) Checklist de tests manuels (à faire à chaque patch)

### A) App démarre (Desktop)
- [ ] Ouvrir `index.html` : pas d’erreurs console.
- [ ] UI visible, boutons cliquables.

### B) Sauvegarde
- [ ] Faire une action (ex : cocher une quête).
- [ ] F5 : l’action est conservée.
- [ ] Fermer/rouvrir l’onglet : conservé.

### C) Quêtes
- [ ] Affichage de la liste depuis `data.js`.
- [ ] Compléter une quête : état cohérent.
- [ ] Titre long + emoji : UI ne casse pas.

### D) XP / niveaux (si présent)
- [ ] Gain XP : progression correcte.
- [ ] Pas de valeurs négatives (HP/GP/XP clampés à 0 min).

### E) Import/Export (si présent)
- [ ] Export : JSON valide.
- [ ] Import : restaure l’état.
- [ ] Import invalide : refuse proprement sans casser l’état actuel.

### F) Mode safe
- [ ] Save corrompu dans localStorage : l’app repart en mode safe + message clair.

### G) Test Android (Chrome)
- [ ] Ouvrir l’app sur Android : lisible sans zoom.
- [ ] Tout est utilisable au doigt (tap targets OK).
- [ ] Rien ne déborde de l’écran, scroll OK.
- [ ] Faire une action → fermer Chrome → rouvrir : état conservé.
- [ ] Mode paysage : utilisable.

### H) PWA (quand activée plus tard)
- [ ] “Ajouter à l’écran d’accueil” possible (manifest).
- [ ] Mode avion : l’app s’ouvre (service worker cache) + données OK.

---

## 10) Définition “Done”
Une fonctionnalité est “done” si :
- Elle est configurable via `data.js` (si c’est une règle de jeu).
- Elle persiste via `localStorage`.
- Elle respecte la séparation UI / logique / storage.
- Elle passe la checklist ci-dessus.

FIN.
