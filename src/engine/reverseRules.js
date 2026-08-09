// Reconstruction d'ancêtres latins possibles à partir d'un mot phonétique
// français : c'est l'inverse du moteur d'évolution (engine/soundChange.js).
//
// Inverser une règle regex arbitraire n'est pas bien défini en général (un
// Pattern peut décrire un ensemble de chaînes, pas une seule). On se limite
// donc, volontairement, aux règles qu'on peut inverser SANS deviner :
//
// - Règle "littérale" (Pattern est une chaîne fixe, éventuellement ancrée en
//   `^` et/ou `$`, sans aucun autre caractère spécial de regex, et
//   Replacement ne dépend pas de groupes capturés `\1`, `\2`…) : on cherche
//   le Replacement dans le mot courant et on le remet tel quel en Pattern.
// - Règle de suppression littérale et ancrée (Pattern littéral ancré,
//   Replacement vide, ex. "^h" -> "") : on ne sait pas si la lettre a
//   vraiment disparu ici — on propose donc les deux possibilités (réinsérée
//   / pas réinsérée), ce qui crée une bifurcation.
// - Toute règle avec classes de caractères, lookaheads/lookbehinds, quantif-
//   icateurs ou rétro-références est ignorée : tenter de l'inverser
//   "au pif" produirait des ancêtres plausibles en apparence mais faux.
//
// Les règles retenues sont triées par Date **décroissante** (on défait la
// dernière chose arrivée en premier) et regroupées par Date comme à l'aller ;
// buildReverseTree réutilise la même idée d'arbre que buildChainTree, mais
// sans tester les permutations (moins pertinent ici) — une bifurcation
// apparaît dès que plusieurs règles du même groupe de Date proposent des
// résultats distincts pour le mot courant.

import { groupRulesByDate } from './soundChange.js'

const METACHARS = /[.*+?^${}()|[\]\\]/

