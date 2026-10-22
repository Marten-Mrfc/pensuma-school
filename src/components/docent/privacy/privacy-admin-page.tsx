"use client";

import { ScrollText } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { routes } from "@/lib/routes";
import { DataSubjectTools } from "./data-subject-tools";
import { OverviewTab } from "./overview-tab";
import { ProcessingRegister } from "./processing-register";
import { RetentionForm } from "./retention-form";
import { RetentionHolds } from "./retention-holds";
import { SchoolDetailsForm } from "./school-details-form";
import { SchoolYearWizard } from "./school-year-wizard";

export const PRIVACY_TABS = [
  { value: "overzicht", label: "Overzicht" },
  { value: "bewaartermijnen", label: "Bewaartermijnen" },
  { value: "inzage", label: "Inzage & verwijderen" },
  { value: "schooljaar", label: "Schooljaar afsluiten" },
  { value: "register", label: "Register & schoolgegevens" },
] as const;

export type PrivacyTab = (typeof PRIVACY_TABS)[number]["value"];

function isTab(value: string | null): value is PrivacyTab {
  return PRIVACY_TABS.some((t) => t.value === value);
}

/** /docent/privacy: retention, data-subject requests, year-end, register. */
export function PrivacyAdminPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const param = searchParams.get("tab");
  const tab: PrivacyTab = isTab(param) ? param : "overzicht";

  const setTab = (next: string) => {
    if (!isTab(next)) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overzicht") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Privacy & gegevens"
        description="Bewaartermijnen, inzage- en verwijderverzoeken en het logboek van wie welke leerlinggegevens heeft bekeken of gewijzigd."
        actions={
          <Button variant="outline" asChild>
            <Link href={routes.docent.privacyLog}>
              <ScrollText aria-hidden="true" />
              Logboek
            </Link>
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <TabsList className="w-max min-w-full sm:min-w-0">
            {PRIVACY_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="px-3">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="overzicht" className="flex flex-col gap-6">
          <OverviewTab onNavigate={setTab} />
        </TabsContent>
        <TabsContent value="bewaartermijnen" className="flex flex-col gap-6">
          <RetentionForm />
        </TabsContent>
        <TabsContent value="inzage" className="flex flex-col gap-6">
          <DataSubjectTools />
          <RetentionHolds />
        </TabsContent>
        <TabsContent value="schooljaar" className="flex flex-col gap-6">
          <SchoolYearWizard />
        </TabsContent>
        <TabsContent value="register" className="flex flex-col gap-6">
          <SchoolDetailsForm />
          <ProcessingRegister />
        </TabsContent>
      </Tabs>
    </div>
  );
}
