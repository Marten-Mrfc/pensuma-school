export { Alert, AlertDescription, type AlertProps, AlertTitle, type AlertTitleProps } from './alert'

// Re-export variant API from the sibling file (kept separate to avoid the
// alert.tsx <-> index.ts circular import — mirrors the Vue registry).
export { type AlertVariants, alertVariants } from './alert.variants'
