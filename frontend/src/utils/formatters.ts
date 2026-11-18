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
  'DTI',
  'REM',
  'INDEC',
  'EMAE',
  'IPI',
  'CBT',
  'EPH',
  'ICA',
  'ICC',
  'CSV',
  'TXT',
  'PDF',
  'PNG',
  'TAMAR',
  'MAE',
  'YoY',
  'MoM',
])

const PRESERVED_PROPER_NOUNS: Record<string, string> = {
  argentinadatos: 'ArgentinaDatos',
  dolarapi: 'DolarApi',
  argentina: 'Argentina',
  excel: 'Excel',
}

const PRESERVED_ABBREVIATIONS = new Set(['com.', 'no.', 'nro.', 'art.', 'inc.', 'sr.', 'sra.'])

/**
 * Converts a title to Spanish grammatical case (sentence case):
 * - First word starts with capital letter.
 * - Words are lowercased unless they are acronyms (BCRA, USD, etc.), codes, numbers,
 *   recognized abbreviations, or proper nouns.
 * - Slashes have no surrounding whitespace ("A/B").
 * - Normalizes "Inflación mensual" to "Inflación intermensual".
 */
export function formatGrammaticalTitle(rawTitle: string): string {
  if (!rawTitle || typeof rawTitle !== 'string') return ''

  let text = rawTitle.trim()

  // Replace "Inflación mensual" / "Inflación Mensual" with "Inflación intermensual"
  text = text.replace(/^inflaci[oó]n\s+mensual/i, 'Inflación intermensual')

  // Remove whitespace around slashes: "word / other" -> "word/other"
  text = text.replace(/\s*\/\s*/g, '/')

  // Split into tokens preserving whitespace and words
  const words = text.split(/\s+/)

  const formatCoreWord = (core: string, isFirstInPhrase: boolean): string => {
    const upperCore = core.toUpperCase()
    const lowerCore = core.toLowerCase()

    // 1. Acronym
    if (PRESERVED_ACRONYMS.has(upperCore)) {
      return upperCore
    }

    // 2. Proper noun
    if (PRESERVED_PROPER_NOUNS[lowerCore]) {
      return PRESERVED_PROPER_NOUNS[lowerCore]
    }

    // 3. Abbreviation like Com.
    if (PRESERVED_ABBREVIATIONS.has(lowerCore)) {
      return lowerCore.charAt(0).toUpperCase() + lowerCore.slice(1)
    }

    // 4. Numbers, codes with digits (e.g. A3500, 2009, 2.2.2002=1), or symbols
    if (/\d/.test(core) || /^[%$/#]+$/.test(core)) {
      return core
    }

    // 5. First word of phrase
    if (isFirstInPhrase) {
      return core.charAt(0).toUpperCase() + core.slice(1).toLowerCase()
    }

    // 6. Subsequent words
    return lowerCore
  }

  const formatTokenPart = (part: string, isFirstInPhrase: boolean): string => {
    const match = part.match(/^([(\["'«¿¡]*)(.*?)([)\]"'»?!:;,.]*)$/)
    if (!match) return part

    const [, leadingPunct, core, trailingPunct] = match
    if (!core) return part

    const formattedCore = formatCoreWord(core, isFirstInPhrase)
    return `${leadingPunct}${formattedCore}${trailingPunct}`
  }

  let isFirstWordOverall = true
  const formattedWords = words.map((word) => {
    if (!word) return word
    if (word.includes('/')) {
      const parts = word.split('/')
      const formattedParts = parts.map((subPart) => {
        const isFirst = isFirstWordOverall
        isFirstWordOverall = false
        return formatTokenPart(subPart, isFirst)
      })
      return formattedParts.join('/')
    }

    const isFirst = isFirstWordOverall
    isFirstWordOverall = false
    return formatTokenPart(word, isFirst)
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
