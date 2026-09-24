// Les règles ne décrivent plus une seule chaîne latin -> français, mais un
// graphe de langues. Chaque règle porte un couple (LangueDepart,
// LangueDestination) ; toutes celles qui partagent le même couple forment un
// TRONÇON, et les tronçons se composent :
//
//   latin --[transcription]--> latin phonétique --[évolution]--> français
//                                               \--[évolution]--> espagnol
//
// À l'intérieur d'un tronçon, rien ne change : les règles sont triées par Date
// et `buildChainTree` s'applique comme avant, avec ses bifurcations quand
// l'ordre des règles simultanées compte. Ce qui est nouveau, c'est qu'au bout
// d'un tronçon plusieurs suites sont possibles, et que **c'est l'utilisateur
// qui choisit** (les « pills ») plutôt que le moteur qui explore tout.

import { buildChainTree } from './soundChange.js'

/** Clé d'un tronçon, pour comparer deux couples de langues. */
export function segmentKey(from, to) {
  return `${from}${to}`
}

/**
 * Regroupe les règles par couple de langues.
 * @returns {Map<string, { from: string, to: string, rules: object[] }>}
 */
export function buildSegments(rules) {
  const segments = new Map()

  for (const rule of rules) {
    const from = rule.from ?? ''
    const to = rule.to ?? ''
    if (from === '' || to === '') continue // règle sans couple de langues
    const key = segmentKey(from, to)
    if (!segments.has(key)) segments.set(key, { from, to, rules: [] })
    segments.get(key).rules.push(rule)
  }

  return segments
}

/**
 * Tronçons partant de `language`, dans l'ordre où leurs règles commencent —
 * c'est la liste des pills à proposer.
 *
 * @returns {Array<{ from: string, to: string, rules: object[] }>}
 */
export function destinationsFrom(segments, language) {
  return [...segments.values()]
    .filter((segment) => segment.from === language)
    .sort((a, b) => Math.min(...a.rules.map((r) => r.date)) - Math.min(...b.rules.map((r) => r.date)))
}

/**
 * Parcourt le graphe en suivant les choix de l'utilisateur.
 *
 * `choices` est la suite des langues choisies depuis `startLanguage`. On
 * s'arrête dès qu'un choix ne correspond à aucun tronçon, ou quand les choix
 * sont épuisés : l'étape courante est alors celle dont l'utilisateur doit
 * choisir la suite.
 *
 * @param {string} word
 * @param {string} startLanguage
 * @param {string[]} choices suite de langues de destination
 * @param {ReturnType<typeof buildSegments>} segments
 * @param {Set<number|string>} [disabledIds]
 * @returns {Array<{ language: string, word: string, tree: object|null, options: object[] }>}
 *   une entrée par carte à afficher, de la première à la dernière
 */
export function walk(word, startLanguage, choices, segments, disabledIds = new Set()) {
  const steps = []
  let currentWord = word
  let currentLanguage = startLanguage
  let currentDate = null

  for (let i = 0; ; i++) {
    const options = destinationsFrom(segments, currentLanguage)
    const chosen = choices[i] ? options.find((option) => option.to === choices[i]) : null

    steps.push({
      language: currentLanguage,
      word: currentWord,
      date: currentDate,
      options,
      chosen: chosen ? chosen.to : null,
      tree: null,
    })

    if (!chosen) return steps

    const tree = buildChainTree(currentWord, chosen.rules, disabledIds)
    steps[steps.length - 1].tree = tree

    currentWord = finalWord(tree)
    currentDate = lastDate(tree) ?? currentDate
    currentLanguage = chosen.to
  }
}

/**
 * Mot au bout de l'arbre. Quand le tronçon a bifurqué, on suit la première
 * branche : les bifurcations internes à un tronçon restent affichées, mais il
 * faut bien un mot pour entrer dans le tronçon suivant.
 */
export function finalWord(tree) {
  let node = tree
  while (node && !node.isLeaf) node = node.forked ? node.branches[0].next : node.next
  return node ? node.word : ''
}

/** Date de la dernière règle appliquée le long de la première branche. */
export function lastDate(tree) {
  let node = tree
  let date = null
  while (node && !node.isLeaf) {
    const steps = node.forked ? node.branches[0].steps : node.steps
    if (steps && steps.length > 0) date = steps[steps.length - 1].date
    node = node.forked ? node.branches[0].next : node.next
  }
  return date
}
