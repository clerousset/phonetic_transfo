// Charge et fusionne les deux jeux de règles d'évolution phonétique :
// rules_latin_phonetic.csv (conversion de l'orthographe latine en réalisation
// phonétique de départ + accent) puis un second jeu de règles selon la
// variante choisie — rulesStress.csv (évolution vers le français) ou
// rulesSavoyard.csv (évolution vers le savoyard, voir README). Fusionnées et
// triées par Date croissante, comme un seul fichier.
//
// Chaque règle reçoit un `id` stable (son index dans la liste fusionnée
// triée, propre à chaque variante), utilisé par l'UI pour savoir quelles
// règles l'utilisateur a désactivées (voir EvolutionPanel.jsx et
// engine/soundChange.js#computeChain).

import phoneticCsvRaw from '../data/rules_latin_phonetic.csv?raw'
import stressCsvRaw from '../data/rulesStress.csv?raw'
import savoyardCsvRaw from '../data/rulesSavoyard.csv?raw'
import { parseRules } from './soundChange.js'

export const VARIANTS = {
  french: { label: 'français', csv: stressCsvRaw },
  savoyard: { label: 'savoyard', csv: savoyardCsvRaw },
}

const rulesCacheByVariant = new Map()

/**
 * @param {keyof typeof VARIANTS} [variant]
 * @returns {ReturnType<typeof parseRules>} règles fusionnées, triées, avec id
 */
export function loadRules(variant = 'french') {
  if (!rulesCacheByVariant.has(variant)) {
    const csv = (VARIANTS[variant] ?? VARIANTS.french).csv
    const rules = [...parseRules(phoneticCsvRaw), ...parseRules(csv)]
      .sort((a, b) => a.date - b.date)
      .map((rule, i) => ({ ...rule, id: i }))
    rulesCacheByVariant.set(variant, rules)
  }
  return rulesCacheByVariant.get(variant)
}
