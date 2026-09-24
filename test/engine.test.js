// Tests du moteur de transformation phonétique (src/engine/).
// Lancer avec : npm test    (équivaut à `node --test`)
//
// Trois familles de tests :
//
// 1. Tests unitaires sur des jeux de règles synthétiques minuscules, écrits à
//    la main : ils décrivent ce que le moteur est censé faire (ordre
//    chronologique, application globale, bifurcation, inversion), plus la
//    compilation du format déclaratif A > B / L _ R (ruleSyntax.js).
// 2. Tests de non-régression sur les vraies données (src/data/*.csv) : les
//    valeurs attendues ont été CAPTURÉES sur le moteur actuel, elles ne sont
//    pas des résultats linguistiquement validés. Leur rôle est de figer le
//    comportement existant : si une de ces valeurs bouge, c'est un changement
//    de comportement à assumer explicitement, pas forcément une régression.
// 3. Aboutissements français attendus : à l'inverse, ces valeurs-là sont des
//    objectifs linguistiques, pas des captures. Elles disent où le moteur
//    devrait arriver, et 2 mots sur 30 n'y sont pas encore.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { parseCsvObjects } from '../src/engine/csv.js'
import { compileRule, parseClasses, parseDeclarativeRules, parseSequence } from '../src/engine/ruleSyntax.js'
import {
  parseRules,
  applyRules,
  computeChain,
  brokenRules,
  groupRulesByDate,
  buildChainTree,
} from '../src/engine/soundChange.js'
import { buildReverseRules, buildReverseTree } from '../src/engine/reverseRules.js'
import { buildSegments, destinationsFrom, walk } from '../src/engine/languageGraph.js'

// --- utilitaires ------------------------------------------------------------

const HEADER = '"Pattern","Replacement","Explanation","Date"'

/** Construit un jeu de règles depuis des lignes CSV brutes, avec des `id`. */
function rulesFrom(...lines) {
  return parseRules([HEADER, ...lines].join('\n')).map((rule, i) => ({ ...rule, id: i }))
}

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8')

const realClasses = parseClasses(parseCsvObjects(read('../src/data/classes.csv')))

/**
 * Reproduit latinEvolution.js#loadRules sans passer par Vite (le module de
 * l'app importe les CSV avec la syntaxe `?raw`, que Node ne sait pas résoudre).
 */
function loadRealRules() {
  const phonetic = parseDeclarativeRules(read('../src/data/rulesLatinPhonetic.csv'), realClasses)
    .map((rule) => ({ ...rule, sequential: true }))
  return [...phonetic, ...parseDeclarativeRules(read('../src/data/rulesFrench.csv'), realClasses)]
    .sort((a, b) => a.date - b.date)
    .map((rule, i) => ({ ...rule, id: i }))
}

/** Mots finaux de toutes les branches de l'arbre, dans l'ordre de parcours. */
function leafWords(tree) {
  const words = []
  ;(function walk(node) {
    if (!node) return
    if (node.isLeaf) {
      words.push(node.word)
      return
    }
    if (node.forked) node.branches.forEach((branch) => walk(branch.next))
    else walk(node.next)
  })(tree)
  return words
}

// --- 1. parseur CSV ---------------------------------------------------------

describe('csv', () => {
  it('garde les virgules situées à l\'intérieur d\'un champ cité', () => {
    const rows = parseCsvObjects('"Pattern","Explanation"\n"a","b, c"')
    assert.equal(rows[0].Explanation, 'b, c')
  })

  it('déséchappe les guillemets doublés', () => {
    const rows = parseCsvObjects('"Pattern","Explanation"\n"a","dit ""bonjour"""')
    assert.equal(rows[0].Explanation, 'dit "bonjour"')
  })
})

// --- 2. lecture des règles --------------------------------------------------

