export {
  Skeleton,
  SkeletonGroup,
  type SkeletonGroupProps,
  SkeletonLoader,
  type SkeletonLoaderProps,
  type SkeletonProps,
  SkeletonText,
  type SkeletonTextProps,
} from './skeleton'

// Re-export variant API from the sibling file (kept separate to mirror the
// Vue registry convention and avoid a component <-> index circular import).
export { type SkeletonLoaderVariants, skeletonLoaderVariants } from './skeleton.variants'
