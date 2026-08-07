# Ingenium

*ingenium, -iī* (n.) — talent naturel, ingéniosité, dispositif ; en latin médiéval : machine, engin. Racine de l'anglais *engine* et du français *ingénieux*.

## Description

Site web / outil (React + Vite) versionné avec git.

La page d'accueil permet de chercher n'importe quel mot latin (champ de
recherche avec suggestions) ou d'en choisir un dans une liste d'exemples
pré-sélectionnée. Dans les deux cas, la définition (section latine) est
récupérée en direct depuis l'API publique de Wiktionary — aucun backend,
aucune base de données locale.

Les suggestions combinent les mots de la liste d'exemples (correspondance
locale immédiate) et l'API `opensearch` de Wiktionary (titres de pages
commençant par ce qui est tapé, avec un léger debounce). Ces suggestions
réseau ne sont pas filtrées par langue : sélectionner l'une d'elles peut
mener à un mot sans section latine, auquel cas le message d'erreur habituel
s'affiche avec un lien vers la page Wiktionary.

Quand un mot est trouvé, une section « Évolution phonétique » calcule sa
forme évoluée en français, mot intermédiaire par mot intermédiaire, avec une
flèche cliquable entre chacun pour annuler (ou rétablir) la règle
correspondante — la suite se recalcule automatiquement. Chaque mot affiché
a aussi un bouton 🔊 expérimental pour tenter une prononciation (voir
« Prononciation (expérimental) » ci-dessous).

## Moteur d'évolution phonétique

`src/engine/` contient un petit moteur de règles indépendant de l'UI :

- `src/data/dico_latin.csv` associe un mot latin (`entries_for_search`, non
  accentué) à sa forme avec voyelles longues/brèves marquées (`entries`,
  ex. `ingĕnĭum`) — nécessaire car `rules_latin_phonetic.csv` convertit
  justement ā/ă/ē/ĕ/ī/ĭ/ō/ŏ/ū/ŭ en symboles phonétiques.
- `src/data/rules_latin_phonetic.csv` (conversion orthographe latine →
  réalisation phonétique de départ + accent) et `src/data/rulesStress.csv`
  (évolution vers le français) listent des règles `Pattern` (regex) →
  `Replacement` (avec rétro-références `\1`, `\2`…), chacune datée (`Date`,
  `-inf` en premier). Les deux fichiers sont fusionnés et triés par Date
  croissante, puis les règles sont appliquées une à une : si le Pattern est
  trouvé dans le mot courant, le Replacement est substitué **partout où il
  matche** (pas seulement à la première occurrence) et le résultat devient
  le mot courant pour la règle suivante.
- Quand plusieurs règles partagent la même Date, leur ordre n'est pas défini
  a priori : le moteur teste tous les ordres possibles (jusqu'à 6 règles
  simultanées) ; s'ils divergent, la chaîne se divise en plusieurs branches
  affichées côte à côte.
- `src/engine/csv.js` — parseur CSV (guillemets, `""` échappé).
- `src/engine/soundChange.js` — `parseRules()`, `groupRulesByDate()` et
  `buildChainTree()` : le moteur générique (arbre de dérivation avec
  bifurcations), convertit aussi `\1`→`$1` pour `String.replace`. Une règle
  dont le Pattern n'est pas une regex JS valide est ignorée silencieusement
  plutôt que de faire planter le calcul (une règle du CSV actuel, `(?)`, est
  dans ce cas).
- `src/engine/latinDictionary.js` — indexe `dico_latin.csv` (chargé à la
  demande via import dynamique, pour ne pas alourdir le bundle initial).
- `src/engine/latinEvolution.js` — charge et fusionne les deux CSV de règles,
  avec un `id` stable par règle (utilisé pour l'annulation dans l'UI).

## Structure

