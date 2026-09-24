# Ingenium

Site React + Vite, sans backend. Il fait deux choses reliées par un même
alphabet phonétique interne :

1. **Recherche d'un mot latin** (recherche libre + liste d'exemples) avec sa
   définition tirée en direct de l'API publique de Wiktionary.
2. **Évolution phonétique** de ce mot vers le français, étape par étape, via
   un moteur de règles maison écrites en notation linguistique
   (`A > B / L _ R`, voir plus bas), avec bifurcation visuelle quand l'ordre
   des règles change le résultat — et son inverse : **reconstruction**
   d'ancêtres latins possibles à partir d'un mot phonétique français.

Tout tourne dans le navigateur : appels réseau directs à l'API Wiktionary
(CORS ouvert), pas de base de données, pas de clé API.

## Commandes

```bash
npm install
npm run dev      # serveur de dev Vite (http://localhost:5173)
npm run build    # build de prod
npm run preview  # sert le build de prod localement
npm test         # node --test, aucune dépendance (voir test/engine.test.js)
```

Pas de lint configuré.

## Architecture

```
src/
├── App.jsx / App.css         # page unique : recherche + définition +
│                              # évolution + reconstruction (styles bruts,
│                              # pas de framework CSS)
├── data/
│   ├── latinWords.js              # liste d'exemples de la page d'accueil
│   ├── dico_latin.csv             # mot latin -> forme marquée (ā, ĕ…)
│   ├── classes.csv                # classes nommées (V, C, C_SANS_L…)
│   ├── rulesLatinPhonetic.csv     # orthographe latine -> phonétique de
│   │                               # départ + accent (21 règles, Date -inf)
│   ├── rulesFrench.csv            # évolution phonétique vers le français
│   │                               # (281 règles)
│   └── rulesIndoEuropean.csv      # table de correspondances indo-européen ->
│                                   # 19 langues, tirée de Wikipédia. Fichier
│                                   # de RÉFÉRENCE seul, pas branché au moteur
│                                   # (ancien format Pattern/Replacement)
├── api/
│   └── wiktionary.js          # fetch REST (définitions) + opensearch
│                               # (suggestions de recherche)
├── engine/                    # moteur de règles, indépendant de l'UI
│   ├── csv.js                 # parseur CSV (guillemets, "" échappé)
│   ├── ruleSyntax.js          # LE format : parseSequence, compileRule,
│   │                          # parseDeclarativeRules, parseClasses —
│   │                          # compile A > B / L _ R en regex
│   ├── soundChange.js         # computeChain, groupRulesByDate,
│   │                          # buildChainTree (sens latin -> français)
│   ├── reverseRules.js        # buildReverseRules, buildReverseTree
│   │                          # (sens inverse, voir plus bas)
│   ├── latinEvolution.js      # charge classes.csv + les deux jeux de règles,
│   │                          # les fusionne et attribue un `id` stable
│   ├── latinDictionary.js     # indexe dico_latin.csv (import dynamique,
│   │                          # ~1,4 Mo, chargé à la demande seulement)
│   ├── ipaToKirshenbaum.js    # conversion best-effort vers la notation
│   │                          # attendue par eSpeak-NG
│   └── pronounce.js           # synthèse vocale expérimentale (eSpeak-NG
│                               # en WASM, voir "Limites connues")
├── components/
│   ├── SearchBox.jsx          # champ de recherche + suggestions (debounce)
│   ├── DefinitionPanel.jsx    # affichage de la définition Wiktionary
│   ├── EvolutionPanel.jsx     # section "latin -> français"
│   ├── ReconstructionPanel.jsx # section "français -> latin" (son propre
│   │                           # champ de saisie, indépendant du reste)
│   ├── ChainTreeView.jsx      # rendu récursif de l'arbre (chemin unique
│   │                          # ou bifurcation) — partagé par les deux sens
│   ├── TransformArrow.jsx     # flèche entre deux mots, cliquable pour
│   │                          # annuler/rétablir la règle correspondante
│   └── WordNode.jsx           # un mot affiché + son bouton de prononciation
└── ../test/engine.test.js     # 44 tests, `npm test`
```

