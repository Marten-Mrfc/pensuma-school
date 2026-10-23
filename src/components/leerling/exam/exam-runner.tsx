"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Maximize,
  Send,
  Timer,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  use,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { CountdownTimer } from "@/components/app/countdown-timer";
import { getErrorMessage } from "@/components/app/get-error-message";
import { ErrorState, LoadingState } from "@/components/app/states";
import { ExamShell } from "@/components/layout/exam-shell";
import { DisplayPreferencesButton } from "@/components/preferences/display-preferences-dialog";
import { usePreferences } from "@/components/preferences/use-preferences";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useShortcut } from "@/lib/a11y/shortcuts";
import { useDocumentTitle } from "@/lib/a11y/use-document-title";
import { countWarnings, getCodeTips } from "@/lib/python/code-tips";
import type { AnswerResponse } from "@/lib/questions/schema";
import { routes } from "@/lib/routes";
import { useTRPC, useTRPCClient } from "@/trpc/react";
import { MonitoringIndicator } from "../monitoring/monitoring-indicator";
import {
  ActivityLogger,
  attachMonitoring,
  type ClientEventType,
  type EventDetails,
} from "./activity-logger";
import { AnswerSaver, REMOVED_STATUS, type SaveState } from "./answer-saver";
import { focusAfterDialogs } from "./focus-after-dialogs";
import {
  HandInSummary,
  handInDescription,
  QuestionOverviewButton,
} from "./hand-in-summary";
import { QuestionNavigator } from "./question-navigator";
import { QuestionView } from "./question-view";
import { SaveIndicator } from "./save-indicator";
import {
  dismissRejectedToasts,
  questionNumbersText,
  rejectedAnswerMessage,
  rejectedOnHandInMessage,
  rejectedToastId,
} from "./save-problems";
import {
  type AttemptData,
  codeData,
  isAnswered,
  type Responses,
  readStorage,
  removeStorage,
  storageKey,
  writeStorage,
} from "./types";

/** Toasts on the exam page never cover the footer navigation. */
const TOAST = { position: "top-center" } as const;

/* -------------------------------------------------------------------------- */
/*                                   Loader                                   */
/* -------------------------------------------------------------------------- */

export function ExamPage({
  params,
}: {
  params: Promise<{ pogingId: string }>;
}) {
  const { pogingId } = use(params);
  return <ExamLoader attemptId={pogingId} />;
}

function forgetAttempt(attemptId: string) {
  removeStorage(storageKey(attemptId));
  removeStorage(storageKey(attemptId, "flags"));
  removeStorage(storageKey(attemptId, "pos"));
}

