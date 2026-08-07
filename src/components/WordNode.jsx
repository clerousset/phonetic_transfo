import { useState } from 'react'
import { pronounce } from '../engine/pronounce.js'

export default function WordNode({ word, label, final }) {
  const [status, setStatus] = useState('idle') // idle | loading | error

  async function handlePlay() {
    if (status === 'loading') return
    setStatus('loading')
    try {
      await pronounce(word)
      setStatus('idle')
    } catch (err) {
      console.warn('Prononciation impossible pour', word, err)
      setStatus('error')
    }
  }

  return (
    <div className={final ? 'word-node word-node--final' : 'word-node'}>
      {label && <span className="word-node-label">{label}</span>}
      <span className="word-node-text">{word}</span>
      <button
        type="button"
        className={status === 'error' ? 'word-node-play word-node-play--error' : 'word-node-play'}
        onClick={handlePlay}
        disabled={status === 'loading'}
        title={status === 'error' ? 'Prononciation indisponible (expérimental)' : 'Écouter (expérimental)'}
        aria-label={`Écouter ${word}`}
      >
        {status === 'loading' ? '…' : status === 'error' ? '⚠' : '🔊'}
      </button>
    </div>
  )
}
