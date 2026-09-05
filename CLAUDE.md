# Ingenium

Site React + Vite, sans backend. Il fait deux choses reliées par un même
alphabet phonétique interne :

1. **Recherche d'un mot latin** (recherche libre + liste d'exemples) avec sa
   définition tirée en direct de l'API publique de Wiktionary.
2. **Évolution phonétique** de ce mot vers le français, étape par étape, via
   un moteur de règles regex maison (`Pattern`/`Replacement`/`Date` en CSV),
   avec bifurcation visuelle quand l'ordre des règles change le résultat —
   et son inverse : **reconstruction** d'ancêtres latins possibles à partir
   d'un mot phonétique français.

Tout tourne dans le navigateur : appels réseau directs à l'API Wiktionary
(CORS ouvert), pas de base de données, pas de clé API.

## Commandes

```bash
npm install
npm run dev      # serveur de dev Vite (http://localhost:5173)
npm run build    # build de prod
npm run preview  # sert le build de prod localement
```

Pas de lint ni de tests configurés pour l'instant.

## Architecture

```
src/
├── App.jsx / App.css         # page unique : recherche + définition +
│                              # évolution + reconstruction (styles bruts,
│                              # pas de framework CSS)
├── data/
│   ├── latinWords.js               # liste d'exemples de la page d'accueil
│   ├── dico_latin.csv              # mot latin -> forme marquée (ā, ĕ…)
│   ├── rules_latin_phonetic.csv    # orthographe latine -> phonétique de
│   │                                # départ + accent (règles "-inf")
│   ├── rulesStress.csv             # évolution phonétique vers le français
│   └── rulesSavoyard.csv           # évolution phonétique vers le savoyard
│                                    # (variante alternative, voir plus bas)
├── api/
│   └── wiktionary.js          # fetch REST (définitions) + opensearch
│                               # (suggestions de recherche)
├── engine/                    # moteur de règles, indépendant de l'UI
│   ├── csv.js                 # parseur CSV (guillemets, "" échappé)
│   ├── soundChange.js         # parseRules, groupRulesByDate,
│   │                          # buildChainTree (sens latin -> français)
│   ├── reverseRules.js        # buildReverseRules, buildReverseTree
│   │                          # (sens inverse, voir plus bas)
│   ├── latinEvolution.js      # charge + fusionne rules_latin_phonetic.csv
│   │                          # avec rulesStress.csv OU rulesSavoyard.csv
│   │                          # selon la variante ; attribue un `id` stable
│   ├── latinDictionary.js     # indexe dico_latin.csv (import dynamique,
│   │                          # ~1,4 Mo, chargé à la demande seulement)
│   ├── ipaToKirshenbaum.js    # conversion best-effort vers la notation
│   │                          # attendue par eSpeak-NG
│   └── pronounce.js           # synthèse vocale expérimentale (eSpeak-NG
│                               # en WASM, voir "Limites connues")
└── components/
    ├── SearchBox.jsx          # champ de recherche + suggestions (debounce)
    ├── DefinitionPanel.jsx    # affichage de la définition Wiktionary
    ├── EvolutionPanel.jsx     # section "latin -> français / savoyard"
    │                          # (sélecteur de variante, voir plus bas)
    ├── ReconstructionPanel.jsx # section "français -> latin" (son propre
    │                           # champ de saisie, indépendant du reste)
    ├── ChainTreeView.jsx      # rendu récursif de l'arbre (chemin unique
    │                          # ou bifurcation) — partagé par les deux sens
    ├── TransformArrow.jsx     # flèche entre deux mots, cliquable pour
    │                          # annuler/rétablir la règle correspondante
    └── WordNode.jsx           # un mot affiché + son bouton de prononciation
```

### Flux de données