```
ingenium/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx
│   ├── App.jsx / App.css
│   ├── data/
│   │   ├── latinWords.js             # liste d'exemples proposée sur l'accueil
│   │   ├── dico_latin.csv            # mot -> forme marquée (ā, ă…)
│   │   ├── rules_latin_phonetic.csv  # latin -> phonétique de départ + accent
│   │   └── rulesStress.csv           # évolution phonétique vers le français
│   ├── api/wiktionary.js        # client REST (définitions) + opensearch (suggestions)
│   ├── engine/                  # moteur d'évolution phonétique + prononciation (voir plus bas)
│   └── components/
│       ├── SearchBox.jsx        # champ de recherche libre
│       ├── DefinitionPanel.jsx  # affichage de la définition
│       ├── EvolutionPanel.jsx   # affichage de l'évolution phonétique
│       ├── ChainTreeView.jsx    # rendu récursif de l'arbre (chemin unique / bifurcation)
│       ├── TransformArrow.jsx   # flèche entre deux mots, cliquable pour annuler la règle
│       └── WordNode.jsx         # un mot affiché, avec son bouton de prononciation
├── public/
└── docs/
```

## Démarrage

```bash
npm install
npm run dev
```

Puis ouvrir l'URL affichée par Vite (http://localhost:5173 par défaut).

## Prononciation (expérimental)

Chaque mot affiché a un bouton 🔊 qui tente une synthèse vocale via
**eSpeak-NG compilé en WebAssembly** (paquet npm `espeak-ng`, ~18 Mo,
téléchargé à la demande au premier clic — pas de backend, pas de clé API).

**Cette fonctionnalité n'a pas pu être testée** dans l'environnement où elle
a été écrite (pas d'accès au registre npm pour installer le paquet, pas de
lecture audio possible). Avant de creuser un problème, vérifier dans cet
ordre :

1. `npm install` a bien téléchargé `node_modules/espeak-ng`.
2. Le premier clic sur 🔊 déclenche bien un téléchargement réseau (~18 Mo)
   dans l'onglet Network des devtools — sinon le module ne se charge pas.
3. Les erreurs dans la console : `src/engine/pronounce.js` logue l'erreur
   complète (`console.warn`) à chaque échec.

Pourquoi ce n'est qu'une approximation, même si ça fonctionne techniquement :

- Les mots générés sont dans l'alphabet phonétique **interne** de ce projet
  (pas rattaché à une langue précise), pas dans l'IPA standard à 100 %. Le
  moteur eSpeak-NG ne prend pas l'IPA en entrée directement, seulement sa
  propre notation **Kirshenbaum** (ASCII-IPA) via la syntaxe `[[...]]`.
  `src/engine/ipaToKirshenbaum.js` fait cette conversion, sur la base de la
  table officielle : <https://github.com/espeak-ng/espeak-ng/blob/master/docs/phonemes/kirshenbaum.md>.
- Certains symboles utilisés dans les CSV de règles sont propres à ce projet
  (ex. le `̬` qui marque une palatalisation *en cours*, censé disparaître
  avant la fin de la chaîne) ou sont des résidus non convertis (voyelles
  marquées absentes de `rules_latin_phonetic.csv`, majuscules de noms
  propres). Le convertisseur les abandonne silencieusement plutôt que de
  planter, donc le rendu peut perdre en fidélité sur ces mots-là.
- `src/engine/pronounce.js` relance une instance eSpeak-NG à chaque clic
  (pas d'API haut niveau de type `speak(texte)` dans ce paquet) : chaque
  lecture peut donc être lente. Une piste d'amélioration si ça marche mais
  que c'est trop lent : garder l'instance en mémoire et l'appeler plusieurs
  fois au lieu d'en recréer une à chaque fois (à vérifier si ce paquet le
  permet).

## Notes

- API utilisée : `https://en.wiktionary.org/api/rest_v1/page/definition/{mot}`
  (endpoint public, CORS ouvert, appelé directement depuis le navigateur).
- Si un mot n'a pas de section latine sur Wiktionary, un message d'erreur
  s'affiche avec un lien direct vers la page Wiktionary.
- Pour ajouter/retirer des mots proposés sur l'accueil, modifier
  `src/data/latinWords.js`.
