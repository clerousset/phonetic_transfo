import { useEffect, useMemo, useRef, useState } from 'react'
import { lookupMarkedForms } from '../engine/latinDictionary.js'
import { loadRules, VARIANTS } from '../engine/latinEvolution.js'
import { buildChainTree } from '../engine/soundChange.js'
import WordNode from './WordNode.jsx'
import ChainTreeView from './ChainTreeView.jsx'
import VowelKeyboard from './VowelKeyboard.jsx'

export default function EvolutionPanel({ term }) {
  const [status, setStatus] = useState('idle') // idle | loading | not-found | ready
  const [markedForm, setMarkedForm] = useState(null)
  const [alternateForms, setAlternateForms] = useState([])
  const [isManual, setIsManual] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [variant, setVariant] = useState('french')
  const [disabledRuleIds, setDisabledRuleIds] = useState(() => new Set())

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

  const rules = useMemo(() => loadRules(variant), [variant])

  const tree = useMemo(() => {
    if (!markedForm) return null
    return buildChainTree(markedForm, rules, disabledRuleIds)
  }, [markedForm, rules, disabledRuleIds])

  function handleVariantChange(next) {
    if (next === variant) return
    setVariant(next)
    setDisabledRuleIds(new Set()) // les id de règles ne sont pas partagés entre variantes
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
    setIsManual(true)
    setMarkedForm(value)
    setStatus('ready')
  }

  if (!term || status === 'idle') return null

  return (
    <div className="evolution-panel">
      <div className="evolution-header">
        <p className="list-label">Évolution phonétique (latin → {VARIANTS[variant].label})</p>
        <div className="variant-switch" role="group" aria-label="Variante d'évolution">
          {Object.entries(VARIANTS).map(([key, { label }]) => (
            <button
              key={key}
              type="button"
              className={key === variant ? 'variant-button variant-button--active' : 'variant-button'}
              onClick={() => handleVariantChange(key)}
              aria-pressed={key === variant}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {variant === 'savoyard' && (
        <p className="status status--muted">
          Règles expérimentales reconstituées à partir des particularités dialectales
          décrites sur{' '}
          <a
            href="https://fr.wikipedia.org/wiki/Savoyard_(langue)#Particularit%C3%A9s_dialectales_du_savoyard"
            target="_blank"
            rel="noreferrer"
          >
            Wikipédia
          </a>{' '}
          (src/data/rulesSavoyard.csv) — bifurcation fréquente, une branche par variante
          régionale documentée (Annecy, Val d'Arly, Maurienne, Tarentaise…).
        </p>
      )}

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

      {status === 'ready' && tree && (
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

          <div className="word-chain">
            <WordNode word={markedForm} label="latin" final={tree.isLeaf} />
            <ChainTreeView node={tree} onToggle={toggleRule} />
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
