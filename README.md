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
forme évoluée en français à partir de `src/data/rulesStress.csv` (voir
ci-dessous), avec le détail des étapes appliquées.

## Moteur d'évolution phonétique

`src/engine/` contient un petit moteur de règles indépendant de l'UI :

- `src/data/dico_latin.csv` associe un mot latin (`entries_for_search`, non
  accentué) à sa forme avec voyelles longues/brèves marquées (`entries`,
  ex. `ingĕnĭum`) — nécessaire car les premières règles du fichier ci-dessous
  convertissent justement ā/ă/ē/ĕ/ī/ĭ/ō/ŏ/ū/ŭ en symboles phonétiques.
- `src/data/rulesStress.csv` liste des règles `Pattern` (regex) → `Replacement`
  (avec rétro-références `\1`, `\2`…), chacune datée (`Date`, `-inf` en
  premier). Les règles sont triées par Date croissante puis appliquées une à
  une : si le Pattern est trouvé dans le mot courant, le Replacement est
  substitué **partout où il matche** (pas seulement à la première occurrence
  — un changement phonétique s'applique à tout le mot) et le résultat devient
  le mot courant pour la règle suivante.
- `src/engine/csv.js` — parseur CSV (guillemets, `""` échappé).
- `src/engine/soundChange.js` — `parseRules()` / `applyRules()` : le moteur
  générique, convertit aussi `\1`→`$1` pour `String.replace`. Une règle dont
  le Pattern n'est pas une regex JS valide est ignorée silencieusement plutôt
  que de faire planter le calcul (une règle du CSV actuel, `(?)`, est dans ce
  cas).
- `src/engine/latinDictionary.js` — indexe `dico_latin.csv` (chargé à la
  demande via import dynamique, pour ne pas alourdir le bundle initial).
- `src/engine/latinEvolution.js` — relie les deux : `evolveLatinWord(mot)`.

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
│   │   ├── latinWords.js        # liste d'exemples proposée sur l'accueil
│   │   ├── dico_latin.csv       # mot -> forme marquée (ā, ă…)
│   │   └── rulesStress.csv      # règles d'évolution phonétique (Pattern/Replacement/Date)
│   ├── api/wiktionary.js        # client REST (définitions) + opensearch (suggestions)
│   ├── engine/                  # moteur d'évolution phonétique (voir plus bas)
│   └── components/
│       ├── SearchBox.jsx        # champ de recherche libre
│       ├── DefinitionPanel.jsx  # affichage de la définition
│       └── EvolutionPanel.jsx   # affichage de l'évolution phonétique
├── public/
└── docs/
```

## Démarrage

```bash
npm install
npm run dev
```

Puis ouvrir l'URL affichée par Vite (http://localhost:5173 par défaut).

## Notes

- API utilisée : `https://en.wiktionary.org/api/rest_v1/page/definition/{mot}`
  (endpoint public, CORS ouvert, appelé directement depuis le navigateur).
- Si un mot n'a pas de section latine sur Wiktionary, un message d'erreur
  s'affiche avec un lien direct vers la page Wiktionary.
- Pour ajouter/retirer des mots proposés sur l'accueil, modifier
  `src/data/latinWords.js`.
