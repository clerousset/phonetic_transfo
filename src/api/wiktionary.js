// Client minimal pour l'API REST publique de Wiktionary.
// Doc: https://en.wiktionary.org/api/rest_v1/  (section "Page content" > /page/definition/{term})
// Cette API est ouverte en CORS, donc utilisable directement depuis le navigateur, sans backend.

const REST_BASE = 'https://en.wiktionary.org/api/rest_v1/page/definition'

/**
 * Récupère les définitions d'un mot depuis Wiktionary (anglophone).
 * Ne garde que la section latine ("la") si elle existe.
 *
 * @param {string} term
 * @returns {Promise<{ term: string, entries: Array<{partOfSpeech: string, definitions: Array<{definitionHtml: string}>}> }>}
 */
export async function fetchLatinDefinition(term) {
  const url = `${REST_BASE}/${encodeURIComponent(term.toLowerCase())}`
  const response = await fetch(url)

  if (response.status === 404) {
    throw new Error(`Aucune page Wiktionary trouvée pour « ${term} ».`)
  }
  if (!response.ok) {
    throw new Error(`Erreur Wiktionary (HTTP ${response.status}) pour « ${term} ».`)
  }

  const data = await response.json()
  const latinEntries = data.la

  if (!latinEntries || latinEntries.length === 0) {
    throw new Error(`« ${term} » existe sur Wiktionary mais sans section latine.`)
  }

  return {
    term,
    entries: latinEntries.map((entry) => ({
      partOfSpeech: entry.partOfSpeech,
      definitions: (entry.definitions || []).map((d) => ({
        definitionHtml: d.definition,
      })),
    })),
  }
}

export function wiktionaryPageUrl(term) {
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(term.toLowerCase())}#Latin`
}
