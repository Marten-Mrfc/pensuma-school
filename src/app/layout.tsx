import type { Metadata, Viewport } from "next";
import { Anybody, DM_Mono, DM_Sans } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
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
      )}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TRPCReactProvider>
            <TooltipProvider delayDuration={400}>
              {children}
              <Toaster />
            </TooltipProvider>
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
