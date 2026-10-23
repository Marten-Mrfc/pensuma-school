import { type ReactNode, Suspense } from "react";
import { shortcutsByScope } from "@/lib/a11y/shortcut-registry";
import { timerThresholdsText } from "@/lib/a11y/timer-announcements";
import { KeyCombo } from "./key-combo";
import { ScrollRegion } from "./scroll-region";
import {
  ContactInstructions,
  SchoolName,
  StatementDate,
} from "./statement-values";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display-wide text-xl font-bold tracking-tight text-foreground sm:text-2xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Bullets({ children }: { children: ReactNode }) {
  return (
    <ul className="ml-5 list-disc space-y-2 marker:text-primary/70">
      {children}
    </ul>
  );
}

function K({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-b-2 bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
      {children}
    </kbd>
  );
}

function Value({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

function ShortcutsTable() {
  const rows = shortcutsByScope().flatMap((group) =>
    group.items.map((item) => ({ scope: group.scope, item })),
  );
  return (
    <ScrollRegion
      label="Sneltoetsen in Pensuma"
      className="rounded-lg border bg-card"
    >
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Sneltoetsen in Pensuma</caption>
        <thead className="bg-muted/40">
          <tr className="border-b">
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              Waar
            </th>
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              Toets
            </th>
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              Wat het doet
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ scope, item }) => (
            <tr key={item.id} className="border-b align-top last:border-0">
              <th
                scope="row"
                className="px-3 py-2.5 text-left font-medium whitespace-nowrap"
              >
                {scope}
              </th>
              <td className="px-3 py-2.5">
                <KeyCombo keys={item.keys} />
                {item.macKeys ? (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Mac: {item.macKeys}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2.5">
                {item.details ?? item.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

/** The Dutch accessibility statement shown on /toegankelijkheid. */
export function AccessibilityStatement() {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 py-12 text-[1.02rem] leading-relaxed text-foreground sm:px-8 sm:py-16">
      <header className="flex flex-col gap-4">
        <h1 className="font-display-wide text-[1.625rem]/[1.2] font-extrabold tracking-tight text-balance break-words hyphens-auto min-[360px]:text-3xl sm:text-4xl">
          Toegankelijkheid
        </h1>
        <p className="text-lg text-muted-foreground">
          <Value>
            <SchoolName position="start" />
          </Value>{" "}
          wil dat iedereen Pensuma kan gebruiken, ook als je slecht ziet,
          kleurenblind bent, alleen een toetsenbord gebruikt of met een
          schermlezer werkt. We houden ons aan de Web Content Accessibility
          Guidelines (WCAG) 2.2, niveau AA. Dat is iets strenger dan de
          wettelijke norm voor overheidsorganisaties (EN 301 549, gebaseerd op
          WCAG 2.1 AA).
        </p>
      </header>

      <Section title="Hoe staat het ervoor?">
        <p>
          Pensuma <strong>voldoet gedeeltelijk</strong> aan WCAG 2.2 niveau AA.
          Hieronder staat wat al goed werkt en waar we nog aan werken. Laatst
          bijgewerkt:{" "}
          <Value>
            <StatementDate />
          </Value>
          .
        </p>
        <p>
          We controleren dit met automatische tests van alle hoofdpagina's (in
          licht én donker thema), met toetsenbordtests van inloggen en het maken
          van een toets, en met handmatige controles.
        </p>
      </Section>

      <Section title="Wat werkt al goed">
        <Bullets>
          <li>
            Je kunt alles met het toetsenbord bedienen. Met <K>Tab</K> ga je
            naar het volgende onderdeel; bovenaan staat een link "Naar de
            inhoud".
          </li>
          <li>
            Tekst en knoppen hebben genoeg contrast, in het lichte en in het
            donkere thema.
          </li>
          <li>
            Je kunt inzoomen tot 400% zonder dat je opzij hoeft te scrollen
            (behalve in tabellen en in de code-editor).
          </li>
          <li>
            Je kunt tekstgrootte, lettertype, regelafstand en contrast aanpassen
            via Accountmenu &gt; Weergave en leesbaarheid. Dat wordt bij je
            account bewaard.
          </li>
          <li>
            Staat "beweging verminderen" aan op je apparaat? Dan zie je geen
            bewegende animaties.
          </li>
          <li>
            Tijdens een toets met tijdslimiet hoor je met een schermlezer een
            melding als je nog {timerThresholdsText()} hebt. Je kunt de timer
            ook verbergen.
          </li>
          <li>
            Of iets goed of fout is, zie je altijd aan een icoon en een woord,
            niet alleen aan een kleur.
          </li>
        </Bullets>
      </Section>

      <Section title="Sneltoetsen">
        <ShortcutsTable />
        <p>
          Pensuma gebruikt geen sneltoetsen van één letter. Je kunt sneltoetsen
          uitzetten via Accountmenu &gt; Sneltoetsen.
        </p>
      </Section>

      <Section title="Extra tijd en hulpmiddelen tijdens toetsen">
        <Bullets>
          <li>
            Heb je recht op extra tijd, bijvoorbeeld door een faciliteitenpas?
            Je docent stelt dat één keer in; daarna krijg je bij elke toets met
            een tijdslimiet automatisch extra tijd.
          </li>
          <li>
            Gebruik je voorleessoftware, een dicteerfunctie of een
            vergrootprogramma? Sommige van die programma's openen een eigen
            venster. Pensuma ziet dat als "venster verlaten" en zet het in het
            logboek. Vertel je docent vooraf dat je zo'n hulpmiddel gebruikt;
            dan weet die waar het door komt.
          </li>
          <li>
            Bij sommige toetsen moet je in het volledige scherm werken. Gebruik
            in de code-editor dan <K>Ctrl+M</K> in plaats van <K>Esc</K> om de
            editor te verlaten. In sommige browsers sluit Esc het volledige
            scherm.
          </li>
          <li>
            Bij sommige toetsen is plakken uitgezet. Werkt jouw hulpmiddel via
            plakken? Vraag je docent of dit voor jou kan worden aangezet.
          </li>
        </Bullets>
      </Section>

      <Section title="Wat nog niet goed werkt">
        <Bullets>
          <li>
            <strong>Code-editor en schermlezers.</strong> De editor werkt met de
            meeste schermlezers, maar kleuren van de code en regelnummers worden
            niet voorgelezen. Foutmeldingen van Python zelf zijn Engelstalig;
            Pensuma zet er altijd een Nederlandse uitleg bij.
          </li>
          <li>
            <strong>Grafieken.</strong> Grafieken op de docentenpagina's zijn
            plaatjes. Onder elke grafiek staat "Toon de gegevens als tabel" met
            dezelfde informatie.
          </li>
          <li>
            <strong>Inlogkaarten.</strong> De printbare inlogkaarten zijn
            bedoeld om op papier uit te delen. Leerlingen die dat lastig vinden,
            kunnen hun pincode ook mondeling of digitaal van hun docent krijgen.
          </li>
        </Bullets>
        <p>
          We willen deze punten oplossen vóór{" "}
          <Value>
            <StatementDate addMonths={6} />
          </Value>
          .
        </p>
      </Section>

      <Section title="Loop je ergens tegenaan?">
        <p>
          Meld het ons, dan helpen we je verder en lossen we het zo snel
          mogelijk op.
        </p>
        <Value>
          <ContactInstructions />
        </Value>
        <p>Je krijgt binnen vijf werkdagen een reactie.</p>
      </Section>

      <Section title="Niet tevreden?">
        <p>
          Ben je niet tevreden met hoe we je melding hebben opgepakt? Dan kun je
          gebruikmaken van de klachtenregeling van{" "}
          <Value>
            <SchoolName position="inline" />
          </Value>
          .
        </p>
      </Section>
    </article>
  );
}
