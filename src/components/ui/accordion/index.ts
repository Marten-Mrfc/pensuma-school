export { Accordion, AccordionContent, AccordionHeader, AccordionItem, AccordionTrigger } from './accordion'

// Re-export variant API from the sibling file (kept separate to avoid an
// import cycle and to give consumers a stable `accordionVariants` path).
export {
  type AccordionItemVariants,
  type AccordionTriggerVariants,
  type AccordionVariants,
  accordionItemVariants,
  accordionTriggerVariants,
  accordionVariants,
} from './accordion.variants'
