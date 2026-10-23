import type { Metadata } from "next";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = {
  title: "Instellen",
  description: "Maak het eerste docentaccount voor Pensuma aan.",
};

export default function SetupPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 pt-5 sm:px-8">
        <Logo size="sm" />
        <ThemeToggle />
      </header>
      <main
        id="inhoud"
        tabIndex={-1}
        className="flex flex-1 items-start justify-center px-5 py-10 outline-none sm:px-8 sm:py-16"
      >
        <div className="w-full max-w-lg">
          <SetupForm />
        </div>
      </main>
    </div>
  );
}
