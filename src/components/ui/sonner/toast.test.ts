import { describe, expect, test } from 'bun:test'
import { ERROR_TOAST_DURATION, errorToastOptions } from './toast'

describe('errorToastOptions', () => {
  test('errors stay 10 seconds', () => {
    expect(ERROR_TOAST_DURATION).toBe(10_000)
    expect(errorToastOptions()).toEqual({ duration: 10_000 })
  })

  test('keeps other options and lets the caller override the duration', () => {
    expect(errorToastOptions({ description: 'Probeer het opnieuw.' })).toEqual({
      duration: 10_000,
      description: 'Probeer het opnieuw.',
    })
    expect(errorToastOptions({ duration: 15_000 })).toEqual({ duration: 15_000 })
  })
})
