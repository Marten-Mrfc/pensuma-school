import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { type SpinnerVariants, spinnerVariants } from './spinner.variants'

// Omit Lucide's own `size` (number|string) so the cva variant `size` wins.
export interface SpinnerProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Loader2>, 'ref' | 'size'>,
    SpinnerVariants {}

const Spinner = React.forwardRef<SVGSVGElement, SpinnerProps>(({ className, size = 'default', ...props }, ref) => (
  <Loader2
    ref={ref}
    data-uipkge=""
    data-slot="spinner"
    className={cn(spinnerVariants({ size }), className)}
    aria-label="Laden"
    role="status"
    {...props}
  />
))
Spinner.displayName = 'Spinner'

export { Spinner }
