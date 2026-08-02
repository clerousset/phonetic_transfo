# Ingenium

*ingenium, -iī* (n.) — talent naturel, ingéniosité, dispositif ; en latin médiéval : machine, engin. Racine de l'anglais *engine* et du français *ingénieux*.

## Description

Site web / outil (React + Vite) versionné avec git.

La page d'accueil permet de chercher n'importe quel mot latin (champ de
recherche avec suggestions) ou d'en choisir un dans une liste d'exemples
pré-sélectionnée. Dans les deux cas, la définition (section latine) est
récupérée en direct depuis l'API publique de Wiktionary — aucun backend,
aucune base de données locale.

Les suggestions combinent les mots de la liste d'exemples (correspondance
locale immédiate) et l'API `opensearch` de Wiktionary (titres de pages
commençant par ce qui est tapé, avec un léger debounce). Ces suggestions
réseau ne sont pas filtrées par langue : sélectionner l'une d'elles peut
mener à un mot sans section latine, auquel cas le message d'erreur habituel
s'affiche avec un lien vers la page Wiktionary.

## Structure

```
ingenium/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx
│   ├── App.jsx / App.css
│   ├── data/latinWords.js       # liste d'exemples proposée sur l'accueil
│   ├── api/wiktionary.js        # client REST (définitions) + opensearch (suggestions)
│   └── components/
│       ├── SearchBox.jsx        # champ de recherche libre
│       └── DefinitionPanel.jsx  # affichage de la définition
├── public/
└── docs/
```

## Démarrage

```bash
npm install
npm run dev
```

Puis ouvrir l'URL affichée par Vite (http://localhost:5173 par défaut).

## Notes

- API utilisée : `https://en.wiktionary.org/api/rest_v1/page/definition/{mot}`
  (endpoint public, CORS ouvert, appelé directement depuis le navigateur).
- Si un mot n'a pas de section latine sur Wiktionary, un message d'erreur
  s'affiche avec un lien direct vers la page Wiktionary.
- Pour ajouter/retirer des mots proposés sur l'accueil, modifier
  `src/data/latinWords.js`.
