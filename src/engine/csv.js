// Parseur CSV minimal (champs entre guillemets, guillemets échappés en "",
// virgules et retours à la ligne à l'intérieur des champs cités).
// Suffisant pour les fichiers de src/data/*.csv, sans dépendance externe.

export function parseCsvRows(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
      continue
    }

    if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

/**
 * Transforme les lignes CSV (avec en-tête) en tableau d'objets { colonne: valeur }.
 */
export function parseCsvObjects(text) {
  const [header, ...rows] = parseCsvRows(text)
  if (!header) return []
  return rows.map((row) => Object.fromEntries(header.map((key, i) => [key, row[i] ?? ''])))
}
