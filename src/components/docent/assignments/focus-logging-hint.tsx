import { ShieldCheck } from "lucide-react";
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
      className={cn(
        "flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground",
        className,
      )}
    >
      <ShieldCheck
        className="mt-0.5 size-3.5 shrink-0 text-foreground/70"
        aria-hidden="true"
      />
      <span>
        Leerlingen zien vóór de start dat dit wordt bijgehouden. Zet het alleen
        aan als het nodig is voor een eerlijke toets; bij oefenen staat het
        standaard uit. Een focusverlies betekent niet automatisch dat iemand
        fraudeert: bespreek het altijd eerst met de leerling.
      </span>
    </p>
  );
}
