import { cn } from "@/lib/utils";

/** Privacy note under the "Vensterwissels registreren" switch. */
export function FocusLoggingHint({
  id,
  className,
}: {
  id?: string;
  className?: string;
}) {
  return (
    <p
      id={id}
      className={cn("text-xs leading-relaxed text-muted-foreground", className)}
    >
      Leerlingen zien vóór de start dat dit wordt bijgehouden. Zet het alleen
      aan als het nodig is voor een eerlijke toets; bij oefenen staat het
      standaard uit. Een vensterwissel betekent niet automatisch dat iemand
      fraudeert: bespreek het altijd eerst met de leerling.
    </p>
  );
}
