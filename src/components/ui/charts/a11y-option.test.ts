import { describe, expect, test } from 'bun:test'
import { withA11yOption } from './a11y-option'

describe('withA11yOption', () => {
  test('enables the aria module with decal patterns and no English label', () => {
    const merged = withA11yOption({ series: [] }, false)
    expect(merged.aria).toEqual({ enabled: true, label: { enabled: false }, decal: { show: true } })
    expect(merged.series).toEqual([])
    expect(merged.animation).toBe(true)
  })

  test('reduced motion always switches animation off', () => {
    expect(withA11yOption({ animation: true }, true).animation).toBe(false)
  })

  test('keeps an explicit animation choice otherwise', () => {
    expect(withA11yOption({ animation: false }, false).animation).toBe(false)
  })

  test('consumer aria settings win but are merged', () => {
    const merged = withA11yOption({ aria: { label: { description: 'x' }, decal: { show: false } } }, false)
    expect(merged.aria).toEqual({
      enabled: true,
      label: { enabled: false, description: 'x' },
      decal: { show: false },
    })
  })

  test('handles a missing option', () => {
    expect(withA11yOption(undefined, false).aria.enabled).toBe(true)
  })
})
