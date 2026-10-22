import type { Metadata } from "next";
import { PublicFooter } from "@/components/layout/public-footer";
import { PublicHeader } from "@/components/layout/public-header";
import { PrivacyStatement } from "@/components/privacy/privacy-statement";

export const metadata: Metadata = {
  title: "Privacyverklaring",
  description:
    "Welke gegevens Pensuma verwerkt, waarom, hoe lang ze bewaard blijven en welke rechten je hebt.",
};

/**
 * Public privacy statement (AVG art. 12–14). Prerendered: readable without
 * JavaScript; the school's own contacts and retention periods fill in on
 * the client from privacy.publicInfo.
 */
export default function PrivacyPage() {
  return (
    <>
      <PublicHeader />
      <main id="inhoud" tabIndex={-1} className="flex-1">
        <PrivacyStatement />
      </main>
      <PublicFooter />
    </>
  );
}
