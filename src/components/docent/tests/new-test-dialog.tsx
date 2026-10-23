"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { FormField } from "@/components/app/form-field";
import { getErrorMessage } from "@/components/app/get-error-message";
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
import { Input } from "@/components/ui/input";
import { routes } from "@/lib/routes";
import { useTRPC } from "@/trpc/react";
import { focusInvalidField } from "../a11y/invalid-field-focus";

export function NewTestDialog({ trigger }: { trigger?: ReactNode }) {
  const uid = useId();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const announce = useAnnounce();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  /** Validation error of the title field. */
  const [titleError, setTitleError] = useState<string | null>(null);
  /** Server error: shown (and announced) below the fields. */
  const [formError, setFormError] = useState<string | null>(null);
  const create = useMutation(trpc.test.create.mutationOptions());
  const titleId = `${uid}-new-test-title`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      const message = "Geef de toets een titel.";
      setTitleError(message);
      focusInvalidField(titleId, message, announce);
      return;
    }
    try {
      const { id } = await create.mutateAsync({
        title: title.trim(),
        topic: topic.trim() || undefined,
      });
      await queryClient.invalidateQueries({
        queryKey: trpc.test.list.pathKey(),
      });
      toast.success("Toets aangemaakt. Voeg nu je eerste vraag toe.");
      setOpen(false);
      setTitle("");
      setTopic("");
      router.push(routes.docent.test(id));
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setTitleError(null);
          setFormError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus aria-hidden="true" />
            Nieuwe toets
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>Nieuwe toets</DialogTitle>
            <DialogDescription>
              Je begint met een lege toets. Daarna voeg je vragen toe vanuit
              handige sjablonen.
            </DialogDescription>
          </DialogHeader>
          <FormField
            label="Titel"
            htmlFor={titleId}
            required
            error={titleError ?? undefined}
          >
            <Input
              id={titleId}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleError(null);
              }}
              placeholder="bijv. Toets H3 – lussen"
              maxLength={200}
              autoFocus
            />
          </FormField>
          <FormField
            label="Onderwerp"
            htmlFor={`${uid}-new-test-topic`}
            description="Optioneel. Handig om toetsen terug te vinden."
          >
            <Input
              id={`${uid}-new-test-topic`}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="bijv. Python – lussen"
              maxLength={200}
            />
          </FormField>
          {formError ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-ink"
            >
              {formError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Annuleren
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? (
                <Loader2
                  className="motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              Aanmaken
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
