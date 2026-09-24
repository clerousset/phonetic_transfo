// Compilation des règles déclaratives  A > B / L _ R  vers la regex que le
// moteur (soundChange.js) exécute déjà.
//
// Une règle est décrite par des colonnes séparées plutôt que par une regex :
//
//   Target      ce qui change
//   Result      ce que ça devient (vide = disparition)
//   Left        ce qui doit précéder, sans être modifié
//   Right       ce qui doit suivre, sans être modifié
//   Condition   contrainte sur le mot entier (voir parseCondition)
//
// Le contexte étant vérifié et jamais consommé, aucune rétro-référence n'est
// nécessaire : Result est une chaîne littérale.
//
// Syntaxe des champs Target / Left / Right :
//
//   a b ɛ …     un symbole littéral (les diacritiques combinants se collent au
//               caractère qui précède : "k̬" est un seul élément)
//   V C …       une classe nommée, définie dans classes.csv (identifiant en
//               majuscules)
//   {a,b,C}     une alternative ; chaque branche peut être une séquence
//               ("{C? r? V, #}" = une séquence OU une frontière de mot)
//   ( … )       un groupe, pour porter un quantificateur ou une négation
//   #           une frontière de mot (début dans Left, fin dans Right)
//   X? X+ X*    élément optionnel / répété
//   !X          négation : à cette position, X ne doit PAS se trouver.
//               Pour nier une séquence entière, il faut la grouper :
//               "!(C_SANS_L SON)" = "non précédé d'une consonne puis d'une
//               sonante". Plusieurs négations peuvent se suivre : "!ː !#".
//
// Target vide = insertion : "∅ > ĭ / # _ s{p,t,k}" insère ĭ à cette position.

import { parseCsvObjects } from './csv.js'
import { toJsReplacement } from './soundChange.js'

const COMBINING = /[̀-̧̯̱ͯ]/