describe('parseRules', () => {
  it('trie les règles par Date croissante', () => {
    const rules = rulesFrom('"a","b","tardive","200"', '"c","d","précoce","100"')
    assert.deepEqual(
      rules.map((r) => r.explanation),
      ['précoce', 'tardive'],
    )
  })

  it('place les règles datées -inf avant les règles datées', () => {
    const rules = rulesFrom('"a","b","datée","0"', '"c","d","originelle","-inf"')
    assert.equal(rules[0].explanation, 'originelle')
    assert.equal(rules[0].date, -Infinity)
  })

  it('retient une règle dont le Pattern n\'est pas une regex valide, mais sans regex', () => {
    const rules = rulesFrom('"(?","x","cassée","0"')
    assert.equal(rules.length, 1)
    assert.equal(rules[0].regex, null)
    assert.deepEqual(brokenRules(rules), rules)
  })

  it('traite une Date non numérique comme 0', () => {
    const rules = rulesFrom('"a","b","sans date",""')
    assert.equal(rules[0].date, 0)
  })
})

// --- 3. écriture du remplacement -------------------------------------------

describe('remplacement', () => {
  it('convertit les rétro-références \\1 en $1', () => {
    const rules = rulesFrom('"(a)b","\\1\\1","doublement","0"')
    assert.equal(applyRules('ab', rules).result, 'aa')
  })

  it('traite un $ du Replacement comme un caractère littéral', () => {
    const rules = rulesFrom('"a","$&","dollar littéral","0"')
    assert.equal(applyRules('a', rules).result, '$&')
  })
})

// --- 4. application de la chaîne -------------------------------------------

describe('computeChain', () => {
  it('applique une règle à toutes les occurrences, pas seulement la première', () => {
    const rules = rulesFrom('"a","b","a>b","0"')
    assert.equal(computeChain('aaa', rules).result, 'bbb')
  })

  it('enchaîne les règles dans l\'ordre chronologique (la suivante voit le résultat de la précédente)', () => {
    const rules = rulesFrom('"a","b","a>b","1"', '"b","c","b>c","2"')
    const { result, timeline } = computeChain('a', rules)
    assert.equal(result, 'c')
    assert.deepEqual(
      timeline.map((step) => [step.before, step.after]),
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    )
  })

  it('n\'affiche pas dans la chronologie les règles sans effet sur le mot', () => {
    const rules = rulesFrom('"a","b","applicable","0"', '"z","y","inapplicable","1"')
    const { timeline } = computeChain('a', rules)
    assert.equal(timeline.length, 1)
    assert.equal(timeline[0].explanation, 'applicable')
  })

  it('montre une règle désactivée sans la laisser modifier le mot', () => {
    const rules = rulesFrom('"a","b","annulée","0"')
    const { result, timeline } = computeChain('a', rules, new Set([rules[0].id]))
    assert.equal(result, 'a')
    assert.equal(timeline[0].disabled, true)
    assert.equal(timeline[0].after, 'b') // ce qu'elle aurait produit
  })
})

// --- 5. regroupement par date ----------------------------------------------

describe('groupRulesByDate', () => {
  it('regroupe les règles partageant la même Date', () => {
    const rules = rulesFrom('"a","b","","100"', '"c","d","","100"', '"e","f","","200"')
    assert.deepEqual(
      groupRulesByDate(rules).map((group) => group.length),
      [2, 1],
    )
  })
})

// --- 6. arbre de dérivation -------------------------------------------------

