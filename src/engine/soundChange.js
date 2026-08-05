// Moteur d'évolution phonétique piloté par des règles ordonnées chronologiquement
// (fichier src/data/rulesStress.csv : colonnes Pattern, Replacement, Explanation, Date).
//
// Principe : on part d'un mot, on trie les règles par Date croissante, puis pour
// chaque règle on regarde si son Pattern (regex) est trouvé dans le mot courant ;
// si oui, on applique le Replacement (remplacement global : une règle phonétique
// s'applique partout où son contexte est réuni dans le mot, pas seulement à la
// première occurrence) et le résultat devient le mot courant pour la règle suivante.

import { parseCsvObjects } from './csv.js'

function parseDate(raw) {
  const v = (raw ?? '').trim()
  if (v === '-inf' || v === '-Infinity') return -Infinity
  if (v === 'inf' || v === 'Infinity') return Infinity
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}

// Le CSV écrit les rétro-références à la façon Perl/Python (\1, \2…), mais
// String.prototype.replace attend la syntaxe $1, $2… On échappe d'abord les
// éventuels "$" littéraux, puis on convertit \N en $N.
function toJsReplacement(replacement) {
  return replacement.replace(/\$/g, '$$$$').replace(/\\(\d+)/g, '$$$1')
}

/**
 * Parse le CSV de règles et retourne les règles triées par Date croissante.
 * Les règles dont le Pattern n'est pas une regex JS valide sont conservées
 * dans la liste (utile pour du debug) mais marquées `regex: null` et sont
 * ignorées lors de l'application (voir applyRules).
 */
export function parseRules(csvText) {
  const rows = parseCsvObjects(csvText)

  return rows
    .map((row) => {
      const pattern = row.Pattern ?? ''
      const replacement = toJsReplacement(row.Replacement ?? '')
      const explanation = row.Explanation ?? ''
      const date = parseDate(row.Date)

      let regex = null
      try {
        regex = new RegExp(pattern, 'g')
      } catch {
        regex = null
      }

      return { pattern, replacement, explanation, date, regex }
    })
    .sort((a, b) => a.date - b.date)
}

/**
 * Applique les règles, dans l'ordre, à `word`, en pouvant désactiver certaines
 * d'entre elles (par `id`, voir latinEvolution.js). Retourne le mot final ainsi
 * que la chronologie (`timeline`) des règles qui auraient un effet sur le mot
 * courant à ce point-là :
 *
 * - une règle désactivée dont le Pattern est trouvé apparaît dans la timeline
 *   avec `disabled: true` et `before`/`after` = ce qu'elle *aurait* produit,
 *   mais ne change pas le mot courant (la chaîne continue sans elle) ;
 * - une règle active dont le Pattern est trouvé apparaît avec `disabled: false`,
 *   et son `after` devient le mot courant pour la suite ;
 * - une règle (active ou non) dont le Pattern n'est pas trouvé n'apparaît pas
 *   du tout (elle n'a simplement aucun effet à cette étape).
 *
 * @param {string} word
 * @param {ReturnType<typeof parseRules>} rules règles avec un champ `id`
 * @param {Set<number>} [disabledIds]
 */
export function computeChain(word, rules, disabledIds = new Set()) {
  let current = word
  const timeline = []

  for (const rule of rules) {
    if (!rule.regex) continue // pattern invalide, ignoré

    let candidate
    try {
      candidate = current.replace(rule.regex, rule.replacement)
    } catch {
      continue
    }

    if (candidate === current) continue // aucun effet ici, pas affiché

    const disabled = disabledIds.has(rule.id)
    timeline.push({
      ruleId: rule.id,
      date: rule.date,
      pattern: rule.pattern,
      replacement: rule.replacement,
      explanation: rule.explanation,
      before: current,
      after: candidate,
      disabled,
    })

    if (!disabled) current = candidate
  }

  return { result: current, timeline }
}

/** Compatibilité : applique toutes les règles (aucune désactivée). */
export function applyRules(word, rules) {
  const { result, timeline } = computeChain(word, rules)
  return { result, steps: timeline }
}

/** Règles dont le Pattern n'a pas pu être compilé en regex JS (pour diagnostic). */
export function brokenRules(rules) {
  return rules.filter((r) => !r.regex)
}

// --- Arbre de dérivation avec bifurcation sur les règles de même Date -------
//
// Quand plusieurs règles partagent la même Date, leur ordre d'application
// n'est a priori pas défini. On les considère "simultanées" : si, pour le mot
// courant, appliquer ces règles dans des ordres différents mène à des
// résultats différents, la chaîne se divise en autant de branches qu'il y a
// de résultats distincts. Si tous les ordres convergent vers le même mot
// (cas très majoritaire, car la plupart des règles ne portent pas sur les
// mêmes caractères), pas de bifurcation visible.

function safeApply(word, rule) {
  try {
    return word.replace(rule.regex, rule.replacement)
  } catch {
    return word
  }
}

