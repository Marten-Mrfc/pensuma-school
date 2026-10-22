import type { Metadata } from "next";
import { AccessibilityStatement } from "@/components/a11y/accessibility-statement";
import { PublicFooter } from "@/components/layout/public-footer";
import { PublicHeader } from "@/components/layout/public-header";

export const metadata: Metadata = {
  title: "Toegankelijkheid",
  description:
    "Hoe toegankelijk Pensuma is, welke sneltoetsen er zijn en waar je problemen meldt.",
};

/**
 * Public accessibility statement. Prerendered; the school's name, contact
 * address and statement date fill in on the client from privacy.publicInfo.
 */
export default function AccessibilityPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main id="inhoud" tabIndex={-1} className="flex-1">
        <AccessibilityStatement />
      </main>
      <PublicFooter />
    </div>
  );
}