describe('buildChainTree', () => {
  it('ne bifurque pas quand les règles simultanées ne se marchent pas dessus', () => {
    // a>x et c>y portent sur des caractères disjoints : tous les ordres convergent.
    const rules = rulesFrom('"a","x","a>x","100"', '"c","y","c>y","100"')
    const tree = buildChainTree('ac', rules)
    assert.equal(tree.forked, false)
    assert.deepEqual(leafWords(tree), ['xy'])
  })

  it('bifurque quand l\'ordre des règles simultanées change le résultat', () => {
    // Sur "abc" : ab>x laisse "xc" (bc ne s'applique plus), bc>y laisse "ay".
    const rules = rulesFrom('"ab","x","ab>x","100"', '"bc","y","bc>y","100"')
    const tree = buildChainTree('abc', rules)
    assert.equal(tree.forked, true)
    assert.deepEqual(leafWords(tree).sort(), ['ay', 'xc'])
  })

  it('retient une règle nourrie par une sœur du même groupe daté', () => {
    // Sur "ac", "bc>x" ne mord pas d'emblée : c'est "a>b" qui lui fabrique son
    // contexte. L'ancien filtre, calculé une fois à l'entrée du groupe,
    // l'écartait définitivement et "x" était inatteignable.
    const rules = rulesFrom('"a","b","a>b","100"', '"bc","x","bc>x","100"')
    const branches = leafWords(buildChainTree('ac', rules))
    assert.ok(branches.includes('x'), branches.join(' | '))
    // l'ordre inverse reste possible : bc>x passe son tour, seul a>b agit
    assert.ok(branches.includes('bc'), branches.join(' | '))
  })

  it('applique un groupe séquentiel dans l\'ordre, y compris les règles nourries par leurs voisines', () => {
    // "b>c" ne devient applicable qu'une fois "a>b" passée : sans le marqueur
    // `sequential`, elle serait écartée du groupe et jamais appliquée.
    const rules = rulesFrom('"a","b","a>b","-inf"', '"b","c","b>c","-inf"')
      .map((rule) => ({ ...rule, sequential: true }))
    assert.deepEqual(leafWords(buildChainTree('a', rules)), ['c'])
  })

  it('signale les règles désactivées dans `cancelled` sans créer de branche', () => {
    const rules = rulesFrom('"a","b","annulée","100"')
    const tree = buildChainTree('a', rules, new Set([rules[0].id]))
    assert.equal(tree.cancelled.length, 1)
    assert.equal(tree.cancelled[0].wouldBe, 'b')
    assert.deepEqual(leafWords(tree), ['a'])
  })

  it('renonce à tester les ordres au-delà de 6 règles simultanées', () => {
    const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const rules = rulesFrom(...letters.map((l) => `"${l}","${l.toUpperCase()}","${l}","100"`))
    const tree = buildChainTree('abcdefg', rules)
    assert.equal(tree.tooManySimultaneous, true)
    assert.equal(tree.forked, false)
    assert.deepEqual(leafWords(tree), ['ABCDEFG'])
  })

  it('tronque la bifurcation quand le budget de branches est épuisé', () => {
    const rules = rulesFrom('"ab","x","ab>x","100"', '"bc","y","bc>y","100"')
    const tree = buildChainTree('abc', rules, new Set(), { maxExtraBranches: 0 })
    assert.equal(tree.forked, false)
    assert.equal(tree.truncatedFork, true)
    assert.equal(leafWords(tree).length, 1)
  })
})

// --- 7. inversion des règles ------------------------------------------------

