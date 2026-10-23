import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { GradingDemo } from "@/components/layout/grading-demo";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/lib/routes";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Inloggen",
  description: "Log in bij Pensuma als leerling of als docent.",
};

function LoginFormSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <Skeleton className="h-9 w-full rounded-lg" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-11 w-full" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-12 w-full" />
      </div>
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Brand panel (desktop) */}
      <aside className="hidden bg-[oklch(0.29_0.045_152)] text-[oklch(0.96_0.01_130)] lg:flex lg:flex-col dark:bg-[oklch(0.2_0.02_150)]">
        <div className="flex flex-1 flex-col justify-between gap-10 p-10 xl:p-14">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <svg viewBox="0 0 32 32" className="size-9" aria-hidden="true">
              <rect width="32" height="32" rx="9" fill="oklch(0.96 0.01 130)" />
              <path
                d="M17.5 23.5H23"
                stroke="oklch(0.29 0.045 152 / 0.55)"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
              <path
                d="M10.5 24V8.5L20 13.25L10.5 18"
                stroke="oklch(0.29 0.045 152)"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
            <span className="font-display-wide text-xl font-bold">Pensuma</span>
          </Link>

          <div className="flex max-w-lg flex-col gap-8">
            {/* A tagline, not a heading: the page's h1 is "Inloggen". */}
            <p className="font-display-wide text-[2.125rem] leading-[1.1] font-bold xl:text-[2.5rem]">
              <span className="block">Je code telt.</span>
              Je{" "}
              <span className="whitespace-nowrap">
                <code className="font-mono text-[0.9em] font-medium text-[oklch(0.86_0.12_140)]">
                  input()
                </code>
                -vraag
              </span>{" "}
              niet.
            </p>
            <GradingDemo className="max-w-md" />
          </div>

          <p className="text-xs text-[oklch(0.8_0.02_130)]">
            Pensuma · toetsen en oefenen voor het informatica-onderwijs
          </p>
        </div>
      </aside>

      {/* Form */}
      <main
        id="inhoud"
        tabIndex={-1}
        className="relative flex flex-col bg-background"
      >
        <div className="flex items-center justify-between px-5 pt-5 sm:px-8 lg:justify-end">
          <Logo size="sm" className="lg:hidden" />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-start justify-center px-5 pt-8 pb-10 sm:items-center sm:px-8 sm:py-10">
          <div className="w-full max-w-[25rem]">
            <div className="mb-8 flex flex-col gap-2">
              <h1 className="font-display-wide text-3xl font-bold tracking-tight">
                Inloggen
              </h1>
              <p className="text-muted-foreground">
                Met je leerlingnummer en pincode, of als docent met je
                e-mailadres.
              </p>
            </div>
            <Suspense fallback={<LoginFormSkeleton />}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
        <footer className="flex flex-col items-center gap-2 px-5 pb-6 text-center text-xs text-muted-foreground sm:px-8">
          <nav aria-label="Voettekst">
            <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              {[
                { href: routes.home, label: "Terug naar de startpagina" },
                { href: routes.privacy, label: "Privacyverklaring" },
                { href: routes.accessibility, label: "Toegankelijkheid" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-block rounded-sm py-1 underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <p>
            Pensuma gebruikt alleen noodzakelijke cookies om je ingelogd te
            houden.
          </p>
        </footer>
      </main>
    </div>
  );
}
