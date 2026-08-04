export default function WordNode({ word, label, final }) {
  return (
    <div className={final ? 'word-node word-node--final' : 'word-node'}>
      {label && <span className="word-node-label">{label}</span>}
      <span className="word-node-text">{word}</span>
    </div>
  )
}
