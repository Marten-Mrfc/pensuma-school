"use client";

import { ClipboardPaste, UserSearch } from "lucide-react";
import { useId, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddExistingPanel } from "./add-existing-panel";
import { ImportResultView } from "./import-result-view";
import {
  type ImportContext,
  type ImportResult,
  ImportStudentsPanel,
} from "./import-students-panel";

export interface AddStudentsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  className: string;
}

/** "Leerlingen toevoegen": paste/CSV import or add existing students. */
export function AddStudentsSheet({
  open,
  onOpenChange,
  classId,
  className,
}: AddStudentsSheetProps) {
  const uid = useId();
  const [tab, setTab] = useState("import");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importContext, setImportContext] = useState<ImportContext>();
  // Bumped to reset the import panel ("Nog een lijst importeren").
  const [importKey, setImportKey] = useState(0);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      // Reset after the close animation.
      setTimeout(() => {
        setResult(null);
        setTab("import");
        setImportKey((k) => k + 1);
      }, 250);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 sm:max-w-2xl"
        aria-describedby={`${uid}-add-students-description`}
      >
        <SheetHeader className="px-4 pt-5 pb-4 sm:px-6">
          <SheetTitle className="font-display text-xl tracking-tight">
            {result
              ? "Import voltooid"
              : `Leerlingen toevoegen aan ${className}`}
          </SheetTitle>
          <SheetDescription id={`${uid}-add-students-description`}>
            {result
              ? "Print de inlogkaarten en deel ze uit in de klas."
              : "Importeer een lijst met nieuwe leerlingen of voeg leerlingen toe die al een account hebben."}
          </SheetDescription>
        </SheetHeader>

        {result ? (
          <ImportResultView
            classId={classId}
            className={className}
            result={result}
            context={importContext}
            onImportMore={() => {
              setResult(null);
              setImportKey((k) => k + 1);
            }}
            onDone={() => handleOpenChange(false)}
          />
        ) : (
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="min-h-0 flex-1 gap-4"
          >
            <div className="px-4 sm:px-6">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="import" className="flex-1 sm:flex-none">
                  <ClipboardPaste className="size-4" aria-hidden="true" />
                  Plakken of CSV
                </TabsTrigger>
                <TabsTrigger value="existing" className="flex-1 sm:flex-none">
                  <UserSearch className="size-4" aria-hidden="true" />
                  Bestaande leerling
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent
              forceMount
              value="import"
              className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
            >
              <ImportStudentsPanel
                key={importKey}
                classId={classId}
                className={className}
                onCancel={() => handleOpenChange(false)}
                onImported={(next, context) => {
                  setImportContext(context);
                  setResult(next);
                }}
              />
            </TabsContent>
            <TabsContent
              value="existing"
              className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
            >
              <AddExistingPanel
                classId={classId}
                className={className}
                onCancel={() => handleOpenChange(false)}
                onAdded={() => handleOpenChange(false)}
              />
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