function escapeLiteral(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Assertion de position : début de mot dans Left, fin de mot dans Right. */
const BOUNDARY = { left: '(?<![\\s\\S])', right: '(?![\\s\\S])' }

/**
 * Découpe un champ (Target, Left ou Right) en éléments.
 * Retourne une liste de { kind, value, optional, negated }.
 */
export function parseSequence(source) {
  const elements = []
  let i = 0

  while (i < source.length) {
    const char = source[i]

    if (char === ' ') {
      i++
      continue
    }

    let negated = false
    if (char === '!') {
      negated = true
      i++
      if (i >= source.length) throw new Error(`"!" en fin de séquence : ${source}`)
    }

    const head = source[i]
    let element

    if (head === '#') {
      element = { kind: 'boundary' }
      i++
    } else if (head === '{') {
      const close = matchingBracket(source, i, '{', '}')
      const alternatives = splitTopLevel(source.slice(i + 1, close))
      if (alternatives.length === 0) throw new Error(`alternative vide : ${source}`)
      element = { kind: 'alternation', value: alternatives }
      i = close + 1
    } else if (head === '(') {
      const close = matchingBracket(source, i, '(', ')')
      element = { kind: 'group', value: source.slice(i + 1, close) }
      i = close + 1
    } else if (/[A-Z]/.test(head)) {
      let name = ''
      while (i < source.length && /[A-Z0-9_]/.test(source[i])) name += source[i++]
      element = { kind: 'class', value: name }
    } else {
      let literal = source[i++]
      // les diacritiques combinants font corps avec le caractère précédent
      while (i < source.length && COMBINING.test(source[i])) literal += source[i++]
      element = { kind: 'literal', value: literal }
    }

    let quantifier = ''
    if (source[i] === '?' || source[i] === '+' || source[i] === '*') {
      quantifier = source[i]
      i++
    }

    elements.push({ ...element, quantifier, negated })
  }

  return elements
}

/** Position du délimiteur fermant correspondant à celui ouvert en `start`. */
function matchingBracket(source, start, open, close) {
  let depth = 0
  for (let i = start; i < source.length; i++) {
    if (source[i] === open) depth++
    else if (source[i] === close && --depth === 0) return i
  }
  throw new Error(`"${open}" non refermée : ${source}`)
}

/** Découpe sur les virgules de premier niveau (hors {} et ()). */
function splitTopLevel(source) {
  const parts = []
  let depth = 0
  let current = ''
  for (const char of source) {
    if (char === '{' || char === '(') depth++
    else if (char === '}' || char === ')') depth--
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current.trim())
  return parts.filter((part) => part.length > 0)
}

/** Compile un élément en fragment de regex (jamais capturant). */
function compileElement(element, classes, side) {
  let fragment

  switch (element.kind) {
    case 'boundary':
      fragment = BOUNDARY[side]
      break
    case 'class': {
      const members = classes.get(element.value)
      if (!members) throw new Error(`classe inconnue : ${element.value}`)
      // Une classe dont un membre fait plusieurs caractères (aː, tʃ…) ne peut
      // pas s'écrire comme classe de caractères : il faut une alternative.
      fragment = members.some((member) => [...member].length > 1)
        ? `(?:${members.map(escapeLiteral).join('|')})`
        : `[${members.map(escapeLiteral).join('')}]`
      break
    }
    case 'alternation':
      // chaque branche est une séquence à part entière
      fragment = `(?:${element.value.map((branch) => compileSequence(branch, classes, side)).join('|')})`
      break
    case 'group':
      fragment = `(?:${compileSequence(element.value, classes, side)})`
      break
    default:
      fragment = escapeLiteral(element.value)
      if (element.value.length > 1) fragment = `(?:${fragment})`
  }

  if (element.negated) fragment = side === 'left' ? `(?<!${fragment})` : `(?!${fragment})`
  if (element.quantifier) fragment = `${fragment}${element.quantifier}`
  return fragment
}

function compileSequence(source, classes, side) {
  return parseSequence(source)
    .map((element) => compileElement(element, classes, side))
    .join('')
}

/** Un élément est-il de largeur nulle (négation, frontière) ? */
function isAssertion(element) {
  return element.negated || element.kind === 'boundary'
}

/**
 * Compile un contexte en assertion. Un champ commençant par "!" nie le
 * contexte ENTIER ("!s" en Left = non précédé de s) ; ailleurs, "!" ne nie que
 * l'élément qui le suit.
 */
function compileContext(source, classes, side) {
  const text = (source ?? '').trim()
  if (text === '') return ''

  const elements = parseSequence(text)
  const body = elements.map((element) => compileElement(element, classes, side)).join('')

  // Des éléments tous de largeur nulle sont déjà des assertions : ils se
  // posent tels quels. Sinon il faut envelopper pour ne rien consommer.
  if (elements.every(isAssertion)) return body
  return side === 'left' ? `(?<=${body})` : `(?=${body})`
}

/**
 * Conditions portant sur le mot entier, là où un contexte local ne suffit pas.
 * Seule famille reconnue pour l'instant : le compte de syllabes, approché par
 * le nombre de voyelles (c'est ce que faisaient les `.*V.*V` des regex).
 *
 *   syllables>1   polysyllabique
 *   syllables=1   monosyllabique
 */
export function parseCondition(source, classes) {
  const text = (source ?? '').trim()
  if (text === '') return null

  const match = /^syllables\s*(>=|<=|>|<|=)\s*(\d+)$/.exec(text)
  if (!match) throw new Error(`condition non reconnue : ${text}`)

  const [, operator, rawCount] = match
  const threshold = Number(rawCount)
  const vowels = new Set(classes.get('V') ?? [])

  return (word) => {
    let syllables = 0
    for (const char of word) if (vowels.has(char)) syllables++
    switch (operator) {
      case '>': return syllables > threshold
      case '<': return syllables < threshold
      case '>=': return syllables >= threshold
      case '<=': return syllables <= threshold
      default: return syllables === threshold
    }
  }
}

/**
 * Compile une règle déclarative.
 * @returns {{ pattern: string, replacement: string, condition: ((word: string) => boolean) | null }}
 */
export function compileRule(rule, classes) {
  const target = (rule.Target ?? '').trim()
  const left = compileContext(rule.Left, classes, 'left')
  const right = compileContext(rule.Right, classes, 'right')

  // Target vide : insertion. Le pattern se réduit aux deux assertions, qui
  // désignent une position ; Result s'y insère.
  if (target === '') {
    if (left === '' && right === '') throw new Error('règle vide : ni Target ni contexte')
    return {
      pattern: left + right,
      replacement: (rule.Result ?? '').replace(/\$/g, '$$$$'),
      condition: parseCondition(rule.Condition, classes),
    }
  }

  const core = compileSequence(target, classes, 'right')

  return {
    pattern: left + core + right,
    replacement: (rule.Result ?? '').replace(/\$/g, '$$$$'),
    condition: parseCondition(rule.Condition, classes),
  }
}

/**
 * Lit un CSV de règles déclaratives et retourne des règles prêtes pour le
 * moteur (même forme que soundChange.js#parseRules : pattern, replacement,
 * regex, date, explanation), triées par Date croissante.
 *
 * Une ligne dont la colonne `Regex` est renseignée court-circuite le format
 * déclaratif : sa regex est utilisée telle quelle. C'est l'échappatoire pour
 * les quelques règles que A > B / L _ R ne sait pas dire (déplacement d'un
 * élément, gémination).
 *
 * @param {string} csvText
 * @param {Map<string, string[]>} classes
 */
export function parseDeclarativeRules(csvText, classes) {
  const rows = parseCsvObjects(csvText)

  return rows
    .map((row) => {
      const explanation = row.Explanation ?? ''
      const date = parseDate(row.Date)
      const rawReplacement = row.Result ?? ''
      const escapeHatch = (row.Regex ?? '').trim()

      let pattern
      let replacement
      let condition = null
      try {
        if (escapeHatch !== '') {
          pattern = escapeHatch
          replacement = toJsReplacement(rawReplacement)
        } else {
          const compiled = compileRule(row, classes)
          pattern = compiled.pattern
          replacement = compiled.replacement
          condition = compiled.condition
        }
      } catch (error) {
        return { pattern: '', rawReplacement, replacement: '', explanation, date, regex: null, condition: null, error: error.message }
      }

      let regex = null
      try {
        regex = new RegExp(pattern, 'g')
      } catch {
        regex = null
      }

      // `declarative` est conservé tel quel : c'est ce qui permet d'inverser la
      // règle sans avoir à relire sa regex (voir reverseRules.js).
      const declarative = escapeHatch === '' ? { Target: row.Target ?? '', Result: rawReplacement, Left: row.Left ?? '', Right: row.Right ?? '', Condition: row.Condition ?? '' } : null

      // Couple de langues : les regles partageant le meme couple forment un
      // troncon (voir languageGraph.js). Les lignees se composent — latin ->
      // latin phonetique -> francais.
      const from = (row.LangueDepart ?? '').trim()
      const to = (row.LangueDestination ?? '').trim()

      return { pattern, rawReplacement, replacement, explanation, date, regex, condition, declarative, from, to }
    })
    .sort((a, b) => a.date - b.date)
}

function parseDate(raw) {
  const value = (raw ?? '').trim()
  if (value === '-inf' || value === '-Infinity') return -Infinity
  if (value === 'inf' || value === 'Infinity') return Infinity
  const parsed = Number(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Lit le fichier de classes (colonnes Name, Members — membres séparés par des
 * espaces) et retourne une Map nom -> liste de symboles.
 */
export function parseClasses(rows) {
  const classes = new Map()
  for (const row of rows) {
    const name = (row.Name ?? '').trim()
    if (name === '') continue
    classes.set(name, (row.Members ?? '').trim().split(/\s+/).filter(Boolean))
  }
  return classes
}
