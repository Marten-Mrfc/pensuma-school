"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
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

export function NewTestDialog({ trigger }: { trigger?: ReactNode }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation(trpc.test.create.mutationOptions());

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Geef de toets een titel.");
      return;
    }
    try {
      const { id } = await create.mutateAsync({ title: title.trim(), topic: topic.trim() || undefined });
      await queryClient.invalidateQueries({ queryKey: trpc.test.list.pathKey() });
      toast.success("Toets aangemaakt. Voeg nu je eerste vraag toe.");
      setOpen(false);
      setTitle("");
      setTopic("");
      router.push(routes.docent.test(id));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setError(null);
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
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Nieuwe toets</DialogTitle>
            <DialogDescription>
              Je begint met een lege toets. Daarna voeg je vragen toe vanuit handige sjablonen.
            </DialogDescription>
          </DialogHeader>
          <FormField label="Titel" htmlFor="new-test-title" required error={error ?? undefined}>
            <Input
              id="new-test-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError(null);
              }}
              placeholder="bijv. Toets H3 – lussen"
              maxLength={200}
              autoFocus
            />
          </FormField>
          <FormField
            label="Onderwerp"
            htmlFor="new-test-topic"
            description="Optioneel. Handig om toetsen terug te vinden."
          >
            <Input
              id="new-test-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="bijv. Python – lussen"
              maxLength={200}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuleren
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : null}
              Aanmaken
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
