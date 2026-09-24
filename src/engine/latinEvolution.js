// Charge et fusionne les deux jeux de règles d'évolution phonétique, tous deux
// écrits en déclaratif (A > B / L _ R, voir ruleSyntax.js) :
//
//   rulesLatinPhonetic.csv  orthographe latine -> réalisation phonétique de
//                           départ, puis placement de l'accent
//   rulesFrench.csv         évolution phonétique vers le français
//
// classes.csv définit les classes nommées (V, C, C_SANS_L…) auxquelles les
// deux fichiers se réfèrent.
//
// Fusionnées et triées par Date croissante, comme un seul fichier. Chaque
// règle reçoit un `id` stable (son index dans la liste triée), utilisé par
// l'UI pour savoir quelles règles l'utilisateur a désactivées (voir
// EvolutionPanel.jsx et engine/soundChange.js#computeChain).

import classesCsvRaw from '../data/classes.csv?raw'
import phoneticCsvRaw from '../data/rulesLatinPhonetic.csv?raw'
import frenchCsvRaw from '../data/rulesFrench.csv?raw'
import { parseCsvObjects } from './csv.js'
import { parseDeclarativeRules, parseClasses } from './ruleSyntax.js'

/** Classes nommées (V, C, C_SANS_L…) auxquelles les règles se réfèrent. */
export const classes = parseClasses(parseCsvObjects(classesCsvRaw))

let cachedRules = null

/**
 * @returns {ReturnType<typeof parseDeclarativeRules>} règles fusionnées,
 *   triées, avec un `id`
 */
export function loadRules() {
  if (!cachedRules) {
    // rulesLatinPhonetic.csv n'est pas un jeu de changements concurrents mais
    // une passe de transcription ordonnée, où une règle rend la suivante
    // applicable (l'accent ne peut se poser qu'une fois les voyelles marquées
    // transcrites). On la marque comme telle pour que buildChainTree
    // l'applique dans l'ordre du fichier au lieu de la traiter comme un
    // groupe de règles simultanées (voir soundChange.js).
    const phoneticRules = parseDeclarativeRules(phoneticCsvRaw, classes).map((rule) => ({ ...rule, sequential: true }))
    cachedRules = [...phoneticRules, ...parseDeclarativeRules(frenchCsvRaw, classes)]
      .sort((a, b) => a.date - b.date)
      .map((rule, i) => ({ ...rule, id: i }))
  }
  return cachedRules
}
