import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { GradingDemo } from "@/components/layout/grading-demo";
import { PublicFooter } from "@/components/layout/public-footer";
import { PublicHeader } from "@/components/layout/public-header";
import { Button } from "@/components/ui/button";
import { homeForRole } from "@/lib/auth-shared";
import { getCurrentUser } from "@/server/session";

/** Signed-in users go straight to their own home. Reads the session, so it sits in <Suspense>. */
async function RedirectSignedIn() {
  let target: string | null = null;
  try {
    const user = await getCurrentUser();
    if (user) target = homeForRole(user.role);
  } catch {
    // Session lookup failed (e.g. database down): just show the landing page.
  }
  if (target) redirect(target);
  return null;
}

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="font-mono text-[0.9em] text-foreground">{children}</code>
  );
}

const FEATURES: { title: string; body: ReactNode }[] = [
  {
    title: "Input-prompts tellen niet mee",
    body: (
      <>
        De tekst in <InlineCode>input("…")</InlineCode> is een vraag aan de
        gebruiker, geen uitvoer. Pensuma laat die vraag weg voordat er wordt
        vergeleken.
      </>
    ),
  },
  {
    title: "Jij bepaalt hoe streng",
    body: "Een spatie te veel, een extra witregel of een hoofdletter anders? Per opdracht bepaal je hoe streng er wordt vergeleken.",
  },
  {
    title: "Functietests",
    body: (
      <>
        Test een functie los met eigen argumenten, zoals{" "}
        <InlineCode>is_even(4)</InlineCode>. Leerlingen hoeven daarvoor niets te
        printen.
      </>
    ),
  },
  {
    title: "Meteen feedback",
    body: "Leerlingen zien meteen welke tests slagen. Twijfelgevallen kijk je als docent zelf na: jij houdt het laatste woord.",
  },
];

const STEPS: { title: string; body: string }[] = [
  {
    title: "Je maakt een toets",
    body: "Schrijf Python-opdrachten met testgevallen en zet de toets klaar voor een klas, met begin- en eindtijd.",
  },
  {
    title: "Leerlingen programmeren",
    body: "In de browser, met een echte code-editor. Python draait lokaal: niets installeren, gewoon inloggen en beginnen.",
  },
  {
    title: "Pensuma kijkt na",
    body: "Pensuma draait de testgevallen meteen. Jij ziet per leerling wat goed ging en waar je nog even naar moet kijken.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Suspense fallback={null}>
        <RedirectSignedIn />
      </Suspense>

      <PublicHeader />

      <main id="inhoud" tabIndex={-1} className="flex-1">
        {/* Hero */}
        <section>
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pt-14 pb-20 sm:px-8 md:pt-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16 lg:pt-24 lg:pb-28">
            <div className="flex flex-col items-start gap-7">
              <h1 className="font-display-wide text-[clamp(1.5rem,7.8vw,3.4rem)] lg:text-[clamp(2.4rem,4vw,3rem)] leading-[1.04] font-extrabold tracking-tight">
                <span className="block whitespace-nowrap">Python-toetsen,</span>
                <span className="block">eerlijk nagekeken</span>
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
                Leerlingen programmeren in de browser en Pensuma kijkt direct
                na. Eerlijk, want een vraag in{" "}
                <code className="rounded-md border bg-muted/70 px-1.5 py-0.5 font-mono text-[0.88em] text-foreground">
                  input()
                </code>{" "}
                wordt nooit meer als fout gerekend.
              </p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button asChild size="lg" className="h-12 px-6 text-[0.95rem]">
                  <Link href="/inloggen">
                    Inloggen als leerling
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 px-6 text-[0.95rem]"
                >
                  <Link href="/inloggen?rol=docent">Inloggen als docent</Link>
                </Button>
              </div>
              <p className="text-sm text-pretty text-muted-foreground">
                Leerlingen loggen in met hun leerlingnummer en pincode. Docenten
                met hun <span className="whitespace-nowrap">e-mailadres</span>.
              </p>
            </div>
            <GradingDemo
              variant="compare"
              className="w-full max-w-lg justify-self-center lg:justify-self-end"
            />
          </div>
        </section>

        {/* Fair grading */}
        <section id="nakijken" className="scroll-mt-20 border-y bg-card/50">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
            <div className="mb-12 flex max-w-2xl flex-col gap-3">
              <h2 className="font-display-wide text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl">
                Nakijken zoals een docent het zou doen
              </h2>
              <p className="text-lg text-pretty text-muted-foreground">
                Oude toetssoftware vergeleek letter voor letter, inclusief de
                vraag in <InlineCode>input()</InlineCode>. Pensuma vergelijkt
                alleen de echte uitvoer.
              </p>
            </div>
            <ul className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
              {FEATURES.map(({ title, body }) => (
                <li key={title} className="flex flex-col gap-1.5 border-t pt-5">
                  <h3 className="font-semibold text-foreground">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="hoe-het-werkt" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
            <h2 className="mb-12 font-display-wide text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl">
              Zo werkt het
            </h2>
            <ol className="grid gap-8 md:grid-cols-3 md:gap-6">
              {STEPS.map((step, i) => (
                <li
                  key={step.title}
                  className="flex flex-col gap-2 border-t pt-5"
                >
                  <h3 className="text-lg font-semibold">
                    <span
                      aria-hidden="true"
                      className="mr-1.5 text-muted-foreground tabular-nums"
                    >
                      {i + 1}.
                    </span>
                    {step.title}
                  </h3>
                  <p className="leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
