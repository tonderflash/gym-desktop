// CSV parse/serialize compatible con el módulo csv de Python
// (comillas dobles, campos con comas/saltos de línea, escape "").

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  if (rows.length === 0) return []
  const header = rows[0]
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {}
    header.forEach((h, idx) => { obj[h] = r[idx] ?? '' })
    return obj
  })
}

function escapeField(v: string): string {
  if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"'
  return v
}

export function serializeCsv(header: string[], rows: Record<string, string>[]): string {
  const lines = [header.map(escapeField).join(',')]
  for (const row of rows) {
    lines.push(header.map((h) => escapeField(row[h] ?? '')).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

/**
 * Sanitiza texto libre que va al CSV (notes, títulos de Hevy):
 * - colapsa saltos de línea/tabs
 * - neutraliza inyección de fórmulas (=, +, -, @ al inicio se ejecutan como
 *   fórmula al abrir el CSV en Excel/Numbers/Sheets)
 */
export function sanitizeCsvText(v: string, maxLen = 500): string {
  const t = v.replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLen)
  return /^[=+\-@]/.test(t) ? `'${t}` : t
}

export function csvHeader(text: string): string[] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  // header simple (sin comillas anidadas en nombres de columna)
  return firstLine.length ? firstLine.split(',') : []
}
