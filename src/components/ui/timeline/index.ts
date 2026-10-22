export type { TimelineAlign, TimelineDensity, TimelineDirection, TimelineSide, TimelineStatus } from './context'
export {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineDescription,
  TimelineHeader,
  TimelineItem,
  type TimelineItemProps,
  type TimelineItemRenderProps,
  TimelineMedia,
  type TimelineMediaProps,
  type TimelineProps,
  TimelineSeparator,
  type TimelineSeparatorProps,
  TimelineTitle,
  type TimelineTitleProps,
} from './timeline'

// Re-export variant API from the sibling file (kept separate to avoid the
// component <-> index circular import that broke dev SSR for Card).
export { type TimelineMediaVariant, type TimelineMediaVariantsProps, timelineMediaVariants } from './timeline.variants'