describe('buildReverseRules', () => {
  const classes = parseClasses([{ Name: 'V', Members: 'a e o u i' }, { Name: 'C', Members: 'p t k b d' }])
  const DECL_HEADER = '"Target","Result","Left","Right","Condition","Regex","Explanation","Date"'
  /** Construit des règles déclaratives depuis des lignes CSV, avec des `id`. */
  const declarativeFrom = (...lines) =>
    parseDeclarativeRules([DECL_HEADER, ...lines].join('\n'), classes).map((rule, i) => ({ ...rule, id: i }))

  it('inverse une règle en échangeant simplement Target et Result', () => {
    const reverse = buildReverseRules(declarativeFrom('"oe","e","","","","","oe>e","0"'), classes)
    assert.equal(reverse.length, 1)
    assert.equal(reverse[0].kind, 'substitute')
    assert.equal('ke'.replace(reverse[0].regex, reverse[0].replacement), 'koe')
  })

  it('garde le contexte du sens aller, qui reste valide en sens inverse', () => {
    // b > β / V _ V  s'inverse en  β > b / V _ V
    const reverse = buildReverseRules(declarativeFrom('"b","β","V","V","","","b intervocalique","0"'), classes)
    assert.equal('aβa kβa'.replace(reverse[0].regex, reverse[0].replacement), 'aba kβa')
  })

  it('produit une origine possible par membre quand la cible est une alternative', () => {
    // {b,w} > β : deux sons ont fusionné, donc deux ancêtres possibles
    const reverse = buildReverseRules(declarativeFrom('"{b,w}","β","","","","","b, w > β","0"'), classes)
    assert.deepEqual(reverse.map((r) => r.replacement).sort(), ['b', 'w'])
  })

  it('renonce quand la cible est une classe trop vaste (rien à restituer de sûr)', () => {
    const rules = declarativeFrom('"C","","V","#","","","chute de la consonne finale","0"')
    assert.deepEqual(buildReverseRules(rules, classes), [])
  })

  it('transforme un effacement en restitution optionnelle', () => {
    const reverse = buildReverseRules(declarativeFrom('"h","","#","","","","chute du h initial","0"'), classes)
    assert.equal(reverse[0].kind, 'optional-insert')
    assert.equal(reverse[0].replacement, 'h')
  })

  it('écarte une règle gardée en regex brute, faute de description déclarative', () => {
    const rules = declarativeFrom('"","\\1","","","","(a)\\1","gémination","0"')
    assert.deepEqual(buildReverseRules(rules, classes), [])
  })
})

describe('buildReverseTree', () => {
  const classes = parseClasses([{ Name: 'V', Members: 'a e o u i' }, { Name: 'C', Members: 'p t k b d' }])
  const DECL_HEADER = '"Target","Result","Left","Right","Condition","Regex","Explanation","Date"'
  const declarativeFrom = (...lines) =>
    parseDeclarativeRules([DECL_HEADER, ...lines].join('\n'), classes).map((rule, i) => ({ ...rule, id: i }))

  it('propose les deux hypothèses (restitué / rien à restituer) pour un effacement', () => {
    const reverse = buildReverseRules(declarativeFrom('"h","","#","","","","chute du h initial","0"'), classes)
    const tree = buildReverseTree('omo', reverse)
    assert.equal(tree.forked, true)
    assert.deepEqual(leafWords(tree).sort(), ['homo', 'omo'])
  })

  it('remonte une substitution littérale sans bifurquer', () => {
    const reverse = buildReverseRules(declarativeFrom('"oe","e","","","","","oe>e","0"'), classes)
    assert.deepEqual(leafWords(buildReverseTree('ke', reverse)), ['koe'])
  })

  it('borne le nombre de restitutions le long d\'un même chemin', () => {
    // trois effacements successifs, mais un budget de une seule restitution :
    // aucune branche ne peut les cumuler toutes.
    const reverse = buildReverseRules(
      declarativeFrom(
        '"h","","#","","","","chute du h","1"',
        '"s","","","#","","","chute du s final","2"',
        '"t","","","#","","","chute du t final","3"',
      ),
      classes,
    )
    const leaves = leafWords(buildReverseTree('oo', reverse, new Set(), { maxRestorations: 1 }))
    assert.ok(leaves.includes('oo'))
    assert.ok(leaves.every((word) => word.replace(/o/g, '').length <= 1), leaves.join(' '))
  })
})

// --- 8. non-régression sur les vraies données -------------------------------
//
// Valeurs capturées sur le moteur actuel (voir en-tête du fichier).

