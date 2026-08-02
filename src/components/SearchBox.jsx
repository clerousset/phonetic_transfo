import { useEffect, useRef, useState } from 'react'
import { fetchTermSuggestions } from '../api/wiktionary.js'
import { LATIN_WORDS } from '../data/latinWords.js'

const DEBOUNCE_MS = 250
const MIN_CHARS = 2
const MAX_SUGGESTIONS = 8

export default function SearchBox({ onSearch, disabled }) {
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const containerRef = useRef(null)
  const debounceRef = useRef(null)
  const abortRef = useRef(null)

  // Recherche de suggestions : correspondances locales (liste d'exemples) immédiates,
  // complétées par les suggestions Wiktionary en direct (debounce + annulation de la
  // requête précédente).
  useEffect(() => {
    const term = value.trim()

    clearTimeout(debounceRef.current)
    abortRef.current?.abort()

    if (term.length < MIN_CHARS) {
      setSuggestions([])
      setIsOpen(false)
      return undefined
    }

    const localMatches = LATIN_WORDS.map((w) => w.term).filter((t) =>
      t.toLowerCase().startsWith(term.toLowerCase()),
    )
    setSuggestions(localMatches)
    setIsOpen(localMatches.length > 0)

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller

      let remoteMatches = []
      try {
        remoteMatches = await fetchTermSuggestions(term, {
          limit: MAX_SUGGESTIONS,
          signal: controller.signal,
        })
      } catch {
        // Suggestions réseau indisponibles : on garde les correspondances locales déjà affichées.
        return
      }

      setSuggestions((current) => {
        const merged = [...localMatches]
        for (const t of remoteMatches) {
          if (!merged.some((m) => m.toLowerCase() === t.toLowerCase())) merged.push(t)
        }
        return merged.slice(0, MAX_SUGGESTIONS)
      })
      setIsOpen(true)
      setActiveIndex(-1)
    }, DEBOUNCE_MS)

    return () => clearTimeout(debounceRef.current)
  }, [value])

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function commit(term) {
    setValue(term)
    setSuggestions([])
    setIsOpen(false)
    onSearch(term)
  }

  function handleSubmit(e) {
    e.preventDefault()
    const term = value.trim()
    if (term) commit(term)
  }

  function handleKeyDown(e) {
    if (!isOpen || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      commit(suggestions[activeIndex])
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <form className="search-box" onSubmit={handleSubmit} ref={containerRef}>
      <label htmlFor="latin-search" className="search-label">
        Chercher un mot latin
      </label>
      <div className="search-row">
        <div className="search-input-wrap">
          <input
            id="latin-search"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setIsOpen(true)}
            placeholder="ex. lumen, virtus, tempus…"
            autoComplete="off"
            disabled={disabled}
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            aria-controls="latin-search-suggestions"
          />
          {isOpen && (
            <ul className="suggestions" id="latin-search-suggestions" role="listbox">
              {suggestions.map((s, i) => (
                <li key={s} role="option" aria-selected={i === activeIndex}>
                  <button
                    type="button"
                    className={i === activeIndex ? 'suggestion suggestion--active' : 'suggestion'}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commit(s)}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="submit" disabled={disabled || !value.trim()}>
          Chercher
        </button>
      </div>
    </form>
  )
}
