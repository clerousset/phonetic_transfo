function formatDate(date) {
  if (date === Infinity) return '∞'
  if (date === -Infinity) return '−∞'
  return String(date)
}

/**
 * Flèche entre deux mots représentant une règle appliquée (ou désactivée par
 * l'utilisateur). Cliquer dessus bascule l'état de la règle : la chaîne se
 * recalcule automatiquement (voir EvolutionPanel).
 */
export default function TransformArrow({ step, onToggle }) {
  return (
    <div className={step.disabled ? 'transform transform--disabled' : 'transform'}>
      <button
        type="button"
        className="transform-toggle"
        onClick={onToggle}
        aria-pressed={!step.disabled}
        title={step.disabled ? 'Rétablir cette règle' : 'Annuler cette règle'}
      >
        <span className="transform-arrow" aria-hidden="true">
          ↓
        </span>
      </button>
      <span className="transform-label">
        {step.explanation}
        <span className="transform-date"> (date {formatDate(step.date)})</span>
        {step.disabled && (
          <span className="transform-cancelled"> — annulée, aurait donné « {step.after} »</span>
        )}
      </span>
    </div>
  )
}
