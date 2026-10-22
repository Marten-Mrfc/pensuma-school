import type { Metadata, Viewport } from "next";
import {
  Anybody,
  Atkinson_Hyperlegible_Mono,
  Atkinson_Hyperlegible_Next,
  DM_Mono,
  DM_Sans,
} from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { LiveAnnouncerProvider } from "@/components/a11y/live-announcer";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TRPCReactProvider } from "@/trpc/react";

const dmSans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  variable: "--font-dm-sans",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-dm-mono",
  display: "swap",
});

const anybody = Anybody({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-anybody",
  display: "swap",
});

/* Display preference "Goed leesbaar lettertype" (data-font="readable" on
   <html>). Not preloaded: only people who switch it on download it. next/font
   self-hosts the files at build time, so browsers never contact Google. */
const readable = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  variable: "--font-readable",
  display: "swap",
  preload: false,
  // No metric overrides are known for this family; skip the fallback font.
  adjustFontFallback: false,
});

const readableMono = Atkinson_Hyperlegible_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-readable-mono",
  display: "swap",
  preload: false,
  // No metric overrides are known for this family; skip the fallback font.
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: {
    default: "Pensuma · Python-toetsen voor informatica",
    template: "%s · Pensuma",
  },
  description:
    "Pensuma is het toetsplatform voor informatica: Python-opdrachten maken in de browser, eerlijk en flexibel nagekeken.",
  applicationName: "Pensuma",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f9f4" },
    { media: "(prefers-color-scheme: dark)", color: "#121712" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="nl"
      data-scroll-behavior="smooth"
      // next-themes sets the `dark` class before hydration.
      suppressHydrationWarning
      className={cn(
        "h-full antialiased",
        dmSans.variable,
        dmMono.variable,
        anybody.variable,
        readable.variable,
        readableMono.variable,
      )}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#inhoud"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
        >
          Naar de inhoud
        </a>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TRPCReactProvider>
            <TooltipProvider delayDuration={400}>
              <LiveAnnouncerProvider>
                {children}
                <Toaster />
              </LiveAnnouncerProvider>
            </TooltipProvider>
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
