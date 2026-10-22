export {
  Tabs,
  TabsContent,
  TabsList,
  type TabsListProps,
  type TabsProps,
  TabsTrigger,
  type TabsTriggerProps,
} from './tabs'

// Re-export variant API from the sibling file (kept separate to avoid the
// component <-> index.ts circular import that broke dev SSR for Card).
export { type TabsListVariants, type TabsTriggerVariants, tabsListVariants, tabsTriggerVariants } from './tabs.variants'
