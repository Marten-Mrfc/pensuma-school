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
  Hand,
  KeyRound,
  Loader2,
  type LucideIcon,
  Play,
  School,
  Settings2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/components/app/get-error-message";
import { PageHeader } from "@/components/app/page-header";
import { EmptyBlock, ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { type AssignmentSettings, SHOW_RESULTS_LABELS } from "@/lib/questions/schema";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import {
  ACCESS_CODE_REGEX,
  type AssignmentMode,
  defaultSettingsForMode,
  normalizeAccessCode,
} from "./defaults";
import { formatMinutes, formatMoment, fromDateTimeLocal, toDateTimeLocal } from "./format";
import { AssignmentSettingsFields } from "./settings-fields";

type StartMode = "now" | "scheduled" | "manual";
type CodeMode = "generate" | "none" | "custom";

const DURATIONS = [15, 30, 45, 50, 60, 90];

const MODE_INFO: Record<AssignmentMode, { title: string; icon: LucideIcon; points: string[] }> = {
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
};

export function AssignmentForm() {
  const trpc = useTRPC();
  const options = useQuery(trpc.assignment.formOptions.queryOptions());

  if (options.isPending) return <LoadingState />;
  if (options.isError) return <ErrorState error={options.error} onRetry={() => options.refetch()} />;
  return <AssignmentFormInner options={options.data} />;
}

type Options = RouterOutputs["assignment"]["formOptions"];

function AssignmentFormInner({ options }: { options: Options }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const id = useId();

  const preTest = searchParams.get("toets");
  const preClass = searchParams.get("klas");
  const [testId, setTestId] = useState(
    options.tests.some((t) => t.id === preTest) ? (preTest as string) : options.tests.length === 1 ? options.tests[0].id : "",
  );
  const [classId, setClassId] = useState(
    options.classes.some((c) => c.id === preClass)
      ? (preClass as string)
      : options.classes.length === 1
        ? options.classes[0].id
        : "",
  );
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<AssignmentMode>("exam");
  const [settings, setSettings] = useState<AssignmentSettings>(() => defaultSettingsForMode("exam"));
  const [startMode, setStartMode] = useState<StartMode>("now");
  const [opensAt, setOpensAt] = useState("");
  const [closesEnabled, setClosesEnabled] = useState(false);
  const [closesAt, setClosesAt] = useState("");
  const [timeLimit, setTimeLimit] = useState("");
  const [codeMode, setCodeMode] = useState<CodeMode>("generate");
  const [customCode, setCustomCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const test = options.tests.find((t) => t.id === testId);
  const klas = options.classes.find((c) => c.id === classId);

  const create = useMutation(
    trpc.assignment.create.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries({ queryKey: trpc.assignment.pathKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.dashboard.pathKey() });
        toast.success(created.effectiveStatus === "open" ? "De afname is open" : "De afname is gepland", {
          description: created.accessCode ? `Toegangscode: ${created.accessCode}` : undefined,
        });
        router.push(routes.docent.assignment(created.id));
      },
      onError: (err) => toast.error(getErrorMessage(err)),
    }),
  );

  const chooseMode = (next: AssignmentMode) => {
    setMode(next);
    setSettings(defaultSettingsForMode(next));
    setCodeMode(next === "exam" ? "generate" : "none");
  };

  const limitMinutes = timeLimit.trim() ? Number.parseInt(timeLimit, 10) : null;

  function validate() {
    const next: Record<string, string> = {};
    const now = new Date();
    if (!testId) next.test = "Kies een toets.";
    if (!classId) next.class = "Kies een klas.";
    const open = startMode === "scheduled" ? fromDateTimeLocal(opensAt) : null;
    if (startMode === "scheduled") {
      if (!open) next.opensAt = "Kies een starttijd.";
      else if (open <= now) next.opensAt = "De starttijd ligt in het verleden. Kies ‘Nu openen’ of een later moment.";
    }
    if (closesEnabled) {
      const close = fromDateTimeLocal(closesAt);
      if (!close) next.closesAt = "Kies een eindtijd of zet automatisch sluiten uit.";
      else if (close <= now) next.closesAt = "De eindtijd ligt in het verleden.";
      else if (open && close <= open) next.closesAt = "Het einde moet na de start liggen.";
    }
    if (timeLimit.trim() && (!limitMinutes || limitMinutes < 1 || limitMinutes > 1440)) {
      next.timeLimit = "Vul een aantal minuten in tussen 1 en 1440.";
    }
    if (codeMode === "custom" && !ACCESS_CODE_REGEX.test(normalizeAccessCode(customCode))) {
      next.code = "Gebruik 3 tot 20 letters, cijfers of streepjes.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) {
      toast.error("Controleer de gemarkeerde velden.");
      return;
    }
    create.mutate({
      testId,
      classId,
      title: title.trim() || null,
      mode,
      openNow: startMode === "now",
      opensAt: startMode === "scheduled" ? fromDateTimeLocal(opensAt) : null,
      closesAt: closesEnabled ? fromDateTimeLocal(closesAt) : null,
      timeLimitMinutes: limitMinutes,
      accessCode: codeMode === "custom" ? normalizeAccessCode(customCode) : codeMode === "none" ? null : undefined,
      generateAccessCode: codeMode === "generate",
      settings,
    });
  }

  if (options.tests.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Afname plannen" backHref={routes.docent.assignments} backLabel="Afnames" />
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

  const submitLabel = startMode === "now" ? "Afname openen" : "Afname plannen";

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <PageHeader
        title="Afname plannen"
        description="Kies een toets en een klas, en bepaal wanneer en hoe de leerlingen hem maken."
        backHref={routes.docent.assignments}
        backLabel="Afnames"
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section step={1} title="Toets en klas" icon={School}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Toets" htmlFor={`${id}-test`} error={errors.test} hint="Alleen gepubliceerde toetsen.">
                <NativeSelect
                  id={`${id}-test`}
                  value={testId}
                  onChange={(e) => setTestId(e.target.value)}
                  aria-invalid={!!errors.test}
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
              <Field label="Klas" htmlFor={`${id}-class`} error={errors.class}>
                <NativeSelect
                  id={`${id}-class`}
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  aria-invalid={!!errors.class}
                >
                  <option value="" disabled>
                    Kies een klas…
                  </option>
                  {options.classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.studentCount} leerlingen)
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                label="Titel (optioneel)"
                htmlFor={`${id}-title`}
                hint="Bijvoorbeeld ‘Toets H3 – herkansing’. Laat leeg om de naam van de toets te gebruiken."
                className="md:col-span-2"
              >
                <Input
                  id={`${id}-title`}
                  value={title}
                  maxLength={150}
                  placeholder={test?.title ?? "Naam van de toets"}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section step={2} title="Modus" icon={FileCheck2}>
            <div role="radiogroup" aria-label="Modus" className="grid gap-3 md:grid-cols-2">
              {(Object.keys(MODE_INFO) as AssignmentMode[]).map((m) => {
                const info = MODE_INFO[m];
                const Icon = info.icon;
                const active = mode === m;
                return (
                  // biome-ignore lint/a11y/useSemanticElements: card-style radio
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => chooseMode(m)}
                    className={cn(
                      "relative flex flex-col gap-3 rounded-xl border bg-background p-4 text-left transition-all outline-none hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      active && "border-primary bg-primary/[0.04] ring-1 ring-primary",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          "grid size-10 place-items-center rounded-lg",
                          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <span className="text-base font-semibold">{info.title}</span>
                      {active ? <Check className="ml-auto size-5 text-primary" aria-hidden="true" /> : null}
                    </span>
                    <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                      {info.points.map((p) => (
                        <li key={p} className="flex items-start gap-2">
                          <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              De modus zet handige standaardinstellingen. Je kunt alles hieronder nog aanpassen.
            </p>
          </Section>

          <Section step={3} title="Wanneer" icon={CalendarClock}>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Start</span>
                <div role="radiogroup" aria-label="Start" className="grid gap-2 sm:grid-cols-3">
                  <ChoiceButton
                    active={startMode === "now"}
                    onClick={() => setStartMode("now")}
                    icon={Play}
                    title="Nu openen"
                    description="Leerlingen kunnen meteen beginnen."
                  />
                  <ChoiceButton
                    active={startMode === "scheduled"}
                    onClick={() => {
                      setStartMode("scheduled");
                      if (!opensAt) {
                        const d = new Date(Date.now() + 60 * 60_000);
                        d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
                        setOpensAt(toDateTimeLocal(d));
                      }
                    }}
                    icon={CalendarClock}
                    title="Op een tijdstip"
                    description="Gaat vanzelf open."
                  />
                  <ChoiceButton
                    active={startMode === "manual"}
                    onClick={() => setStartMode("manual")}
                    icon={Hand}
                    title="Zelf openen"
                    description="Jij klikt straks op ‘Openen’."
                  />
                </div>
                {startMode === "scheduled" ? (
                  <Field label="Opent op" htmlFor={`${id}-opens`} error={errors.opensAt} className="sm:max-w-xs">
                    <Input
                      id={`${id}-opens`}
                      type="datetime-local"
                      value={opensAt}
                      onChange={(e) => setOpensAt(e.target.value)}
                      aria-invalid={!!errors.opensAt}
                    />
                  </Field>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={closesEnabled}
                    onChange={(e) => {
                      setClosesEnabled(e.target.checked);
                      if (e.target.checked && !closesAt) {
                        const base =
                          startMode === "scheduled" && fromDateTimeLocal(opensAt)
                            ? (fromDateTimeLocal(opensAt) as Date)
                            : new Date();
                        const d = new Date(base.getTime() + (limitMinutes ?? 50) * 60_000);
                        d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
                        setClosesAt(toDateTimeLocal(d));
                      }
                    }}
                  />
                  Automatisch sluiten op een tijdstip
                </label>
                {closesEnabled ? (
                  <Field
                    label="Sluit op"
                    htmlFor={`${id}-closes`}
                    error={errors.closesAt}
                    hint="Leerlingen die dan nog bezig zijn, leveren automatisch in."
                    className="sm:max-w-xs"
                  >
                    <Input
                      id={`${id}-closes`}
                      type="datetime-local"
                      value={closesAt}
                      onChange={(e) => setClosesAt(e.target.value)}
                      aria-invalid={!!errors.closesAt}
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
                htmlFor={`${id}-limit`}
                error={errors.timeLimit}
                hint="De tijd loopt vanaf het moment dat de leerling begint. Leeg = geen limiet."
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="sm:w-36 sm:shrink-0">
                    <Input
                      id={`${id}-limit`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={1440}
                      placeholder="Geen limiet"
                      value={timeLimit}
                      onChange={(e) => setTimeLimit(e.target.value)}
                      aria-invalid={!!errors.timeLimit}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {DURATIONS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setTimeLimit(String(m))}
                        className={cn(
                          "h-7 rounded-full border px-2.5 text-xs font-medium tabular-nums transition-colors hover:bg-accent",
                          limitMinutes === m && "border-primary bg-primary/10 text-primary",
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
            <div role="radiogroup" aria-label="Toegangscode" className="grid gap-2 sm:grid-cols-3">
              <ChoiceButton
                active={codeMode === "generate"}
                onClick={() => setCodeMode("generate")}
                title="Code maken"
                description="Een willekeurige code van 6 tekens."
              />
              <ChoiceButton
                active={codeMode === "none"}
                onClick={() => setCodeMode("none")}
                title="Geen code"
                description="Iedereen in de klas kan starten."
              />
              <ChoiceButton
                active={codeMode === "custom"}
                onClick={() => setCodeMode("custom")}
                title="Zelf kiezen"
                description="Bijvoorbeeld een woord."
              />
            </div>
            {codeMode === "custom" ? (
              <Field label="Jouw code" htmlFor={`${id}-code`} error={errors.code} className="sm:max-w-xs">
                <Input
                  id={`${id}-code`}
                  value={customCode}
                  maxLength={20}
                  autoCapitalize="characters"
                  placeholder="BIJV. PYTHON"
                  className="font-mono tracking-widest uppercase"
                  onChange={(e) => setCustomCode(e.target.value)}
                  aria-invalid={!!errors.code}
                />
              </Field>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Leerlingen typen de code als ze beginnen. Zo start niemand voordat jij de code op het bord laat zien.
            </p>
          </Section>

          <Section step={5} title="Instellingen" icon={Settings2}>
            <AssignmentSettingsFields value={settings} onChange={setSettings} />
          </Section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs">
            <h2 className="font-semibold">Samenvatting</h2>
            <dl className="flex flex-col gap-3 text-sm">
              <SummaryRow icon={FileCode2} label="Toets">
                {test ? (
                  <>
                    {test.title}
                    <span className="block text-xs text-muted-foreground">
                      {test.questionCount} vragen · {test.totalPoints.toLocaleString("nl-NL")} punten
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Nog niet gekozen</span>
                )}
              </SummaryRow>
              <SummaryRow icon={Users} label="Klas">
                {klas ? (
                  `${klas.name} · ${klas.studentCount} leerlingen`
                ) : (
                  <span className="text-muted-foreground">Nog niet gekozen</span>
                )}
              </SummaryRow>
              <SummaryRow icon={mode === "exam" ? FileCheck2 : Dumbbell} label="Modus">
                {MODE_INFO[mode].title}
              </SummaryRow>
              <SummaryRow icon={CalendarClock} label="Tijdvak">
                {startMode === "now"
                  ? "Opent direct"
                  : startMode === "manual"
                    ? "Jij opent hem zelf"
                    : opensAt
                      ? `Opent ${formatMoment(fromDateTimeLocal(opensAt))}`
                      : "Kies een starttijd"}
                <span className="block text-xs text-muted-foreground">
                  {closesEnabled && fromDateTimeLocal(closesAt)
                    ? `Sluit ${formatMoment(fromDateTimeLocal(closesAt))}`
                    : "Sluit wanneer jij dat doet"}
                </span>
              </SummaryRow>
              <SummaryRow icon={Clock} label="Tijdslimiet">
                {formatMinutes(limitMinutes && limitMinutes > 0 ? limitMinutes : null)}
              </SummaryRow>
              <SummaryRow icon={KeyRound} label="Toegangscode">
                {codeMode === "generate"
                  ? "Wordt gemaakt"
                  : codeMode === "none"
                    ? "Geen"
                    : customCode
                      ? normalizeAccessCode(customCode)
                      : "Zelf kiezen"}
              </SummaryRow>
              <SummaryRow icon={Settings2} label="Resultaten">
                {SHOW_RESULTS_LABELS[settings.showResults]}
              </SummaryRow>
            </dl>
            <Button type="submit" size="lg" disabled={create.isPending} className="w-full">
              {create.isPending ? (
                <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
              ) : startMode === "now" ? (
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
        <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary tabular-nums">
          {step}
        </span>
        {title}
        <Icon className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function ChoiceButton({
  active,
  onClick,
  icon: Icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: card-style radio
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border bg-background p-3 text-left transition-all outline-none hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active && "border-primary bg-primary/[0.04] ring-1 ring-primary",
      )}
    >
      {Icon ? (
        <Icon className={cn("mt-0.5 size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
      ) : (
        <span
          className={cn(
            "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
            active ? "border-primary bg-primary" : "border-muted-foreground/40",
          )}
        >
          {active ? <span className="size-1.5 rounded-full bg-primary-foreground" /> : null}
        </span>
      )}
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

function SummaryRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex min-w-0 flex-col">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium break-words">{children}</dd>
      </div>
    </div>
  );
}
