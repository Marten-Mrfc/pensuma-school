export type { StepperOrientation, StepperSize, StepperStatus } from './context'
export {
  Stepper,
  StepperContent,
  type StepperContentProps,
  StepperDescription,
  StepperHeader,
  StepperIndicator,
  type StepperIndicatorProps,
  StepperItem,
  type StepperItemProps,
  type StepperProps,
  StepperStep,
  type StepperStepProps,
  StepperTitle,
} from './stepper'
// Re-export variant API from the sibling file (kept separate to avoid the
// stepper.tsx <-> index.ts circular import that broke dev SSR in the Vue source).
export { type StepperIndicatorVariants, stepperIndicatorVariants } from './stepper.variants'
export type { StepperStep as StepperStepConfig } from './types'
