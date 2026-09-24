// Reconstruction d'ancêtres latins possibles à partir d'un mot phonétique
// français : c'est l'inverse du moteur d'évolution (engine/soundChange.js).
//
// Les règles étant écrites en déclaratif (A > B / L _ R, voir ruleSyntax.js),
// l'inversion est mécanique : l'inverse de A > B / L _ R est B > A / L _ R.
// On échange simplement Target et Result, et on laisse le compilateur produire
// la regex — plus besoin de deviner, à partir du texte d'une regex, ce qui y
// est cible et ce qui y est contexte.
//
// Le contexte reste valide en sens inverse parce qu'il n'est jamais consommé :
// une règle ne modifie que sa cible, donc L et R sont encore là après coup.
//
// Trois formes d'inverse, selon la règle de départ :
//
// - A > B (les deux non vides) : on cherche B en contexte et on remet A.
//   Si A désigne une classe ou une alternative ({b,w}, V…), on ne sait pas
//   lequel de ses membres était là : on produit une règle inverse par membre,
//   et l'arbre bifurque. C'est une vraie ambiguïté — deux sons d'origine ont
//   fusionné en un seul — pas un défaut de l'outil.
// - A > ∅ (effacement) : on ne sait pas si l'effacement a eu lieu ici. On
//   propose donc les deux hypothèses, réinséré / pas réinséré.
// - ∅ > B (insertion) : on retire B là où le contexte s'y prête.
//
// Restent hors de portée : les règles à échappatoire `Regex` (pas de
// description déclarative), et celles dont la cible est une séquence complexe
// (quantificateur, négation) dont on ne saurait pas quoi restituer.

import { compileRule, parseSequence } from './ruleSyntax.js'
import { groupRulesByDate } from './soundChange.js'

/** Nombre maximum de membres d'une classe qu'on accepte de déplier. */
const MAX_MEMBRES = 4

/**
 * Si `source` désigne une cible restituable, retourne la liste des chaînes
 * possibles ; sinon null.
 *
 * - "oe"      -> ['oe']            littéral
 * - "{b,w}"   -> ['b', 'w']        alternative : une origine par membre
 * - "V"       -> ['a', 'e', …]     classe, si elle n'a pas trop de membres
 * - "C?V"     -> null              on ne saurait pas quoi remettre
 */
function ciblesPossibles(source, classes) {
  const text = (source ?? '').trim()
  if (text === '') return ['']

  let elements
  try {
    elements = parseSequence(text)
  } catch {
    return null
  }

  if (elements.some((element) => element.quantifier || element.negated)) return null

  if (elements.every((element) => element.kind === 'literal')) {
    return [elements.map((element) => element.value).join('')]
  }

  // un seul élément, classe ou alternative : on déplie ses membres
  if (elements.length === 1) {
    const [element] = elements
    if (element.kind === 'class') {
      const members = classes.get(element.value)
      if (members && members.length <= MAX_MEMBRES) return members
      return null
    }
    if (element.kind === 'alternation') {
      const branches = element.value
      if (branches.length > MAX_MEMBRES) return null
      // chaque branche doit elle-même être un littéral
      if (branches.some((branch) => ciblesPossibles(branch, classes)?.length !== 1)) return null
      return branches
    }
  }

  return null
}

/**
 * Construit, à partir des règles d'évolution (aller), les règles "retour",
 * triées par Date décroissante — on défait la dernière chose arrivée en
 * premier.
 *
 * @param {Array<{declarative: object|null, date: number, explanation: string, id: number|string}>} forwardRules
 * @param {Map<string, string[]>} classes
 */
export function buildReverseRules(forwardRules, classes) {
  const reverse = []

  for (const rule of forwardRules) {
    const declaration = rule.declarative
    if (!declaration) continue // règle gardée en regex brute : pas inversible

    const origines = ciblesPossibles(declaration.Target, classes)
    if (origines === null) continue

    const aboutissement = (declaration.Result ?? '').trim()

    for (const origine of origines) {
      // l'inverse : on cherche l'aboutissement, on remet l'origine
      let compiled
      try {
        compiled = compileRule(
          { Target: declaration.Result, Result: origine, Left: declaration.Left, Right: declaration.Right },
          classes,
        )
      } catch {
        continue
      }

      let regex
      try {
        regex = new RegExp(compiled.pattern, 'g')
      } catch {
        continue
      }

      const id = origines.length > 1 ? `${rule.id}-${origine}` : rule.id
      const explanation =
        origines.length > 1 ? `${rule.explanation} (origine possible : ${origine})` : rule.explanation

      reverse.push({
        id,
        date: rule.date,
        // un aboutissement vide veut dire que la règle aller effaçait quelque
        // chose : sa réinsertion est une hypothèse, pas une certitude
        kind: aboutissement === '' ? 'optional-insert' : 'substitute',
        explanation,
        regex,
        replacement: compiled.replacement,
      })
    }
  }

  return reverse.sort((a, b) => b.date - a.date)
}

