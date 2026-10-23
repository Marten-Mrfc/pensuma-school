import { afterEach, describe, expect, test } from 'bun:test'
import {
  captureFocusOpener,
  type FocusDocument,
  isFromToaster,
  resolveFocusOpener,
  restoreFocusOnClose,
} from './return-focus'

/** Minimal DOM stand-ins (bun has no DOM): enough for closest/focus. */
class FakeDocument implements FocusDocument {
  activeElement: Element | null = null
  readonly body: Element
  private byId = new Map<string, FakeElement>()
  constructor() {
    this.body = new FakeElement(this, {}) as unknown as Element
    this.activeElement = this.body
  }
  register(el: FakeElement, id: string) {
    this.byId.set(id, el)
  }
  getElementById(id: string) {
    return (this.byId.get(id) as unknown as Element) ?? null
  }
}

class FakeElement {
  isConnected = true
  disabled = false
  parent: FakeElement | null = null
  constructor(
    private doc: FakeDocument,
    private attrs: Record<string, string>,
  ) {
    if (attrs.id) doc.register(this, attrs.id)
  }
  getAttribute(name: string) {
    return this.attrs[name] ?? null
  }
  closest(selector: string): FakeElement | null {
    const match = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(selector)
    if (!match) throw new Error(`unsupported selector ${selector}`)
    const [, name, value] = match
    for (let el: FakeElement | null = this; el; el = el.parent) {
      const attr = el.attrs[name]
      if (attr !== undefined && (value === undefined || attr === value)) return el
    }
    return null
  }
  focus() {
    if (this.isConnected && !this.disabled) this.doc.activeElement = this as unknown as Element
  }
  matches(selector: string) {
    if (selector !== ':disabled') throw new Error(`unsupported selector ${selector}`)
    return this.disabled
  }
  child(attrs: Record<string, string> = {}) {
    const el = new FakeElement(this.doc, attrs)
    el.parent = this
    return el
  }
}

const asEl = (el: FakeElement | null) => el as unknown as HTMLElement

function closeEvent() {
  let prevented = false
  return {
    get defaultPrevented() {
      return prevented
    },
    preventDefault() {
      prevented = true
    },
  } as unknown as Event
}

describe('resolveFocusOpener', () => {
  test('the focused button itself', () => {
    const doc = new FakeDocument()
    const button = new FakeElement(doc, {})
    expect(resolveFocusOpener(asEl(button), doc)).toBe(asEl(button))
  })

  test('nothing for <body> or no element', () => {
    const doc = new FakeDocument()
    expect(resolveFocusOpener(doc.body, doc)).toBeNull()
    expect(resolveFocusOpener(null, doc)).toBeNull()
  })

  test('a menu item maps to the button that opened the menu (also from a submenu)', () => {
    const doc = new FakeDocument()
    const trigger = new FakeElement(doc, { id: 'menu-trigger' })
    const menu = new FakeElement(doc, { role: 'menu', 'aria-labelledby': 'menu-trigger' })
    menu.child({ id: 'sub-trigger' })
    const submenu = new FakeElement(doc, { role: 'menu', 'aria-labelledby': 'sub-trigger' })
    const item = submenu.child()
    expect(resolveFocusOpener(asEl(menu.child()), doc)).toBe(asEl(trigger))
    expect(resolveFocusOpener(asEl(item), doc)).toBe(asEl(trigger))
  })

  test('a menu without a known trigger gives nothing', () => {
    const doc = new FakeDocument()
    const menu = new FakeElement(doc, { role: 'menu' })
    expect(resolveFocusOpener(asEl(menu.child()), doc)).toBeNull()
  })
})

describe('restoreFocusOnClose', () => {
  test('focus goes back to the opener (no DialogTrigger needed)', () => {
    const doc = new FakeDocument()
    const opener = new FakeElement(doc, {})
    const event = closeEvent()
    restoreFocusOnClose(event, asEl(opener), null, doc)
    expect(doc.activeElement).toBe(asEl(opener) as unknown as Element)
    // Radix's own handler (focus the trigger) is skipped.
    expect(event.defaultPrevented).toBe(true)
  })

  test("a caller's preventDefault() wins (e.g. a returnFocusRef)", () => {
    const doc = new FakeDocument()
    const opener = new FakeElement(doc, {})
    const event = closeEvent()
    event.preventDefault()
    restoreFocusOnClose(event, asEl(opener), null, doc)
    expect(doc.activeElement).toBe(doc.body)
  })

  test('focus the page already moved on purpose stays where it is', () => {
    const doc = new FakeDocument()
    const opener = new FakeElement(doc, {})
    const heading = new FakeElement(doc, {})
    heading.focus()
    const event = closeEvent()
    restoreFocusOnClose(event, asEl(opener), null, doc)
    expect(doc.activeElement).toBe(asEl(heading) as unknown as Element)
    expect(event.defaultPrevented).toBe(true)
  })

  test('the fallback when the opener is gone or cannot take focus', () => {
    for (const break_ of [
      (el: FakeElement) => {
        el.isConnected = false
      },
      (el: FakeElement) => {
        el.disabled = true
      },
    ]) {
      const doc = new FakeDocument()
      const opener = new FakeElement(doc, {})
      const fallback = new FakeElement(doc, {})
      break_(opener)
      const event = closeEvent()
      restoreFocusOnClose(event, asEl(opener), asEl(fallback), doc)
      expect(doc.activeElement).toBe(asEl(fallback) as unknown as Element)
      expect(event.defaultPrevented).toBe(true)
    }
  })

  test('without opener or fallback Radix keeps its default (the trigger, if any)', () => {
    const doc = new FakeDocument()
    const event = closeEvent()
    restoreFocusOnClose(event, null, null, doc)
    expect(event.defaultPrevented).toBe(false)
    expect(doc.activeElement).toBe(doc.body)
  })
})

