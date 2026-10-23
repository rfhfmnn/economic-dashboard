/**
 * Text and title formatting utilities according to Spanish grammatical standards.
 */

const PRESERVED_ACRONYMS = new Set([
  'BCRA',
  'USD',
  'ARS',
  'UVA',
  'UVI',
  'CER',
  'BADLAR',
  'BAIBAR',
  'MEP',
  'CCL',
  'TNA',
  'TEA',
  'DEG',
  'A3500',
  'IPC',
  'AFIP',
  'CUIT',
  'CUIL',
  'AL30',
  'GD30',
])

const PRESERVED_ABBREVIATIONS = new Set(['com.', 'no.', 'nro.', 'art.', 'inc.', 'sr.', 'sra.'])

/**
 * Converts a title to Spanish grammatical case (sentence case):
 * - First word starts with capital letter.
 * - Words are lowercased unless they are acronyms (BCRA, USD, etc.), codes, numbers,
 *   or recognized abbreviations.
 * - Normalizes "Inflación mensual" to "Inflación intermensual".
 */
export function formatGrammaticalTitle(rawTitle: string): string {
  if (!rawTitle || typeof rawTitle !== 'string') return ''

  let text = rawTitle.trim()

  // Replace "Inflación mensual" / "Inflación Mensual" with "Inflación intermensual"
  text = text.replace(/^inflaci[oó]n\s+mensual/i, 'Inflación intermensual')

  // Split into tokens preserving whitespace and words
  const words = text.split(/\s+/)

  const formattedWords = words.map((word, index) => {
    // Separate leading/trailing punctuation like (, ), [, ], :, ,, ., ", '
    const match = word.match(/^([(\["'«¿¡]*)(.*?)([)\]"'»?!:;,.]*)$/)
    if (!match) return word

    const [, leadingPunct, core, trailingPunct] = match
    if (!core) return word

    const upperCore = core.toUpperCase()
    const lowerCore = core.toLowerCase()

    // 1. Check if core is an acronym that must remain capitalized
    if (PRESERVED_ACRONYMS.has(upperCore)) {
      return `${leadingPunct}${upperCore}${trailingPunct}`
    }

    // 2. Check if it's an abbreviation like Com.
    if (PRESERVED_ABBREVIATIONS.has(lowerCore + (trailingPunct.includes('.') ? '.' : ''))) {
      const capitalizedAbbr = lowerCore.charAt(0).toUpperCase() + lowerCore.slice(1)
      return `${leadingPunct}${capitalizedAbbr}${trailingPunct}`
    }

    // 3. Numbers, codes with digits (e.g. A3500, 2009, 2.2.2002=1), or symbols
    if (/\d/.test(core) || /^[%$/#]+$/.test(core)) {
      return `${leadingPunct}${core}${trailingPunct}`
    }

    // 4. First word: Capitalize first letter, lowercase rest
    if (index === 0) {
      const capitalized = core.charAt(0).toUpperCase() + core.slice(1).toLowerCase()
      return `${leadingPunct}${capitalized}${trailingPunct}`
    }

    // 5. Subsequent words: Lowercase
    return `${leadingPunct}${lowerCore}${trailingPunct}`
  })

  return formattedWords.join(' ')
}

/**
 * Checks whether a variable is already an inflation variation (e.g. interanual, intermensual)
 * so that displaying MoM or YoY rate of variation is omitted as redundant.
 */
export function isInflationMetric(idVariable?: number, title?: string): boolean {
  if (idVariable === 28 || idVariable === 27) {
    return true
  }
  if (!title) return false
  const lower = title.toLowerCase()
  return lower.includes('inflación') || lower.includes('inflacion')
}