function literalCore(pattern) {
  let core = pattern
  let anchoredStart = false
  let anchoredEnd = false
  if (core.startsWith('^')) {
    anchoredStart = true
    core = core.slice(1)
  }
  if (core.endsWith('$')) {
    anchoredEnd = true
    core = core.slice(0, -1)
  }
  if (core.length === 0) return null
  if (METACHARS.test(core)) return null
  return { core, anchoredStart, anchoredEnd }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeDollar(s) {
  return s.replace(/\$/g, '$$$$')
}

/**
 * Construit, à partir des règles d'évolution (aller), le sous-ensemble
 * inversible, sous forme de règles "retour" triées par Date décroissante.
 *
 * @param {ReturnType<typeof import('./soundChange.js').parseRules>} forwardRules
 */
export function buildReverseRules(forwardRules) {
  const reverse = []

  for (const rule of forwardRules) {
    if (!rule.regex) continue

    const lit = literalCore(rule.pattern)
    if (!lit) continue // Pattern pas une simple chaîne (éventuellement ancrée)

    const hasBackref = /\\\d/.test(rule.rawReplacement ?? '')
    if (hasBackref) continue // Replacement dépend du contexte capturé

    const replacementLiteral = rule.rawReplacement ?? ''

    if (replacementLiteral.length === 0) {
      // Règle de suppression : seulement inversible si ancrée (position
      // unique et bien définie où réinsérer le texte disparu).
      if (!lit.anchoredStart && !lit.anchoredEnd) continue

      reverse.push({
        id: rule.id,
        date: rule.date,
        kind: 'optional-insert',
        explanation: rule.explanation,
        insertText: lit.core,
        anchoredStart: lit.anchoredStart,
        anchoredEnd: lit.anchoredEnd,
      })
      continue
    }

    const searchPattern =
      (lit.anchoredStart ? '^' : '') +
      escapeRegExp(replacementLiteral) +
      (lit.anchoredEnd ? '$' : '')

    let regex
    try {
      regex = new RegExp(searchPattern, 'g')
    } catch {
      continue
    }

    reverse.push({
      id: rule.id,
      date: rule.date,
      kind: 'substitute',
      explanation: rule.explanation,
      regex,
      replacement: escapeDollar(lit.core),
    })
  }

  return reverse.sort((a, b) => b.date - a.date)
}

function insertLiteral(word, rule) {
  if (rule.anchoredStart) return rule.insertText + word
  if (rule.anchoredEnd) return word + rule.insertText
  return word
}

function safeSubstitute(word, rule) {
  try {
    return word.replace(rule.regex, rule.replacement)
  } catch {
    return word
  }
}

const DEFAULT_MAX_EXTRA_BRANCHES = 30 // plus permissif qu'à l'aller : la
// reconstruction inverse est censée beaucoup bifurquer.

/**
 * Construit l'arbre des ancêtres possibles de `word`, en remontant les
 * règles inversibles par Date décroissante. Même forme de nœud que
 * buildChainTree (voir soundChange.js), avec `cancelled: []` toujours vide
 * (pas de notion de règle "désactivée mais qui aurait matché" ici).
 *
 * @param {string} word
 * @param {ReturnType<typeof buildReverseRules>} reverseRules
 * @param {Set<number|string>} [disabledIds]
 * @param {{ maxExtraBranches?: number }} [options]
 */
export function buildReverseTree(word, reverseRules, disabledIds = new Set(), options = {}) {
  const groups = groupRulesByDate(reverseRules)
  const branchBudget = { remaining: options.maxExtraBranches ?? DEFAULT_MAX_EXTRA_BRANCHES }

  function recurse(currentWord, groupIndex) {
    for (let gi = groupIndex; gi < groups.length; gi++) {
      const group = groups[gi]
      const outcomes = new Map()

      for (const rule of group) {
        if (disabledIds.has(rule.id)) continue

        if (rule.kind === 'substitute') {
          const candidate = safeSubstitute(currentWord, rule)
          if (candidate !== currentWord && !outcomes.has(candidate)) {
            outcomes.set(candidate, {
              ruleId: rule.id,
              date: rule.date,
              explanation: rule.explanation,
              before: currentWord,
              after: candidate,
            })
          }
        } else {
          const inserted = insertLiteral(currentWord, rule)
          if (inserted !== currentWord) {
            if (!outcomes.has(inserted)) {
              outcomes.set(inserted, {
                ruleId: `${rule.id}-insert`,
                date: rule.date,
                explanation: `${rule.explanation} (réinséré)`,
                before: currentWord,
                after: inserted,
              })
            }
            if (!outcomes.has(currentWord)) {
              outcomes.set(currentWord, {
                ruleId: `${rule.id}-skip`,
                date: rule.date,
                explanation: `${rule.explanation} (pas réinséré ici)`,
                before: currentWord,
                after: currentWord,
              })
            }
          }
        }
      }

      if (outcomes.size === 0) continue

      const entries = [...outcomes.entries()]

      if (entries.length === 1) {
        const [finalWord, step] = entries[0]
        return {
          word: currentWord,
          cancelled: [],
          isLeaf: false,
          forked: false,
          steps: [step],
          next: recurse(finalWord, gi + 1),
        }
      }

      branchBudget.remaining -= entries.length - 1

      if (branchBudget.remaining < 0) {
        const [finalWord, step] = entries[0]
        return {
          word: currentWord,
          cancelled: [],
          isLeaf: false,
          forked: false,
          truncatedFork: true,
          steps: [step],
          next: recurse(finalWord, gi + 1),
        }
      }

      return {
        word: currentWord,
        cancelled: [],
        isLeaf: false,
        forked: true,
        branches: entries.map(([finalWord, step]) => ({
          steps: [step],
          next: recurse(finalWord, gi + 1),
        })),
      }
    }

    return { word: currentWord, cancelled: [], isLeaf: true }
  }

  return recurse(word, 0)
}