describe('captureFocusOpener', () => {
  test('the focused element', () => {
    const doc = new FakeDocument()
    const button = new FakeElement(doc, {})
    button.focus()
    expect(captureFocusOpener(doc, null, 0)).toBe(asEl(button))
  })

  test('a button that the same update disabled (focus fell to <body>)', () => {
    const doc = new FakeDocument()
    const button = new FakeElement(doc, {})
    button.disabled = true
    const loss = { el: button as unknown as Element, at: 1000 }
    expect(captureFocusOpener(doc, loss, 1050)).toBe(asEl(button))
  })

  test('not an element that lost focus long ago, is gone, or simply lost focus', () => {
    const doc = new FakeDocument()
    const old = new FakeElement(doc, {})
    old.disabled = true
    expect(captureFocusOpener(doc, { el: old as unknown as Element, at: 0 }, 5000)).toBeNull()
    const removed = new FakeElement(doc, {})
    removed.disabled = true
    removed.isConnected = false
    expect(captureFocusOpener(doc, { el: removed as unknown as Element, at: 1000 }, 1050)).toBeNull()
    // e.g. a click on an empty part of the page: still enabled, not the opener.
    const input = new FakeElement(doc, {})
    expect(captureFocusOpener(doc, { el: input as unknown as Element, at: 1000 }, 1050)).toBeNull()
  })
})

describe('restoreFocusOnClose with an opener that is still disabled', () => {
  const g = globalThis as { MutationObserver?: unknown }
  const original = g.MutationObserver
  let observers: { callback: () => void; disconnected: boolean }[] = []

  class FakeMutationObserver {
    record: { callback: () => void; disconnected: boolean }
    constructor(callback: () => void) {
      this.record = { callback, disconnected: false }
      observers.push(this.record)
    }
    observe() {}
    disconnect() {
      this.record.disconnected = true
    }
  }

  afterEach(() => {
    g.MutationObserver = original
    observers = []
  })

  test('focus goes to it as soon as it is enabled again', () => {
    g.MutationObserver = FakeMutationObserver
    const doc = new FakeDocument()
    const opener = new FakeElement(doc, {})
    opener.disabled = true
    const event = closeEvent()
    restoreFocusOnClose(event, asEl(opener), null, doc)
    expect(event.defaultPrevented).toBe(true)
    expect(doc.activeElement).toBe(doc.body)

    observers[0].callback() // still disabled: keep waiting
    expect(doc.activeElement).toBe(doc.body)
    opener.disabled = false
    observers[0].callback()
    expect(doc.activeElement).toBe(asEl(opener) as unknown as Element)
    expect(observers[0].disconnected).toBe(true)
  })

  test('but not when the user has moved on in the meantime', () => {
    g.MutationObserver = FakeMutationObserver
    const doc = new FakeDocument()
    const opener = new FakeElement(doc, {})
    opener.disabled = true
    restoreFocusOnClose(closeEvent(), asEl(opener), null, doc)
    const elsewhere = new FakeElement(doc, {})
    elsewhere.focus()
    opener.disabled = false
    observers[0].callback()
    expect(doc.activeElement).toBe(asEl(elsewhere) as unknown as Element)
  })
})

describe('isFromToaster', () => {
  test('clicks on a toast (or its close button) are recognised', () => {
    const doc = new FakeDocument()
    const toaster = new FakeElement(doc, { 'data-sonner-toaster': '' })
    const close = toaster.child().child()
    expect(isFromToaster(close as unknown as EventTarget)).toBe(true)
    expect(isFromToaster(new FakeElement(doc, {}) as unknown as EventTarget)).toBe(false)
    expect(isFromToaster(null)).toBe(false)
  })
})
