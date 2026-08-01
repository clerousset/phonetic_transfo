import { useState } from 'react'

export default function SearchBox({ onSearch, disabled }) {
  const [value, setValue] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const term = value.trim()
    if (term) onSearch(term)
  }

  return (
    <form className="search-box" onSubmit={handleSubmit}>
      <label htmlFor="latin-search" className="search-label">
        Chercher un autre mot latin
      </label>
      <div className="search-row">
        <input
          id="latin-search"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ex. lumen, virtus, tempus…"
          autoComplete="off"
          disabled={disabled}
        />
        <button type="submit" disabled={disabled || !value.trim()}>
          Chercher
        </button>
      </div>
    </form>
  )
}
