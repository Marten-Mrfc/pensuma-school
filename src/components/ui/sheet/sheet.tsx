'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import * as React from 'react'
import { FocusReturningContent, type FocusReturningContentProps } from '@/components/ui/dialog/return-focus'
import { cn } from '@/lib/utils'

const Sheet = DialogPrimitive.Root

const SheetTrigger = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>
>(({ ...props }, ref) => <DialogPrimitive.Trigger ref={ref} data-uipkge="" data-slot="sheet-trigger" {...props} />)
SheetTrigger.displayName = DialogPrimitive.Trigger.displayName

const SheetClose = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
>(({ ...props }, ref) => <DialogPrimitive.Close ref={ref} data-uipkge="" data-slot="sheet-close" {...props} />)
SheetClose.displayName = DialogPrimitive.Close.displayName

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-uipkge=""
    data-slot="sheet-overlay"
    className={cn(
      'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=open]:ease-emphasized motion-safe:data-[state=open]:blur-in-2 motion-safe:data-[state=closed]:blur-out-2 motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0 bg-foreground/50 fixed inset-0 z-50',
      className,
    )}
    {...props}
  />
))
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName

interface SheetContentProps extends FocusReturningContentProps {
  side?: 'top' | 'right' | 'bottom' | 'left'
}

const SheetContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, SheetContentProps>(
  ({ side = 'right', className, children, ...props }, ref) => (
    <DialogPrimitive.Portal>
      <SheetOverlay />
      <FocusReturningContent
        ref={ref}
        data-uipkge=""
        data-slot="sheet-content"
        className={cn(
          'bg-background motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=open]:ease-emphasized motion-safe:data-[state=open]:blur-in-2 motion-safe:data-[state=closed]:blur-out-2 fixed z-50 flex flex-col gap-4 overflow-hidden shadow-lg transition ease-in-out motion-safe:data-[state=closed]:duration-200 motion-safe:data-[state=open]:duration-300',
          side === 'right' &&
            'motion-safe:data-[state=closed]:slide-out-to-right motion-safe:data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
          side === 'left' &&
            'motion-safe:data-[state=closed]:slide-out-to-left motion-safe:data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm',
          side === 'top' &&
            'motion-safe:data-[state=closed]:slide-out-to-top motion-safe:data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b',
          side === 'bottom' &&
            'motion-safe:data-[state=closed]:slide-out-to-bottom motion-safe:data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t',
          className,
        )}
        {...props}
      >
        {children}

        <DialogPrimitive.Close className="text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring absolute top-3 right-3 grid size-8 place-items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-hidden disabled:pointer-events-none">
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">Sluiten</span>
        </DialogPrimitive.Close>
      </FocusReturningContent>
    </DialogPrimitive.Portal>
  ),
)
SheetContent.displayName = DialogPrimitive.Content.displayName

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div data-uipkge="" data-slot="sheet-header" className={cn('flex flex-col gap-1.5 p-4', className)} {...props} />
)
SheetHeader.displayName = 'SheetHeader'

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-uipkge=""
    data-slot="sheet-footer"
    className={cn('mt-auto flex flex-col gap-2 p-4', className)}
    {...props}
  />
)
SheetFooter.displayName = 'SheetFooter'

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-uipkge=""
    data-slot="sheet-title"
    className={cn('text-foreground font-semibold', className)}
    {...props}
  />
))
SheetTitle.displayName = DialogPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    data-uipkge=""
    data-slot="sheet-description"
    className={cn('text-muted-foreground text-sm', className)}
    {...props}
  />
))
SheetDescription.displayName = DialogPrimitive.Description.displayName

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
