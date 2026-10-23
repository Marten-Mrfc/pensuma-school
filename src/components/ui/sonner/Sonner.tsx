'use client'

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon, XIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { installErrorToastDefaults } from './toast'

// Every error toast, also `toast.error` straight from "sonner", stays 10 s.
installErrorToastDefaults()

/** Rich-colour variables built from the theme tokens: a light tint of the
 *  status colour as background and the *-ink text token (≥ 4.5:1 in light
 *  and dark mode, unlike Sonner's built-in rich colours). */
function richColorVars(name: 'success' | 'info' | 'warning' | 'error', token: string, ink: string) {
  return {
    [`--${name}-bg`]: `color-mix(in oklab, var(--${token}) 10%, var(--popover))`,
    [`--${name}-text`]: `var(--${ink})`,
    [`--${name}-border`]: `color-mix(in oklab, var(--${token}) 30%, var(--popover))`,
  }
}

// Sonner cadence: 4000ms default (errors 10s, see installErrorToastDefaults),
// a close button on every toast (WCAG 2.2.1), max 3 visible, rich colours
// mapped to accessible theme tokens. Toasts stay hoverable and closable while
// a dialog is open (globals.css; DialogContent/SheetContent ignore clicks on
// them as "outside" clicks).
const Toaster = ({ ...props }: ToasterProps) => {
  // next-themes is the React registry theme stack (via init / use-theme bootstrap).
  // Falls back to 'system' when ThemeProvider is absent so the toaster still mounts.
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      data-uipkge=""
      data-slot="sonner"
      className="toaster group"
      position="bottom-right"
      duration={4000}
      visibleToasts={3}
      richColors
      closeButton
      expand={false}
      containerAriaLabel="Meldingen"
      toastOptions={{
        closeButtonAriaLabel: 'Melding sluiten',
        // 24px target (WCAG 2.5.8); Sonner's default close button is 20px.
        classNames: { closeButton: 'size-6!' },
      }}
      style={
        {
          // Inline on purpose: Radix sets pointer-events: none on <body> while a
          // dialog is open; the toaster must stay hoverable/closable (WCAG
          // 2.2.1). The equivalent globals.css rule is dropped by the
          // production CSS optimiser, so it can't be relied on.
          pointerEvents: 'auto',
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
          ...richColorVars('success', 'success', 'success-ink'),
          ...richColorVars('info', 'info', 'info-ink'),
          ...richColorVars('warning', 'warning', 'warning-ink'),
          ...richColorVars('error', 'destructive', 'destructive-ink'),
        } as React.CSSProperties
      }
      icons={{
        success: <CircleCheckIcon className="size-4" aria-hidden="true" />,
        info: <InfoIcon className="size-4" aria-hidden="true" />,
        warning: <TriangleAlertIcon className="size-4" aria-hidden="true" />,
        error: <OctagonXIcon className="size-4" aria-hidden="true" />,
        loading: <Loader2Icon className="size-4 motion-safe:animate-spin" aria-hidden="true" />,
        close: <XIcon className="size-4" aria-hidden="true" />,
      }}
      {...props}
    />
  )
}

export { Toaster }