describe('ruleSyntax', () => {
  const classes = parseClasses([
    { Name: 'V', Members: 'a e o u i' },
    { Name: 'C', Members: 'p t k b d g' },
    { Name: 'VL', Members: 'aː eː' },
  ])
  const compile = (rule) => {
    const { pattern, replacement } = compileRule(rule, classes)
    return (word) => word.replace(new RegExp(pattern, 'g'), replacement)
  }

  it('vérifie le contexte sans le consommer', () => {
    // le "a" de gauche doit rester : aucune rétro-référence n'est nécessaire
    assert.equal(compile({ Target: 'b', Result: 'β', Left: 'V', Right: 'V' })('aba'), 'aβa')
  })

  it('nie un seul élément avec !x et une séquence avec !(x y)', () => {
    assert.equal(compile({ Target: 'e', Result: 'ɛ', Right: '!ː' })('eːe'), 'eːɛ')
    assert.equal(compile({ Target: 'ẽ', Result: 'ɑ̃', Left: '!(ˈi)' })('ˈiẽ aẽ'), 'ˈiẽ aɑ̃')
  })

  it('accepte une séquence entière comme branche d\'alternative', () => {
    const apply = compile({ Target: 'o', Result: 'ɔ', Right: '{C V, #}' })
    assert.equal(apply('o'), 'ɔ')      // fin de mot
    assert.equal(apply('opa'), 'ɔpa')  // consonne puis voyelle
    assert.equal(apply('oppa'), 'oppa')
  })

  it('traite une classe à membres multi-caractères comme une alternative', () => {
    assert.equal(compile({ Target: 'VL', Result: 'V̄' })('aːx eːx ax'), 'V̄x V̄x ax')
  })

  it('insère quand Target est vide', () => {
    assert.equal(compile({ Target: '', Result: 'ˈ', Left: '#', Right: 'C V' })('pa ta'), 'ˈpa ta')
  })

  it('applique la Condition au mot entier, pas au site du match', () => {
    const rule = { Target: 'm', Result: '', Right: '#', Condition: 'syllables>1' }
    const { pattern, replacement, condition } = compileRule(rule, classes)
    const apply = (word) => (condition(word) ? word.replace(new RegExp(pattern, 'g'), replacement) : word)
    assert.equal(apply('rem'), 'rem')   // monosyllabe : conservé
    assert.equal(apply('amem'), 'ame')  // polysyllabe : m final tombe
  })

  it('sépare les classes accolées mais garde les littéraux compacts', () => {
    assert.deepEqual(parseSequence('V C').map((e) => e.value), ['V', 'C'])
    assert.deepEqual(parseSequence('oe').map((e) => e.value), ['o', 'e'])
  })
})

