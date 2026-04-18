import { describe, expect, it } from 'vitest'
import { useChromeDesktopMediaForKind } from '@/components/voice/electronCaptureIsolation'

describe('electronCaptureIsolation', () => {
  it('usa solo chrome desktop GUM para ventana (aislamiento tipo pestaña)', () => {
    expect(useChromeDesktopMediaForKind('window')).toBe(true)
    expect(useChromeDesktopMediaForKind('screen')).toBe(false)
  })
})
