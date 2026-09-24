import WordNode from './WordNode.jsx'

function formatDate(date) {
  if (date === null || date === undefined) return null
  if (date === -Infinity) return 'origine'
  const year = Math.round(date)
  return year < 0 ? `${-year} av. J.-C.` : `${year} ap. J.-C.`
}

/**
 * Une étape du parcours : le mot dans une langue, à une date, et les langues
 * vers lesquelles on peut poursuivre. Les pills sont un choix — tant qu'on n'a
 * pas cliqué, la suite n'est pas calculée.
 */
export default function LanguageCard({ step, onChoose }) {
  const date = formatDate(step.date)

  return (
    <div className="language-card">
      <div className="language-card-head">
        <span className="language-card-name">{step.language}</span>
        {date && <span className="language-card-date">{date}</span>}
      </div>

      <WordNode word={step.word} final={step.options.length === 0} />

      {step.options.length > 0 ? (
        <div className="pill-row" role="group" aria-label="Langues accessibles">
          {step.options.map((option) => (
            <button
              key={option.to}
              type="button"
              className={option.to === step.chosen ? 'pill pill--active' : 'pill'}
              aria-pressed={option.to === step.chosen}
              onClick={() => onChoose(option.to)}
            >
              {option.to}
              <span className="pill-count">{option.rules.length}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="status status--muted">Aucune suite connue depuis cette langue.</p>
      )}
    </div>
  )
}