## Format des règles

Les règles s'écrivent comme en linguistique historique : **`A > B / L _ R`**,
« A devient B quand il y a L avant et R après ». Colonnes du CSV :

| colonne | rôle |
|---|---|
| `Target` | la cible, ce qui change (vide = **insertion**) |
| `Result` | ce que ça devient (vide = **effacement**) |
| `Left` | ce qui doit précéder, **sans être modifié** |
| `Right` | ce qui doit suivre, sans être modifié |
| `Condition` | contrainte sur le mot entier (`syllables>1`) |
| `Regex` | échappatoire : regex brute, court-circuite tout le reste |
| `Explanation`, `Date` | comme avant |

Le contexte est **vérifié mais jamais consommé** : c'est ce qui rend les
rétro-références inutiles (`Result` est une chaîne littérale) et l'inversion
mécanique.

Syntaxe de `Target` / `Left` / `Right` :

```
a ɛ k̬      un symbole littéral (les diacritiques combinants se collent au
           caractère précédent : "k̬" est un seul élément)
V C        une classe nommée, définie dans classes.csv. Deux classes
           accolées doivent être séparées par une espace : "V C", pas "VC"
           (qui serait lu comme une classe nommée "VC")
{a,b,C}    une alternative ; chaque branche peut être une séquence,
           ex. "{C? r? V, #}"
( … )      un groupe, pour porter un quantificateur ou une négation
#          une frontière de mot (début dans Left, fin dans Right)
X? X+ X*   élément optionnel / répété
!X         négation : X ne doit PAS se trouver à cette position.
           Pour nier une séquence, la grouper : "!(C_SANS_L SON)"
```

`classes.csv` (colonnes `Name`, `Members`, `Comment`) définit les classes une
seule fois. Une classe dont un membre fait plusieurs caractères (`VL` =
`aː eː iː oː uː`) est compilée en alternative et non en classe de caractères.
Les trois variantes `C_SANS_L`, `C_SANS_R`, `C_SANS_BTD` sont **voulues**, pas
des coquilles : chacune correspond à une contrainte documentée (premier membre
des groupes consonne+sonante, amuïssement « other than r », centrale de trois
consonnes).

`Date` sert à trier ET à regrouper les règles simultanées pour la détection de
bifurcation. Les règles de `rulesLatinPhonetic.csv` sont toutes datées `-inf`
et marquées `sequential` au chargement : ce n'est pas un jeu de changements
concurrents mais une passe de transcription ordonnée, où une règle rend la
suivante applicable (l'accent ne peut se poser qu'une fois `ă`/`ĕ` transcrits).
`buildChainTree` les applique donc dans l'ordre du fichier, sans permutation.

Trois règles de `rulesFrench.csv` restent en colonne `Regex` : elles
**déplacent** un élément au lieu de le transformer (l'accent est recopié
ailleurs) ou décrivent une gémination — `A > B / L _ R` ne sait pas dire ça.

### Flux de données

**Sens direct** : `EvolutionPanel` cherche la forme marquée du mot dans
`dico_latin.csv` — ou accepte une forme saisie manuellement (clavier de
voyelles longues/brèves) si le mot n'y est pas —, charge les règles fusionnées
(`latinEvolution.js#loadRules`), puis `soundChange.js#buildChainTree` produit
un arbre. Les règles sont triées par `Date` croissante ; à `Date` égale, tous
les ordres possibles sont testés (permutations, plafonné à 6 règles
simultanées) — s'ils divergent, l'arbre bifurque. `ChainTreeView` le restitue
récursivement, `TransformArrow` permet de désactiver une règle à la volée.

