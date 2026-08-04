// Index de src/data/dico_latin.csv (entries_for_search -> entries), utilisé pour
// retrouver la forme d'un mot latin avec voyelles longues/brèves marquées
// (ā, ă, ē, ĕ…), nécessaire en entrée du moteur d'évolution phonétique.
//
// Le fichier (1,4 Mo, ~51 000 lignes) est chargé à la demande (import dynamique)
// et indexé une seule fois ; les appels suivants réutilisent le résultat en cache.

import { parseCsvObjects } from './csv.js'

let indexPromise = null

function buildIndex(csvText) {
  const rows = parseCsvObjects(csvText)
  const index = new Map()

  for (const row of rows) {
    const key = (row.entries_for_search ?? '').trim().toLowerCase()
    const entry = (row.entries ?? '').trim()
    if (!key || !entry) continue

    if (!index.has(key)) index.set(key, [])
    const list = index.get(key)
    if (!list.includes(entry)) list.push(entry)
  }

  return index
}

function loadIndex() {
  if (!indexPromise) {
    indexPromise = import('../data/dico_latin.csv?raw').then((mod) => buildIndex(mod.default))
  }
  return indexPromise
}

/**
 * Retourne les formes marquées (ā, ă…) connues pour un mot latin, ou `null`
 * si le mot n'est pas présent dans le dictionnaire local.
 *
 * @param {string} word
 * @returns {Promise<string[] | null>}
 */
export async function lookupMarkedForms(word) {
  const index = await loadIndex()
  const key = word.trim().toLowerCase()
  return index.get(key) ?? null
}
