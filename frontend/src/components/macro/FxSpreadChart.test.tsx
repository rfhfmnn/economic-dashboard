import { describe, it, expect } from 'vitest'
import { getCotizationColor } from './FxSpreadChart'

function getLuminance(hex: string): number {
  const rgb = hex.replace('#', '')
  const r = parseInt(rgb.substring(0, 2), 16) / 255
  const g = parseInt(rgb.substring(2, 4), 16) / 255
  const b = parseInt(rgb.substring(4, 6), 16) / 255

  const [rLinear, gLinear, bLinear] = [r, g, b].map((val) =>
    val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
  )

  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear
}

function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hex1)
  const lum2 = getLuminance(hex2)
  const brightest = Math.max(lum1, lum2)
  const darkest = Math.min(lum1, lum2)
  return (brightest + 0.05) / (darkest + 0.05)
}

describe('FxSpreadChart getCotizationColor contrast verification', () => {
  it('returns high contrast Sky-700 (#0369a1) for oficial in light mode with contrast >= 4.5:1 against white', () => {
    const lightOficialColor = getCotizationColor('oficial', false)
    expect(lightOficialColor).toBe('#0369a1')

    const contrastAgainstWhite = getContrastRatio(lightOficialColor, '#ffffff')
    // Sky-700 yields ~5.92:1 contrast against pure white
    expect(contrastAgainstWhite).toBeGreaterThanOrEqual(4.5)
  })

  it('returns sky-400 (#38bdf8) for oficial in dark mode', () => {
    const darkOficialColor = getCotizationColor('oficial', true)
    expect(darkOficialColor).toBe('#38bdf8')
  })

  it('returns correct theme-dependent colors for other cotizations', () => {
    expect(getCotizationColor('mep', true)).toBe('#818cf8')
    expect(getCotizationColor('mep', false)).toBe('#4f46e5')
    expect(getCotizationColor('ccl', true)).toBe('#a855f7')
    expect(getCotizationColor('ccl', false)).toBe('#9333ea')
    expect(getCotizationColor('blue', true)).toBe('#f59e0b')
    expect(getCotizationColor('blue', false)).toBe('#d97706')
  })
})
