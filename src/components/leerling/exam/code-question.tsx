"use client";

import {
  ClipboardX,
  FlaskConical,
  RotateCcw,
  SquareTerminal,
} from "lucide-react";
import { useRef, useState } from "react";
import { useAnnounce } from "@/components/a11y/live-announcer";
import {
  CodeEditor,
  type CodeEditorHandle,
} from "@/components/app/code-editor";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Markdown } from "@/components/app/markdown";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { CodeTipsButton } from "./code-tips";
import { CodeRunTab, CodeTestTab, type RunHandle } from "./code-tools";
import { HintPanel } from "./hint-panel";
import { QuestionHeader, type QuestionViewProps } from "./question-view";
import { codeData } from "./types";
import { useMediaQuery } from "./use-media-query";

export function CodeQuestion(props: QuestionViewProps) {
  const { attemptId, question, response, onChange, settings, onLog, disabled } =
    props;
  const data = codeData(question);
  const announce = useAnnounce();
  // The student-safe checks carry no weight; the browser self-test needs one.
  const checks = (data.checks ?? []).map((c) => ({ ...c, weight: 1 }));
  const code =
    response && "code" in response ? response.code : data.starterCode;
  const wide = useMediaQuery("(min-width: 1024px)");
  const [tab, setTab] = useState<"run" | "test">(
    settings.allowCodeRun ? "run" : "test",
  );
  const [resetOpen, setResetOpen] = useState(false);
  const [pasteBlockedAt, setPasteBlockedAt] = useState<number | null>(null);
  const [runHandle, setRunHandle] = useState<RunHandle | null>(null);
  const editorRef = useRef<CodeEditorHandle>(null);
  const hasTools = settings.allowCodeRun || settings.allowSelfTest;

  const onPaste = () => {
    onLog("paste", { questionId: question.id, blocked: settings.blockPaste });
    if (settings.blockPaste) {
      setPasteBlockedAt(Date.now());
      announce("Plakken is uitgezet tijdens deze toets.", {
        dedupeKey: "paste",
      });
    }
  };

  const runNow = () => {
    if (!settings.allowCodeRun || !runHandle) return;
    setTab("run");
    runHandle.run();
  };

  const header = <QuestionHeader {...props} />;
  const prompt = (
    <>
      {question.prompt.trim() ? (
        <div className="text-[0.95rem]">
          <Markdown>{question.prompt}</Markdown>
        </div>
      ) : null}
      {settings.allowHints ? (
        <HintPanel
          attemptId={attemptId}
          questionId={question.id}
          points={question.points}
          disabled={disabled}
        />
      ) : null}
    </>
  );

  const editorToolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">Jouw code</span>
      {settings.blockPaste ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-muted-foreground transition-colors",
            pasteBlockedAt && "bg-warning/15 text-warning-ink",
          )}
          key={pasteBlockedAt ?? 0}
        >
          <ClipboardX className="size-3.5" aria-hidden="true" />
          {pasteBlockedAt ? "Plakken is uitgeschakeld" : "Plakken uit"}
        </span>
      ) : null}
      <div className="ml-auto flex items-center gap-1.5">
        {settings.codeTips ? (
          <CodeTipsButton
            code={code}
            options={{
              starterCode: data.starterCode,
              functionNames: data.functionNames,
              hasIoTests: data.hasIoTests,
            }}
          />
        ) : null}
        {data.starterCode.trim() || code.trim() ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setResetOpen(true)}
            disabled={disabled || code === data.starterCode}
            className="text-muted-foreground"
          >
            <RotateCcw aria-hidden="true" />
            <span className="max-sm:sr-only">Startcode</span>
          </Button>
        ) : null}
      </div>
    </div>
  );

  const editor = (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onKeyDownCapture={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          runNow();
        }
      }}
    >
      <CodeEditor
        ref={editorRef}
        value={code}
        onChange={(next) => onChange({ code: next })}
        readOnly={disabled}
        blockPaste={settings.blockPaste}
        onPaste={onPaste}
        minHeight={wide ? "100%" : 260}
        maxHeight={wide ? undefined : "60vh"}
        aria-labelledby={props.headingId}
        escapeHint={settings.requireFullscreen ? "ctrl-m" : "escape"}
        className={cn(
          wide && "h-full min-h-0 flex-1 [&>div:first-child]:h-full",
        )}
      />
    </div>
  );

  const tools = hasTools ? (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as "run" | "test")}
      className="flex h-full min-h-0 flex-col gap-3"
    >
      <TabsList className="w-full shrink-0 [&_svg]:size-4">
        {settings.allowCodeRun ? (
          <TabsTrigger value="run" className="flex-1">
            <SquareTerminal aria-hidden="true" />
            Uitvoer
          </TabsTrigger>
        ) : null}
        {settings.allowSelfTest ? (
          <TabsTrigger value="test" className="flex-1">
            <FlaskConical aria-hidden="true" />
            Testen
            {data.tests.length ? (
              <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">
                {data.tests.length}
              </span>
            ) : null}
          </TabsTrigger>
        ) : null}
      </TabsList>
      {settings.allowCodeRun ? (
        <TabsContent
          value="run"
          forceMount
          hidden={tab !== "run"}
          className="min-h-0 flex-1"
        >
          <CodeRunTab
            code={code}
            timeLimitMs={data.timeLimitMs}
            disabled={disabled}
            onRun={() => onLog("code_run", { questionId: question.id })}
            onHandle={setRunHandle}
            onGoToLine={(line) => editorRef.current?.goToLine(line)}
          />
        </TabsContent>
      ) : null}
      {settings.allowSelfTest ? (
        <TabsContent
          value="test"
          forceMount
          hidden={tab !== "test"}
          className="min-h-0 flex-1"
        >
          <CodeTestTab
            code={code}
            tests={data.tests}
            checks={checks}
            timeLimitMs={data.timeLimitMs}
            disabled={disabled}
            onResult={(result) =>
              onLog("self_test", {
                questionId: question.id,
                passed: result.tests.filter((t) => t.passed).length,
                total: result.tests.length,
              })
            }
          />
        </TabsContent>
      ) : null}
    </Tabs>
  ) : (
    <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      Uitvoeren en testen zijn bij deze toets uitgeschakeld. Je code wordt na
      het inleveren nagekeken.
    </p>
  );

  const resetDialog = (
    <ConfirmDialog
      open={resetOpen}
      onOpenChange={setResetOpen}
      title="Terug naar de startcode?"
      description="Je huidige code wordt vervangen door de code waarmee de vraag begon."
      confirmLabel="Vervangen"
      destructive
      onConfirm={() => onChange({ code: data.starterCode })}
    />
  );

  if (!wide) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="flex flex-col gap-5 px-4 py-5 sm:px-6">
          {header}
          {prompt}
          <div className="flex flex-col gap-2">
            {editorToolbar}
            {editor}
          </div>
          <div className="min-h-72">{tools}</div>
        </div>
        {resetDialog}
      </div>
    );
  }

  return (
    <>
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId="pensuma-exam-code-h"
      >
        <ResizablePanel defaultSize={hasTools ? 58 : 100} minSize={35}>
          <ResizablePanelGroup
            direction="vertical"
            autoSaveId="pensuma-exam-code-v"
          >
            <ResizablePanel defaultSize={40} minSize={12}>
              <div className="h-full overflow-y-auto px-6 py-5">
                <div className="flex flex-col gap-4">
                  {header}
                  {prompt}
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={60} minSize={30}>
              <div className="flex h-full min-h-0 flex-col gap-2 px-4 pt-3 pb-4">
                {editorToolbar}
                {editor}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        {hasTools ? (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={42} minSize={25}>
              <div className="h-full min-h-0 bg-card/40 px-4 pt-4 pb-4">
                {tools}
              </div>
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
      {resetDialog}
    </>
  );
}