describe('non-régression (src/data)', () => {
  const french = loadRealRules()

  it('fait évoluer les mots latins de référence vers le français', () => {
    const words = [
      'cămĕra', 'căballus', 'tăbŭla', 'rēgŭla', 'pŏpŭlus', 'causa',
      'porta', 'lacte', 'vīta', 'ŏcŭlus', 'ăqua', 'terra',
    ]
    const got = Object.fromEntries(words.map((w) => [w, applyRules(w, french).result]))
    assert.deepEqual(got, {
      'cămĕra': 'ʃˈɑ̃bʀ',
      'căballus': 'ʃˈavl',
      'tăbŭla': 'tˈavl',
      'rēgŭla': 'ʀɛgʷl',
      'pŏpŭlus': 'pˈɔpl',
      'causa': 'ʃˈo',
      'porta': 'pˈɔʀt',
      'lacte': 'lˈɛt',
      'vīta': 'vˈi',
      // ŏcŭlus a changé à la bascule vers le format déclaratif : la règle
      // "kl, gl intervocaliques > l̬" avait un Pattern non compilable ("(?)")
      // et était donc ignorée en silence ; réparée, elle s'applique.
      'ŏcŭlus': 'ˈuœs',
      'ăqua': 'akʷ',
      'terra': 'tˈjɛʀ',
    })
  })

  // Garde-fou contre une régression déjà survenue : buildChainTree ne retenait,
  // dans un groupe de même Date, que les règles matchant le mot à l'entrée du
  // groupe, si bien qu'une règle rendue applicable par une de ses sœurs n'était
  // jamais appliquée. Les règles de rulesLatinPhonetic.csv étant toutes
  // datées -inf, et l'accent ne pouvant se poser qu'une fois "ă"/"ĕ" transcrits
  // en "a"/"e", l'arbre perdait l'accent tonique ("ʃɑ̃bʀ" au lieu de "ʃˈɑ̃bʀ")
  // et toutes les règles conditionnées par "ˈ" cessaient de s'appliquer.
  // L'arbre explore tous les ordres possibles des règles simultanées : il peut
  // donc proposer plusieurs mots là où la chaîne linéaire, qui suit l'ordre du
  // fichier, n'en donne qu'un. Ce qu'on exige, c'est que le résultat de la
  // chaîne figure PARMI les branches — pas qu'il soit le seul.
  it('propose, parmi ses branches, le mot de la chaîne linéaire', () => {
    for (const word of ['cămĕra', 'porta', 'vīta', 'ŏcŭlus']) {
      const branches = leafWords(buildChainTree(word, french))
      assert.ok(branches.includes(applyRules(word, french).result), `${word} : ${branches.join(' | ')}`)
    }
  })

  it('charge toutes les règles, et toutes compilent', () => {
    assert.equal(french.length, 302)
    assert.deepEqual(french.filter((rule) => rule.error), [])
    assert.deepEqual(brokenRules(french), [])
  })

  it('sait inverser la quasi-totalité des règles', () => {
    // 96 avant le passage au format déclaratif, 45 juste après (l'inversion
    // lisait encore le texte de la regex compilée), 281 depuis qu'elle échange
    // Target et Result.
    const reverse = buildReverseRules(french, realClasses)
    assert.equal(reverse.length, 281)
    assert.equal(reverse.filter((rule) => rule.kind === 'optional-insert').length, 20)
  })

  it('applique la règle prosodique du m final selon le nombre de syllabes', () => {
    const rule = french.find((r) => r.explanation.startsWith('final m> zero'))
    assert.equal(rule.condition('rem'), false) // monosyllabe : le m reste
    assert.equal(rule.condition('amem'), true)
  })
})

// --- 9. aboutissements français attendus ------------------------------------
//
// Contrairement au bloc précédent, ces valeurs ne sont PAS capturées sur le
// moteur : ce sont les aboutissements français attendus, fournis comme
// objectif linguistique. Elles ne notent pas l'accent tonique, donc la
// comparaison l'ignore.

const ABOUTISSEMENTS = {
  'bĕllōs':    'bo',
  'bĕnĕ':      'bjɛ̃',
  'bŏvĕ':      'bø',
  'cāmĕra':    'ʃɑ̃bʀ',
  'cantātŭ':   'ʃɑ̃te',
  'cāpŭ':      'ʃɛf',
  'cārŭ':      'ʃɛʀ',
  'cŏmĭte':    'kɔ̃t',
  'cŏmpŭtat':  'kɔ̃t',
  'factŭ':     'fɛt',
  'fĭde':      'fwa',
  'fīlĭŭs':    'fis',
  'fŏlĭă':     'fœj',
  'hŏspĭte':   'ot',
  'lĕctŭ':     'li',
  'malos':     'mo',
  'matūrŭ':    'myʀ',
  'mercēde':   'mɛʀsi',
  'nausĕa':    'nwaz',
  'nĕpōte':    'nəvø',
  'nūdŭ':      'ny',
  'pĕde':      'pje',
  'planŭ':     'plɛ̃',
  'pŏtet':     'pø',
  'prătŭ':     'pʀe',
  'pŭgnŭ':     'pwɛ̃',
  'tēctŭ':     'twa',
  'tĕnĕrŭ':    'tɑ̃dʀ',
  'vīta':      'vi',
  'vĭncĕre':   'vɛ̃kʀ',
}

// Les mots qui n'atteignent pas encore leur cible, avec ce que le moteur
// produit aujourd'hui. Cette liste est faite pour rétrécir : chaque entrée
// qu'on en retire devient un cas garanti par le test principal.
const ECARTS_CONNUS = {
  'tēctŭ':     'twat', // le t final devrait tomber : toit /twa/
  // Le moteur ne normalise pas sa sortie : ce "ẽ" est un e suivi du tilde
  // combinant, pas le caractère précomposé U+1EBD. On l'écrit en échappements
  // pour qu'aucun éditeur ne le recompose en passant.
  'vĭncĕre':   'vɑ̃ẽ̯nʀ', // vaincre /vɛ̃kʀ/
}

