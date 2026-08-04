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
 * Applique les règles, dans l'ordre, à `word`. Retourne le mot final ainsi que
 * le détail des étapes où une règle a effectivement modifié le mot.
 *
 * @param {string} word
 * @param {ReturnType<typeof parseRules>} rules
 */
export function applyRules(word, rules) {
  let current = word
  const steps = []

  for (const rule of rules) {
    if (!rule.regex) continue // pattern invalide, ignoré

    let next
    try {
      next = current.replace(rule.regex, rule.replacement)
    } catch {
      continue
    }

    if (next !== current) {
      steps.push({
        date: rule.date,
        pattern: rule.pattern,
        replacement: rule.replacement,
        explanation: rule.explanation,
        before: current,
        after: next,
      })
      current = next
    }
  }

  return { result: current, steps }
}

/** Règles dont le Pattern n'a pas pu être compilé en regex JS (pour diagnostic). */
export function brokenRules(rules) {
  return rules.filter((r) => !r.regex)
}
