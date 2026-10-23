import {
  Ban,
  ChevronDown,
  CircleCheck,
  Eye,
  EyeOff,
  type LucideIcon,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { routes } from "@/lib/routes";
import { CookieTable } from "./cookie-table";
import { DataInventoryTable } from "./data-inventory-table";
import {
  AskSentence,
  ContactDetails,
  ContactPhrase,
  ControllerDetails,
  HostingLocation,
  ProcessorName,
  RetentionConfirmationNote,
  RetentionNoticeRef,
  RetentionValue,
  UpdatedAt,
  ValueSkeleton,
} from "./public-values";

/** Date of the current text of this statement (shown as "Laatst bijgewerkt"). */
export const PRIVACY_STATEMENT_VERSION_DATE = "2026-10-23";

export const PRIVACY_SECTIONS = [
  { id: "kort", title: "In het kort (voor leerlingen)" },
  { id: "verantwoordelijk", title: "Wie is verantwoordelijk?" },
  { id: "gegevens", title: "Welke gegevens verwerken we?" },
  { id: "grondslag", title: "Waarom en op welke grondslag?" },
  { id: "logboek", title: "Het logboek tijdens toetsen" },
  { id: "nakijken", title: "Automatisch nakijken" },
  { id: "bewaren", title: "Hoe lang bewaren we je gegevens?" },
  { id: "inzien", title: "Wie kan je gegevens zien?" },
  { id: "opslag", title: "Waar staan je gegevens?" },
  { id: "cookies", title: "Cookies en lokale opslag" },
  { id: "beveiliging", title: "Beveiliging" },
  { id: "rechten", title: "Je rechten" },
  { id: "docenten", title: "Voor docenten" },
  { id: "datalek", title: "Datalek" },
  { id: "contact", title: "Contact" },
] as const;

type SectionId = (typeof PRIVACY_SECTIONS)[number]["id"];

const titleOf = (id: SectionId) =>
  PRIVACY_SECTIONS.find((s) => s.id === id)?.title ?? id;

const linkClass =
  "font-medium text-primary underline underline-offset-[3px] hover:no-underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  return (
    <section
      aria-labelledby={`${id}-titel`}
      className="flex scroll-mt-24 flex-col gap-4"
      id={id}
    >
      <h2
        id={`${id}-titel`}
        className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl"
      >
        {titleOf(id)}
      </h2>
      <div className="flex flex-col gap-4 text-[0.97rem] leading-relaxed text-pretty text-muted-foreground [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

function Bullets({ children }: { children: ReactNode }) {
  return (
    <ul className="ml-5 flex list-disc flex-col gap-2 marker:text-primary">
      {children}
    </ul>
  );
}

function Inline({ children }: { children: ReactNode }) {
  return <Suspense fallback={<ValueSkeleton />}>{children}</Suspense>;
}

function Block({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ValueSkeleton className="h-24 w-full" />}>
      {children}
    </Suspense>
  );
}

