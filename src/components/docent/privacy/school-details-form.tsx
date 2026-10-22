"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { FormErrorSummary } from "@/components/a11y/form-error-summary";
import { FormFieldset } from "@/components/a11y/form-fieldset";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { FormField } from "@/components/app/form-field";
import { getErrorMessage } from "@/components/app/get-error-message";
import { ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { privacySettingsSchema } from "@/lib/privacy/settings";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { formatDateTime } from "../students/format";
import { PanelCard } from "./notice";

type Data = RouterOutputs["privacy"]["getSettings"];

type Values = {
  schoolName: string;
  authority: string;
  privacyEmail: string;
  policyUrl: string;
  dpoName: string;
  dpoEmail: string;
  processorName: string;
  processorEmail: string;
  hostingLocation: string;
  backupDays: string;
  accessibilityEmail: string;
  statementDate: string;
};

type Field = {
  key: keyof Values;
  label: string;
  type?: "email" | "url" | "number" | "date";
  description?: string;
  autoComplete?: string;
};

const GROUPS: { legend: string; description?: string; fields: Field[] }[] = [
  {
    legend: "School",
    description:
      "De school is verwerkingsverantwoordelijke. Deze gegevens staan op de privacyverklaring.",
    fields: [
      {
        key: "schoolName",
        label: "Naam van de school",
        autoComplete: "organization",
      },
      {
        key: "authority",
        label: "Bevoegd gezag (stichting of vereniging)",
      },
      {
        key: "privacyEmail",
        label: "E-mailadres voor privacyvragen",
        type: "email",
      },
      {
        key: "policyUrl",
        label: "Link naar het privacyreglement",
        type: "url",
        description: "Begint met https://",
      },
    ],
  },
  {
    legend: "Functionaris gegevensbescherming (FG)",
    fields: [
      { key: "dpoName", label: "Naam van de FG" },
      { key: "dpoEmail", label: "E-mailadres van de FG", type: "email" },
    ],
  },
  {
    legend: "Beheerder van Pensuma (verwerker)",
    description:
      "Wie de server beheert: de ICT-afdeling van de school of een externe partij. Bij een externe partij hoort een verwerkersovereenkomst.",
    fields: [
      { key: "processorName", label: "Naam van de beheerder" },
      {
        key: "processorEmail",
        label: "E-mailadres van de beheerder",
        type: "email",
      },
      {
        key: "hostingLocation",
        label: "Locatie van de servers",
        description: "Bijvoorbeeld: Nederland (EU).",
      },
      {
        key: "backupDays",
        label: "Back-ups worden bewaard (dagen)",
        type: "number",
        description:
          "Verwijderde gegevens bestaan zo lang nog in back-ups. Dit staat in de privacyverklaring en in de verwijderdialoog.",
      },
    ],
  },
  {
    legend: "Toegankelijkheid",
    description: "Deze gegevens staan op de toegankelijkheidsverklaring.",
    fields: [
      {
        key: "accessibilityEmail",
        label: "E-mailadres voor toegankelijkheidsvragen",
        type: "email",
      },
      {
        key: "statementDate",
        label: "Datum toegankelijkheidsverklaring",
        type: "date",
      },
    ],
  },
];

function toValues(s: Data["settings"]): Values {
  return {
    schoolName: s.school.name,
    authority: s.school.authority,
    privacyEmail: s.school.privacyEmail,
    policyUrl: s.school.policyUrl,
    dpoName: s.dpo.name,
    dpoEmail: s.dpo.email,
    processorName: s.processor.name,
    processorEmail: s.processor.email,
    hostingLocation: s.processor.hostingLocation,
    backupDays: String(s.processor.backupDays),
    accessibilityEmail: s.accessibility.contactEmail,
    statementDate: s.accessibility.statementDate ?? "",
  };
}

const FIELD_PATHS: Record<keyof Values, string> = {
  schoolName: "school.name",
  authority: "school.authority",
  privacyEmail: "school.privacyEmail",
  policyUrl: "school.policyUrl",
  dpoName: "dpo.name",
  dpoEmail: "dpo.email",
  processorName: "processor.name",
  processorEmail: "processor.email",
  hostingLocation: "processor.hostingLocation",
  backupDays: "processor.backupDays",
  accessibilityEmail: "accessibility.contactEmail",
  statementDate: "accessibility.statementDate",
};

function buildSettings(data: Data, v: Values) {
  const s = data.settings;
  const { confirmedAt: _a, confirmedById: _b, ...retention } = s.retention;
  return {
    school: {
      name: v.schoolName.trim(),
      authority: v.authority.trim(),
      privacyEmail: v.privacyEmail.trim(),
      policyUrl: v.policyUrl.trim(),
    },
    dpo: { name: v.dpoName.trim(), email: v.dpoEmail.trim() },
    processor: {
      name: v.processorName.trim(),
      email: v.processorEmail.trim(),
      hostingLocation: v.hostingLocation.trim(),
      backupDays: Number(v.backupDays),
    },
    retention,
    exports: s.exports,
    accessibility: {
      contactEmail: v.accessibilityEmail.trim(),
      statementDate: v.statementDate || null,
    },
  };
}

/** Client-side validation with the shared schema (same messages). */
function validate(data: Data, v: Values) {
  const errors: Partial<Record<keyof Values, string>> = {};
  const backup = Number(v.backupDays);
  if (!v.backupDays.trim() || !Number.isInteger(backup)) {
    errors.backupDays = "Vul een heel aantal dagen in.";
  } else if (backup < 0 || backup > 365) {
    errors.backupDays = "Kies 0 tot en met 365 dagen.";
  }
  const parsed = privacySettingsSchema.safeParse({
    ...buildSettings(data, v),
    retention: data.settings.retention,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      const key = (Object.keys(FIELD_PATHS) as (keyof Values)[]).find(
        (k) => FIELD_PATHS[k] === path,
      );
      if (key && !errors[key]) {
        errors[key] = issue.message.startsWith("Invalid")
          ? "Deze waarde is niet geldig."
          : issue.message;
      }
    }
  }
  return errors;
}

export function SchoolDetailsForm() {
  const trpc = useTRPC();
  const query = useQuery(trpc.privacy.getSettings.queryOptions());
  if (query.isPending) return <LoadingState variant="list" />;
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return (
    <SchoolDetailsInner
      key={String(query.data.updatedAt ?? "new")}
      data={query.data}
    />
  );
}

function SchoolDetailsInner({ data }: { data: Data }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const baseId = useId();
  const [values, setValues] = useState<Values>(() => toValues(data.settings));
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>(
    {},
  );
  const [focusKey, setFocusKey] = useState(0);
  const update = useMutation(trpc.privacy.updateSettings.mutationOptions());
  const fieldId = (key: string) => `${baseId}-${key}`;
  const labels = Object.fromEntries(
    GROUPS.flatMap((g) => g.fields).map((f) => [f.key, f.label]),
  ) as Record<keyof Values, string>;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = validate(data, values);
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setFocusKey((k) => k + 1);
      return;
    }
    try {
      await update.mutateAsync(buildSettings(data, values));
      const message = "Schoolgegevens opgeslagen.";
      toast.success(message);
      announce(message);
      await queryClient.invalidateQueries({ queryKey: trpc.privacy.pathKey() });
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  const summary = (Object.keys(errors) as (keyof Values)[]).map((key) => ({
    fieldId: fieldId(key),
    message: `${labels[key]}: ${errors[key]}`,
  }));

  return (
    <PanelCard
      title="Schoolgegevens"
      description={
        data.updatedAt ? (
          <>
            Laatst gewijzigd op {formatDateTime(data.updatedAt)}
            {data.updatedByName ? ` door ${data.updatedByName}` : ""}.
          </>
        ) : (
          "Vul deze gegevens in; ze staan op de privacyverklaring en in het verwerkingsregister."
        )
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        <FormErrorSummary errors={summary} focusKey={focusKey} />
        {GROUPS.map((group) => (
          <FormFieldset
            key={group.legend}
            legend={group.legend}
            description={group.description}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {group.fields.map((f) => (
                <Row key={f.key}>
                  <FormField
                    label={f.label}
                    htmlFor={fieldId(f.key)}
                    description={f.description}
                    error={errors[f.key]}
                  >
                    <Input
                      id={fieldId(f.key)}
                      type={f.type === "url" ? "url" : (f.type ?? "text")}
                      inputMode={
                        f.type === "number"
                          ? "numeric"
                          : f.type === "email"
                            ? "email"
                            : f.type === "url"
                              ? "url"
                              : undefined
                      }
                      autoComplete={
                        f.autoComplete ?? (f.type === "email" ? "email" : "off")
                      }
                      min={f.type === "number" ? 0 : undefined}
                      max={f.type === "number" ? 365 : undefined}
                      maxLength={f.type === "number" ? undefined : 200}
                      value={values[f.key]}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [f.key]: e.target.value }))
                      }
                    />
                  </FormField>
                </Row>
              ))}
            </div>
          </FormFieldset>
        ))}
        <div>
          <Button
            type="submit"
            disabled={update.isPending}
            aria-busy={update.isPending}
          >
            <Save aria-hidden="true" />
            Opslaan
          </Button>
        </div>
      </form>
    </PanelCard>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="min-w-0">{children}</div>;
}
