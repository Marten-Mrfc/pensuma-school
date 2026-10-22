import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { GradingDemo } from "@/components/layout/grading-demo";
import { Skeleton } from "@/components/ui/skeleton";
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
      <aside className="relative hidden overflow-hidden bg-[oklch(0.29_0.045_152)] text-[oklch(0.96_0.01_130)] lg:flex lg:flex-col dark:bg-[oklch(0.2_0.02_150)]">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-60 [background-image:linear-gradient(to_right,oklch(1_0_0/0.05)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0/0.05)_1px,transparent_1px)] [background-size:28px_28px]"
        />
        <div
          aria-hidden="true"
          className="absolute -top-40 -right-32 size-[34rem] rounded-full bg-[oklch(0.62_0.12_145)]/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-48 -left-24 size-[30rem] rounded-full bg-[oklch(0.8_0.1_85)]/12 blur-3xl"
        />
        <div className="relative flex flex-1 flex-col justify-between gap-10 p-10 xl:p-14">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-white/50"
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
            <div className="flex flex-col gap-4">
              <p className="text-sm font-medium tracking-[0.14em] text-[oklch(0.85_0.08_140)] uppercase">
                Informatica · Python
              </p>
              <h2 className="font-display-wide text-4xl leading-[1.05] font-bold text-balance xl:text-5xl">
                Je code telt. Je{" "}
                <span className="text-[oklch(0.86_0.12_140)]">input()</span>
                -vraag niet.
              </h2>
              <p className="max-w-md text-base leading-relaxed text-[oklch(0.88_0.015_130)]">
                Pensuma kijkt naar wat je programma écht doet. Een vraag als
                “Wat is je naam?” wordt nooit meer als fout gerekend.
              </p>
            </div>
            <GradingDemo className="max-w-md" />
          </div>

          <p className="text-xs text-[oklch(0.8_0.02_130)]">
            Pensuma · toetsen en oefenen voor het informatica-onderwijs
          </p>
        </div>
      </aside>

      {/* Form */}
      <main className="relative flex flex-col bg-background">
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
                Welkom terug! Kies hieronder hoe je inlogt.
              </p>
            </div>
            <Suspense fallback={<LoginFormSkeleton />}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
        <div className="px-5 pb-6 text-center text-xs text-muted-foreground sm:px-8">
          <Link
            href="/"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            Terug naar de startpagina
          </Link>
        </div>
      </main>
    </div>
  );
}
