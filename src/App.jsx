import { useState } from 'react'
import { LATIN_WORDS } from './data/latinWords.js'
import { fetchLatinDefinition } from './api/wiktionary.js'
import DefinitionPanel from './components/DefinitionPanel.jsx'

export default function App() {
  const [selected, setSelected] = useState(null) // term string
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [entries, setEntries] = useState([])
  const [error, setError] = useState(null)

  async function handleSelect(term) {
    setSelected(term)
    setStatus('loading')
    setError(null)
    setEntries([])

    try {
      const result = await fetchLatinDefinition(term)
      setEntries(result.entries)
      setStatus('success')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Ingenium</h1>
        <p className="subtitle">Choisissez un mot latin — sa définition est chargée en direct depuis Wiktionary.</p>
      </header>

      <main>
        <ul className="word-list">
          {LATIN_WORDS.map(({ term, hint }) => (
            <li key={term}>
              <button
                className={term === selected ? 'word-button word-button--active' : 'word-button'}
                onClick={() => handleSelect(term)}
              >
                <span className="term">{term}</span>
                <span className="hint">{hint}</span>
              </button>
            </li>
          ))}
        </ul>

        <DefinitionPanel term={selected} status={status} error={error} entries={entries} />
      </main>
    </div>
  )
}
