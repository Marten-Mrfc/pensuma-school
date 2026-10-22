"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  CircleAlert,
  CircleCheck,
  FileUp,
  Loader2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import {
  type DragEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/components/app/get-error-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { parseStudentList } from "@/lib/import/parse-students";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";

export type ImportResult = RouterOutputs["student"]["import"];

const EXAMPLE = "17053\tJan Jansen\n17054\tSem de Vries\n17061\tLotte Bakker";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/** Read a text file; falls back to Windows-1252 (Excel's CSV default) when it isn't UTF-8. */
async function readTextFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("�")) return utf8;
  return new TextDecoder("windows-1252").decode(buffer);
}

const SPREADSHEET_EXT = /\.(xlsx|xls|ods|numbers)$/i;

type PreviewStatus =
  | { kind: "new" }
  | { kind: "existing"; currentName: string; nameDiffers: boolean }
  | { kind: "member"; currentName: string; nameDiffers: boolean }
  | { kind: "error"; message: string };

type PreviewRow = {
  line: number;
  studentNumber: string;
  name: string;
  status: PreviewStatus;
};

export interface ImportStudentsPanelProps {
  classId: string;
  className: string;
  onCancel: () => void;
  onImported: (result: ImportResult) => void;
}

/** Paste/CSV import with a live, validated preview. */
export function ImportStudentsPanel({
  classId,
  className,
  onCancel,
  onImported,
}: ImportStudentsPanelProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [updateNames, setUpdateNames] = useState(false);

  const parsed = useMemo(() => parseStudentList(text), [text]);
  const numbers = useMemo(
    () => [...new Set(parsed.rows.map((r) => r.studentNumber))].sort(),
    [parsed.rows],
  );
  const debouncedNumbers = useDebouncedValue(numbers, 300);

  const existingQuery = useQuery({
    ...trpc.student.checkExisting.queryOptions({
      studentNumbers: debouncedNumbers,
      classId,
    }),
    enabled: debouncedNumbers.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
  const checking =
    numbers.length > 0 &&
    (existingQuery.isFetching || debouncedNumbers.join() !== numbers.join());

  const existing = useMemo(
    () => new Map((existingQuery.data ?? []).map((e) => [e.studentNumber, e])),
    [existingQuery.data],
  );

  const preview: PreviewRow[] = useMemo(() => {
    const rows: PreviewRow[] = parsed.rows.map((r) => {
      const found = existing.get(r.studentNumber);
      let status: PreviewStatus = { kind: "new" };
      if (found && !found.isStudent) {
        status = {
          kind: "error",
          message: "Dit nummer is al in gebruik door een ander account.",
        };
      } else if (found) {
        const nameDiffers =
          found.name.trim().toLowerCase() !== r.name.trim().toLowerCase();
        status = found.inClass
          ? { kind: "member", currentName: found.name, nameDiffers }
          : { kind: "existing", currentName: found.name, nameDiffers };
      }
      return { ...r, status };
    });
    for (const e of parsed.errors) {
      rows.push({
        line: e.line,
        studentNumber: "",
        name: e.raw,
        status: { kind: "error", message: e.message },
      });
    }
    return rows.sort((a, b) => a.line - b.line);
  }, [parsed, existing]);

  const counts = useMemo(() => {
    const c = { new: 0, existing: 0, member: 0, error: 0, renamable: 0 };
    for (const r of preview) {
      c[r.status.kind]++;
      if (
        (r.status.kind === "existing" || r.status.kind === "member") &&
        r.status.nameDiffers
      )
        c.renamable++;
    }
    return c;
  }, [preview]);

  const importable = preview.filter((r) => r.status.kind !== "error");
  /** Rows that actually change something (members are only sent for renaming). */
  const toAdd = counts.new + counts.existing;
  const canSubmit = toAdd > 0 || (updateNames && counts.renamable > 0);

  const importMutation = useMutation(
    trpc.student.import.mutationOptions({
      onSuccess: async (result) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.class.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.student.pathKey() }),
        ]);
        onImported(result);
      },
      onError: (e) => toast.error(getErrorMessage(e)),
    }),
  );

  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (SPREADSHEET_EXT.test(file.name)) {
      toast.error("Excel-bestanden kun je niet direct inlezen", {
        description:
          "Kopieer de cellen in Excel en plak ze hier, of sla het bestand op als CSV.",
      });
      return;
    }
    if (file.size > 2_000_000) {
      toast.error("Dit bestand is te groot (maximaal 2 MB).");
      return;
    }
    try {
      setText(await readTextFile(file));
      setFileName(file.name);
    } catch {
      toast.error("Dit bestand kon niet worden gelezen.");
    }
  }

  function onDrop(e: DragEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    setDragging(false);
    void loadFile(e.dataTransfer.files?.[0]);
  }

  function submit() {
    importMutation.mutate({
      classId,
      onExisting: updateNames ? "update_name" : "skip",
      rows: importable.map((r) => ({
        studentNumber: r.studentNumber,
        name: r.name,
        line: r.line,
      })),
    });
  }

  const hasInput = text.trim().length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 sm:px-6">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <label htmlFor={inputId} className="text-sm font-medium">
              Plak hier je leerlingenlijst
            </label>
            <div className="flex items-center gap-1.5">
              {fileName ? (
                <span className="inline-flex max-w-48 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  <span className="truncate">{fileName}</span>
                  <button
                    type="button"
                    className="rounded-full hover:text-foreground"
                    aria-label="Bestand verwijderen"
                    onClick={() => {
                      setFileName(null);
                      setText("");
                    }}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInput.current?.click()}
              >
                <FileUp aria-hidden="true" />
                CSV-bestand kiezen
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  void loadFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          <div className="relative rounded-md">
            <textarea
              id={inputId}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (fileName) setFileName(null);
              }}
              rows={7}
              spellCheck={false}
              placeholder={`Bijvoorbeeld:\n${EXAMPLE.replaceAll("\t", "  ")}`}
              className={cn(
                "block min-h-36 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2.5 font-mono text-sm leading-relaxed shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                dragging && "border-primary ring-[3px] ring-primary/40",
              )}
            />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Eén leerling per regel: leerlingnummer en naam. Kopieer de kolommen
            uit Excel, Magister of SOMtoday, of sleep een CSV-bestand hierheen.
            Een kopregel (zoals{" "}
            <span className="font-mono">Leerlingnummer;Naam</span> of{" "}
            <span className="font-mono">Voornaam;Tussenvoegsel;Achternaam</span>
            ) wordt herkend.
          </p>
        </div>

        {hasInput ? (
          <section
            aria-label="Voorbeeld van de import"
            className="flex flex-col gap-3"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <SummaryChip
                tone="success"
                icon={UserPlus}
                label={`${counts.new} nieuw`}
              />
              <SummaryChip
                tone="info"
                icon={UsersRound}
                label={`${counts.existing} bestaan al`}
              />
              {counts.member > 0 ? (
                <SummaryChip
                  tone="muted"
                  icon={CircleCheck}
                  label={`${counts.member} al in klas`}
                />
              ) : null}
              {counts.error > 0 ? (
                <SummaryChip
                  tone="destructive"
                  icon={CircleAlert}
                  label={`${counts.error} met fout`}
                />
              ) : null}
              {checking ? (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Loader2
                    className="size-3 motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                  Controleren…
                </span>
              ) : null}
              {parsed.headerDetected ? (
                <span className="text-muted-foreground">Kopregel herkend</span>
              ) : null}
            </div>

            <div className="overflow-hidden rounded-lg border">
              <div className="max-h-[42vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th scope="col" className="w-12 px-3 py-2 font-medium">
                        Regel
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Leerling
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r) => (
                      <PreviewTableRow
                        key={`${r.line}-${r.studentNumber}`}
                        row={r}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {counts.renamable > 0 ? (
              <label
                htmlFor="import-update-names"
                className="flex cursor-pointer items-start gap-2.5 rounded-lg border bg-muted/30 p-3 text-sm"
              >
                <Checkbox
                  id="import-update-names"
                  checked={updateNames}
                  onCheckedChange={(v) => setUpdateNames(v === true)}
                  className="mt-0.5"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    Namen van bestaande leerlingen bijwerken
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {counts.renamable === 1
                      ? "1 bestaande leerling heeft een andere naam in je lijst."
                      : `${counts.renamable} bestaande leerlingen hebben een andere naam in je lijst.`}{" "}
                    Zonder vinkje blijft de huidige naam staan.
                  </span>
                </span>
              </label>
            ) : null}
          </section>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={importMutation.isPending}
        >
          Annuleren
        </Button>
        <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center">
          {importMutation.isPending ? (
            <span className="text-center text-xs text-muted-foreground">
              Accounts aanmaken, even geduld…
            </span>
          ) : null}
          <Button
            onClick={submit}
            disabled={!canSubmit || importMutation.isPending || checking}
            aria-busy={importMutation.isPending}
          >
            {importMutation.isPending ? (
              <Loader2
                className="motion-safe:animate-spin"
                aria-hidden="true"
              />
            ) : (
              <UserPlus aria-hidden="true" />
            )}
            {toAdd === 0
              ? canSubmit
                ? "Namen bijwerken"
                : "Importeren"
              : `${toAdd} ${toAdd === 1 ? "leerling" : "leerlingen"} toevoegen aan ${className}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

const CHIP_TONE = {
  success: "bg-success/10 text-success-ink ring-success/25",
  info: "bg-info/10 text-info-ink ring-info/25",
  muted: "bg-muted text-muted-foreground ring-border",
  destructive: "bg-destructive/10 text-destructive-ink ring-destructive/25",
} as const;

function SummaryChip({
  tone,
  icon: Icon,
  label,
}: {
  tone: keyof typeof CHIP_TONE;
  icon: typeof UserPlus;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 font-medium ring-1 ring-inset",
        CHIP_TONE[tone],
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

function PreviewTableRow({ row }: { row: PreviewRow }) {
  const { status } = row;
  const isError = status.kind === "error";
  return (
    <tr
      className={cn("border-t align-top", isError && "bg-destructive/[0.04]")}
    >
      <td className="px-3 py-2 font-mono text-xs text-muted-foreground tabular-nums">
        {row.line}
      </td>
      <td className="px-3 py-2">
        {isError ? (
          <span className="font-mono text-xs break-all text-muted-foreground">
            {row.name || "(leeg)"}
          </span>
        ) : (
          <span className="flex flex-col">
            <span className="font-medium">{row.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {row.studentNumber}
            </span>
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        {status.kind === "new" ? (
          <span className="inline-flex items-center gap-1 font-medium text-success-ink">
            <UserPlus className="size-3.5" aria-hidden="true" />
            Nieuw, krijgt een pincode
          </span>
        ) : status.kind === "existing" ? (
          <span className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 font-medium text-info-ink">
              <UsersRound className="size-3.5" aria-hidden="true" />
              Bestaat al – wordt aan klas toegevoegd
            </span>
            {status.nameDiffers ? (
              <span className="text-muted-foreground">
                Nu: {status.currentName}
              </span>
            ) : null}
          </span>
        ) : status.kind === "member" ? (
          <span className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <CircleCheck className="size-3.5" aria-hidden="true" />
              Zit al in deze klas
            </span>
            {status.nameDiffers ? (
              <span className="text-muted-foreground">
                Nu: {status.currentName}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="inline-flex items-start gap-1 font-medium text-destructive-ink">
            <CircleAlert
              className="mt-px size-3.5 shrink-0"
              aria-hidden="true"
            />
            {status.message}
          </span>
        )}
      </td>
    </tr>
  );
}
