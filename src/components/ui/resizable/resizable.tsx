'use client'

import { GripVertical } from 'lucide-react'
import type * as React from 'react'
// Named exports (the package exposes these directly, not under a namespace).
import { Panel, PanelGroup, PanelResizeHandle, usePanelGroupContext } from 'react-resizable-panels'
import { cn } from '@/lib/utils'

function ResizablePanelGroup({ className, ...props }: React.ComponentProps<typeof PanelGroup>) {
  return (
    <PanelGroup
      data-uipkge=""
      data-slot="resizable-panel-group"
      className={cn('flex h-full w-full data-[panel-group-direction=vertical]:flex-col', className)}
      {...props}
    />
  )
}

function ResizablePanel({ ...props }: React.ComponentProps<typeof Panel>) {
  return <Panel data-uipkge="" data-slot="resizable-panel" {...props} />
}

/**
 * The separator's orientation is that of the line it draws: between panels
 * side by side (a horizontal group) it is vertical, between stacked panels
 * horizontal. react-resizable-panels sets role="separator" but no
 * aria-orientation, so screen readers would assume horizontal for both.
 */
export function separatorOrientation(
  direction: 'horizontal' | 'vertical' | undefined,
): 'horizontal' | 'vertical' | undefined {
  if (direction === 'horizontal') return 'vertical'
  if (direction === 'vertical') return 'horizontal'
  return undefined
}

function ResizableHandle({
  withHandle,
  className,
  children,
  ...props
}: React.ComponentProps<typeof PanelResizeHandle> & {
  withHandle?: boolean
}) {
  const { direction } = usePanelGroupContext()
  return (
    <PanelResizeHandle
      data-uipkge=""
      data-slot="resizable-handle"
      aria-orientation={separatorOrientation(direction)}
      className={cn(
        'bg-border focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2 [&[data-panel-group-direction=vertical]>div]:rotate-90',
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
          {children ?? <GripVertical className="size-2.5" aria-hidden="true" />}
        </div>
      )}
    </PanelResizeHandle>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
