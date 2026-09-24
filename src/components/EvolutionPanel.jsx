import { useEffect, useMemo, useRef, useState } from 'react'
import { lookupMarkedForms } from '../engine/latinDictionary.js'
import { loadRules } from '../engine/latinEvolution.js'
import { buildSegments, walk } from '../engine/languageGraph.js'
import ChainTreeView from './ChainTreeView.jsx'
import LanguageCard from './LanguageCard.jsx'
import VowelKeyboard from './VowelKeyboard.jsx'

export default function EvolutionPanel({ term }) {
  const [status, setStatus] = useState('idle') // idle | loading | not-found | ready
  const [markedForm, setMarkedForm] = useState(null)
  const [alternateForms, setAlternateForms] = useState([])
  const [isManual, setIsManual] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [disabledRuleIds, setDisabledRuleIds] = useState(() => new Set())
  const [choices, setChoices] = useState([])

  const manualInputRef = useRef(null)

  useEffect(() => {
    if (!term) {
      setStatus('idle')
      setMarkedForm(null)
      return undefined
    }

    let cancelled = false
    setStatus('loading')
    setMarkedForm(null)
    setIsManual(false)
    setManualInput(term)
    setDisabledRuleIds(new Set())
    setChoices([])

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
  const segments = useMemo(() => buildSegments(rules), [rules])

  const steps = useMemo(() => {
    if (!markedForm) return null
    return walk(markedForm, 'latin', choices, segments, disabledRuleIds)
  }, [markedForm, choices, segments, disabledRuleIds])

  // Choisir une langue a l'etape `index` remplace tout ce qui suivait.
  function chooseAt(index, destination) {
    setChoices((prev) => {
      const next = prev.slice(0, index)
      if (prev[index] !== destination) next.push(destination)
      return next
    })
  }

  function toggleRule(ruleId) {
    setDisabledRuleIds((prev) => {
      const next = new Set(prev)
      if (next.has(ruleId)) next.delete(ruleId)
      else next.add(ruleId)
      return next
    })
  }

  function insertVowel(char) {
    const el = manualInputRef.current
    if (!el) {
      setManualInput((v) => v + char)
      return
    }
    const start = el.selectionStart ?? manualInput.length
    const end = el.selectionEnd ?? manualInput.length
    const next = manualInput.slice(0, start) + char + manualInput.slice(end)
    setManualInput(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + char.length
      el.setSelectionRange(pos, pos)
    })
  }

  function handleManualSubmit(e) {
    e.preventDefault()
    const value = manualInput.trim()
    if (!value) return
    setDisabledRuleIds(new Set())
    setChoices([])
    setIsManual(true)
    setMarkedForm(value)
    setStatus('ready')
  }

  if (!term || status === 'idle') return null

  return (
    <div className="evolution-panel">
      <div className="evolution-header">
        <p className="list-label">Évolution phonétique (latin → français)</p>
      </div>

      {status === 'loading' && <p className="status">Calcul en cours…</p>}

      {status === 'not-found' && (
        <div className="manual-form-entry">
          <p className="status status--muted">
            « {term} » n'est pas présent dans le dictionnaire local
            (src/data/dico_latin.csv), impossible de déterminer automatiquement les
            voyelles longues/brèves nécessaires au calcul. Vous pouvez saisir vous-même
            la forme marquée (voyelles longues à macron, brèves à brève) ci-dessous.
          </p>

          <form onSubmit={handleManualSubmit}>
            <label htmlFor="manual-marked-form" className="search-label">
              Forme marquée
            </label>
            <div className="search-row">
              <div className="search-input-wrap">
                <input
                  id="manual-marked-form"
                  type="text"
                  ref={manualInputRef}
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="ex. ăbăcus, cāmĕra…"
                  autoComplete="off"
                />
              </div>
              <button type="submit" disabled={!manualInput.trim()}>
                Utiliser cette forme
              </button>
            </div>
            <VowelKeyboard onInsert={insertVowel} />
          </form>
        </div>
      )}

      {status === 'ready' && steps && (
        <>
          <p className="status status--muted">
            Cliquez sur une flèche pour annuler (ou rétablir) la règle correspondante — la suite
            se recalcule automatiquement. Quand des règles de même date divergent selon l'ordre,
            la chaîne se divise.
          </p>

          {isManual && (
            <p className="status status--muted">
              Forme saisie manuellement (mot absent du dictionnaire local) — voyelles
              longues/brèves non vérifiées.
            </p>
          )}

          <div className="language-path">
            {steps.map((step, index) => (
              <div key={`${step.language}-${index}`}>
                <LanguageCard step={step} onChoose={(destination) => chooseAt(index, destination)} />
                {step.tree && (
                  <div className="word-chain">
                    <ChainTreeView node={step.tree} onToggle={toggleRule} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {!isManual && alternateForms.length > 0 && (
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
