import { useEffect, useMemo, useState } from 'react'
import { lookupMarkedForms } from '../engine/latinDictionary.js'
import { loadRules } from '../engine/latinEvolution.js'
import { computeChain } from '../engine/soundChange.js'
import WordNode from './WordNode.jsx'
import TransformArrow from './TransformArrow.jsx'

export default function EvolutionPanel({ term }) {
  const [status, setStatus] = useState('idle') // idle | loading | not-found | ready
  const [markedForm, setMarkedForm] = useState(null)
  const [alternateForms, setAlternateForms] = useState([])
  const [disabledRuleIds, setDisabledRuleIds] = useState(() => new Set())

  useEffect(() => {
    if (!term) {
      setStatus('idle')
      setMarkedForm(null)
      return undefined
    }

    let cancelled = false
    setStatus('loading')
    setMarkedForm(null)
    setDisabledRuleIds(new Set())

    lookupMarkedForms(term).then((matches) => {
      if (cancelled) return
      if (!matches || matches.length === 0) {
        setStatus('not-found')
      } else {
        const [first, ...rest] = matches
        setMarkedForm(first)
        setAlternateForms(rest)
        setStatus('ready')
      }
    })

    return () => {
      cancelled = true
    }
  }, [term])

  const rules = useMemo(() => loadRules(), [])

  const chain = useMemo(() => {
    if (!markedForm) return null
    const { result, timeline } = computeChain(markedForm, rules, disabledRuleIds)
    const lastActiveIndex = timeline.reduce((acc, s, i) => (s.disabled ? acc : i), -1)
    return { result, timeline, lastActiveIndex }
  }, [markedForm, rules, disabledRuleIds])

  function toggleRule(ruleId) {
    setDisabledRuleIds((prev) => {
      const next = new Set(prev)
      if (next.has(ruleId)) next.delete(ruleId)
      else next.add(ruleId)
      return next
    })
  }

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

      {status === 'ready' && chain && (
        <>
          <p className="status status--muted">
            Cliquez sur une flèche pour annuler (ou rétablir) la règle correspondante — la suite
            de la chaîne se recalcule automatiquement.
          </p>

          <div className="word-chain">
            <WordNode word={markedForm} label="latin" final={chain.lastActiveIndex === -1} />

            {chain.timeline.length === 0 && (
              <p className="status status--muted">Aucune règle applicable à ce mot.</p>
            )}

            {chain.timeline.map((step, i) => (
              <div className="chain-link" key={step.ruleId}>
                <TransformArrow step={step} onToggle={() => toggleRule(step.ruleId)} />
                {!step.disabled && (
                  <WordNode word={step.after} final={i === chain.lastActiveIndex} />
                )}
              </div>
            ))}
          </div>

          {alternateForms.length > 0 && (
            <p className="status status--muted">
              Autres formes trouvées pour « {term} » : {alternateForms.join(', ')} (non utilisées
              ici).
            </p>
          )}
        </>
      )}
    </div>
  )
}
