"use client";

// TEMPORARY visual check page. Delete after review.
import { BookOpen, FileCode2, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { CodeEditor } from "@/components/app/code-editor";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { CopyButton } from "@/components/app/copy-button";
import { CountdownTimer } from "@/components/app/countdown-timer";
import { FormField } from "@/components/app/form-field";
import { Markdown } from "@/components/app/markdown";
import { MarkdownEditor } from "@/components/app/markdown-editor";
import { PageHeader } from "@/components/app/page-header";
import { SimpleTable } from "@/components/app/simple-table";
import { StatCard } from "@/components/app/stat-card";
import { EmptyBlock, ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MD = `## Opdracht 3: Begroeting

Schrijf een programma dat om je **naam** vraagt en je daarna begroet.

- Gebruik \`input()\` om de naam te vragen
- Print \`Hallo\` gevolgd door de naam

\`\`\`python
naam = input("Wat is je naam? ")
print("Hallo", naam)  # zo dus
for i in range(3):
    print(i * 2)
\`\`\`

| Invoer | Verwachte uitvoer |
| ------ | ----------------- |
| Sam    | Hallo Sam         |
| Noor   | Hallo Noor        |

> Tip: de vraag in \`input()\` telt niet mee.
`;

const rows = [
  { id: "1", name: "Sam de Vries", klas: "4H2", score: 8.2, status: "graded" },
  { id: "2", name: "Noor Jansen", klas: "4H2", score: 6.4, status: "needs_review" },
  { id: "3", name: "Ali Bakker", klas: "4H1", score: null, status: "pending" },
];

export default function Preview() {
  const [code, setCode] = useState(
    'def is_even(n):\n    """Geeft True als n even is."""\n    return n % 2 == 0\n\nnaam = input("Wat is je naam? ")\nprint(f"Hallo {naam}!", 42, True, None)\n',
  );
  const [md, setMd] = useState(MD);
  const deadlineSoon = new Date(Date.now() + 4 * 60 * 1000 + 30 * 1000);
  const deadlineLater = new Date(Date.now() + 75 * 60 * 1000);
  const deadlineDanger = new Date(Date.now() + 45 * 1000);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-5 py-10">
      <PageHeader
        title="Toets hoofdstuk 3: lussen"
        description="Een voorbeeld van een paginakop met badge, acties en terug-link."
        backHref="/"
        backLabel="Alle toetsen"
        badge={<StatusBadge kind="test" status="published" />}
        actions={
          <>
            <Button variant="outline">Voorbeeld</Button>
            <Button>Bewerken</Button>
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Leerlingen" value={128} icon={Users} hint="4 klassen" tone="primary" />
        <StatCard label="Toetsen" value={12} icon={FileCode2} hint="3 concepten" tone="info" />
        <StatCard label="Nakijken nodig" value={7} icon={BookOpen} hint="in 2 afnames" tone="warning" />
        <StatCard label="Gemiddelde" value="7,4" tone="success" />
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["test", "draft"],
            ["test", "published"],
            ["test", "archived"],
            ["assignment", "planned"],
            ["assignment", "open"],
            ["assignment", "closed"],
            ["attempt", "in_progress"],
            ["attempt", "submitted"],
            ["grading", "pending"],
            ["grading", "graded"],
            ["grading", "needs_review"],
            ["answer", "empty"],
            ["answer", "saved"],
          ] as const
        ).map(([k, s]) => (
          <StatusBadge key={k + s} kind={k} status={s} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <CountdownTimer deadline={deadlineLater} />
        <CountdownTimer deadline={deadlineSoon} />
        <CountdownTimer deadline={deadlineDanger} />
        <CopyButton value="17053" label="Kopieer" variant="outline" />
        <CopyButton value="17053" />
        <ConfirmDialog
          trigger={
            <Button variant="outline">
              <Trash2 /> Verwijderen
            </Button>
          }
          title="Klas 4H2 verwijderen?"
          description="Alle leerlingen blijven bestaan, maar worden uit deze klas gehaald."
          destructive
          onConfirm={async () => {
            await new Promise((r) => setTimeout(r, 800));
          }}
        />
      </div>
      <CodeEditor value={code} onChange={setCode} minHeight={180} autocomplete />
      <CodeEditor value={code} readOnly minHeight={80} />
      <div className="grid gap-6 lg:grid-cols-2">
        <MarkdownEditor value={md} onChange={setMd} />
        <div className="rounded-xl border bg-card p-5">
          <Markdown>{md}</Markdown>
        </div>
      </div>
      <SimpleTable
        caption="Resultaten"
        columns={[
          { key: "name", header: "Naam", sortValue: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: "klas", header: "Klas", sortValue: (r) => r.klas, hideBelow: "sm" },
          { key: "score", header: "Cijfer", align: "right", sortValue: (r) => r.score, cell: (r) => r.score?.toFixed(1) ?? "–" },
          { key: "status", header: "Status", cell: (r) => <StatusBadge kind="grading" status={r.status} /> },
        ]}
        rows={rows}
        onRowClick={() => {}}
      />
      <SimpleTable columns={[{ key: "a", header: "Naam" }]} rows={[]} emptyText="Nog geen leerlingen in deze klas." />
      <div className="grid gap-6 md:grid-cols-2">
        <FormField label="Naam van de klas" htmlFor="k" description="Bijvoorbeeld 4H2." required>
          <Input id="k" placeholder="4H2" />
        </FormField>
        <FormField label="Leerlingnummer" htmlFor="n" error="Dit leerlingnummer bestaat al.">
          <Input id="n" status="error" defaultValue="17053" />
        </FormField>
      </div>
      <EmptyBlock
        icon={Users}
        title="Nog geen klassen"
        description="Maak je eerste klas aan en voeg leerlingen toe."
        action={<Button>Klas toevoegen</Button>}
      />
      <ErrorState error={new Error("Failed to fetch")} onRetry={() => {}} />
      <LoadingState />
    </div>
  );
}