**Sens direct (latin → français ou savoyard)** : `EvolutionPanel` cherche la
forme marquée du mot dans `dico_latin.csv` (`latinDictionary.js`) — ou
accepte une forme saisie manuellement (clavier de voyelles longues/brèves)
si le mot n'y est pas —, charge les règles fusionnées pour la variante
choisie (`latinEvolution.js#loadRules('french' | 'savoyard')`), puis
`soundChange.js#buildChainTree` produit un arbre. Les règles sont triées par
`Date` croissante ; à `Date` égale, tous les ordres possibles sont testés
(permutations, plafonné à 6 règles simultanées) — s'ils divergent, l'arbre
bifurque. `ChainTreeView` le restitue récursivement, `TransformArrow` permet
de désactiver une règle à la volée (l'arbre entier est recalculé). La
variante savoyarde bifurque beaucoup plus que la française : elle modélise
volontairement plusieurs devenirs régionaux documentés (Annecy, Val d'Arly,
Maurienne, Tarentaise…) comme des règles concurrentes de même `Date`, plutôt
qu'un seul résultat.

**Sens inverse (français → latin)** : `ReconstructionPanel` construit
d'abord un sous-ensemble **inversible sans ambiguïté** des mêmes règles
(`reverseRules.js#buildReverseRules` — seules les règles à Pattern
littéral, sans rétro-référence, sont retenues ; ~96 sur 301 actuellement),
triées par `Date` décroissante, puis `buildReverseTree` remonte le mot en
bifurquant chaque fois qu'une suppression littérale ancrée pourrait avoir
eu lieu ou non (« réinséré » vs « pas réinséré »). Bifurcation beaucoup plus
fréquente qu'à l'aller — c'est attendu, pas un bug.

### Format des CSV de règles

Colonnes `Pattern,Replacement,Explanation,Date` :

- `Pattern` : regex JavaScript (compilée avec le flag `g`, donc appliquée à
  toutes les occurrences, pas seulement la première).
- `Replacement` : rétro-références à la façon Perl/Python (`\1`, `\2`…),
  converties en `$1`, `$2`… par `soundChange.js#toJsReplacement` avant
  d'être passées à `String.replace`.
- `Date` : `-inf` (ou un nombre) ; sert à trier ET à regrouper les règles
  simultanées pour la détection de bifurcation.

Une règle dont le `Pattern` ne compile pas en regex JS valide est ignorée
silencieusement (une du jeu actuel : `(?)`, ligne invalide héritée de
`rulesStress.csv` et présente aussi dans `rulesSavoyard.csv`) plutôt que de
faire planter le calcul.

## Limites connues

- **Prononciation (`engine/pronounce.js`, bouton 🔊)** : expérimentale et
  **non testée en conditions réelles** (écrite dans un environnement sans
  accès au registre npm ni lecture audio). Utilise `eSpeak-NG` compilé en
  WASM (paquet `espeak-ng`, ~18 Mo, chargé à la demande) via sa syntaxe de
  phonèmes bruts `[[...]]` en notation Kirshenbaum — pas de l'IPA standard.
  Voir le README (section « Prononciation ») pour la checklist de debug si
  ça ne marche pas.
- **Version de `@vitejs/plugin-react` figée à `^6.0.5`** : nécessaire pour
  être compatible avec `vite@^8.2.0` (peer dependency). Ne pas redescendre
  sans aussi redescendre `vite`.
- Certains résidus non convertis peuvent apparaître dans les mots générés
  (voyelles marquées absentes de `rules_latin_phonetic.csv`, majuscules de
  noms propres non traitées) — pas un bug du moteur de règles en tant que
  tel, plutôt une limite de couverture des CSV de données.
- **`rulesSavoyard.csv`** : reconstitution best-effort à partir d'un seul
  article de synthèse (Wikipédia, section « Particularités dialectales du
  savoyard »), pas d'une grammaire historique complète. C'est une copie de
  `rulesStress.csv` où seuls les points de divergence documentés (C+A latin,
  C+I,E latin, groupe ST latin, Ŭ bref latin) ont été remplacés par des
  règles concurrentes de même `Date` (une par variante régionale citée) ;
  tout le reste du cheminement phonétique reste identique au français, faute
  de source sur le sujet. Les traits purement lexicaux/morphologiques
  mentionnés dans l'article (pronom *dje*, jours de la semaine inversés…) ne
  sont pas modélisables comme des règles regex générales et n'y figurent
  donc pas.