describe('aboutissements français attendus', () => {
  const french = loadRealRules()
  const evolue = (latin) => applyRules(latin, french).result.replaceAll('ˈ', '')

  it('mène 28 des 30 mots de référence à leur aboutissement attendu', () => {
    const got = {}
    const want = {}
    for (const [latin, cible] of Object.entries(ABOUTISSEMENTS)) {
      if (latin in ECARTS_CONNUS) continue
      got[latin] = evolue(latin)
      want[latin] = cible
    }
    assert.equal(Object.keys(want).length, 28)
    assert.deepEqual(got, want)
  })

  it('produit toujours le même écart sur toit et vaincre', () => {
    const got = Object.fromEntries(Object.keys(ECARTS_CONNUS).map((latin) => [latin, evolue(latin)]))
    assert.deepEqual(got, ECARTS_CONNUS)
  })

  it('mène les 30 mots à leur aboutissement', { todo: 'toit et vaincre n\'y arrivent pas encore (voir ECARTS_CONNUS)' }, () => {
    const got = Object.fromEntries(Object.keys(ABOUTISSEMENTS).map((latin) => [latin, evolue(latin)]))
    assert.deepEqual(got, ABOUTISSEMENTS)
  })
})

// --- 10. graphe de langues ---------------------------------------------------

describe('languageGraph', () => {
  const classes = parseClasses([{ Name: 'V', Members: 'a e o u i' }])
  const HEAD = '"Target","Result","Left","Right","Condition","Regex","Explanation","Date","LangueDepart","LangueDestination"'
  const rulesFromLangs = (...lines) =>
    parseDeclarativeRules([HEAD, ...lines].join('\n'), classes).map((rule, i) => ({ ...rule, id: i }))

  // a -> b, puis b se scinde vers c et d
  const rules = rulesFromLangs(
    '"x","y","","","","","x>y","100","a","b"',
    '"y","z","","","","","y>z","200","b","c"',
    '"y","w","","","","","y>w","200","b","d"',
  )
  const segments = buildSegments(rules)

  it('regroupe les règles par couple de langues', () => {
    assert.deepEqual(
      [...segments.values()].map((s) => `${s.from}>${s.to}:${s.rules.length}`),
      ['a>b:1', 'b>c:1', 'b>d:1'],
    )
  })

  it('propose comme pills les langues accessibles depuis la langue courante', () => {
    assert.deepEqual(destinationsFrom(segments, 'a').map((s) => s.to), ['b'])
    assert.deepEqual(destinationsFrom(segments, 'b').map((s) => s.to).sort(), ['c', 'd'])
  })

  it('ne calcule rien tant qu\'aucune pill n\'est choisie', () => {
    const steps = walk('x', 'a', [], segments)
    assert.equal(steps.length, 1)
    assert.equal(steps[0].word, 'x')
    assert.equal(steps[0].tree, null) // la suite n'est pas explorée
  })

  it('avance d\'un tronçon par choix, et compose les lignées', () => {
    const steps = walk('x', 'a', ['b', 'd'], segments)
    assert.deepEqual(steps.map((s) => [s.language, s.word]), [
      ['a', 'x'],
      ['b', 'y'],
      ['d', 'w'],
    ])
  })

  it('porte la date de la dernière règle appliquée', () => {
    const steps = walk('x', 'a', ['b', 'c'], segments)
    assert.deepEqual(steps.map((s) => s.date), [null, 100, 200])
  })

  it('s\'arrête si le choix ne correspond à aucun tronçon', () => {
    const steps = walk('x', 'a', ['inconnue'], segments)
    assert.equal(steps.length, 1)
    assert.equal(steps[0].chosen, null)
  })
})
