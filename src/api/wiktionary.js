// Client minimal pour l'API REST publique de Wiktionary.
// Doc: https://en.wiktionary.org/api/rest_v1/  (section "Page content" > /page/definition/{term})
// Cette API est ouverte en CORS, donc utilisable directement depuis le navigateur, sans backend.

const REST_BASE = 'https://en.wiktionary.org/api/rest_v1/page/definition'
const ACTION_API = 'https://en.wiktionary.org/w/api.php'

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

/**
 * Suggestions de complétion (titres de pages Wiktionary commençant par `prefix`).
 * Utilise l'API opensearch de MediaWiki, ouverte en CORS via origin=*.
 * Ne filtre pas par langue : les suggestions peuvent inclure des mots non latins,
 * l'appel à fetchLatinDefinition se chargera de signaler l'absence de section latine.
 *
 * @param {string} prefix
 * @param {{ limit?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<string[]>}
 */
export async function fetchTermSuggestions(prefix, { limit = 8, signal } = {}) {
  const params = new URLSearchParams({
    action: 'opensearch',
    format: 'json',
    origin: '*',
    namespace: '0',
    limit: String(limit),
    search: prefix,
  })

  const response = await fetch(`${ACTION_API}?${params.toString()}`, { signal })
  if (!response.ok) return []

  const data = await response.json()
  return Array.isArray(data) && Array.isArray(data[1]) ? data[1] : []
}

export function wiktionaryPageUrl(term) {
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(term.toLowerCase())}#Latin`
}
