"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  Clock,
  Dumbbell,
  FileCheck2,
  FileCode2,
  GraduationCap,
  Hand,
  KeyRound,
  Loader2,
  type LucideIcon,
  Play,
  RotateCcw,
  School,
  Settings2,
  UserRoundCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { FormErrorSummary } from "@/components/a11y/form-error-summary";
import { getErrorMessage } from "@/components/app/get-error-message";
import { PageHeader } from "@/components/app/page-header";
import { EmptyBlock, ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { describeScale } from "@/lib/grading/grade-scale";
import { SHOW_RESULTS_LABELS } from "@/lib/questions/schema";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import {
  type RovingRadioItemProps,
  useRovingRadioGroup,
} from "../a11y/roving-radio";
import {
  type AssignmentFormState,
  buildCreatePayload,
  type CodeMode,
  classesSummary,
  createdToast,
  effectiveStudentIds,
  initialFormState,
  type Preset,
  presetDefaults,
  presetMode,
  type StartMode,
  studentsSummary,
  validateAssignmentForm,
} from "./assignment-form-payload";
import { ClassMultiSelect } from "./class-multi-select";
import { normalizeAccessCode } from "./defaults";
import { Field, fieldDescribedBy } from "./field";
import {
  formatMinutes,
  formatMoment,
  fromDateTimeLocal,
  toDateTimeLocal,
} from "./format";
import { Notice } from "./notice";
import { AssignmentSettingsFields } from "./settings-fields";
import { StudentPicker } from "./student-picker";

const DURATIONS = [15, 30, 45, 50, 60, 90];
const START_MODES: StartMode[] = ["now", "scheduled", "manual"];
const CODE_MODES: CodeMode[] = ["generate", "none", "custom"];

const PRESET_INFO: Record<
  Preset,
  { title: string; icon: LucideIcon; description?: string; points: string[] }
> = {
  exam: {
    title: "Toets",
    icon: FileCheck2,
    points: [
      "Eén poging per leerling",
      "Toegangscode op het bord",
      "Resultaten pas na sluiten",
      "Vensterwissels worden geregistreerd",
    ],
  },
  practice: {
    title: "Oefenen",
    icon: Dumbbell,
    points: [
      "Meerdere pogingen (standaard 5)",
      "Geen toegangscode nodig",
      "Direct resultaat na inleveren",
      "Geen toezicht op vensterwissels",
    ],
  },
  selfstudy: {
    title: "Zelfstudie (altijd open)",
    icon: GraduationCap,
    description:
      "Leerlingen kunnen dit hele schooljaar oefenen, zo vaak als ze willen.",
    points: [
      "Nu open, zonder eindtijd",
      "Tot 100 pogingen, direct resultaat",
      "Hints en modeloplossing na de pogingen",
    ],
  },
};

const PRESETS = Object.keys(PRESET_INFO) as Preset[];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function AssignmentForm() {
  const trpc = useTRPC();
  const options = useQuery(trpc.assignment.formOptions.queryOptions());

  if (options.isPending) return <LoadingState />;
  if (options.isError)
    return (
      <ErrorState error={options.error} onRetry={() => options.refetch()} />
    );
  return <AssignmentFormInner options={options.data} />;
}

type Options = RouterOutputs["assignment"]["formOptions"];

function AssignmentFormInner({ options }: { options: Options }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const id = useId();
  const ids = {
    test: `${id}-test`,
    class: `${id}-class`,
    students: `${id}-students`,
    title: `${id}-title`,
    opensAt: `${id}-opens`,
    closesAt: `${id}-closes`,
    timeLimit: `${id}-limit`,
    code: `${id}-code`,
  };

  const [initial] = useState(() =>
    initialFormState(options, new URLSearchParams(searchParams.toString())),
  );
  const [state, setState] = useState<AssignmentFormState>(initial.state);
  const { unavailableTestId, unavailableClassId } = initial;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorFocusKey, setErrorFocusKey] = useState(0);
  const set = <K extends keyof AssignmentFormState>(
    key: K,
    value: AssignmentFormState[K],
  ) => setState((s) => ({ ...s, [key]: value }));

  const test = options.tests.find((t) => t.id === state.testId);
  const chosenClasses = options.classes.filter((c) =>
    state.classIds.includes(c.id),
  );
  const singleClass = chosenClasses.length === 1 ? chosenClasses[0] : null;
  const students = effectiveStudentIds(state);
  const mode = presetMode(state.preset);
  const retakeOf = state.retakeOfId;

  const create = useMutation(
    trpc.assignment.create.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.assignment.pathKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.pathKey(),
        });
        const count = created.items.length;
        toast.success(createdToast(count, created.effectiveStatus), {
          description:
            count > 1
              ? created.items.map((i) => i.className).join(", ")
              : created.accessCode
                ? `Toegangscode: ${created.accessCode}`
                : undefined,
        });
        router.push(
          count > 1
            ? routes.docent.assignments
            : routes.docent.assignment(created.id),
        );
      },
      onError: (err) => toast.error(getErrorMessage(err)),
    }),
  );

  const choosePreset = (next: Preset) => {
    const d = presetDefaults(next);
    setState((s) => ({
      ...s,
      preset: next,
      settings: d.settings,
      codeMode: d.codeMode,
      startMode: d.startMode ?? s.startMode,
      closesEnabled: d.closesEnabled ?? s.closesEnabled,
    }));
  };

  const chooseStart = (next: StartMode) => {
    if (next !== "scheduled") {
      set("startMode", next);
      return;
    }
    setState((s) => {
      if (s.opensAt) return { ...s, startMode: "scheduled" };
      const d = new Date(Date.now() + 60 * 60_000);
      d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
      return {
        ...s,
        startMode: "scheduled",
        opensAt: toDateTimeLocal(d),
      };
    });
  };

  // Card-style radio groups: arrow keys, Home/End and one Tab stop.
  const presetRadios = useRovingRadioGroup({
    count: PRESETS.length,
    checkedIndex: PRESETS.indexOf(state.preset),
    onSelect: (index) => choosePreset(PRESETS[index]),
  });
  const startRadios = useRovingRadioGroup({
    count: START_MODES.length,
    checkedIndex: START_MODES.indexOf(state.startMode),
    onSelect: (index) => chooseStart(START_MODES[index]),
  });
  const codeRadios = useRovingRadioGroup({
    count: CODE_MODES.length,
    checkedIndex: CODE_MODES.indexOf(state.codeMode),
    onSelect: (index) => set("codeMode", CODE_MODES[index]),
  });

  const limitMinutes = state.timeLimit.trim()
    ? Number.parseInt(state.timeLimit, 10)
    : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = validateAssignmentForm(state);
    setErrors(next);
    if (Object.keys(next).length) {
      setErrorFocusKey((k) => k + 1);
      return;
    }
    create.mutate(buildCreatePayload(state));
  }

  if (options.tests.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Afname plannen"
          backHref={routes.docent.assignments}
          backLabel="Afnames"
        />
        <EmptyBlock
          icon={FileCode2}
          title="Je hebt nog geen gepubliceerde toets"
          description="Alleen gepubliceerde toetsen kun je inplannen. Maak een toets en publiceer hem eerst."
          action={
            <Button asChild>
              <Link href={routes.docent.tests}>Naar toetsen</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const count = Math.max(1, chosenClasses.length);
  const submitLabel =
    count > 1
      ? `${count} afnames ${state.startMode === "now" ? "openen" : "plannen"}`
      : state.startMode === "now"
        ? "Afname openen"
        : "Afname plannen";
  const errorItems = (
    [
      "test",
      "class",
      "students",
      "opensAt",
      "closesAt",
      "timeLimit",
      "code",
    ] as const
  )
    .filter((k) => errors[k])
    .map((k) => ({ fieldId: ids[k], message: errors[k] }));

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <PageHeader
        title={retakeOf ? "Herkansing plannen" : "Afname plannen"}
        description="Kies een toets en een of meer klassen, en bepaal wanneer en hoe de leerlingen hem maken."
        backHref={routes.docent.assignments}
        backLabel="Afnames"
      />

      <FormErrorSummary errors={errorItems} focusKey={errorFocusKey} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section step={1} title="Toets en klassen" icon={School}>
            <div className="flex flex-col gap-5">
              {unavailableTestId ? (
                <Notice
                  tone="warning"
                  title="De toets van deze link kun je nu niet inplannen"
                >
                  <p id={`${ids.test}-unavailable`}>
                    Hij is gearchiveerd, staat op concept of bestaat niet meer.
                    Alleen gepubliceerde toetsen kun je inplannen. Publiceer de
                    toets opnieuw en laad deze pagina daarna opnieuw, of kies
                    hieronder bewust een andere toets.
                  </p>
                  {UUID_RE.test(unavailableTestId) ? (
                    <Link
                      href={routes.docent.test(unavailableTestId)}
                      className="mt-1 inline-block font-medium underline underline-offset-4"
                    >
                      Toets openen
                    </Link>
                  ) : null}
                </Notice>
              ) : null}
              <Field
                label="Toets"
                htmlFor={ids.test}
                error={errors.test}
                hint="Alleen gepubliceerde toetsen."
              >
                <NativeSelect
                  id={ids.test}
                  value={state.testId}
                  onChange={(e) => set("testId", e.target.value)}
                  aria-invalid={!!errors.test}
                  aria-describedby={fieldDescribedBy(ids.test, {
                    hint: true,
                    error: !!errors.test,
                    extra: [unavailableTestId && `${ids.test}-unavailable`],
                  })}
                >
                  <option value="" disabled>
                    Kies een toets…
                  </option>
                  {options.tests.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.questionCount} vragen)
                    </option>
                  ))}
                </NativeSelect>
              </Field>

              {unavailableClassId ? (
                <Notice tone="warning">
                  De klas van deze link is gearchiveerd of bestaat niet meer.
                  Kies hieronder een klas.
                </Notice>
              ) : null}
              <ClassMultiSelect
                fieldsetId={ids.class}
                classes={options.classes}
                value={state.classIds}
                onChange={(classIds) =>
                  setState((s) => ({
                    ...s,
                    classIds,
                    // A student selection belongs to one class.
                    studentIds:
                      classIds.length === 1 && classIds[0] === s.classIds[0]
                        ? s.studentIds
                        : s.studentIds
                          ? []
                          : null,
                  }))
                }
                description="Je kunt meerdere klassen kiezen: elke klas krijgt een eigen afname met dezelfde instellingen."
                error={errors.class}
              />

              {singleClass ? (
                <div className="flex flex-col gap-3 rounded-lg border bg-background/50 p-3">
                  <label
                    htmlFor={`${id}-targeted`}
                    className="flex cursor-pointer items-start gap-3"
                  >
                    <UserRoundCheck
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="flex flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        Alleen voor een paar leerlingen (inhaaltoets of
                        herkansing)
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Alleen de gekozen leerlingen zien deze afname.
                      </span>
                    </span>
                    <Switch
                      id={`${id}-targeted`}
                      checked={state.studentIds !== null}
                      onCheckedChange={(on) =>
                        set("studentIds", on ? (state.studentIds ?? []) : null)
                      }
                    />
                  </label>
                  {state.studentIds !== null ? (
                    <StudentPicker
                      fieldsetId={ids.students}
                      classId={singleClass.id}
                      value={state.studentIds}
                      onChange={(v) => set("studentIds", v)}
                      error={errors.students}
                    />
                  ) : null}
                </div>
              ) : null}

              <Field
                label="Titel (optioneel)"
                htmlFor={ids.title}
                hint="Bijvoorbeeld ‘Toets H3 – herkansing’. Laat leeg om de naam van de toets te gebruiken."
              >
                <Input
                  id={ids.title}
                  value={state.title}
                  maxLength={150}
                  placeholder={test?.title ?? "Naam van de toets"}
                  onChange={(e) => set("title", e.target.value)}
                  aria-describedby={fieldDescribedBy(ids.title, { hint: true })}
                />
              </Field>
            </div>
          </Section>

          <Section step={2} title="Modus" icon={FileCheck2}>
            <div
              role="radiogroup"
              aria-label="Modus"
              className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3"
            >
              {PRESETS.map((p, index) => {
                const info = PRESET_INFO[p];
                const Icon = info.icon;
                const active = state.preset === p;
                return (
                  // biome-ignore lint/a11y/useSemanticElements: card-style radio (arrow keys and one Tab stop via useRovingRadioGroup)
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => choosePreset(p)}
                    {...presetRadios.itemProps(index)}
                    className={cn(
                      "relative flex flex-col gap-3 rounded-xl border bg-background p-4 text-left transition-all outline-none hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring",
                      p === "selfstudy" && "md:col-span-2 2xl:col-span-1",
                      active &&
                        "border-primary bg-primary/[0.04] ring-1 ring-primary",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          "grid size-10 shrink-0 place-items-center rounded-lg",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <span className="text-base leading-tight font-semibold">
                        {info.title}
                      </span>
                      {active ? (
                        <Check
                          className="ml-auto size-5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                      ) : null}
                    </span>
                    {info.description ? (
                      <span className="text-sm text-foreground/90">
                        {info.description}
                      </span>
                    ) : null}
                    <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                      {info.points.map((pt) => (
                        <li key={pt} className="flex items-start gap-2">
                          <span
                            className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60"
                            aria-hidden="true"
                          />
                          {pt}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              De modus zet handige standaardinstellingen. Je kunt alles
              hieronder nog aanpassen.
            </p>
          </Section>

          <Section step={3} title="Wanneer" icon={CalendarClock}>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium" id={`${id}-start`}>
                  Start
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby={`${id}-start`}
                  className="grid gap-2 sm:grid-cols-3"
                >
                  <ChoiceButton
                    active={state.startMode === "now"}
                    onClick={() => chooseStart("now")}
                    radio={startRadios.itemProps(0)}
                    icon={Play}
                    title="Nu openen"
                    description="Leerlingen kunnen meteen beginnen."
                  />
                  <ChoiceButton
                    active={state.startMode === "scheduled"}
                    onClick={() => chooseStart("scheduled")}
                    radio={startRadios.itemProps(1)}
                    icon={CalendarClock}
                    title="Op een tijdstip"
                    description="Gaat vanzelf open."
                  />
                  <ChoiceButton
                    active={state.startMode === "manual"}
                    onClick={() => chooseStart("manual")}
                    radio={startRadios.itemProps(2)}
                    icon={Hand}
                    title="Zelf openen"
                    description="Jij klikt straks op ‘Openen’."
                  />
                </div>
                {state.startMode === "scheduled" ? (
                  <Field
                    label="Opent op"
                    htmlFor={ids.opensAt}
                    error={errors.opensAt}
                    className="sm:max-w-xs"
                  >
                    <Input
                      id={ids.opensAt}
                      type="datetime-local"
                      value={state.opensAt}
                      onChange={(e) => set("opensAt", e.target.value)}
                      aria-invalid={!!errors.opensAt}
                      aria-describedby={fieldDescribedBy(ids.opensAt, {
                        error: !!errors.opensAt,
                      })}
                    />
                  </Field>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={state.closesEnabled}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setState((s) => {
                        if (!on || s.closesAt)
                          return { ...s, closesEnabled: on };
                        const base =
                          s.startMode === "scheduled" &&
                          fromDateTimeLocal(s.opensAt)
                            ? (fromDateTimeLocal(s.opensAt) as Date)
                            : new Date();
                        const d = new Date(
                          base.getTime() + (limitMinutes ?? 50) * 60_000,
                        );
                        d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
                        return {
                          ...s,
                          closesEnabled: true,
                          closesAt: toDateTimeLocal(d),
                        };
                      });
                    }}
                  />
                  Automatisch sluiten op een tijdstip
                </label>
                {state.closesEnabled ? (
                  <Field
                    label="Sluit op"
                    htmlFor={ids.closesAt}
                    error={errors.closesAt}
                    hint="Leerlingen die dan nog bezig zijn, leveren automatisch in. Wie verlengde tijd heeft, werkt door tot de eigen eindtijd."
                    className="sm:max-w-md"
                  >
                    <Input
                      id={ids.closesAt}
                      type="datetime-local"
                      value={state.closesAt}
                      onChange={(e) => set("closesAt", e.target.value)}
                      aria-invalid={!!errors.closesAt}
                      aria-describedby={fieldDescribedBy(ids.closesAt, {
                        hint: true,
                        error: !!errors.closesAt,
                      })}
                    />
                  </Field>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Zonder eindtijd blijft de afname open tot je hem zelf sluit.
                  </p>
                )}
              </div>

              <Field
                label="Tijdslimiet per leerling (minuten, optioneel)"
                htmlFor={ids.timeLimit}
                error={errors.timeLimit}
                hint="De tijd loopt vanaf het moment dat de leerling begint. Leeg = geen limiet. Verlengde tijd komt er automatisch bij."
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="sm:w-36 sm:shrink-0">
                    <Input
                      id={ids.timeLimit}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={1440}
                      placeholder="Geen limiet"
                      value={state.timeLimit}
                      onChange={(e) => set("timeLimit", e.target.value)}
                      aria-invalid={!!errors.timeLimit}
                      aria-describedby={fieldDescribedBy(ids.timeLimit, {
                        hint: true,
                        error: !!errors.timeLimit,
                      })}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {DURATIONS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={limitMinutes === m}
                        onClick={() => set("timeLimit", String(m))}
                        className={cn(
                          "h-7 rounded-full border px-2.5 text-xs font-medium tabular-nums transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring",
                          limitMinutes === m &&
                            "border-primary bg-primary/10 text-primary",
                        )}
                      >
                        {m} min
                      </button>
                    ))}
                  </div>
                </div>
              </Field>
            </div>
          </Section>

          <Section step={4} title="Toegangscode" icon={KeyRound}>
            <div
              role="radiogroup"
              aria-label="Toegangscode"
              className="grid gap-2 sm:grid-cols-3"
            >
              <ChoiceButton
                active={state.codeMode === "generate"}
                onClick={() => set("codeMode", "generate")}
                radio={codeRadios.itemProps(0)}
                title="Code maken"
                description="Een willekeurige code van 6 tekens."
              />
              <ChoiceButton
                active={state.codeMode === "none"}
                onClick={() => set("codeMode", "none")}
                radio={codeRadios.itemProps(1)}
                title="Geen code"
                description="Iedereen in de klas kan starten."
              />
              <ChoiceButton
                active={state.codeMode === "custom"}
                onClick={() => set("codeMode", "custom")}
                radio={codeRadios.itemProps(2)}
                title="Zelf kiezen"
                description="Bijvoorbeeld een woord."
              />
            </div>
            {state.codeMode === "custom" ? (
              <Field
                label="Jouw code"
                htmlFor={ids.code}
                error={errors.code}
                className="sm:max-w-xs"
              >
                <Input
                  id={ids.code}
                  value={state.customCode}
                  maxLength={20}
                  autoCapitalize="characters"
                  placeholder="BIJV. PYTHON"
                  className="font-mono tracking-widest uppercase"
                  onChange={(e) => set("customCode", e.target.value)}
                  aria-invalid={!!errors.code}
                  aria-describedby={fieldDescribedBy(ids.code, {
                    error: !!errors.code,
                  })}
                />
              </Field>
            ) : null}
            {chosenClasses.length > 1 && state.codeMode === "generate" ? (
              <label
                htmlFor={`${id}-per-class`}
                className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background/50 p-3"
              >
                <KeyRound
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    Elke klas een eigen toegangscode
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Handig als de klassen niet tegelijk de toets maken.
                  </span>
                </span>
                <Switch
                  id={`${id}-per-class`}
                  checked={state.accessCodePerClass}
                  onCheckedChange={(on) => set("accessCodePerClass", on)}
                />
              </label>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Leerlingen typen de code als ze beginnen. Zo start niemand voordat
              jij de code op het bord laat zien.
            </p>
          </Section>

          <Section step={5} title="Instellingen" icon={Settings2}>
            <AssignmentSettingsFields
              value={state.settings}
              onChange={(settings) => set("settings", settings)}
              mode={mode}
            />
          </Section>
        </div>

        <aside
          aria-labelledby={`${id}-summary`}
          className="flex flex-col gap-4 lg:sticky lg:top-20"
        >
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs">
            <h2 id={`${id}-summary`} className="font-semibold">
              Samenvatting
            </h2>
            <dl className="flex flex-col gap-3 text-sm">
              <SummaryRow icon={FileCode2} label="Toets">
                {test ? (
                  <>
                    {test.title}
                    <span className="block text-xs text-muted-foreground">
                      {test.questionCount} vragen ·{" "}
                      {test.totalPoints.toLocaleString("nl-NL")} punten
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Nog niet gekozen
                  </span>
                )}
              </SummaryRow>
              <SummaryRow
                icon={Users}
                label={chosenClasses.length > 1 ? "Klassen" : "Klas"}
              >
                {chosenClasses.length ? (
                  classesSummary(chosenClasses)
                ) : (
                  <span className="text-muted-foreground">
                    Nog niet gekozen
                  </span>
                )}
              </SummaryRow>
              {students && singleClass ? (
                <SummaryRow icon={UserRoundCheck} label="Leerlingen">
                  {studentsSummary(students.length, singleClass.studentCount)}
                </SummaryRow>
              ) : null}
              {retakeOf ? (
                <SummaryRow icon={RotateCcw} label="Soort">
                  Herkansing
                </SummaryRow>
              ) : null}
              <SummaryRow icon={PRESET_INFO[state.preset].icon} label="Modus">
                {PRESET_INFO[state.preset].title}
              </SummaryRow>
              <SummaryRow icon={CalendarClock} label="Tijdvak">
                {state.startMode === "now"
                  ? "Opent direct"
                  : state.startMode === "manual"
                    ? "Jij opent hem zelf"
                    : state.opensAt
                      ? `Opent ${formatMoment(fromDateTimeLocal(state.opensAt))}`
                      : "Kies een starttijd"}
                <span className="block text-xs text-muted-foreground">
                  {state.closesEnabled && fromDateTimeLocal(state.closesAt)
                    ? `Sluit ${formatMoment(fromDateTimeLocal(state.closesAt))}`
                    : "Sluit wanneer jij dat doet"}
                </span>
              </SummaryRow>
              <SummaryRow icon={Clock} label="Tijdslimiet">
                {formatMinutes(
                  limitMinutes && limitMinutes > 0 ? limitMinutes : null,
                )}
              </SummaryRow>
              <SummaryRow icon={KeyRound} label="Toegangscode">
                {state.codeMode === "generate"
                  ? chosenClasses.length > 1 && state.accessCodePerClass
                    ? "Per klas een eigen code"
                    : "Wordt gemaakt"
                  : state.codeMode === "none"
                    ? "Geen"
                    : state.customCode
                      ? normalizeAccessCode(state.customCode)
                      : "Zelf kiezen"}
              </SummaryRow>
              <SummaryRow icon={Settings2} label="Resultaten">
                {SHOW_RESULTS_LABELS[state.settings.showResults]}
                <span className="block text-xs text-muted-foreground">
                  {describeScale(state.settings.grading)}
                </span>
              </SummaryRow>
            </dl>
            <Button
              type="submit"
              size="lg"
              disabled={create.isPending}
              className="w-full"
            >
              {create.isPending ? (
                <Loader2
                  className="motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : state.startMode === "now" ? (
                <Play aria-hidden="true" />
              ) : (
                <CalendarPlus aria-hidden="true" />
              )}
              {submitLabel}
            </Button>
          </div>
        </aside>
      </div>
    </form>
  );
}

function Section({
  step,
  title,
  icon: Icon,
  children,
}: {
  step: number;
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs sm:p-6">
      <h2 className="flex items-center gap-3 font-semibold">
        <span
          className="grid size-7 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary tabular-nums"
          aria-hidden="true"
        >
          {step}
        </span>
        <span className="sr-only">Stap {step}: </span>
        {title}
        <Icon
          className="ml-auto size-4 text-muted-foreground"
          aria-hidden="true"
        />
      </h2>
      {children}
    </section>
  );
}

function ChoiceButton({
  active,
  onClick,
  radio,
  icon: Icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  /** Roving tabindex and arrow keys of the group (useRovingRadioGroup). */
  radio: RovingRadioItemProps;
  icon?: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: card-style radio (arrow keys and one Tab stop via useRovingRadioGroup)
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      {...radio}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border bg-background p-3 text-left transition-all outline-none hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring",
        active && "border-primary bg-primary/[0.04] ring-1 ring-primary",
      )}
    >
      {Icon ? (
        <Icon
          className={cn(
            "mt-0.5 size-4 shrink-0",
            active ? "text-primary" : "text-muted-foreground",
          )}
          aria-hidden="true"
        />
      ) : (
        <span
          className={cn(
            "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
            active ? "border-primary bg-primary" : "border-muted-foreground/40",
          )}
          aria-hidden="true"
        >
          {active ? (
            <span className="size-1.5 rounded-full bg-primary-foreground" />
          ) : null}
        </span>
      )}
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  // dt and dd sit directly in the wrapping div (valid dl structure); the
  // icon is part of the term.
  return (
    <div className="relative flex min-w-0 flex-col pl-7">
      <dt className="text-xs text-muted-foreground">
        <Icon
          className="absolute top-0.5 left-0 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        {label}
      </dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}
