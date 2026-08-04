import { wiktionaryPageUrl } from '../api/wiktionary.js'
import EvolutionPanel from './EvolutionPanel.jsx'

export default function DefinitionPanel({ term, status, error, entries }) {
  if (!term) {
    return (
      <div className="definition-panel definition-panel--empty">
        <p>Choisissez un mot latin dans la liste pour afficher sa définition.</p>
      </div>
    )
  }

  return (
    <div className="definition-panel">
      <h2>{term}</h2>

      {status === 'loading' && <p className="status">Chargement depuis Wiktionary…</p>}

      {status === 'error' && (
        <p className="status status--error">
          {error}{' '}
          <a href={wiktionaryPageUrl(term)} target="_blank" rel="noreferrer">
            Voir sur Wiktionary
          </a>
        </p>
      )}

      {status === 'success' && (
        <>
          {entries.map((entry, i) => (
            <div className="entry" key={i}>
              <p className="pos">{entry.partOfSpeech}</p>
              <ol>
                {entry.definitions.map((d, j) => (
                  // eslint-disable-next-line react/no-danger
                  <li key={j} dangerouslySetInnerHTML={{ __html: d.definitionHtml }} />
                ))}
              </ol>
            </div>
          ))}
          <a
            className="source-link"
            href={wiktionaryPageUrl(term)}
            target="_blank"
            rel="noreferrer"
          >
            Source : Wiktionary ↗
          </a>

          <EvolutionPanel term={term} />
        </>
      )}
    </div>
  )
}
