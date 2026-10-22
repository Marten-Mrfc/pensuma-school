"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, FileJson, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/components/app/get-error-message";
import { QUESTION_TYPE_ICONS } from "@/components/docent/questions/question-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { QUESTION_TYPE_LABELS, type QuestionType } from "@/lib/questions/schema";
import { type PortableTest, parsePortableTest } from "@/lib/questions/validate";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

const MAX_FILE_BYTES = 5_000_000;

export function ImportTestDialog({ trigger }: { trigger?: ReactNode }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const importJson = useMutation(trpc.test.importJson.mutationOptions());

  const parsed = text.trim() ? parsePortableTest(text) : null;
  const preview: PortableTest | null = parsed?.success ? parsed.data : null;

  function reset() {
    setText("");
    setFileName(null);
  }

  async function readFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      toast.error("Dit bestand is te groot (maximaal 5 MB).");
      return;
    }
    setFileName(file.name);
    setText(await file.text());
  }

  async function submit() {
    if (!preview) return;
    try {
      const res = await importJson.mutateAsync({ json: text });
      await queryClient.invalidateQueries({ queryKey: trpc.test.list.pathKey() });
      toast.success(
        `“${preview.test.title}” geïmporteerd met ${res.questionCount} ${res.questionCount === 1 ? "vraag" : "vragen"}.`,
      );
      setOpen(false);
      reset();
      router.push(routes.docent.test(res.id));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  const counts = preview
    ? (["code", "multiple_choice", "open"] as QuestionType[]).map((type) => ({
        type,
        n: preview.questions.filter((q) => q.type === type).length,
      }))
    : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <Upload aria-hidden="true" />
            Importeren (JSON)
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(44rem,calc(100dvh-2rem))] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Toets importeren</DialogTitle>
          <DialogDescription>
            Kies een JSON-bestand dat met “Exporteren” uit Pensuma is gemaakt, bijvoorbeeld van een collega. De
            toets wordt als concept toegevoegd.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <label
            htmlFor={inputId}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void readFile(file);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors hover:border-primary/50 hover:bg-primary/[0.03] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50",
              dragging && "border-primary bg-primary/[0.05]",
            )}
          >
            <FileJson className="size-7 text-primary" aria-hidden="true" />
            <span className="text-sm font-medium">{fileName ?? "Sleep een bestand hierheen of klik om te kiezen"}</span>
            <span className="text-xs text-muted-foreground">.json, maximaal 5 MB</span>
            <input
              ref={fileRef}
              id={inputId}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readFile(file);
                e.target.value = "";
              }}
            />
          </label>

          <details className="group rounded-lg border px-3 py-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground select-none">Of plak de JSON-tekst</summary>
            <textarea
              aria-label="JSON-tekst"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setFileName(null);
              }}
              rows={6}
              spellCheck={false}
              className="mt-2 block w-full resize-y rounded-md border border-input bg-[var(--code-bg)] px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </details>

          {parsed && !parsed.success ? (
            <div role="alert" className="flex gap-2.5 rounded-lg bg-destructive/[0.07] px-3 py-2.5 text-sm text-destructive-ink">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <p className="font-medium">Dit bestand kan niet worden geïmporteerd.</p>
                <ul className="list-disc pl-4 text-xs text-foreground/80">
                  {parsed.messages.slice(0, 4).map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {preview ? (
            <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-muted-foreground">Voorbeeld</span>
                <span className="font-semibold">{preview.test.title}</span>
                {preview.test.topic ? (
                  <span className="text-sm text-muted-foreground">{preview.test.topic}</span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium ring-1 ring-border">
                  {preview.questions.length} {preview.questions.length === 1 ? "vraag" : "vragen"} ·{" "}
                  {preview.questions.reduce((s, q) => s + q.points, 0)} punten
                </span>
                {counts
                  .filter((c) => c.n > 0)
                  .map(({ type, n }) => {
                    const Icon = QUESTION_TYPE_ICONS[type];
                    return (
                      <span
                        key={type}
                        className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs ring-1 ring-border"
                      >
                        <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                        {n}× {QUESTION_TYPE_LABELS[type].toLowerCase()}
                      </span>
                    );
                  })}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuleren
          </Button>
          <Button onClick={() => void submit()} disabled={!preview || importJson.isPending}>
            {importJson.isPending ? (
              <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            Importeren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
