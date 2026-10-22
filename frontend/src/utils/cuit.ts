/**
 * AFIP Módulo 11 CUIT/CUIL checksum validation and formatting utilities.
 */

export function cleanCuit(cuit: string | number): string {
  if (cuit === null || cuit === undefined) return ''
  return String(cuit).replace(/\D/g, '')
}

export function formatCuit(cuit: string | number): string {
  const digits = cleanCuit(cuit)
  if (digits.length !== 11) return String(cuit)
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`
}

export interface CuitValidationResult {
  valid: boolean
  error?: string
}

export function validateCuitModulo11(cuit: string | number): CuitValidationResult {
  const digits = cleanCuit(cuit)

  if (!digits) {
    return { valid: false, error: 'Ingrese un CUIT o CUIL.' }
  }

  if (digits.length !== 11) {
    return { valid: false, error: `Debe contener exactamente 11 dígitos numéricos (actual: ${digits.length}).` }
  }

  const prefix = digits.slice(0, 2)
  const validPrefixes = new Set(['20', '23', '24', '27', '30', '33', '34'])
  if (!validPrefixes.has(prefix)) {
    return {
      valid: false,
      error: `Prefijo inválido '${prefix}'. Los tipos válidos son 20, 23, 24, 27, 30, 33 o 34.`,
    }
  }

  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 10; i++) {
    sum += Number(digits[i]) * multipliers[i]
  }

  const remainder = sum % 11
  let expectedVerifier: number

  if (remainder === 0) {
    expectedVerifier = 0
  } else if (remainder === 1) {
    expectedVerifier = prefix === '23' ? 4 : 9
  } else {
    expectedVerifier = 11 - remainder
  }

  const actualVerifier = Number(digits[10])

  if (actualVerifier !== expectedVerifier) {
    return {
      valid: false,
      error: `Dígito verificador incorrecto. Esperado '${expectedVerifier}', recibido '${actualVerifier}'.`,
    }
  }

  return { valid: true }
}
