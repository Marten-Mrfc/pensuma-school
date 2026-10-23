"use client";

import { ChevronDown, Download, Eraser } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import {
  CodeEditor,
  type CodeEditorHandle,
} from "@/components/app/code-editor";
import { useCurrentUser } from "@/components/app/current-user";
import { PageHeader } from "@/components/app/page-header";
import { LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { claimLocalData, practiceCodeKey } from "@/lib/local-data";
import { CodeTipsButton } from "./exam/code-tips";
import { CodeRunTab, type RunHandle } from "./exam/code-tools";
import { readStorage, writeStorage } from "./exam/types";

const SNIPPETS: { id: string; label: string; hint: string; code: string }[] = [
  {
    id: "print",
    label: "print",
    hint: "Tekst en getallen laten zien",
    code: 'print("Hallo wereld!")\nprint("1 + 2 =", 1 + 2)\n',
  },
  {
    id: "input",
    label: "input",
    hint: "De gebruiker iets laten typen",
    code: 'naam = input("Wat is je naam? ")\nleeftijd = int(input("Hoe oud ben je? "))\nprint("Hallo", naam + "!")\nprint("Over 10 jaar ben je", leeftijd + 10)\n',
  },
  {
    id: "if",
    label: "if / elif / else",
    hint: "Keuzes maken",
    code: 'cijfer = float(input("Welk cijfer heb je? "))\n\nif cijfer >= 8:\n    print("Top gedaan!")\nelif cijfer >= 5.5:\n    print("Voldoende, netjes.")\nelse:\n    print("Helaas onvoldoende. Volgende keer beter!")\n',
  },
  {
    id: "for",
    label: "for-lus",
    hint: "Iets een vast aantal keer herhalen",
    code: 'for i in range(1, 6):\n    print(i, "x 7 =", i * 7)\n\nfor letter in "Python":\n    print(letter)\n',
  },
  {
    id: "while",
    label: "while-lus",
    hint: "Herhalen zolang iets waar is",
    code: 'geheim = 7\ngok = 0\n\nwhile gok != geheim:\n    gok = int(input("Raad het getal (1-10): "))\n    if gok < geheim:\n        print("Hoger!")\n    elif gok > geheim:\n        print("Lager!")\n\nprint("Goed geraden!")\n',
  },
  {
    id: "functions",
    label: "functies",
    hint: "Je eigen functies maken met def en return",
    code: 'def kwadraat(getal):\n    return getal * getal\n\n\ndef begroet(naam):\n    print("Hoi", naam + "!")\n\n\nbegroet("Sam")\nprint(kwadraat(4))\nprint(kwadraat(12))\n',
  },
  {
    id: "lists",
    label: "lijsten",
    hint: "Meerdere waarden bewaren",
    code: 'cijfers = [6.5, 8.0, 5.4, 7.2]\ncijfers.append(9.1)\n\nprint("Aantal cijfers:", len(cijfers))\nprint("Hoogste:", max(cijfers))\nprint("Gemiddelde:", round(sum(cijfers) / len(cijfers), 1))\n\nfor c in cijfers:\n    if c < 5.5:\n        print(c, "is een onvoldoende")\n',
  },
];

const DEFAULT_CODE = SNIPPETS[1].code;

/** No assignment here: only the general tips apply. */
const PLAYGROUND_TIP_OPTIONS = {};

/**
 * The user's own practice code from this browser. On a shared school
 * computer the previous student may have closed the browser without signing
 * out: claimLocalData first clears their local data (code, answer backups)
 * so it is never shown to the next student.
 */
function loadCode(userId: string): string {
  if (typeof window === "undefined") return DEFAULT_CODE;
  claimLocalData(userId);
  return readStorage<string>(practiceCodeKey(userId)) ?? DEFAULT_CODE;
}

const subscribeNoop = () => () => {};

export function PracticePlayground() {
  // localStorage only exists in the browser: render after hydration.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const tipsTitleId = useId();
  const outputTitleId = useId();
  const user = useCurrentUser();
  const storageKey = practiceCodeKey(user.id);
  const [code, setCode] = useState<string>(() => loadCode(user.id));
  const [runHandle, setRunHandle] = useState<RunHandle | null>(null);
  const editorRef = useRef<CodeEditorHandle>(null);

  // Persist (debounced) in this browser.
  useEffect(() => {
    const t = setTimeout(() => writeStorage(storageKey, code), 400);
    return () => clearTimeout(t);
  }, [code, storageKey]);

  const replaceCode = (next: string, message: string) => {
    const previous = code;
    setCode(next);
    if (previous.trim() && previous !== next) {
      toast(message, {
        action: { label: "Ongedaan maken", onClick: () => setCode(previous) },
      });
    }
  };

  const download = () => {
    const blob = new Blob([code], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "oefenen.py";
    a.click();
    URL.revokeObjectURL(url);
  };

  const header = (
    <PageHeader
      title="Oefenen"
      description="Probeer hier vrij Python uit. Je docent ziet hier niets van en er wordt niets nagekeken."
    />
  );
  if (!mounted) {
    return (
      <>
        {header}
        <LoadingState variant="list" />
      </>
    );
  }

  return (
    <>
      {header}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col gap-3" aria-label="Code">
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  Voorbeelden
                  <ChevronDown aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>Kies een voorbeeld</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {SNIPPETS.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onSelect={() =>
                      replaceCode(s.code, `Voorbeeld "${s.label}" geladen.`)
                    }
                    className="flex flex-col items-start gap-0.5"
                  >
                    <span className="font-mono text-sm font-medium">
                      {s.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {s.hint}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="ml-auto flex items-center gap-1">
              <CodeTipsButton code={code} options={PLAYGROUND_TIP_OPTIONS} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => replaceCode("", "Editor leeggemaakt.")}
                disabled={!code}
              >
                <Eraser aria-hidden="true" />
                Wissen
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={download}
                disabled={!code.trim()}
              >
                <Download aria-hidden="true" />
                <span className="max-sm:sr-only">Opslaan als .py</span>
              </Button>
            </div>
          </div>
          <div
            onKeyDownCapture={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                runHandle?.run();
              }
            }}
          >
            <CodeEditor
              ref={editorRef}
              value={code}
              onChange={setCode}
              minHeight={380}
              maxHeight="70vh"
              autocomplete
              placeholder="# Typ hier je Python-code"
              aria-label="Python-code om te oefenen"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Je code wordt bewaard in deze browser. <Kbd>Ctrl</Kbd> +{" "}
            <Kbd>Enter</Kbd> voert hem uit.
          </p>
        </section>

        <section
          className="flex min-h-80 min-w-0 flex-col gap-3"
          aria-labelledby={outputTitleId}
        >
          {/* Keeps the heading order intact: the run panel's error card is
              an h3 ("Foutmelding: …") and the page title is the h1. */}
          <h2 id={outputTitleId} className="sr-only">
            Uitvoer
          </h2>
          <CodeRunTab
            code={code}
            timeLimitMs={10_000}
            onHandle={setRunHandle}
            onGoToLine={(line) => editorRef.current?.goToLine(line)}
          />
        </section>
      </div>

      <section className="border-t pt-6" aria-labelledby={tipsTitleId}>
        <h2
          id={tipsTitleId}
          className="mb-3 font-display text-base font-semibold"
        >
          Tips
        </h2>
        <ul className="grid gap-3 text-sm leading-6 sm:grid-cols-2">
          <li>
            <strong>Tekst in input() mag gewoon.</strong> Schrijf bijvoorbeeld{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
              input("Wat is je naam? ")
            </code>
            . Bij toetsen telt die vraagtekst nooit mee als uitvoer, dus je
            wordt er niet op afgerekend.
          </li>
          <li>
            <strong>input() geeft altijd tekst.</strong> Wil je rekenen? Gebruik{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
              int(...)
            </code>{" "}
            of{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
              float(...)
            </code>
            .
          </li>
          <li>
            <strong>Een foutmelding?</strong> Kijk naar het regelnummer: daar
            (of net erboven) zit meestal het probleem. Let op inspringen en
            dubbele punten.
          </li>
          <li>
            <strong>Inspringen</strong> doe je met <Kbd>Tab</Kbd> (4 spaties).{" "}
            <Kbd>Shift</Kbd> + <Kbd>Tab</Kbd> springt terug.
          </li>
        </ul>
      </section>
    </>
  );
}
