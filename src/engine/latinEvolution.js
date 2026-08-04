// Relie la recherche de mot (dico_latin.csv) au moteur d'évolution phonétique
// (rulesStress.csv) pour produire, à partir d'un mot latin, sa forme évoluée
// et le détail des étapes appliquées.

import rulesCsvRaw from '../data/rulesStress.csv?raw'
import { parseRules, applyRules } from './soundChange.js'
import { lookupMarkedForms } from './latinDictionary.js'

let rulesCache = null

function getRules() {
  if (!rulesCache) rulesCache = parseRules(rulesCsvRaw)
  return rulesCache
}

/**
 * @param {string} term mot latin tel que recherché sur le site
 * @returns {Promise<
 *   | { found: false }
 *   | { found: true, term: string, markedForm: string, alternateForms: string[],
 *       result: string, steps: ReturnType<typeof applyRules>['steps'] }
 * >}
 */
export async function evolveLatinWord(term) {
  const matches = await lookupMarkedForms(term)
  if (!matches || matches.length === 0) {
    return { found: false }
  }

  const [markedForm, ...alternateForms] = matches
  const { result, steps } = applyRules(markedForm, getRules())

  return { found: true, term, markedForm, alternateForms, result, steps }
}