function ExamLoader({ attemptId }: { attemptId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const query = useQuery(
    trpc.portal.getAttempt.queryOptions(
      { attemptId },
      {
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: 0,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    ),
  );
  const submitted = query.data?.attempt.status === "submitted";
  const contentHidden = !!query.data?.contentHidden;
  useDocumentTitle([
    submitted ? "Ingeleverd" : null,
    query.data?.assignment.title ?? "Toets",
  ]);

  useEffect(() => {
    if (!submitted) return;
    // Shared school PCs: nothing of a handed-in attempt stays behind.
    forgetAttempt(attemptId);
    if (!contentHidden) router.replace(routes.leerling.result(attemptId));
  }, [submitted, contentHidden, attemptId, router]);

  if (query.isPending) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        <LoadingState label="Toets wordt geladen…" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-16">
        <ErrorState
          title="Deze toets kon niet worden geladen"
          error={query.error}
          onRetry={() => query.refetch()}
        />
        <Button asChild variant="ghost" className="self-center">
          <Link href={routes.leerling.dashboard}>Terug naar mijn toetsen</Link>
        </Button>
      </div>
    );
  }
  if (submitted && contentHidden) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-success/12 text-success-ink">
          <CheckCircle2 className="size-7" aria-hidden="true" />
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Je hebt deze toets ingeleverd.
        </h1>
        <p className="max-w-md text-muted-foreground">
          Je antwoorden zijn veilig opgeslagen. Op de statuspagina zie je
          wanneer je je resultaat kunt bekijken.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href={routes.leerling.dashboard}>Naar mijn toetsen</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={routes.leerling.result(attemptId)}>
              Bekijk de status
            </Link>
          </Button>
        </div>
      </main>
    );
  }
  if (submitted) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <Loader2
          className="size-6 animate-spin text-primary"
          aria-hidden="true"
        />
        <p className="text-muted-foreground">
          Deze toets is ingeleverd. Je gaat naar je resultaat…
        </p>
      </div>
    );
  }
  return (
    <ExamRunner
      key={attemptId}
      data={query.data}
      serverOffsetMs={
        new Date(query.data.serverNow).getTime() - query.dataUpdatedAt
      }
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Runner                                   */
/* -------------------------------------------------------------------------- */

type Backup = Record<string, { response: AnswerResponse; updatedAt: number }>;

function initialState(data: AttemptData) {
  const attemptId = data.attempt.id;
  const responses: Responses = {};
  const savedAt: Record<string, number> = {};
  for (const a of data.answers) {
    if (a.response) responses[a.questionId] = a.response;
    savedAt[a.questionId] = a.savedAt ? new Date(a.savedAt).getTime() : 0;
  }
  // Restore local changes that never reached the server (crash, offline, closed tab).
  const restored: string[] = [];
  const backup = readStorage<Backup>(storageKey(attemptId)) ?? {};
  const known = new Set(data.questions.map((q) => q.id));
  for (const [questionId, entry] of Object.entries(backup)) {
    if (!known.has(questionId) || !entry?.response) continue;
    const serverTime = savedAt[questionId] ?? 0;
    const same =
      JSON.stringify(entry.response) ===
      JSON.stringify(responses[questionId] ?? null);
    if (!same && entry.updatedAt > serverTime) {
      responses[questionId] = entry.response;
      restored.push(questionId);
    }
  }
  const flagged = new Set(
    readStorage<string[]>(storageKey(attemptId, "flags")) ?? [],
  );
  const pos = readStorage<number>(storageKey(attemptId, "pos")) ?? 0;
  const index = Math.min(
    Math.max(0, pos),
    Math.max(0, data.questions.length - 1),
  );
  return { responses, restored, flagged, index };
}

function useFullscreenElement() {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener("fullscreenchange", onChange);
      return () => document.removeEventListener("fullscreenchange", onChange);
    },
    () => !!document.fullscreenElement,
    () => true,
  );
}

