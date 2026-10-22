import {
  ArrowRight,
  Braces,
  GraduationCap,
  type LucideIcon,
  MessageSquareOff,
  Presentation,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
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

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: MessageSquareOff,
    title: "Input-prompts tellen niet mee",
    body: 'De tekst in input("…") is een vraag aan de gebruiker, geen uitvoer. Pensuma laat die vraag weg voordat er wordt vergeleken.',
  },
  {
    icon: SlidersHorizontal,
    title: "Flexibele vergelijking",
    body: "Een spatie te veel, een extra witregel of een hoofdletter anders? Per opdracht bepaal je hoe streng er wordt vergeleken.",
  },
  {
    icon: Braces,
    title: "Functietests",
    body: "Test een functie los met eigen argumenten, zoals is_even(4). Leerlingen hoeven daarvoor niets te printen.",
  },
  {
    icon: Zap,
    title: "Direct feedback",
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
    body: "Automatisch, eerlijk en direct. Jij ziet per leerling wat goed ging en waar je nog even naar moet kijken.",
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
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="bg-graph-paper absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_80%_70%_at_50%_0%,black_30%,transparent_75%)]"
          />
          <div
            aria-hidden="true"
            className="absolute top-24 -right-40 -z-10 size-[36rem] rounded-full bg-primary/10 blur-3xl"
          />
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pt-14 pb-20 sm:px-8 md:pt-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16 lg:pt-24 lg:pb-28">
            <div className="flex flex-col items-start gap-7">
              <span className="inline-flex items-center gap-2 rounded-full border bg-card/80 py-1 pr-3.5 pl-2.5 text-xs font-medium text-muted-foreground shadow-xs">
                <span className="relative flex size-2" aria-hidden="true">
                  <span className="absolute inline-flex size-full rounded-full bg-primary/50 motion-safe:animate-ping" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </span>
                Het toetsplatform voor informatica
              </span>
              <h1 className="font-display-wide text-[clamp(2rem,8.6vw,3.4rem)] lg:text-[clamp(2.4rem,4.4vw,3.4rem)] leading-[1.04] font-extrabold tracking-tight">
                <span className="block whitespace-nowrap">Python-toetsen</span>
                <span className="block">
                  zonder gedoe<span className="text-primary">.</span>
                </span>
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
                    <GraduationCap aria-hidden="true" />
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
                  <Link href="/inloggen?rol=docent">
                    <Presentation aria-hidden="true" />
                    Inloggen als docent
                  </Link>
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Geen installatie nodig: Python draait gewoon in je browser.
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
              <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">
                Eerlijk nakijken
              </p>
              <h2 className="font-display-wide text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl">
                Nakijken zoals een docent het zou doen
              </h2>
              <p className="text-lg text-pretty text-muted-foreground">
                Oude toetssoftware vergeleek letter voor letter. Pensuma
                begrijpt wat de opdracht vraagt.
              </p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li
                  key={title}
                  className="group relative flex gap-4 rounded-2xl border bg-background p-6 shadow-xs transition-colors hover:border-primary/30"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <h3 className="font-semibold text-foreground">{title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="hoe-het-werkt" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
            <div className="mb-12 flex max-w-2xl flex-col gap-3">
              <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">
                Hoe het werkt
              </p>
              <h2 className="font-display-wide text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl">
                Van opdracht tot cijfer in drie stappen
              </h2>
            </div>
            <ol className="grid gap-8 md:grid-cols-3 md:gap-6">
              {STEPS.map((step, i) => (
                <li key={step.title} className="relative flex flex-col gap-3">
                  <div className="flex items-center gap-4">
                    <span className="font-display-wide grid size-12 shrink-0 place-items-center rounded-2xl border-2 border-primary/25 bg-primary/[0.07] text-xl font-bold text-primary">
                      {i + 1}
                    </span>
                    {i < STEPS.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="hidden h-px flex-1 border-t-2 border-dashed md:block"
                      />
                    ) : null}
                  </div>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* CTA */}
        <section className="px-5 pb-20 sm:px-8 lg:pb-24">
          <div className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-3xl bg-[oklch(0.29_0.045_152)] px-6 py-12 text-[oklch(0.96_0.01_130)] sm:px-12 sm:py-14 dark:bg-[oklch(0.22_0.025_150)]">
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-70 [background-image:linear-gradient(to_right,oklch(1_0_0/0.05)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0/0.05)_1px,transparent_1px)] [background-size:28px_28px]"
            />
            <div
              aria-hidden="true"
              className="absolute -top-24 -right-24 size-80 rounded-full bg-[oklch(0.62_0.12_145)]/30 blur-3xl"
            />
            <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto]">
              <div className="flex flex-col gap-3">
                <h2 className="font-display-wide text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl">
                  Klaar om te beginnen?
                </h2>
                <p className="max-w-xl text-lg text-[oklch(0.88_0.015_130)]">
                  Leerlingen loggen in met hun leerlingnummer en PIN-code.
                  Docenten met hun e-mailadres.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="h-12 bg-[oklch(0.96_0.01_130)] px-6 text-[0.95rem] text-[oklch(0.25_0.04_152)] hover:bg-white"
                >
                  <Link href="/inloggen">
                    <GraduationCap aria-hidden="true" />
                    Inloggen als leerling
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 border-white/25 bg-white/5 px-6 text-[0.95rem] text-[oklch(0.96_0.01_130)] hover:bg-white/10 hover:text-white dark:border-white/25 dark:bg-white/5 dark:hover:bg-white/10"
                >
                  <Link href="/inloggen?rol=docent">
                    <Presentation aria-hidden="true" />
                    Inloggen als docent
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