function safeApply(word, rule) {
  try {
    return word.replace(rule.regex, rule.replacement)
  } catch {
    return word
  }
}

const DEFAULT_MAX_EXTRA_BRANCHES = 30 // la reconstruction est censée bifurquer

// Chaque effacement du sens aller a PU ne pas avoir eu lieu, donc chacun ouvre
// une hypothèse de restitution. Prises une à une elles sont légitimes ; cumulées
// sur les vingt effacements du jeu de règles, elles fabriquent des ancêtres
// absurdes, hérissés de consonnes restituées partout. On borne donc le nombre
// de restitutions admises le long d'un même chemin : au-delà, seule
// l'hypothèse « rien à restituer ici » est explorée.
const DEFAULT_MAX_RESTORATIONS = 2

/**
 * Construit l'arbre des ancêtres possibles de `word`, en remontant les règles
 * inversibles par Date décroissante. Même forme de nœud que buildChainTree
 * (voir soundChange.js), avec `cancelled: []` toujours vide.
 *
 * @param {string} word
 * @param {ReturnType<typeof buildReverseRules>} reverseRules
 * @param {Set<number|string>} [disabledIds]
 * @param {{ maxExtraBranches?: number }} [options]
 */
export function buildReverseTree(word, reverseRules, disabledIds = new Set(), options = {}) {
  const groups = groupRulesByDate(reverseRules)
  const branchBudget = { remaining: options.maxExtraBranches ?? DEFAULT_MAX_EXTRA_BRANCHES }
  const maxRestorations = options.maxRestorations ?? DEFAULT_MAX_RESTORATIONS

  function recurse(currentWord, groupIndex, restorations) {
    for (let gi = groupIndex; gi < groups.length; gi++) {
      const group = groups[gi]
      // `outcomes` : mot obtenu -> { step, restored }. L'hypothèse conservatrice
      // (ne rien restituer) est insérée en premier pour que la branche la plus
      // sobre vienne en tête de l'arbre.
      const outcomes = new Map()

      for (const rule of group) {
        if (disabledIds.has(rule.id)) continue

        const candidate = safeApply(currentWord, rule)
        if (candidate === currentWord) continue

        if (rule.kind === 'optional-insert') {
          if (!outcomes.has(currentWord)) {
            outcomes.set(currentWord, {
              restored: false,
              step: {
                ruleId: `${rule.id}-skip`,
                date: rule.date,
                explanation: `${rule.explanation} (rien à restituer ici)`,
                before: currentWord,
                after: currentWord,
              },
            })
          }
          if (restorations >= maxRestorations) continue // budget épuisé
        }

        if (!outcomes.has(candidate)) {
          outcomes.set(candidate, {
            restored: rule.kind === 'optional-insert',
            step: {
              ruleId: rule.kind === 'optional-insert' ? `${rule.id}-insert` : rule.id,
              date: rule.date,
              explanation: rule.kind === 'optional-insert' ? `${rule.explanation} (restitué)` : rule.explanation,
              before: currentWord,
              after: candidate,
            },
          })
        }
      }

      if (outcomes.size === 0) continue

      const entries = [...outcomes.entries()]
      const descend = ([finalWord, { restored }]) => recurse(finalWord, gi + 1, restorations + (restored ? 1 : 0))

      if (entries.length === 1) {
        const [, { step }] = entries[0]
        return {
          word: currentWord,
          cancelled: [],
          isLeaf: false,
          forked: false,
          steps: [step],
          next: descend(entries[0]),
        }
      }

      branchBudget.remaining -= entries.length - 1

      if (branchBudget.remaining < 0) {
        const [, { step }] = entries[0]
        return {
          word: currentWord,
          cancelled: [],
          isLeaf: false,
          forked: false,
          truncatedFork: true,
          steps: [step],
          next: descend(entries[0]),
        }
      }

      return {
        word: currentWord,
        cancelled: [],
        isLeaf: false,
        forked: true,
        branches: entries.map((entry) => ({
          steps: [entry[1].step],
          next: descend(entry),
        })),
      }
    }

    return { word: currentWord, cancelled: [], isLeaf: true }
  }

  return recurse(word, 0, 0)
}
