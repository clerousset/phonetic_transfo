import { useEffect, useState } from 'react'
import { evolveLatinWord } from '../engine/latinEvolution.js'

export default function EvolutionPanel({ term }) {
  const [status, setStatus] = useState('idle') // idle | loading | not-found | success
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!term) {
      setStatus('idle')
      setData(null)
      return undefined
    }

    let cancelled = false
    setStatus('loading')
    setData(null)

    evolveLatinWord(term).then((res) => {
      if (cancelled) return
      if (!res.found) {
        setStatus('not-found')
      } else {
        setData(res)
        setStatus('success')
      }
    })

    return () => {
      cancelled = true
    }
  }, [term])

  if (!term || status === 'idle') return null

  return (
    <div className="evolution-panel">
      <p className="list-label">Évolution phonétique (latin → français)</p>

      {status === 'loading' && <p className="status">Calcul en cours…</p>}

      {status === 'not-found' && (
        <p className="status status--muted">
          « {term} » n'est pas présent dans le dictionnaire local (src/data/dico_latin.csv),
          impossible de déterminer les voyelles longues/brèves nécessaires au calcul.
        </p>
      )}

      {status === 'success' && data && (
        <>
          <p className="evolution-result">
            <span className="evolution-from">{data.markedForm}</span>
            <span className="evolution-arrow">→</span>
            <span className="evolution-to">{data.result}</span>
          </p>

          {data.alternateForms.length > 0 && (
            <p className="status status--muted">
              Autres formes trouvées pour « {term} » : {data.alternateForms.join(', ')} (non utilisées ici).
            </p>
          )}

          {data.steps.length > 0 && (
            <details className="evolution-steps">
              <summary>Voir les {data.steps.length} étapes appliquées</summary>
              <ol>
                {data.steps.map((s, i) => (
                  <li key={i}>
                    <code>{s.before}</code> → <code>{s.after}</code>
                    <span className="step-meta">
                      {' '}
                      — {s.explanation} (date {Number.isFinite(s.date) ? s.date : s.date > 0 ? '∞' : '−∞'})
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </div>
  )
}
