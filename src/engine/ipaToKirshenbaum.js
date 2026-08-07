// Convertit (au mieux) les mots produits par le moteur d'évolution phonétique
// vers la notation Kirshenbaum (ASCII-IPA) attendue par eSpeak-NG en entrée
// phonème brut (syntaxe `[[...]]`).
//
// Table de correspondance basée sur la documentation officielle d'eSpeak-NG :
// https://github.com/espeak-ng/espeak-ng/blob/master/docs/phonemes/kirshenbaum.md
//
// AVERTISSEMENT : ce mapping est fait au mieux, sans avoir pu être testé avec
// un vrai moteur audio (voir README). Les symboles non standards utilisés en
// interne par le CSV de règles (ex. le ̬ qui marque une palatalisation en
// cours, censé disparaître avant la fin de la chaîne) et les artefacts de
// données non convertis par rules_latin_phonetic.csv (voyelles marquées non
// couvertes, majuscules de noms propres...) sont abandonnés silencieusement
// plutôt que d'interrompre la synthèse.

// Voyelles : IPA -> code Kirshenbaum (voir table "Vowels" du document).
const VOWELS = {
  a: 'a',
  e: 'e',
  i: 'i',
  o: 'o',
  u: 'u',
  y: 'y',
  ø: 'Y',
  œ: 'W',
  ɛ: 'E',
  ɔ: 'O',
  ə: '@',
  ɑ: 'A',
}

// Consonnes : IPA -> code Kirshenbaum (table "Consonants" + "Other Symbols").
const CONSONANTS = {
  p: 'p',
  b: 'b',
  t: 't',
  d: 'd',
  k: 'k',
  g: 'g',
  f: 'f',
  v: 'v',
  s: 's',
  z: 'z',
  m: 'm',
  n: 'n',
  l: 'l',
  ɫ: 'l', // "l" vélarisé : notation propre à ce projet, pas de code Kirshenbaum
  // dédié ici -> simplifié en "l" (perte de la coloration vélaire).
  j: 'j',
  w: 'w',
  h: 'h',
  ʃ: 'S',
  ʒ: 'Z',
  ʀ: 'r"', // trille uvulaire voisée (r français)
  x: 'x', // fricative vélaire sourde
  γ: 'Q', // fricative vélaire voisée
  β: 'B', // fricative bilabiale voisée
  δ: 'D', // fricative dentale voisée (ð) — notation ad hoc de ce projet pour ð
  θ: 'T', // fricative dentale sourde
}

// Diacritiques combinants gérés explicitement (agissent sur le caractère qui
// les précède). `̃` = nasalisation, `ʷ` = labialisation.
const NASALIZATION = '̃' // ̃
const LABIALIZATION = 'ʷ' // ʷ (kʷ, gʷ)
const NON_SYLLABIC = '̯' // ̯ (i̯, u̯...)
const PROJECT_PALATAL_MARK = '̬' // ̬ : marqueur interne, pas de l'IPA standard

const STRESS = 'ˈ' // ˈ

/**
 * Convertit un mot (issu du moteur d'évolution) en chaîne de phonèmes
 * Kirshenbaum, prête à être enveloppée dans `[[...]]` pour eSpeak-NG.
 *
 * @param {string} word
 * @returns {string}
 */
export function toKirshenbaumPhonemes(word) {
  // Décomposition canonique : sépare les lettres accentuées précomposées
  // (résidus de dico_latin.csv non convertis) en lettre de base + diacritiques,
  // pour au moins récupérer la lettre de base au lieu de tout perdre.
  const chars = Array.from(word.normalize('NFD'))
  let out = ''

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]

    if (c === STRESS) {
      out += "'"
      continue
    }
    if (c === PROJECT_PALATAL_MARK || c === NON_SYLLABIC) {
      // Ces marques ne devraient normalement plus être présentes dans un mot
      // final "propre" ; si elles le sont (règle manquante, mot inhabituel),
      // on les ignore plutôt que de faire échouer la synthèse.
      continue
    }
    if (c === NASALIZATION || c === LABIALIZATION) {
      // Traités en avance via lookahead ci-dessous ; ne devrait pas être
      // atteint isolément, mais on ignore par sécurité.
      continue
    }

    const next = chars[i + 1]

    if (VOWELS[c]) {
      let code = VOWELS[c]
      if (next === NASALIZATION) {
        code += '~'
        i++
      }
      out += code
      continue
    }

    if (CONSONANTS[c]) {
      let code = CONSONANTS[c]
      if (next === LABIALIZATION) {
        code += '<w>'
        i++
      }
      out += code
      continue
    }

    // Repli : une lettre ASCII simple inconnue de nos tables (ex. résidu non
    // converti) est laissée telle quelle ; tout le reste est abandonné.
    if (/[a-z]/i.test(c)) {
      out += c.toLowerCase()
    }
  }

  return out
}
