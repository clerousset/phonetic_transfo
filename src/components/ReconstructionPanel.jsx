import { useMemo, useState } from 'react'
import { loadRules } from '../engine/latinEvolution.js'
import { buildReverseRules, buildReverseTree } from '../engine/reverseRules.js'
import WordNode from './WordNode.jsx'
import ChainTreeView from './ChainTreeView.jsx'

export default function ReconstructionPanel() {
  const [input, setInput] = useState('')
  const [submitted, setSubmitted] = useState(null)
  const [disabledRuleIds, setDisabledRuleIds] = useState(() => new Set())

  const forwardRules = useMemo(() => loadRules(), [])
  const reverseRules = useMemo(() => buildReverseRules(forwardRules), [forwardRules])

  const tree = useMemo(() => {
    if (!submitted) return null
    return buildReverseTree(submitted, reverseRules, disabledRuleIds)
  }, [submitted, reverseRules, disabledRuleIds])

  function handleSubmit(e) {
    e.preventDefault()
    const term = input.trim()
    if (!term) return
    setDisabledRuleIds(new Set())
    setSubmitted(term)
  }

  function toggleRule(ruleId) {
    setDisabledRuleIds((prev) => {
      const next = new Set(prev)
      if (next.has(ruleId)) next.delete(ruleId)
      else next.add(ruleId)
      return next
    })
  }

  return (
    <div className="evolution-panel reconstruction-panel">
      <p className="list-label">Reconstruction : origine latine possible</p>
      <p className="status status--muted">
        Partez d'un mot dans l'alphabet phonétique du site (par exemple un résultat obtenu
        au-dessus) pour explorer les ancêtres compatibles avec les règles, en remontant le temps.
        Seules les règles inversibles <em>sans ambiguïté</em> sont remontées (voir README) —
        attendez-vous à beaucoup de bifurcations : chaque endroit où de l'information a pu être
        perdue en chemin (ex. une lettre supprimée) ouvre deux possibilités, réinsérée ou non.
      </p>

      <form className="search-box" onSubmit={handleSubmit}>
        <label htmlFor="reconstruct-input" className="search-label">
          Mot phonétique (français)
        </label>
        <div className="search-row">
          <div className="search-input-wrap">
            <input
              id="reconstruct-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="ex. fˈɔʀm, ami, tɛʀ…"
              autoComplete="off"
            />
          </div>
          <button type="submit" disabled={!input.trim()}>
            Reconstruire
          </button>
        </div>
      </form>

      {tree && (
        <div className="word-chain">
          <WordNode word={submitted} label="français (phonétique)" final={tree.isLeaf} />
          <ChainTreeView node={tree} onToggle={toggleRule} />
        </div>
      )}
    </div>
  )
}
