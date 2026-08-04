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
