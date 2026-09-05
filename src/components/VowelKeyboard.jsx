// Petit clavier visuel pour saisir les voyelles latines marquées (longues à
// macron, brèves à brève) que le moteur d'évolution attend en entrée mais
// qu'un clavier standard ne permet pas de taper directement.

const LONG_VOWELS = ['ā', 'ē', 'ī', 'ō', 'ū']
const SHORT_VOWELS = ['ă', 'ĕ', 'ĭ', 'ŏ', 'ŭ']

export default function VowelKeyboard({ onInsert }) {
  return (
    <div className="vowel-keyboard">
      <div className="vowel-keyboard-row">
        <span className="vowel-keyboard-label">longues</span>
        {LONG_VOWELS.map((v) => (
          <button
            key={v}
            type="button"
            className="vowel-key"
            onClick={() => onInsert(v)}
            title={`voyelle longue ${v}`}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="vowel-keyboard-row">
        <span className="vowel-keyboard-label">brèves</span>
        {SHORT_VOWELS.map((v) => (
          <button
            key={v}
            type="button"
            className="vowel-key"
            onClick={() => onInsert(v)}
            title={`voyelle brève ${v}`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}
