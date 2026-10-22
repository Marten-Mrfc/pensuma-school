export {
  Avatar,
  AvatarFallback,
  type AvatarFallbackProps,
  AvatarGroup,
  type AvatarGroupProps,
  AvatarImage,
  type AvatarProps,
} from './avatar'

// Re-export variant API from the sibling file (kept separate to mirror the
// Vue registry convention and avoid a component <-> index circular import).
export {
  type AvatarFallbackVariants,
  type AvatarVariants,
  avatarFallbackVariants,
  avatarVariants,
} from './avatar.variants'