L'ensemble des règles candidates d'un groupe (`candidateRules`) ne se limite
pas à celles qui mordent sur le mot **à l'entrée** du groupe : une règle peut
n'avoir de prise qu'une fois qu'une de ses sœurs a agi (elle est « nourrie »).
Le filtre est donc itéré jusqu'à stabilité, sur le mot d'entrée *et* sur le mot
obtenu après les candidates déjà retenues. Chaque candidate garde ensuite **un
seul tour** : une règle ne boucle pas à l'intérieur d'un groupe. Conséquence à
garder en tête : l'arbre peut proposer plusieurs mots là où la chaîne linéaire,
qui suit l'ordre du fichier, n'en donne qu'un — ce qu'on exige, c'est que le
mot de la chaîne figure **parmi** les branches (2,5 branches en moyenne sur les
30 mots de référence, 7 au pire).

**Sens inverse** : l'inverse de `A > B / L _ R` est `B > A / L _ R`, donc
`reverseRules.js#buildReverseRules` échange simplement `Target` et `Result` et
laisse le compilateur produire la regex — **281 des 302 règles sont
inversibles**. Quand la cible est une alternative (`{b,w} > β`), il produit une
règle inverse par membre : deux sons ont fusionné, donc deux ancêtres sont
possibles. Un effacement devient une restitution *hypothétique* (l'arbre
propose « restitué » et « rien à restituer ici »), une insertion devient une
suppression certaine. Bifurcation beaucoup plus fréquente qu'à l'aller — c'est
attendu, pas un bug.

## Limites connues

- **Qualité de la reconstruction inverse** : le mécanisme est juste mais le
  résultat n'est pas encore exploitable — sur les 30 mots de référence,
  **aucun ne retrouve sa forme latine**. Les restitutions s'appliquent
  globalement (une seule application insère à tous les sites qui s'y prêtent)
  et se nourrissent les unes les autres : le `s` restitué crée un site pour le
  `f`, etc. Un budget de 2 restitutions par chemin
  (`buildReverseTree(..., { maxRestorations })`) empêche l'emballement complet.
  Le levier suivant serait de restituer **une position à la fois** et de
  classer les branches par plausibilité, plutôt que d'explorer gloutonnement.
- **Deux mots sur 30 n'atteignent pas leur cible** : `tēctŭ` donne `twat` au
  lieu de `twa` (le t final devrait tomber) et `vĭncĕre` donne `vɑ̃ẽ̯nʀ` au
  lieu de `vɛ̃kʀ`. Figés dans `ECARTS_CONNUS` (test/engine.test.js).
- **Prononciation (`engine/pronounce.js`, bouton 🔊)** : expérimentale et
  **non testée en conditions réelles** (écrite dans un environnement sans
  accès au registre npm ni lecture audio). Utilise `eSpeak-NG` compilé en
  WASM (paquet `espeak-ng`, ~18 Mo, chargé à la demande) via sa syntaxe de
  phonèmes bruts `[[...]]` en notation Kirshenbaum — pas de l'IPA standard.
  Voir le README (section « Prononciation ») pour la checklist de debug.
- **Version de `@vitejs/plugin-react` figée à `^6.0.5`** : nécessaire pour
  être compatible avec `vite@^8.2.0` (peer dependency). Ne pas redescendre
  sans aussi redescendre `vite`.
- Certains résidus non convertis peuvent apparaître dans les mots générés
  (voyelles marquées absentes de `rulesLatinPhonetic.csv`, majuscules de noms
  propres non traitées) — limite de couverture des données, pas du moteur.
- **La sortie du moteur n'est pas normalisée en Unicode** : `ẽ` y est un `e`
  suivi du tilde combinant, pas le caractère précomposé U+1EBD. Une valeur
  attendue tapée à la main peut donc différer d'une chaîne visuellement
  identique — les écrire en échappements `\u` dans les tests.

## Fichiers hérités

`rulesStress.csv`, `rules_latin_phonetic.csv` et `rulesSavoyard.csv` sont les
anciens jeux de règles au format regex `Pattern`/`Replacement`. Plus personne
ne les lit : les deux premiers ont été convertis (conversion vérifiée règle par
règle sur un corpus de formes réelles), la variante savoyarde a été abandonnée.
Ils ne sont gardés que le temps de confirmer la bascule et peuvent être
supprimés.
