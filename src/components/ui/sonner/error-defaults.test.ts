import { afterEach, describe, expect, test } from 'bun:test'
import { type ExternalToast, type ToastT, toast } from 'sonner'
// The Toaster module (mounted once in the root layout) installs the defaults
// as a side effect of being imported; nothing else in this file may install
// them before the first test.
import './Sonner'
import { ERROR_TOAST_DURATION, installErrorToastDefaults } from './toast'

type ErrorFn = typeof toast.error

/** The active toast with this id (sonner also lists dismissed ones). */
function created(id: string | number): ToastT | undefined {
  return toast.getToasts().find((t): t is ToastT => t.id === id && !('dismiss' in t))
}

describe('installErrorToastDefaults', () => {
  afterEach(() => {
    toast.dismiss()
  })

  test('loading the Toaster makes toast.error straight from "sonner" stay 10 seconds', () => {
    // No installErrorToastDefaults() call here: the Toaster module did it.
    const id = toast.error('Opslaan lukte niet.')
    expect(created(id)?.duration).toBe(ERROR_TOAST_DURATION)
    expect(ERROR_TOAST_DURATION).toBe(10_000)
  })

  test("the caller's own duration and options still win", () => {
    installErrorToastDefaults()
    const id = toast.error('Mislukt', { duration: 20_000, description: 'Probeer het opnieuw.' })
    expect(created(id)?.duration).toBe(20_000)
    expect(created(id)?.description).toBe('Probeer het opnieuw.')
  })

  test('other toast types keep the Toaster default', () => {
    installErrorToastDefaults()
    const id = toast.success('Opgeslagen')
    expect(created(id)?.title).toBe('Opgeslagen')
    expect(created(id)?.duration).toBeUndefined()
  })

  test('installing twice (hot reload) does not wrap twice', () => {
    const calls: (ExternalToast | undefined)[] = []
    const original: ErrorFn = (_message, data) => {
      calls.push(data)
      return 1
    }
    const target = { error: original }
    installErrorToastDefaults(target)
    const wrapped = target.error
    installErrorToastDefaults(target)
    expect(target.error).toBe(wrapped)
    target.error('x')
    target.error('y', { id: 'save' })
    expect(calls).toEqual([{ duration: 10_000 }, { id: 'save', duration: 10_000 }])
  })
})
