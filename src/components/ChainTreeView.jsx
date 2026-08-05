import WordNode from './WordNode.jsx'
import TransformArrow from './TransformArrow.jsx'

// Rendu récursif de l'arbre produit par engine/soundChange.js#buildChainTree.
// Un nœud est soit une feuille (rien à afficher de plus), soit un chemin
// unique (une suite de flèches vers un seul mot suivant), soit une
// bifurcation (plusieurs ordres possibles pour des règles de même Date,
// menant à des mots différents : une colonne par résultat).

function cancelledAsStep(note) {
  return {
    ruleId: note.ruleId,
    date: note.date,
    explanation: note.explanation,
    after: note.wouldBe,
    disabled: true,
  }
}

function appliedAsStep(step) {
  return { ...step, disabled: false }
}

export default function ChainTreeView({ node, onToggle }) {
  if (node.isLeaf) return null

  const cancelledArrows = node.cancelled.map((note) => (
    <TransformArrow
      key={`cancelled-${note.ruleId}`}
      step={cancelledAsStep(note)}
      onToggle={() => onToggle(note.ruleId)}
    />
  ))

  if (!node.forked) {
    return (
      <div className="chain-segment">
        {cancelledArrows}
        {node.steps.map((step) => (
          <TransformArrow
            key={step.ruleId}
            step={appliedAsStep(step)}
            onToggle={() => onToggle(step.ruleId)}
          />
        ))}
        {node.tooManySimultaneous && (
          <p className="status status--muted">
            Trop de règles simultanées à cette date pour tester tous les ordres possibles :
            un seul ordre est affiché.
          </p>
        )}
        {node.truncatedFork && (
          <p className="status status--muted">
            Cette date aurait aussi divergé selon l'ordre, mais le nombre de branches déjà
            affichées est limité : un seul résultat est montré ici.
          </p>
        )}
        <WordNode word={node.next.word} final={node.next.isLeaf} />
        <ChainTreeView node={node.next} onToggle={onToggle} />
      </div>
    )
  }

  return (
    <div className="chain-fork-wrapper">
      {cancelledArrows}
      <p className="status status--muted fork-note">
        Ces règles partagent la même date et leur ordre change le résultat — {node.branches.length}{' '}
        possibilités :
      </p>
      <div className="chain-fork">
        {node.branches.map((branch, i) => (
          <div className="chain-branch" key={i}>
            <p className="branch-label">Ordre {i + 1}</p>
            {branch.steps.map((step) => (
              <TransformArrow
                key={step.ruleId}
                step={appliedAsStep(step)}
                onToggle={() => onToggle(step.ruleId)}
              />
            ))}
            <WordNode word={branch.next.word} final={branch.next.isLeaf} />
            <ChainTreeView node={branch.next} onToggle={onToggle} />
          </div>
        ))}
      </div>
    </div>
  )
}
