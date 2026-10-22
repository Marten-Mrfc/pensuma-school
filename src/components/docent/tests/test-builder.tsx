"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Ellipsis,
  Eye,
  FileQuestion,
  FolderInput,
  ListOrdered,
  Loader2,
  Rocket,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { getErrorMessage } from "@/components/app/get-error-message";
import { EmptyBlock, ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { IssueDot } from "@/components/docent/questions/issue-list";
import {
  type QuestionDraft,
  QuestionEditor,
} from "@/components/docent/questions/question-editor";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { QuestionType } from "@/lib/questions/schema";
import type { QuestionTemplate } from "@/lib/questions/templates";
import {
  EDIT_WITH_ATTEMPTS_WARNING,
  MAX_POINTS_PER_QUESTION,
  type SolutionCheck,
  safeParseQuestionData,
  type TestProblem,
  validateTest,
} from "@/lib/questions/validate";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { CopyToTestDialog } from "./copy-to-test-dialog";
import { downloadTestJson } from "./download";
import { PreviewSheet } from "./preview-sheet";
import { PublishDialog } from "./publish-dialog";
import {
  type BuilderSelection,
  formatPoints,
  QuestionList,
} from "./question-list";
import { SaveIndicator } from "./save-indicator";
import {
  type TestSettingsDraft,
  TestSettingsEditor,
} from "./test-settings-editor";
import { useAutosave } from "./use-autosave";

type BuilderTest = RouterOutputs["test"]["get"];
type BuilderQuestion = BuilderTest["questions"][number];
type DraftValue = TestSettingsDraft | QuestionDraft;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEST_KEY = "test";
const qKey = (id: string) => `q:${id}`;

/* -------------------------------------------------------------------------- */
/*                                  Loader                                    */
/* -------------------------------------------------------------------------- */

export function TestBuilder({
  params,
}: {
  params: Promise<{ toetsId: string }>;
}) {
  const { toetsId } = use(params);
  const trpc = useTRPC();
  const valid = UUID_RE.test(toetsId);
  const query = useQuery({
    ...trpc.test.get.queryOptions({ id: toetsId }),
    enabled: valid,
    refetchOnWindowFocus: false,
  });

  if (!valid) {
    return <MissingTest />;
  }
  if (query.isPending) return <LoadingState label="Toets laden…" />;
  if (query.isError) {
    if (query.error.data?.code === "NOT_FOUND") return <MissingTest />;
    return (
      <ErrorState
        title="De toets kon niet worden geladen"
        error={query.error}
        onRetry={() => query.refetch()}
      />
    );
  }
  return <Builder test={query.data} />;
}

function MissingTest() {
  return (
    <EmptyBlock
      icon={FileQuestion}
      title="Deze toets bestaat niet (meer)"
      description="Misschien is hij verwijderd. Ga terug naar het overzicht van je toetsen."
      action={
        <Button asChild>
          <Link href={routes.docent.tests}>Naar toetsen</Link>
        </Button>
      }
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Builder                                   */
/* -------------------------------------------------------------------------- */

function Builder({ test }: { test: BuilderTest }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const testKey = trpc.test.get.queryKey({ id: test.id });

  const [selectionState, setSelection] = useState<BuilderSelection>(() => {
    const fromUrl = searchParams.get("vraag");
    if (fromUrl === "instellingen") return { kind: "settings" };
    if (fromUrl && test.questions.some((q) => q.id === fromUrl))
      return { kind: "question", id: fromUrl };
    if (test.questions[0])
      return { kind: "question", id: test.questions[0].id };
    return { kind: "settings" };
  });
  const [listOpen, setListOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [publishResult, setPublishResult] = useState<{
    problems: TestProblem[];
    warnings: TestProblem[];
  } | null>(null);
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null);
  const [copyQuestionId, setCopyQuestionId] = useState<string | null>(null);
  const [deleteTestOpen, setDeleteTestOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  /* ------------------------------ Mutations ------------------------------ */

  const updateTest = useMutation(trpc.test.update.mutationOptions());
  const updateQuestion = useMutation(trpc.question.update.mutationOptions());
  const createQuestion = useMutation(trpc.question.create.mutationOptions());
  const deleteQuestion = useMutation(trpc.question.delete.mutationOptions());
  const reorderQuestions = useMutation(trpc.question.reorder.mutationOptions());
  const duplicateQuestion = useMutation(
    trpc.question.duplicate.mutationOptions(),
  );
  const setStatus = useMutation(trpc.test.setStatus.mutationOptions());
  const duplicateTest = useMutation(trpc.test.duplicate.mutationOptions());
  const deleteTest = useMutation(trpc.test.delete.mutationOptions());

  function patchCache(fn: (old: BuilderTest) => BuilderTest) {
    queryClient.setQueryData(testKey, (old) => (old ? fn(old) : old));
  }

  function noteAttempts(hasAttempts: boolean) {
    const current = queryClient.getQueryData(testKey);
    if (hasAttempts && current && !current.hasAttempts) {
      patchCache((old) => ({ ...old, hasAttempts: true }));
      toast.warning(EDIT_WITH_ATTEMPTS_WARNING);
    }
  }

  async function invalidateAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: testKey }),
      queryClient.invalidateQueries({ queryKey: trpc.test.list.pathKey() }),
    ]);
  }

  /* ------------------------------ Autosave ------------------------------- */

  const autosave = useAutosave<DraftValue>({
    delay: 800,
    validate: (key, value) => {
      if (key === TEST_KEY) {
        const v = value as TestSettingsDraft;
        if (!v.title.trim()) return "Geef de toets een titel.";
        return null;
      }
      const v = value as QuestionDraft;
      const question = queryClient
        .getQueryData(testKey)
        ?.questions.find((q) => qKey(q.id) === key);
      if (!question) return null;
      if (!(v.points >= 0 && v.points <= MAX_POINTS_PER_QUESTION)) {
        return `Punten moeten tussen 0 en ${MAX_POINTS_PER_QUESTION} liggen.`;
      }
      const parsed = safeParseQuestionData(question.type, v.data);
      if (!parsed.success) {
        const number =
          (queryClient
            .getQueryData(testKey)
            ?.questions.findIndex((q) => q.id === question.id) ?? 0) + 1;
        return `Vraag ${number}: ${parsed.messages[0] ?? "ongeldige instellingen"}.`;
      }
      return null;
    },
    save: async (key, value) => {
      if (key === TEST_KEY) {
        const v = value as TestSettingsDraft;
        const res = await updateTest.mutateAsync({
          id: test.id,
          title: v.title,
          topic: v.topic.trim() || null,
          description: v.description,
        });
        patchCache((old) => ({
          ...old,
          title: res.test.title,
          topic: res.test.topic,
          description: res.test.description,
          updatedAt: res.test.updatedAt,
        }));
        queryClient.invalidateQueries({ queryKey: trpc.test.list.pathKey() });
        noteAttempts(res.hasAttempts);
        return;
      }
      const id = key.slice(2);
      const v = value as QuestionDraft;
      const res = await updateQuestion.mutateAsync({
        id,
        title: v.title,
        prompt: v.prompt,
        points: v.points,
        data: v.data,
      });
      patchCache((old) => ({
        ...old,
        questions: old.questions.map((q) =>
          q.id === id
            ? {
                ...q,
                title: res.question.title,
                prompt: res.question.prompt,
                points: res.question.points,
                data: res.question.data,
                solutionCheck: res.question.solutionCheck,
                updatedAt: res.question.updatedAt,
              }
            : q,
        ),
      }));
      noteAttempts(res.hasAttempts);
    },
  });
  const { drafts, flush } = autosave;

  /* ----------------------------- Derived data ---------------------------- */

  const settings: TestSettingsDraft = (drafts[TEST_KEY] as
    | TestSettingsDraft
    | undefined) ?? {
    title: test.title,
    topic: test.topic ?? "",
    description: test.description,
  };
  const questions: BuilderQuestion[] = test.questions.map((q) => {
    const draft = drafts[qKey(q.id)] as QuestionDraft | undefined;
    return draft ? { ...q, ...draft } : q;
  });
  const validation = validateTest({
    title: settings.title,
    questions: questions.map((q) => ({
      id: q.id,
      type: q.type,
      title: q.title,
      prompt: q.prompt,
      points: q.points,
      data: q.data,
      solutionCheck: q.solutionCheck as SolutionCheck | null,
    })),
  });
  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
  // A selected question may be missing for a moment (just added and the
  // cache not yet re-rendered) or for good (deleted): fall back without
  // overwriting the choice, so it reappears as soon as the data arrives.
  const selection: BuilderSelection =
    selectionState.kind === "question" &&
    !questions.some((q) => q.id === selectionState.id)
      ? questions[0]
        ? { kind: "question", id: questions[0].id }
        : { kind: "settings" }
      : selectionState;
  const selectedIndex =
    selection.kind === "question"
      ? questions.findIndex((q) => q.id === selection.id)
      : -1;
  const selectedQuestion = selectedIndex >= 0 ? questions[selectedIndex] : null;

  /* ------------------------------ Selection ------------------------------ */

  function select(next: BuilderSelection, opts: { scroll?: boolean } = {}) {
    if (selection.kind === "question") void flush(qKey(selection.id));
    if (selection.kind === "settings") void flush(TEST_KEY);
    setSelection(next);
    setListOpen(false);
    const params = new URLSearchParams(window.location.search);
    params.set("vraag", next.kind === "settings" ? "instellingen" : next.id);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`,
    );
    if (opts.scroll !== false) {
      requestAnimationFrame(() => {
        const el = editorRef.current;
        if (el && el.getBoundingClientRect().top < 64)
          el.scrollIntoView({ block: "start" });
      });
    }
  }

  function selectRelative(delta: -1 | 1) {
    if (questions.length === 0) return;
    if (selection.kind === "settings") {
      if (delta === 1) select({ kind: "question", id: questions[0].id });
      return;
    }
    const target = selectedIndex + delta;
    if (target < 0) select({ kind: "settings" });
    else if (target < questions.length)
      select({ kind: "question", id: questions[target].id });
  }

  /* --------------------------- Global listeners -------------------------- */

  const listenerState = useRef({
    flush,
    selectRelative,
    hasUnsaved: autosave.hasUnsaved,
  });
  useEffect(() => {
    listenerState.current = {
      flush,
      selectRelative,
      hasUnsaved: autosave.hasUnsaved,
    };
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        e.key.toLowerCase() === "s"
      ) {
        e.preventDefault();
        void listenerState.current.flush().then((ok) => {
          if (ok) toast.success("Opgeslagen", { duration: 1500 });
        });
        return;
      }
      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        (e.key === "ArrowUp" || e.key === "ArrowDown")
      ) {
        const target = e.target as HTMLElement | null;
        if (e.defaultPrevented || target?.closest(".cm-editor")) return;
        e.preventDefault();
        listenerState.current.selectRelative(e.key === "ArrowUp" ? -1 : 1);
      }
    }
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (listenerState.current.hasUnsaved()) {
        void listenerState.current.flush();
        e.preventDefault();
        e.returnValue = "";
      }
    }
    function onVisibility() {
      if (document.visibilityState === "hidden")
        void listenerState.current.flush();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      // Leaving the builder (client navigation): save what is pending.
      void listenerState.current.flush().then((ok) => {
        if (!ok)
          toast.error(
            "Niet alles kon worden opgeslagen. Open de toets opnieuw om het te controleren.",
          );
      });
    };
  }, []);

  /* ------------------------------ Actions -------------------------------- */

  function editQuestion(
    question: BuilderQuestion,
    patch: Partial<QuestionDraft>,
  ) {
    autosave.update(qKey(question.id), {
      title: question.title,
      prompt: question.prompt,
      points: question.points,
      data: question.data,
      ...patch,
    });
  }

  function editSettings(patch: Partial<TestSettingsDraft>) {
    autosave.update(TEST_KEY, { ...settings, ...patch });
  }

  async function addQuestion(template: QuestionTemplate) {
    try {
      const res = await createQuestion.mutateAsync({
        testId: test.id,
        type: template.type as QuestionType,
        templateId: template.id,
      });
      patchCache((old) => ({
        ...old,
        questions: [...old.questions, res.question],
      }));
      noteAttempts(res.hasAttempts);
      select({ kind: "question", id: res.question.id });
      void invalidateAll();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function moveQuestion(id: string, delta: -1 | 1) {
    const ids = questions.map((q) => q.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    await reorder(ids);
  }

  async function reorder(orderedIds: string[]) {
    const previous = queryClient.getQueryData(testKey);
    patchCache((old) => {
      const byId = new Map(old.questions.map((q) => [q.id, q]));
      return {
        ...old,
        questions: orderedIds
          .map((id, position) => {
            const q = byId.get(id);
            return q ? { ...q, position } : null;
          })
          .filter((q): q is BuilderQuestion => q !== null),
      };
    });
    try {
      const res = await reorderQuestions.mutateAsync({
        testId: test.id,
        orderedIds,
      });
      noteAttempts(res.hasAttempts);
      void queryClient.invalidateQueries({
        queryKey: trpc.test.list.pathKey(),
      });
    } catch (error) {
      if (previous) queryClient.setQueryData(testKey, previous);
      toast.error(getErrorMessage(error));
      void invalidateAll();
    }
  }

  async function duplicate(id: string) {
    await flush(qKey(id));
    try {
      const res = await duplicateQuestion.mutateAsync({ id });
      noteAttempts(res.hasAttempts);
      await invalidateAll();
      select({ kind: "question", id: res.question.id });
      toast.success("Vraag gedupliceerd.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function confirmDeleteQuestion() {
    const id = deleteQuestionId;
    if (!id) return;
    const index = questions.findIndex((q) => q.id === id);
    autosave.discard(qKey(id));
    await deleteQuestion.mutateAsync({ id, force: test.hasAttempts });
    const remaining = questions.filter((q) => q.id !== id);
    patchCache((old) => ({
      ...old,
      questions: old.questions.filter((q) => q.id !== id),
    }));
    const neighbour = remaining[Math.min(index, remaining.length - 1)];
    select(
      neighbour ? { kind: "question", id: neighbour.id } : { kind: "settings" },
      { scroll: false },
    );
    void invalidateAll();
    toast.success("Vraag verwijderd.");
  }

  async function publish(acknowledgeWarnings = false) {
    const saved = await flush();
    if (!saved) {
      toast.error(
        "Eerst moeten alle wijzigingen opgeslagen zijn. Bekijk de melding bij het opslaan.",
      );
      return;
    }
    try {
      const res = await setStatus.mutateAsync({
        id: test.id,
        status: "published",
        acknowledgeWarnings,
      });
      if (!res.changed) {
        setPublishResult({ problems: res.problems, warnings: res.warnings });
        return;
      }
      setPublishResult(null);
      patchCache((old) => ({ ...old, status: "published" }));
      void invalidateAll();
      toast.success(
        "De toets is gepubliceerd. Je kunt nu een afname plannen.",
        {
          action: {
            label: "Afname plannen",
            onClick: () =>
              router.push(routes.docent.newAssignment({ testId: test.id })),
          },
        },
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function changeStatus(status: "draft" | "archived") {
    try {
      await flush();
      await setStatus.mutateAsync({ id: test.id, status });
      patchCache((old) => ({ ...old, status }));
      void invalidateAll();
      toast.success(
        status === "draft"
          ? "De toets is weer een concept. Inplannen kan pas weer na publiceren."
          : "De toets is gearchiveerd.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function exportJson() {
    try {
      await flush();
      const data = await queryClient.fetchQuery({
        ...trpc.test.exportJson.queryOptions({ id: test.id }),
        staleTime: 0,
      });
      downloadTestJson(settings.title, data);
      toast.success("Toets geëxporteerd als JSON-bestand.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function duplicateWholeTest() {
    try {
      await flush();
      const res = await duplicateTest.mutateAsync({ id: test.id });
      void queryClient.invalidateQueries({
        queryKey: trpc.test.list.pathKey(),
      });
      toast.success("Kopie gemaakt. Je bewerkt nu de kopie.");
      router.push(routes.docent.test(res.id));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function confirmDeleteTest() {
    await deleteTest.mutateAsync({ id: test.id });
    for (const key of Object.keys(drafts)) autosave.discard(key);
    await queryClient.invalidateQueries({ queryKey: trpc.test.list.pathKey() });
    queryClient.removeQueries({ queryKey: testKey });
    toast.success("Toets verwijderd.");
    router.push(routes.docent.tests);
  }

  function openPreview() {
    setPreviewIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setPreviewOpen(true);
  }

  function onSolutionChecked(questionId: string, check: SolutionCheck) {
    patchCache((old) => ({
      ...old,
      questions: old.questions.map((q) =>
        q.id === questionId ? { ...q, solutionCheck: check } : q,
      ),
    }));
  }

  /* ------------------------------- Render -------------------------------- */

  const status = test.status;
  const saveIndicator = (
    <SaveIndicator state={autosave.state} onRetry={() => void flush()} />
  );
  const deletingQuestion =
    questions.find((q) => q.id === deleteQuestionId) ?? null;
  const copyingQuestion =
    questions.find((q) => q.id === copyQuestionId) ?? null;
  const settingsHasIssue = validation.errors.some(
    (e) => e.code === "test.no_title",
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <header className="flex flex-col gap-3">
        <Link
          href={routes.docent.tests}
          className="-ml-1 inline-flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Toetsen
        </Link>
        <div className="flex flex-col gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <label htmlFor="toets-titel" className="sr-only">
                Titel van de toets
              </label>
              <textarea
                id="toets-titel"
                rows={1}
                value={settings.title}
                onChange={(e) =>
                  editSettings({ title: e.target.value.replace(/\n/g, " ") })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                onBlur={() => void flush(TEST_KEY)}
                maxLength={200}
                placeholder="Titel van de toets"
                className={cn(
                  "-ml-2 max-w-full min-w-48 resize-none overflow-hidden rounded-md border text-balance [field-sizing:content] border-transparent bg-transparent px-2 py-0.5 font-display text-2xl leading-tight font-bold tracking-tight text-foreground transition-colors outline-none placeholder:text-muted-foreground/60 hover:border-border focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:text-[1.75rem]",
                  !settings.title.trim() && "border-destructive/50",
                )}
              />
              <StatusBadge kind="test" status={status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {settings.topic ? (
                <span className="font-medium text-foreground/80">
                  {settings.topic} ·{" "}
                </span>
              ) : null}
              {questions.length} {questions.length === 1 ? "vraag" : "vragen"} ·{" "}
              {formatPoints(totalPoints)}{" "}
              {totalPoints === 1 ? "punt" : "punten"}
              {test.assignmentCount > 0
                ? ` · ${test.assignmentCount} ${test.assignmentCount === 1 ? "afname" : "afnames"}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={openPreview}
              disabled={questions.length === 0}
            >
              <Eye aria-hidden="true" />
              Voorbeeld
            </Button>
            {status === "published" ? (
              <Button asChild variant="outline" size="sm">
                <Link href={routes.docent.newAssignment({ testId: test.id })}>
                  <CalendarPlus aria-hidden="true" />
                  Afname plannen
                </Link>
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="outline" size="sm" disabled>
                      <CalendarPlus aria-hidden="true" />
                      Afname plannen
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Publiceer de toets eerst.</TooltipContent>
              </Tooltip>
            )}
            {status === "draft" ? (
              <Button
                size="sm"
                onClick={() => void publish(false)}
                disabled={setStatus.isPending}
              >
                {setStatus.isPending ? (
                  <Loader2
                    className="motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Rocket aria-hidden="true" />
                )}
                Publiceren
                {validation.errors.length > 0 ? (
                  <span className="ml-0.5 rounded-full bg-primary-foreground/20 px-1.5 text-[0.68rem] tabular-nums">
                    {validation.errors.length}
                  </span>
                ) : null}
              </Button>
            ) : status === "published" ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void changeStatus("draft")}
              >
                <Undo2 aria-hidden="true" />
                Terug naar concept
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void changeStatus("draft")}
              >
                <ArchiveRestore aria-hidden="true" />
                Dearchiveren
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Meer acties">
                  <Ellipsis aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={() => void duplicateWholeTest()}>
                  <Copy aria-hidden="true" />
                  Toets dupliceren
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void exportJson()}>
                  <Download aria-hidden="true" />
                  Exporteren (JSON)
                </DropdownMenuItem>
                {status !== "archived" ? (
                  <DropdownMenuItem
                    onSelect={() => void changeStatus("archived")}
                  >
                    <Archive aria-hidden="true" />
                    Archiveren
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setDeleteTestOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 aria-hidden="true" />
                  Verwijderen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {test.hasAttempts ? (
        <div
          role="note"
          className="flex items-start gap-3 rounded-xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm"
        >
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-warning-ink"
            aria-hidden="true"
          />
          <p className="text-pretty">
            <span className="font-medium text-warning-ink">
              Deze toets is al gemaakt ({test.attemptCount} pogingen).
            </span>{" "}
            Je kunt hem nog aanpassen.{" "}
            {EDIT_WITH_ATTEMPTS_WARNING.replace("Er zijn al pogingen; l", "L")}{" "}
            <Link
              href={routes.docent.assignments}
              className="font-medium text-foreground underline underline-offset-4"
            >
              Naar afnames
            </Link>
          </p>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:items-start xl:grid-cols-[19rem_minmax(0,1fr)]">
        {/* Left: question list */}
        <aside
          aria-label="Vragenlijst"
          className="flex flex-col gap-3 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100svh-5.5rem)] lg:overflow-y-auto lg:pb-2"
        >
          <button
            type="button"
            aria-expanded={listOpen}
            onClick={() => setListOpen((o) => !o)}
            className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-3 text-left shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:hidden"
          >
            <ListOrdered
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-xs text-muted-foreground">
                {selection.kind === "settings"
                  ? "Toetsinstellingen"
                  : `Vraag ${selectedIndex + 1} van ${questions.length}`}
              </span>
              <span className="truncate text-sm font-medium">
                {selection.kind === "settings"
                  ? settings.title || "Naamloze toets"
                  : selectedQuestion?.title || "Naamloze vraag"}
              </span>
            </span>
            {validation.errors.length > 0 ? (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive-ink tabular-nums">
                {validation.errors.length}
              </span>
            ) : null}
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                listOpen && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
          <div className={cn(listOpen ? "block" : "hidden", "lg:block")}>
            <QuestionList
              questions={questions}
              issuesById={validation.byQuestion}
              selection={selection}
              onSelect={(s) => select(s)}
              onMove={(id, d) => void moveQuestion(id, d)}
              onReorder={(ids) => void reorder(ids)}
              onAdd={(t) => void addQuestion(t)}
              adding={createQuestion.isPending}
              settingsTitle={settings.title}
              settingsHasIssue={settingsHasIssue}
            />
          </div>
        </aside>

        {/* Right: editor */}
        <section
          ref={editorRef}
          aria-label="Editor"
          className="flex min-w-0 scroll-mt-20 flex-col gap-5"
        >
          {autosave.state.status === "invalid" ||
          autosave.state.status === "error" ? (
            <div
              role="alert"
              className={cn(
                "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
                autosave.state.status === "error"
                  ? "border-destructive/30 bg-destructive/[0.06]"
                  : "border-warning/35 bg-warning/10",
              )}
            >
              <TriangleAlert
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  autosave.state.status === "error"
                    ? "text-destructive-ink"
                    : "text-warning-ink",
                )}
                aria-hidden="true"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="font-medium">
                  {autosave.state.status === "error"
                    ? "Opslaan lukte niet"
                    : "Deze wijziging is nog niet opgeslagen"}
                </p>
                <p className="text-pretty text-muted-foreground">
                  {autosave.state.message}
                  {autosave.state.status === "invalid"
                    ? " Pas dit aan; daarna wordt alles automatisch opgeslagen."
                    : ""}
                </p>
              </div>
              {autosave.state.status === "error" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void flush()}
                >
                  Opnieuw proberen
                </Button>
              ) : null}
            </div>
          ) : null}

          {selection.kind === "settings" ? (
            <TestSettingsEditor
              value={settings}
              onChange={editSettings}
              status={saveIndicator}
            />
          ) : selectedQuestion ? (
            <QuestionEditor
              key={selectedQuestion.id}
              question={{
                id: selectedQuestion.id,
                type: selectedQuestion.type,
                title: selectedQuestion.title,
                prompt: selectedQuestion.prompt,
                points: selectedQuestion.points,
                data: selectedQuestion.data,
                solutionCheck:
                  selectedQuestion.solutionCheck as SolutionCheck | null,
              }}
              number={selectedIndex + 1}
              total={questions.length}
              issues={validation.byQuestion[selectedQuestion.id] ?? []}
              onChange={(patch) => editQuestion(selectedQuestion, patch)}
              onFlush={() => flush(qKey(selectedQuestion.id))}
              onSolutionChecked={(check) =>
                onSolutionChecked(selectedQuestion.id, check)
              }
              status={saveIndicator}
              actions={
                <>
                  <Button variant="ghost" size="sm" onClick={openPreview}>
                    <Eye aria-hidden="true" />
                    <span className="hidden sm:inline">Voorbeeld</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void duplicate(selectedQuestion.id)}
                    disabled={
                      duplicateQuestion.isPending || questions.length >= 50
                    }
                  >
                    <Copy aria-hidden="true" />
                    <span className="hidden sm:inline">Dupliceren</span>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Meer acties voor deze vraag"
                      >
                        <Ellipsis aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem
                        onSelect={() => setCopyQuestionId(selectedQuestion.id)}
                      >
                        <FolderInput aria-hidden="true" />
                        Kopiëren naar andere toets
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() =>
                          setDeleteQuestionId(selectedQuestion.id)
                        }
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 aria-hidden="true" />
                        Vraag verwijderen
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              }
            />
          ) : (
            <EmptyBlock
              icon={FileQuestion}
              title="Kies een vraag"
              description="Selecteer links een vraag of voeg een nieuwe vraag toe."
            />
          )}

          {questions.length > 0 ? (
            <nav
              aria-label="Vorige en volgende vraag"
              className="flex items-center justify-between gap-2 pt-1"
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => selectRelative(-1)}
                disabled={selection.kind === "settings"}
              >
                <ChevronLeft aria-hidden="true" />
                {selectedIndex > 0 ? `Vraag ${selectedIndex}` : "Instellingen"}
              </Button>
              {selectedQuestion ? (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <IssueDot
                    issues={validation.byQuestion[selectedQuestion.id] ?? []}
                  />
                  {selectedIndex + 1} / {questions.length}
                </span>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => selectRelative(1)}
                disabled={selectedIndex >= questions.length - 1}
              >
                {selection.kind === "settings"
                  ? "Vraag 1"
                  : `Vraag ${selectedIndex + 2}`}
                <ChevronRight aria-hidden="true" />
              </Button>
            </nav>
          ) : null}
        </section>
      </div>

      <PublishDialog
        open={publishResult !== null}
        onOpenChange={(open) => {
          if (!open) setPublishResult(null);
        }}
        problems={publishResult?.problems ?? []}
        warnings={publishResult?.warnings ?? []}
        pending={setStatus.isPending}
        onPublishAnyway={() => void publish(true)}
        onSelectQuestion={(id) => {
          setPublishResult(null);
          select(id ? { kind: "question", id } : { kind: "settings" });
        }}
      />

      <PreviewSheet
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        testTitle={settings.title}
        questions={questions}
        index={Math.min(previewIndex, Math.max(questions.length - 1, 0))}
        onIndexChange={setPreviewIndex}
      />

      <ConfirmDialog
        open={deleteQuestionId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteQuestionId(null);
        }}
        destructive
        title={`Vraag ${questions.findIndex((q) => q.id === deleteQuestionId) + 1} verwijderen?`}
        description={
          test.hasAttempts
            ? `“${deletingQuestion?.title ?? ""}” wordt verwijderd, inclusief de antwoorden die leerlingen al op deze vraag gaven. Dit kan niet ongedaan worden gemaakt.`
            : `“${deletingQuestion?.title ?? ""}” wordt definitief verwijderd.`
        }
        confirmLabel="Verwijderen"
        onConfirm={confirmDeleteQuestion}
      />

      <ConfirmDialog
        open={deleteTestOpen}
        onOpenChange={setDeleteTestOpen}
        destructive={!test.hasAttempts}
        title={
          test.hasAttempts
            ? "Archiveren in plaats van verwijderen?"
            : "Toets verwijderen?"
        }
        description={
          test.hasAttempts
            ? `Deze toets is al ${test.attemptCount} keer gemaakt door leerlingen en kan daarom niet worden verwijderd. Archiveer hem; dan verdwijnt hij uit je lijst en blijven alle resultaten bewaard.`
            : test.assignmentCount > 0
              ? `“${settings.title}” en ${test.assignmentCount === 1 ? "de geplande afname" : `de ${test.assignmentCount} geplande afnames`} worden definitief verwijderd.`
              : `“${settings.title}” en ${questions.length === 1 ? "de vraag" : `alle ${questions.length} vragen`} worden definitief verwijderd.`
        }
        confirmLabel={test.hasAttempts ? "Archiveren" : "Verwijderen"}
        onConfirm={
          test.hasAttempts ? () => changeStatus("archived") : confirmDeleteTest
        }
      />

      <CopyToTestDialog
        open={copyQuestionId !== null}
        onOpenChange={(open) => {
          if (!open) setCopyQuestionId(null);
        }}
        questionId={copyQuestionId}
        questionTitle={copyingQuestion?.title ?? ""}
        currentTestId={test.id}
        beforeCopy={() =>
          copyQuestionId ? flush(qKey(copyQuestionId)) : Promise.resolve(true)
        }
      />
    </div>
  );
}
