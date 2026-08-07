// Synthèse vocale expérimentale des mots phonétiques, via eSpeak-NG compilé
// en WebAssembly (package npm "espeak-ng") : tout se passe dans le
// navigateur, aucun backend, cohérent avec le reste du site.
//
// NON TESTÉ. Ce module n'a pas pu être vérifié avec un vrai moteur audio ni
// un vrai navigateur dans l'environnement où il a été écrit (pas d'accès au
// registre npm, pas de lecture audio possible). Voir README > Prononciation
// pour la liste des points à vérifier en premier si ça ne fonctionne pas.

import { toKirshenbaumPhonemes } from './ipaToKirshenbaum.js'

/**
 * Charge (à la demande) et exécute eSpeak-NG avec les arguments donnés.
 * Le paquet expose un programme CLI compilé via Emscripten : chaque appel
 * relance une instance pilotée par ses arguments de ligne de commande — il
 * n'y a pas d'API "haut niveau" de type `speak(text)`. Voir son README :
 * https://github.com/ianmarmour/espeak-ng.js
 */
async function runEspeak(args) {
  const { default: ESpeakNg } = await import('espeak-ng')
  return ESpeakNg({ arguments: args })
}

/**
 * Synthétise puis joue un mot (déjà dans la notation phonétique du projet)
 * via eSpeak-NG, en le convertissant d'abord en phonèmes Kirshenbaum.
 *
 * @param {string} word
 * @param {{ voice?: string }} [options] `voice` : voix eSpeak-NG à utiliser
 *   (par défaut "en-us" — une voix française donnerait sans doute un rendu
 *   plus naturel pour un résultat évolué vers le français, à essayer).
 * @returns {Promise<void>} résolue quand la lecture est terminée.
 */
export async function pronounce(word, { voice = 'en-us' } = {}) {
  const phonemes = toKirshenbaumPhonemes(word)
  if (!phonemes) {
    throw new Error(`Aucun phonème reconnu dans « ${word} ».`)
  }

  const outFile = 'out.wav'
  const espeak = await runEspeak(['-w', outFile, '-v', voice, `[[${phonemes}]]`])

  const bytes = espeak.FS.readFile(outFile)
  const blob = new Blob([bytes], { type: 'audio/wav' })
  const url = URL.createObjectURL(blob)

  try {
    const audio = new Audio(url)
    await audio.play()
    await new Promise((resolve, reject) => {
      audio.addEventListener('ended', resolve, { once: true })
      audio.addEventListener('error', () => reject(new Error('Lecture audio impossible.')), {
        once: true,
      })
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
