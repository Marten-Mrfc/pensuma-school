/**
 * V12: a resize handle tells screen readers which way its line runs, from
 * the panel group's direction (react-resizable-panels sets role="separator"
 * but no aria-orientation).
 */
import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './index'
import { separatorOrientation } from './resizable'

function handleTag(direction: 'horizontal' | 'vertical', label?: string) {
  const html = renderToStaticMarkup(
    <ResizablePanelGroup direction={direction}>
      <ResizablePanel defaultSize={50}>A</ResizablePanel>
      <ResizableHandle withHandle aria-label={label} />
      <ResizablePanel defaultSize={50}>B</ResizablePanel>
    </ResizablePanelGroup>,
  )
  return html.match(/<[^>]*role="separator"[^>]*>/)?.[0] ?? ''
}

describe('ResizableHandle orientation (V12)', () => {
  test('side-by-side panels: a vertical separator', () => {
    expect(handleTag('horizontal')).toContain('aria-orientation="vertical"')
  })

  test('stacked panels: a horizontal separator', () => {
    expect(handleTag('vertical')).toContain('aria-orientation="horizontal"')
  })

  test('the accessible name passed by the caller is kept', () => {
    const tag = handleTag('horizontal', 'Breedte aanpassen')
    expect(tag).toContain('aria-label="Breedte aanpassen"')
    expect(tag).toContain('aria-orientation="vertical"')
  })

  test('outside a group nothing is guessed', () => {
    expect(separatorOrientation(undefined)).toBeUndefined()
  })
})
