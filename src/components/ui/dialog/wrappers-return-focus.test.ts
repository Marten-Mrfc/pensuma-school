import { describe, expect, test } from 'bun:test'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as React from 'react'
import { CommandDialog } from '@/components/ui/command'
import { SheetContent } from '@/components/ui/sheet'
import { DialogContent, DialogScrollContent } from './dialog'
import { FocusReturningContent } from './return-focus'

/**
 * Every shared dialog and sheet wrapper renders FocusReturningContent rather
 * than Radix's bare Content, so focus returns to the element that opened it
 * also without a <DialogTrigger> (WCAG 2.4.3). bun has no DOM, so this walks
 * the element tree the wrappers return instead of mounting them.
 */

type AnyElement = React.ReactElement<Record<string, unknown>>
type ForwardRefRender = { render: (props: object, ref: unknown) => React.ReactNode }

function elementsOf(node: React.ReactNode): AnyElement[] {
  const found: AnyElement[] = []
  const visit = (n: React.ReactNode) => {
    if (Array.isArray(n)) return n.forEach(visit)
    if (!React.isValidElement(n)) return
    const el = n as AnyElement
    found.push(el)
    visit(el.props.children as React.ReactNode)
  }
  visit(node)
  return found
}

function renderForwardRef(component: unknown, props: object): AnyElement[] {
  return elementsOf((component as ForwardRefRender).render(props, null))
}

const fallbackRef = { current: null }
const onCloseAutoFocus = () => {}

describe('dialog and sheet wrappers return focus by default', () => {
  const wrappers: [string, () => AnyElement[]][] = [
    ['DialogContent', () => renderForwardRef(DialogContent, { returnFocusFallbackRef: fallbackRef, onCloseAutoFocus })],
    [
      'DialogScrollContent',
      () => renderForwardRef(DialogScrollContent, { returnFocusFallbackRef: fallbackRef, onCloseAutoFocus }),
    ],
    ['SheetContent', () => renderForwardRef(SheetContent, { returnFocusFallbackRef: fallbackRef, onCloseAutoFocus })],
  ]

  for (const [name, render] of wrappers) {
    test(`${name} renders FocusReturningContent and passes the caller's focus props on`, () => {
      const tree = render()
      const content = tree.filter((el) => el.type === FocusReturningContent)
      expect(content).toHaveLength(1)
      expect(tree.some((el) => el.type === DialogPrimitive.Content)).toBe(false)
      expect(content[0].props.returnFocusFallbackRef).toBe(fallbackRef)
      expect(content[0].props.onCloseAutoFocus).toBe(onCloseAutoFocus)
    })
  }

  test('CommandDialog renders FocusReturningContent', () => {
    const tree = elementsOf(CommandDialog({ open: true }))
    expect(tree.filter((el) => el.type === FocusReturningContent)).toHaveLength(1)
    expect(tree.some((el) => el.type === DialogPrimitive.Content)).toBe(false)
  })

  test("DialogScrollContent still runs the caller's onPointerDownOutside", () => {
    const calls: unknown[] = []
    const tree = renderForwardRef(DialogScrollContent, { onPointerDownOutside: (e: unknown) => calls.push(e) })
    const content = tree.find((el) => el.type === FocusReturningContent)
    const handler = content?.props.onPointerDownOutside as (event: unknown) => void
    const target = { clientWidth: 100, clientHeight: 100 }
    const event = {
      detail: { originalEvent: { target, offsetX: 10, offsetY: 10 } },
      preventDefault() {},
    }
    handler(event)
    expect(calls).toEqual([event])
  })
})
