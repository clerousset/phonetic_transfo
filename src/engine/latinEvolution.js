// Charge et fusionne les deux jeux de règles d'évolution phonétique :
// rules_latin_phonetic.csv (conversion de l'orthographe latine en réalisation
// phonétique de départ + accent) puis rulesStress.csv (évolution vers le
// français). Fusionnées et triées par Date croissante, comme un seul fichier.
//
// Chaque règle reçoit un `id` stable (son index dans la liste fusionnée
// triée), utilisé par l'UI pour savoir quelles règles l'utilisateur a
// désactivées (voir EvolutionPanel.jsx et engine/soundChange.js#computeChain).

import phoneticCsvRaw from '../data/rules_latin_phonetic.csv?raw'
import stressCsvRaw from '../data/rulesStress.csv?raw'
import { parseRules } from './soundChange.js'

let rulesCache = null

/** @returns {ReturnType<typeof parseRules>} règles fusionnées, triées, avec id */
export function loadRules() {
  if (!rulesCache) {
    rulesCache = [...parseRules(phoneticCsvRaw), ...parseRules(stressCsvRaw)]
      .sort((a, b) => a.date - b.date)
      .map((rule, i) => ({ ...rule, id: i }))
  }
  return rulesCache
}