function CheckList({
  icon: Icon,
  tone,
  title,
  items,
}: {
  icon: LucideIcon;
  tone: "success" | "destructive";
  title: string;
  items: string[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5">
      <p className="flex items-center gap-2 font-semibold text-foreground">
        <span
          className={
            tone === "success"
              ? "grid size-8 place-items-center rounded-lg bg-success/12 text-success-ink"
              : "grid size-8 place-items-center rounded-lg bg-destructive/10 text-destructive-ink"
          }
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
        {title}
      </p>
      <ul className="flex flex-col gap-1.5 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="text-muted-foreground">
              –
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The full public privacy statement. Static; school values fill in later. */
export function PrivacyStatement() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-10 sm:px-8 sm:py-14">
      <header className="flex max-w-3xl flex-col gap-3 lg:ml-[19.5rem]">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
          Privacy
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
          Privacyverklaring
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">
          Hoe Pensuma omgaat met de gegevens van leerlingen en docenten.
        </p>
        <p className="text-sm text-muted-foreground">
          Laatst bijgewerkt:{" "}
          <Inline>
            <UpdatedAt versionDate={PRIVACY_STATEMENT_VERSION_DATE} />
          </Inline>
        </p>
      </header>

      <div className="flex flex-col gap-10 lg:flex-row lg:gap-14">
        <aside className="lg:w-64 lg:shrink-0">
          <details className="group rounded-xl border bg-card lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              Inhoud
              <ChevronDown
                className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="px-2 pb-3">
              <TocList />
            </div>
          </details>
          <nav
            aria-labelledby="privacy-inhoud-titel"
            className="sticky top-24 hidden rounded-xl border bg-card p-4 lg:block"
          >
            <h2
              id="privacy-inhoud-titel"
              className="mb-2 text-sm font-semibold text-foreground"
            >
              Inhoud
            </h2>
            <TocList />
          </nav>
        </aside>

        <article className="flex min-w-0 max-w-3xl flex-1 flex-col gap-12">
          <Section id="kort">
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-5 sm:p-6">
              <ul className="flex flex-col gap-3 text-foreground">
                {[
                  "Pensuma is het programma waarin je Python-toetsen maakt voor informatica.",
                  "We bewaren alleen wat nodig is: je naam, je leerlingnummer, je klas, je antwoorden en je resultaten.",
                  "Bij sommige toetsen houdt Pensuma bij wanneer je het toetsvenster verlaat. Dat zie je altijd vóórdat je begint.",
                  "Je docent kijkt je toets na en beslist over je cijfer. De computer helpt alleen bij het nakijken.",
                  "Geen reclame, geen trackers, en we geven je gegevens niet aan andere bedrijven.",
                ].map((text) => (
                  <li key={text} className="flex gap-3">
                    <CircleCheck
                      className="mt-0.5 size-5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span>{text}</span>
                  </li>
                ))}
                <li className="flex gap-3">
                  <CircleCheck
                    className="mt-0.5 size-5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span>
                    Je mag altijd vragen welke gegevens we over je hebben.{" "}
                    <Inline>
                      <AskSentence />
                    </Inline>
                  </span>
                </li>
              </ul>
            </div>
          </Section>

          <Section id="verantwoordelijk">
            <p>
              Je school is <strong>verwerkingsverantwoordelijke</strong>: de
              school bepaalt waarvoor Pensuma wordt gebruikt en welke gegevens
              daarvoor nodig zijn. De beheerder van Pensuma zorgt voor de
              techniek en is <strong>verwerker</strong>: die werkt alleen in
              opdracht van de school. Elke school heeft ook een{" "}
              <strong>functionaris gegevensbescherming (FG)</strong> die
              toezicht houdt op hoe de school met persoonsgegevens omgaat.
            </p>
            <Block>
              <ControllerDetails />
            </Block>
          </Section>

          <Section id="gegevens">
            <p>
              Dit zijn alle gegevens die in Pensuma staan. Er staan geen
              gegevens in over je adres, je ouders, je gezondheid of je
              achtergrond.
            </p>
            <Suspense fallback={<ValueSkeleton className="h-64 w-full" />}>
              <DataInventoryTable />
            </Suspense>
          </Section>

          <Section id="grondslag">
            <p>
              Pensuma wordt gebruikt om les te geven en om te toetsen. Dat is
              een <strong>taak van algemeen belang</strong> van de school (AVG
              artikel 6 lid 1 sub e), in samenhang met de Wet voortgezet
              onderwijs 2020. Daarom vragen we geen toestemming: je hebt Pensuma
              nodig voor de lessen informatica.
            </p>
            <p>
              Inloggegevens en het logboek van docenthandelingen bewaren we
              omdat de school haar systemen moet beveiligen en moet kunnen laten
              zien wat er met je gegevens gebeurt (AVG artikel 5 lid 2 en
              artikel 32).
            </p>
            <p>
              We gebruiken je gegevens nergens anders voor: geen profielen, geen
              reclame en geen verkoop. De school stelt de grondslag definitief
              vast in haar privacyreglement.
            </p>
          </Section>

          <Section id="logboek">
            <p>
              Bij elke toets, ook een oefentoets van je docent, houdt Pensuma
              bij wanneer je je code uitvoert of test: bij welke vraag, hoe lang
              het duurde, welke soort fout er was en hoeveel tests slaagden. Je
              code zelf staat daar niet in; die zit in je antwoord. Op de vrije
              oefenplek (Oefenen) komt niets in het logboek.
            </p>
            <p>
              Bij sommige toetsen zet je docent daarnaast het logboek van je
              toetsvenster aan. Dat zie je altijd op het startscherm, voordat je
              begint, en tijdens de toets. Bij oefentoetsen staat dat standaard
              uit.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <CheckList
                icon={Eye}
                tone="success"
                title="Wat we bijhouden als het aanstaat"
                items={[
                  "Wanneer je het toetsvenster of tabblad verlaat en weer terugkomt",
                  "Wanneer je het volledige scherm verlaat",
                  "Pogingen om te plakken, zonder wát je plakt",
                ]}
              />
              <CheckList
                icon={EyeOff}
                tone="destructive"
                title="Wat we nooit bijhouden"
                items={[
                  "Je toetsaanslagen",
                  "Je scherm, camera of microfoon",
                  "Wat je kopieert, en de inhoud van je klembord",
                  "Wat je in andere tabbladen doet",
                ]}
              />
            </div>
            <p>
              Heb je de faciliteit ‘vensterwissels niet registreren’? Dan houden
              we niet bij wanneer je het toetsvenster of tabblad verlaat. Als de
              toets erom vraagt, zien we wel wanneer je het volledige scherm
              verlaat of probeert te plakken, en ook dan houden we bij wanneer
              je je code uitvoert of test.
            </p>
            <p>
              Alleen je docenten informatica kunnen het logboek zien. Het wordt{" "}
              <Inline>
                <RetentionValue field="attemptEventsDays" />
              </Inline>{" "}
              na het einde van je poging automatisch verwijderd.
            </p>
            <p className="rounded-xl border-l-4 border-primary bg-card px-4 py-3 font-medium text-foreground">
              Een melding in het logboek leidt nooit automatisch tot een lager
              cijfer.
            </p>
            <p>
              Je kunt het venster ook verlaten door een melding, een pop-up of
              een trage computer. Je docent bespreekt het daarom altijd eerst
              met je.
            </p>
          </Section>

          <Section id="nakijken">
            <p>
              Pensuma voert je code uit met testgevallen en geeft meteen een
              voorlopige score. Bij open vragen kijkt altijd je docent zelf.
            </p>
            <p>
              Je docent controleert de resultaten en kan scores aanpassen. Ben
              je het niet eens met een score, bespreek het met je docent.
            </p>
          </Section>

          <Section id="bewaren">
            <Bullets>
              <li>
                <strong>Antwoorden en resultaten:</strong>{" "}
                <Inline>
                  <RetentionValue field="attemptsMonths" />
                </Inline>{" "}
                na het sluiten van de afname, ook als je een poging nooit hebt
                ingeleverd
                <Inline>
                  <RetentionNoticeRef />
                </Inline>
                . Werk van schoolexamens (PTA) wordt minstens 6 maanden na het
                vaststellen van de uitslag bewaard.
              </li>
              <li>
                <strong>Logboek tijdens toetsen:</strong>{" "}
                <Inline>
                  <RetentionValue field="attemptEventsDays" />
                </Inline>{" "}
                na het einde van de poging.
              </li>
              <li>
                <strong>Je account:</strong> zolang je in een klas zit. Zit je
                niet meer in een klas, dan wordt je account{" "}
                <Inline>
                  <RetentionValue field="inactiveStudentMonths" />
                </Inline>{" "}
                na de laatste keer inloggen verwijderd
                <Inline>
                  <RetentionNoticeRef />
                </Inline>
                .
              </li>
              <li>
                <strong>Inloggegevens:</strong> een sessie verloopt 12 uur nadat
                je Pensuma voor het laatst hebt gebruikt; tellers van
                inlogpogingen verdwijnen na 24 uur.
              </li>
              <li>
                <strong>Logboek van docenthandelingen:</strong>{" "}
                <Inline>
                  <RetentionValue field="auditLogMonths" />
                </Inline>
                .
              </li>
              <li>
                <strong>Back-ups:</strong> verwijderde gegevens staan nog
                maximaal{" "}
                <Inline>
                  <RetentionValue field="backupDays" />
                </Inline>{" "}
                in een beveiligde back-up en verdwijnen dan ook daar.
              </li>
            </Bullets>
            <Inline>
              <RetentionConfirmationNote />
            </Inline>
            <p>
              Je officiële cijfer staat in de leerlingadministratie van je
              school, bijvoorbeeld Magister of SOMtoday. Pensuma is daar niet de
              bron van.
            </p>
          </Section>

          <Section id="inzien">
            <Bullets>
              <li>
                <strong>De docenten informatica van je school</strong> die
                Pensuma gebruiken: zij zien je antwoorden, je resultaten en, als
                het aanstond, het logboek.
              </li>
              <li>
                <strong>Jijzelf:</strong> je resultaten, zodra je docent ze
                vrijgeeft.
              </li>
              <li>
                <strong>
                  De beheerder van Pensuma
                  <Inline>
                    <ProcessorName />
                  </Inline>
                </strong>{" "}
                alleen voor technisch onderhoud, en alleen als dat echt nodig
                is.
              </li>
              <li>
                Verder <strong>niemand</strong>: geen andere bedrijven en geen
                adverteerders.
              </li>
            </Bullets>
          </Section>

          <Section id="opslag">
            <p>
              Je gegevens staan op servers in{" "}
              <Inline>
                <HostingLocation />
              </Inline>
              . Er gaan geen gegevens naar landen buiten de EU. Lettertypen en
              Python draaien op onze eigen server of in je eigen browser.
            </p>
          </Section>

          <Section id="cookies">
            <p>
              Pensuma gebruikt een paar cookies en wat lokale opslag in je
              browser. Dit zijn alleen noodzakelijke en functionele cookies,
              daarom vragen we geen toestemming.
            </p>
            <CookieTable />
            <p className="text-sm">
              Zonder beveiligde verbinding (alleen tijdens het ontwikkelen)
              hebben de inlogcookies geen voorvoegsel “__Secure-”.
            </p>
          </Section>

          <Section id="beveiliging">
            <Bullets>
              <li>De verbinding met Pensuma is altijd versleuteld (https).</li>
              <li>
                Wachtwoorden en pincodes worden alleen versleuteld (als hash)
                opgeslagen. Je pincode staat daarnaast extra versleuteld
                opgeslagen, zodat je docent je inlogkaart opnieuw kan afdrukken.
              </li>
              <li>
                Na te veel mislukte inlogpogingen wordt een account tijdelijk
                geblokkeerd.
              </li>
              <li>
                Code wordt nagekeken in een afgeschermde omgeving zonder
                internet.
              </li>
              <li>
                Wie leerlinggegevens wijzigt, exporteert of verwijdert, en wie
                een leerling, een poging of pincodes bekijkt, wordt vastgelegd
                in een logboek dat docenten niet kunnen aanpassen.
              </li>
              <li>
                Technische gegevens en logboeken worden automatisch verwijderd
                als de bewaartermijn voorbij is; pogingen en oude accounts ook,
                zodra de school dat heeft aangezet.
              </li>
            </Bullets>
          </Section>

          <Section id="rechten">
            <p>Over je eigen gegevens heb je deze rechten:</p>
            <Bullets>
              <li>
                <strong>Inzage:</strong> je mag weten welke gegevens we over je
                hebben. Als leerling kun je ze zelf downloaden op de pagina{" "}
                <Link href={routes.leerling.myData} className={linkClass}>
                  Mijn gegevens
                </Link>
                .
              </li>
              <li>
                <strong>Verbetering:</strong> klopt er iets niet, dan past je
                docent het aan.
              </li>
              <li>
                <strong>Verwijdering:</strong> gegevens die niet meer nodig
                zijn, laten we verwijderen.
              </li>
              <li>
                <strong>Beperking:</strong> terwijl er een vraag of klacht over
                je gegevens loopt, kan de school de verwerking beperken. Je
                account wordt dan geblokkeerd en je gegevens worden bewaard
                zoals ze zijn: ze worden niet automatisch verwijderd en docenten
                passen ze pas weer aan als de vraag is afgehandeld.
              </li>
              <li>
                <strong>Bezwaar:</strong> je kunt bezwaar maken tegen het
                gebruik van je gegevens.
              </li>
            </Bullets>
            <p>
              Ben je jonger dan 16? Dan kunnen je ouders of verzorgers deze
              rechten voor je uitoefenen. Een verzoek doe je bij je docent of{" "}
              <Inline>
                <ContactPhrase />
              </Inline>
              . De school reageert binnen een maand.
            </p>
            <p>
              Ben je het niet eens met hoe er met je gegevens wordt omgegaan?
              Bespreek het eerst met de school of de FG. Je kunt ook een klacht
              indienen bij de{" "}
              <a
                href="https://www.autoriteitpersoonsgegevens.nl"
                className={linkClass}
                rel="noopener noreferrer"
              >
                Autoriteit Persoonsgegevens
              </a>
              .
            </p>
          </Section>

          <Section id="docenten">
            <p>
              Ook docenten zijn betrokkenen. Pensuma houdt een{" "}
              <strong>logboek van docenthandelingen</strong> bij: wie wanneer
              een leerling, een poging of pincodes heeft bekeken, code van
              leerlingen heeft vergeleken, scores heeft aangepast (met de oude
              en nieuwe score), gegevens heeft geëxporteerd of verwijderd, en
              wanneer docenten inloggen. Daarbij worden de naam van de docent,
              het tijdstip en een ingekort IP-adres vastgelegd, nooit de inhoud
              van antwoorden. Bij een gewijzigde faciliteit staat alleen wát er
              is gewijzigd (bijvoorbeeld de verlengde tijd), niet de nieuwe
              waarde.
            </p>
            <p>
              Het logboek is er voor verantwoording en beveiliging. Docenten met
              toegang tot Pensuma kunnen het inzien, maar niet aanpassen. Het
              wordt na{" "}
              <Inline>
                <RetentionValue field="auditLogMonths" />
              </Inline>{" "}
              automatisch verwijderd. Wordt een leerling eerder verwijderd, dan
              wist Pensuma meteen de scores en faciliteiten uit de regels over
              die leerling; wie wat wanneer deed, blijft tot die tijd staan (met
              leerlingnummer, zonder naam). De medezeggenschapsraad (MR) heeft
              een stem in het privacyreglement van de school.
            </p>
          </Section>

          <Section id="datalek">
            <p>
              Gaat er toch iets mis met gegevens, bijvoorbeeld doordat iemand
              zonder toestemming kan meekijken? Dan is dat een datalek. De
              beheerder meldt het direct bij de school. De school meldt een
              ernstig datalek binnen 72 uur bij de Autoriteit Persoonsgegevens
              en laat het jou weten als het grote gevolgen voor je kan hebben.
            </p>
            <p className="flex gap-3 rounded-xl border bg-card p-4 text-foreground">
              <Ban
                className="mt-0.5 size-5 shrink-0 text-destructive-ink"
                aria-hidden="true"
              />
              <span>
                Zie je zelf iets wat niet klopt, bijvoorbeeld dat je in het
                account van iemand anders kunt? Meld het meteen bij je docent of{" "}
                <Inline>
                  <ContactPhrase />
                </Inline>
                .
              </span>
            </p>
          </Section>

          <Section id="contact">
            <Block>
              <ContactDetails />
            </Block>
            <p className="text-sm">
              Laatst bijgewerkt:{" "}
              <Inline>
                <UpdatedAt versionDate={PRIVACY_STATEMENT_VERSION_DATE} />
              </Inline>
            </p>
          </Section>
        </article>
      </div>
    </div>
  );
}

function TocList() {
  return (
    <ol className="flex flex-col gap-0.5 text-sm">
      {PRIVACY_SECTIONS.map((s, i) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            className="flex gap-2 rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="w-5 shrink-0 text-right tabular-nums">
              {i + 1}.
            </span>
            {s.title}
          </a>
        </li>
      ))}
    </ol>
  );
}
