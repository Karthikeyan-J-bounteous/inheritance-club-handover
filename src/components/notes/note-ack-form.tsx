"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { FormState } from "@/lib/form-state";
import { NOTE_LIMITS } from "@/lib/notes/notes";

/** The counterparty's one action: say they have read the note. The name is optional. */
export function NoteAckForm({ action, token }: { action: (prev: FormState, formData: FormData) => Promise<FormState>; token: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  const id = useId();
  return (
    <form action={formAction} className="flex flex-col gap-3" aria-busy={pending} data-testid="note-ack-form">
      <input type="hidden" name="token" value={token} />
      <label htmlFor={`${id}-name`} className="text-sm font-medium">
        Your name <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <input
        id={`${id}-name`}
        name="name"
        maxLength={NOTE_LIMITS.ackName}
        autoComplete="name"
        className="h-10 rounded-lg border bg-background px-3 text-sm"
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Recording…" : "I have read this note"}
        </Button>
      </div>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