/** macOS/iOS: Option+arrows move by word; Back is Cmd+[ there. */
function isApplePlatform() {
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** Keep Escape inside the page while in fullscreen (where supported). */
function lockEscapeKey() {
  const keyboard = (
    navigator as Navigator & {
      keyboard?: { lock?: (keys: string[]) => Promise<void> };
    }
  ).keyboard;
  keyboard?.lock?.(["Escape"]).catch(() => {});
}

function ExamRunner({
  data,
  serverOffsetMs,
}: {
  data: AttemptData;
  serverOffsetMs: number;
}) {
  const attemptId = data.attempt.id;
  const settings = data.assignment.settings;
  const questions = data.questions;
  const trpcClient = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const announce = useAnnounce();
  const { prefs } = usePreferences();
  const headingId = useId();
  const scopeRef = useRef<HTMLDivElement>(null);

  const [init] = useState(() => initialState(data));
  const [responses, setResponses] = useState<Responses>(init.responses);
  const [index, setIndex] = useState(init.index);
  const [flagged, setFlagged] = useState<Set<string>>(init.flagged);
  const [offset, setOffset] = useState(serverOffsetMs);
  const [deadlineAt, setDeadlineAt] = useState<Date | null>(
    data.attempt.deadlineAt ? new Date(data.attempt.deadlineAt) : null,
  );
  const [navOpen, setNavOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [timerRevealed, setTimerRevealed] = useState(false);
  const [finishing, setFinishing] = useState<null | "manual" | "auto">(null);
  const finishingRef = useRef(false);
  const offsetRef = useRef(serverOffsetMs);

  const handlers = useRef({
    locked: (_err: unknown) => {},
    saved: (_questionId: string, _status: string) => {},
  });
  const indexRef = useRef(index);

  const [saver] = useState(
    () =>
      new AnswerSaver(
        attemptId,
        (questionId, response) =>
          trpcClient.portal.saveAnswer.mutate({
            attemptId,
            questionId,
            response,
          }),
        {
          serverOffsetMs: () => offsetRef.current,
          onLocked: (err) => handlers.current.locked(err),
          onSaved: (questionId, status) =>
            handlers.current.saved(questionId, status),
        },
      ),
  );
  const [logger] = useState(
    () =>
      new ActivityLogger(
        (events) => trpcClient.portal.logEvents.mutate({ attemptId, events }),
        settings,
      ),
  );
  const snapshot = useSyncExternalStore(
    saver.subscribe,
    saver.getSnapshot,
    saver.getSnapshot,
  );
  const isFullscreen = useFullscreenElement();
  const fullscreenSupported =
    typeof document !== "undefined" && document.fullscreenEnabled;
  const mustFullscreen = settings.requireFullscreen && fullscreenSupported;
  const showOverlay =
    mustFullscreen && !isFullscreen && !finishing && !overlayDismissed;

  const question = questions[index];
  const answered = new Set(
    questions.filter((q) => isAnswered(q, responses[q.id])).map((q) => q.id),
  );

  useDocumentTitle([
    question ? `Vraag ${index + 1} van ${questions.length}` : null,
    data.assignment.title,
  ]);

  const log = (type: ClientEventType, details?: EventDetails) =>
    logger.log(type, details);

  /** Question numbers (as the student sees them) of these question ids. */
  const questionNumbers = (ids: readonly string[]) =>
    ids
      .map((id) => questions.findIndex((q) => q.id === id) + 1)
      .filter((n) => n > 0);

  /* ------------------------------ lifecycle ------------------------------ */

  const goToResult = () => {
    saver.clearBackup();
    forgetAttempt(attemptId);
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => {});
    void queryClient.invalidateQueries({ queryKey: trpc.portal.pathKey() });
    router.replace(routes.leerling.result(attemptId));
  };

  const finish = async (mode: "manual" | "auto") => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(mode);
    const flushed = await Promise.race([
      saver.flush(),
      new Promise<boolean>((r) => setTimeout(() => r(false), 8000)),
    ]);
    if (!flushed && mode === "manual" && !saver.isLocked) {
      const snap = saver.getSnapshot();
      const refused = questionNumbers(snap.rejected);
      // The hand-in warning replaces the advice to shorten the answer.
      dismissRejectedToasts(snap.rejected);
      toast.warning(
        snap.state !== "offline" && refused.length
          ? rejectedOnHandInMessage(refused)
          : "Niet alles kon worden opgeslagen. We leveren in wat er op de server staat.",
        TOAST,
      );
    }
    await logger.flush();
    for (let attempt = 0; ; attempt++) {
      try {
        const sent = Date.now();
        const res = await trpcClient.portal.submitAttempt.mutate({
          attemptId,
          auto: mode === "auto",
        });
        if (res.notYet) {
          // The teacher gave extra time that the heartbeat had not brought
          // in yet: the server kept the attempt open. Carry on.
          const next =
            new Date(res.serverNow).getTime() - (sent + Date.now()) / 2;
          offsetRef.current = next;
          setOffset(next);
          setDeadlineAt(new Date(res.deadlineAt));
          finishingRef.current = false;
          setFinishing(null);
          toast.success(
            "Je hebt extra tijd gekregen van je docent. Je kunt verder werken.",
            TOAST,
          );
          return;
        }
        break;
      } catch (err) {
        const code = (err as { data?: { code?: string } }).data?.code;
        if (code === "PRECONDITION_FAILED") break;
        if (mode === "manual" || attempt >= 20) {
          finishingRef.current = false;
          setFinishing(null);
          toast.error(
            getErrorMessage(err, "Inleveren lukte niet. Probeer het opnieuw."),
            TOAST,
          );
          return;
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (mode === "auto") {
      // Only now that the server confirmed it (the time may have been
      // extended at the last moment).
      announce("De tijd is om. Je antwoorden zijn ingeleverd.", {
        politeness: "assertive",
        dedupeKey: "time-up",
      });
      toast.info("De tijd is om! Je werk is ingeleverd.", TOAST);
    }
    logger.stop();
    goToResult();
  };

  /** The attempt is gone or not the student's: back to the overview. */
  const leaveAttempt = () => {
    saver.clearBackup();
    forgetAttempt(attemptId);
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => {});
    void queryClient.invalidateQueries({ queryKey: trpc.portal.pathKey() });
    router.replace(routes.leerling.dashboard);
  };

  useEffect(() => {
    handlers.current.locked = (err) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      logger.stop();
      const code = (err as { data?: { code?: string } } | null)?.data?.code;
      // null: the heartbeat saw the attempt handed in.
      if (err == null || code === "PRECONDITION_FAILED") {
        toast.info(
          "Deze toets is ingeleverd. Je kunt niets meer wijzigen.",
          TOAST,
        );
        goToResult();
      } else {
        toast.error(
          "Deze toets is niet meer beschikbaar. Vraag je docent wat er aan de hand is.",
          TOAST,
        );
        leaveAttempt();
      }
    };
    handlers.current.saved = (_questionId, status) => {
      if (status !== REMOVED_STATUS) return;
      // The teacher deleted a question during the test: reload the list.
      toast.info(
        "Je docent heeft een vraag uit de toets gehaald. Die hoef je niet meer te maken.",
        { ...TOAST, id: "question-removed" },
      );
      void queryClient.invalidateQueries({
        queryKey: trpc.portal.getAttempt.queryKey({ attemptId }),
      });
    };
  });

  // A question disappeared (deleted by the teacher): stay within the list.
  useEffect(() => {
    if (questions.length > 0 && index > questions.length - 1)
      setIndex(questions.length - 1);
  }, [questions.length, index]);

  // Push restored local changes to the server once.
  const restoredPushed = useRef(false);
  useEffect(() => {
    if (restoredPushed.current) return;
    restoredPushed.current = true;
    for (const questionId of init.restored) {
      const r = init.responses[questionId];
      if (r) saver.update(questionId, r, { backup: false });
    }
    if (init.restored.length) {
      toast.success("We hebben je laatste wijzigingen teruggezet.", TOAST);
    }
  }, [init, saver]);

  useEffect(() => {
    logger.start();
    return () => {
      void saver.flush();
      void logger.flush();
      logger.pause();
      saver.dispose();
    };
  }, [logger, saver]);

  // Save on tab hide / page hide; warn before closing with unsaved work.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        void saver.flush();
        void logger.flush();
      }
    };
    const onPageHide = () => {
      void saver.flush();
      void logger.flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saver.hasUnsaved && !finishingRef.current) e.preventDefault();
    };
    const onOnline = () => void saver.flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("online", onOnline);
    };
  }, [saver, logger]);

  // Monitoring: only the listeners the (effective) settings ask for.
  useEffect(
    () =>
      attachMonitoring(
        logger,
        {
          logFocusEvents: settings.logFocusEvents,
          requireFullscreen: settings.requireFullscreen,
        },
        { window, document },
        { isFinishing: () => finishingRef.current },
      ),
    [logger, settings.logFocusEvents, settings.requireFullscreen],
  );

  // Announce save problems and their recovery, never routine autosaves.
  const lastSaveState = useRef<SaveState>(snapshot.state);
  useEffect(() => {
    const previous = lastSaveState.current;
    lastSaveState.current = snapshot.state;
    if (previous === snapshot.state) return;
    if (snapshot.state === "offline") {
      announce(
        "Je antwoord is nog niet opgeslagen: geen verbinding. We proberen het opnieuw.",
        { politeness: "assertive", dedupeKey: "save-offline" },
      );
    } else if (previous === "offline" && snapshot.state === "saved") {
      announce("Alles is weer opgeslagen.", { dedupeKey: "save-online" });
    }
  }, [snapshot.state, announce]);

  // An answer the server refused (e.g. over 20.000 tekens): say which one
  // and why, once; drop the toast again once a changed answer is saved.
  const lastRejected = useRef<readonly string[]>(snapshot.rejected);
  useEffect(() => {
    const previous = lastRejected.current;
    lastRejected.current = snapshot.rejected;
    if (previous === snapshot.rejected) return;
    for (const id of previous) {
      if (!snapshot.rejected.includes(id)) toast.dismiss(rejectedToastId(id));
    }
    for (const id of snapshot.rejected) {
      if (previous.includes(id)) continue;
      const i = questions.findIndex((q) => q.id === id);
      const q = questions[i];
      if (!q) continue;
      const message = rejectedAnswerMessage(q, responses[id], i + 1);
      announce(message, {
        politeness: "assertive",
        dedupeKey: rejectedToastId(id),
      });
      toast.error(message, {
        ...TOAST,
        id: rejectedToastId(id),
        duration: 15_000,
      });
    }
  }, [snapshot.rejected, questions, responses, announce]);
  // Leaving the exam (handed in, or another page): "make it shorter" no
  // longer applies, so those toasts must not follow the student there.
  useEffect(() => () => dismissRejectedToasts(lastRejected.current), []);

  // Heartbeat: last activity for the teacher + time extensions / force-submit.
  useEffect(() => {
    const beat = async () => {
      try {
        const sent = Date.now();
        const res = await trpcClient.portal.heartbeat.mutate({ attemptId });
        const received = Date.now();
        const next = new Date(res.serverNow).getTime() - (sent + received) / 2;
        if (Math.abs(next - offsetRef.current) > 1500) {
          offsetRef.current = next;
          setOffset(next);
        }
        setDeadlineAt((current) => {
          const incoming = res.deadlineAt ? new Date(res.deadlineAt) : null;
          return current?.getTime() === incoming?.getTime()
            ? current
            : incoming;
        });
        if (res.status === "submitted") handlers.current.locked(null);
      } catch {
        // Offline: the save indicator already shows it.
      }
    };
    const id = setInterval(beat, 30_000);
    return () => clearInterval(id);
  }, [trpcClient, attemptId]);

  // Five- and one-minute warnings (visual; the timer announces them).
  useEffect(() => {
    if (!deadlineAt) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const remaining = deadlineAt.getTime() - (Date.now() + offset);
    const warn = (ms: number, text: string) => {
      if (remaining > ms)
        timers.push(
          setTimeout(
            () => toast.warning(text, { ...TOAST, duration: 8000 }),
            remaining - ms,
          ),
        );
    };
    warn(5 * 60_000, "Nog 5 minuten! Rond je antwoorden af.");
    warn(60_000, "Nog 1 minuut. Je werk wordt straks automatisch ingeleverd.");
    return () => timers.forEach(clearTimeout);
  }, [deadlineAt, offset]);

  // Remember the current question (reload lands on the same one).
  useEffect(() => {
    indexRef.current = index;
    writeStorage(storageKey(attemptId, "pos"), index);
  }, [index, attemptId]);

  // Move focus to the new question's heading after every question change.
  const focusTarget = useRef<number | null>(null);
  useEffect(() => {
    if (focusTarget.current !== index) return;
    focusTarget.current = null;
    // After a sheet or dialog (navigator, hand-in) has closed, if one was open.
    focusAfterDialogs(headingId);
  }, [index, headingId]);

  // Fullscreen overlay: remember where focus was, and return it there once
  // fullscreen is back.
  const focusBeforeOverlay = useRef<HTMLElement | null>(null);
  const overlayWasShown = useRef(false);
  useEffect(() => {
    if (showOverlay && !overlayWasShown.current) {
      overlayWasShown.current = true;
      focusBeforeOverlay.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    } else if (!showOverlay && overlayWasShown.current) {
      overlayWasShown.current = false;
    }
  }, [showOverlay]);
  useEffect(() => {
    if (!submitOpen) setOverlayDismissed(false);
  }, [submitOpen]);

  /* ------------------------------- actions ------------------------------- */

  const goTo = (next: number) => {
    if (next < 0 || next >= questions.length || next === index) return;
    void saver.flush();
    focusTarget.current = next;
    setIndex(next);
    setNavOpen(false);
  };

  const setResponse = (questionId: string, response: AnswerResponse) => {
    setResponses((prev) => ({ ...prev, [questionId]: response }));
    saver.update(questionId, response);
  };

  const toggleFlag = (questionId: string) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      writeStorage(storageKey(attemptId, "flags"), [...next]);
      return next;
    });
  };

  // Keyboard: Alt+←/→ switch questions (not while typing), Ctrl/Cmd+S saves.
  useShortcut({
    id: "exam-navigate",
    label: "Vorige vraag",
    keys: { key: "ArrowLeft", alt: true },
    scope: scopeRef,
    handler: () => goTo(indexRef.current - 1),
  });
  useShortcut({
    id: "exam-navigate",
    label: "Volgende vraag",
    keys: { key: "ArrowRight", alt: true },
    scope: scopeRef,
    handler: () => goTo(indexRef.current + 1),
  });
  // Alt+←/→ is also the browser's Back/Forward on Windows and Linux. The
  // question shortcuts skip text fields and answer options, so keep the
  // browser from leaving the exam there (macOS uses Option+arrows for
  // moving by word, which must keep working).
  useEffect(() => {
    if (isApplePlatform()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useShortcut({
    id: "exam-save",
    label: "Nu opslaan",
    keys: { key: "s", mod: true },
    allowInEditable: true,
    handler: () => {
      void saver.flush().then((ok) => {
        if (ok) announce("Opgeslagen.", { dedupeKey: "save-now" });
      });
    },
  });

  const enterFullscreen = () => {
    void document.documentElement
      .requestFullscreen({ navigationUI: "hide" })
      .then(() => {
        lockEscapeKey();
        // Back in fullscreen: return focus to where the student was.
        const target = focusBeforeOverlay.current;
        focusAfterDialogs(target?.isConnected ? target : headingId);
      })
      .catch(() => {
        toast.error(
          "Volledig scherm lukte niet. Probeer F11 of vraag je docent om hulp.",
          TOAST,
        );
      });
  };

  /* -------------------------------- render ------------------------------- */

  const unanswered = questions.filter((q) => !answered.has(q.id));
  const flaggedList = questions.filter((q) => flagged.has(q.id));
  const rejectedIds = new Set(snapshot.rejected);
  const rejectedQuestions = questions.filter((q) => rejectedIds.has(q.id));
  const isLast = index === questions.length - 1;
  const monitored = settings.logFocusEvents || settings.requireFullscreen;

  // Code tips at hand-in time (never blocks submitting).
  const withTips = settings.codeTips
    ? questions.filter((q) => {
        if (q.type !== "code") return false;
        const r = responses[q.id];
        const code = r && "code" in r ? r.code : "";
        const d = codeData(q);
        return (
          countWarnings(
            getCodeTips(code, {
              starterCode: d.starterCode,
              functionNames: d.functionNames,
              hasIoTests: d.hasIoTests,
            }),
          ) > 0
        );
      })
    : [];

  const navigator = (
    <QuestionNavigator
      questions={questions}
      currentIndex={index}
      answered={answered}
      flagged={flagged}
      onSelect={goTo}
    />
  );

  const monitoringNote = monitored ? (
    <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
      <Eye className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        Logboek aan: je docent kan zien wanneer je het toetsvenster verlaat.
      </span>
    </p>
  ) : null;

  const timerHidden = !prefs.showTimer && !timerRevealed;
  const timer = deadlineAt ? (
    <div className="flex items-center gap-1">
      <CountdownTimer
        deadline={deadlineAt}
        serverOffsetMs={offset}
        onExpire={() => void finish("auto")}
        hidden={timerHidden}
      />
      {!prefs.showTimer ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setTimerRevealed((v) => !v)}
          aria-pressed={timerRevealed}
          className="text-muted-foreground"
        >
          {timerRevealed ? (
            <EyeOff aria-hidden="true" />
          ) : (
            <Timer aria-hidden="true" />
          )}
          <span className="max-sm:sr-only">
            {timerRevealed ? "Verberg timer" : "Toon timer"}
          </span>
        </Button>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      <div ref={scopeRef} className="contents">
        <ExamShell
          title={data.assignment.title}
          subtitle={
            <>
              Vraag {index + 1} van {questions.length}
              <span className="hidden sm:inline">
                {" "}
                · {answered.size} beantwoord
              </span>
            </>
          }
          bodyMode="fixed"
          timer={timer}
          actions={
            <>
              <MonitoringIndicator active={monitored} />
              <SaveIndicator
                snapshot={snapshot}
                rejectedLabel={
                  snapshot.rejected.length
                    ? questionNumbersText(questionNumbers(snapshot.rejected))
                    : undefined
                }
              />
              <DisplayPreferencesButton variant="icon" />
              <Button
                onClick={() => setSubmitOpen(true)}
                disabled={!!finishing}
                className="max-sm:px-3"
                aria-label="Inleveren"
              >
                {finishing ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Send aria-hidden="true" />
                )}
                <span className="max-sm:sr-only">Inleveren</span>
              </Button>
            </>
          }
          footer={
            <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-5">
              <Button
                variant="outline"
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
              >
                <ArrowLeft aria-hidden="true" />
                <span className="max-sm:sr-only">Vorige</span>
              </Button>
              <div className="flex items-center gap-2">
                <QuestionOverviewButton
                  index={index}
                  total={questions.length}
                  className="xl:hidden"
                  onClick={() => setNavOpen(true)}
                />
                <span className="hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex">
                  <Kbd>Alt</Kbd>+<Kbd>←</Kbd>/<Kbd>→</Kbd> vorige/volgende vraag
                </span>
              </div>
              {isLast ? (
                <Button
                  onClick={() => setSubmitOpen(true)}
                  disabled={!!finishing}
                >
                  <span className="max-sm:sr-only">Naar inleveren</span>
                  <Send aria-hidden="true" />
                </Button>
              ) : (
                <Button onClick={() => goTo(index + 1)}>
                  <span className="max-sm:sr-only">Volgende</span>
                  <ArrowRight aria-hidden="true" />
                </Button>
              )}
            </div>
          }
        >
          <div className="flex h-full min-h-0">
            <aside className="hidden w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r bg-card/40 p-4 xl:flex">
              {navigator}
              <div className="mt-auto">{monitoringNote}</div>
            </aside>
            <div className="min-h-0 min-w-0 flex-1">
              {question ? (
                <QuestionView
                  key={question.id}
                  attemptId={attemptId}
                  question={question}
                  number={index + 1}
                  total={questions.length}
                  headingId={headingId}
                  response={responses[question.id]}
                  onChange={(r) => setResponse(question.id, r)}
                  flagged={flagged.has(question.id)}
                  onToggleFlag={() => toggleFlag(question.id)}
                  settings={settings}
                  onLog={log}
                  disabled={!!finishing || snapshot.state === "locked"}
                  saveProblem={
                    rejectedIds.has(question.id)
                      ? rejectedAnswerMessage(
                          question,
                          responses[question.id],
                          index + 1,
                        )
                      : null
                  }
                />
              ) : null}
            </div>
          </div>
        </ExamShell>
      </div>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] overflow-y-auto rounded-t-2xl px-5 pb-6"
        >
          <SheetHeader className="px-0">
            <SheetTitle>Vragen</SheetTitle>
            <SheetDescription>
              Kies een vraag om ernaartoe te gaan.
            </SheetDescription>
          </SheetHeader>
          <div className="mx-auto w-full max-w-xs">{navigator}</div>
          {monitoringNote ? (
            <div className="mx-auto mt-4 w-full max-w-xs">{monitoringNote}</div>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        title="Toets inleveren?"
        description={handInDescription({
          unanswered: unanswered.length,
          rejected: rejectedQuestions.length,
        })}
        confirmLabel="Inleveren"
        cancelLabel="Nog even terug"
        onConfirm={() => finish("manual")}
      >
        <HandInSummary
          questions={questions}
          unanswered={unanswered}
          withTips={withTips}
          flagged={flaggedList}
          rejected={rejectedQuestions}
          offline={snapshot.state === "offline"}
          onJump={(i) => {
            setSubmitOpen(false);
            goTo(i);
          }}
        />
      </ConfirmDialog>

      <Dialog open={showOverlay}>
        <DialogContent
          role="alertdialog"
          showCloseButton={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => {
            // Focus goes back to where the student was (see enterFullscreen),
            // or into the hand-in dialog.
            e.preventDefault();
          }}
          className="flex max-w-md flex-col items-center gap-4 p-8 text-center"
        >
          <span className="grid size-14 place-items-center rounded-2xl bg-warning/15 text-warning-ink">
            <Maximize className="size-7" aria-hidden="true" />
          </span>
          <DialogTitle className="font-display text-2xl leading-tight font-bold tracking-tight">
            Ga terug naar volledig scherm om verder te gaan
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Deze toets werkt alleen in volledig scherm. Het verlaten ervan wordt
            bijgehouden. Je antwoorden zijn veilig opgeslagen.
          </DialogDescription>
          <Button
            size="lg"
            className="h-12 px-6 text-base"
            onClick={enterFullscreen}
            autoFocus
          >
            <Maximize aria-hidden="true" />
            Volledig scherm
          </Button>
          <Button
            variant="link"
            className="text-muted-foreground"
            onClick={() => {
              setOverlayDismissed(true);
              setSubmitOpen(true);
            }}
          >
            Ik ben klaar en wil inleveren
          </Button>
        </DialogContent>
      </Dialog>

      {finishing ? (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-background/80 backdrop-blur-sm"
          aria-busy="true"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2
              className="size-8 animate-spin text-primary"
              aria-hidden="true"
            />
            <p className="font-display text-lg font-semibold">
              {finishing === "auto"
                ? "De tijd is om. Je werk wordt ingeleverd…"
                : "Inleveren…"}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