function permutations(items) {
  if (items.length <= 1) return [items]
  const result = []
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const p of permutations(rest)) result.push([items[i], ...p])
  }
  return result
}

/** Regroupe les règles (déjà triées par Date) en tranches de même Date. */
export function groupRulesByDate(rules) {
  const groups = []
  let current = null
  for (const r of rules) {
    if (!current || current[0].date !== r.date) {
      current = [r]
      groups.push(current)
    } else {
      current.push(r)
    }
  }
  return groups
}

function stepsInOrder(word, orderedRules) {
  let current = word
  const steps = []
  for (const r of orderedRules) {
    const next = safeApply(current, r)
    if (next !== current) {
      steps.push({
        ruleId: r.id,
        date: r.date,
        pattern: r.pattern,
        explanation: r.explanation,
        before: current,
        after: next,
      })
      current = next
    }
  }
  return { word: current, steps }
}

const MAX_PERMUTE = 6 // au-delà, on n'explore pas tous les ordres (factorielle)
const DEFAULT_MAX_EXTRA_BRANCHES = 8 // garde-fou contre l'explosion combinatoire

/**
 * Construit l'arbre de dérivation de `word` à travers `rules` (déjà triées et
 * munies d'un `id`), en testant l'ordre des règles simultanées (même Date).
 *
 * Forme d'un nœud :
 *   { word, cancelled, isLeaf }                                — feuille
 *   { word, cancelled, isLeaf:false, forked:false, steps, next } — chemin unique
 *   { word, cancelled, isLeaf:false, forked:true, branches }     — bifurcation,
 *     branches: [{ steps, next }, ...]
 *
 * `cancelled` liste les règles désactivées par l'utilisateur qui auraient eu
 * un effet à ce point (avec le mot qu'elles auraient produit), sans faire
 * avancer le mot ni créer de branche.
 *
 * @param {string} word
 * @param {ReturnType<typeof parseRules>} rules règles avec un champ `id`
 * @param {Set<number>} [disabledIds]
 * @param {{ maxExtraBranches?: number }} [options]
 */
export function buildChainTree(word, rules, disabledIds = new Set(), options = {}) {
  const groups = groupRulesByDate(rules)
  const branchBudget = { remaining: options.maxExtraBranches ?? DEFAULT_MAX_EXTRA_BRANCHES }

  function recurse(currentWord, groupIndex) {
    const word = currentWord
    let cancelled = []

    for (let gi = groupIndex; gi < groups.length; gi++) {
      const group = groups[gi]
      const valid = group.filter((r) => r.regex)
      const enabled = valid.filter((r) => !disabledIds.has(r.id))
      const disabled = valid.filter((r) => disabledIds.has(r.id))

      const disabledMatching = disabled
        .map((r) => ({ rule: r, after: safeApply(word, r) }))
        .filter(({ after }) => after !== word)
        .map(({ rule, after }) => ({
          ruleId: rule.id,
          date: rule.date,
          explanation: rule.explanation,
          wouldBe: after,
        }))
      if (disabledMatching.length > 0) cancelled = [...cancelled, ...disabledMatching]

      const matching = enabled.filter((r) => safeApply(word, r) !== word)
      if (matching.length === 0) continue // rien ici, groupe de date suivant

      if (matching.length === 1 || matching.length > MAX_PERMUTE) {
        const { word: nextWord, steps } = stepsInOrder(word, matching)
        return {
          word,
          cancelled,
          isLeaf: false,
          forked: false,
          tooManySimultaneous: matching.length > MAX_PERMUTE,
          steps,
          next: recurse(nextWord, gi + 1),
        }
      }

      // 2..MAX_PERMUTE règles simultanées : teste tous les ordres possibles
      const outcomes = new Map()
      for (const perm of permutations(matching)) {
        const { word: finalWord, steps } = stepsInOrder(word, perm)
        if (!outcomes.has(finalWord)) outcomes.set(finalWord, steps)
      }

      if (outcomes.size === 1) {
        const [[finalWord, steps]] = outcomes.entries()
        return {
          word,
          cancelled,
          isLeaf: false,
          forked: false,
          steps,
          next: recurse(finalWord, gi + 1),
        }
      }

      const entries = [...outcomes.entries()]
      branchBudget.remaining -= entries.length - 1

      if (branchBudget.remaining < 0) {
        const [finalWord, steps] = entries[0]
        return {
          word,
          cancelled,
          isLeaf: false,
          forked: false,
          truncatedFork: true,
          steps,
          next: recurse(finalWord, gi + 1),
        }
      }

      return {
        word,
        cancelled,
        isLeaf: false,
        forked: true,
        branches: entries.map(([finalWord, steps]) => ({
          steps,
          next: recurse(finalWord, gi + 1),
        })),
      }
    }

    return { word, cancelled, isLeaf: true }
  }

  return recurse(word, 0)
}
