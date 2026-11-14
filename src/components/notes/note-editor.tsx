"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { FormState } from "@/lib/form-state";
import { capitalise } from "@/lib/ledger-view";
import { NOTE_LIMITS, promiseState, renderNote, type NoteItem } from "@/lib/notes/notes";
import { NoteDocument } from "./note-document";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export type EditorNote = {
  id: string;
  counterparty: string;
  recipient: string;
  new_contact: string;
  contact_details: string | null;
  message: string | null;
  club_name: string;
  sender_name: string;
  /** Ids of the items the saved draft carries. */
  selected: string[];
};

const KIND_WORDS = (i: NoteItem) =>
  i.kind === "recurring" ? "Each time" : { done: "Done", open: "Still owed", no_record: "No record it was done", believed_done: "Probably done", unsettled: "Records disagree" }[promiseState(i)];

const field = "h-10 w-full rounded-lg border bg-background px-3 text-sm";

/**
 * The outgoing lead's draft: who it is to, the new contact, how to reach them, a short message,
 * and which approved items go in. The preview beside it is the exact note the counterparty will
 * read (the same function renders the signed page). Approving needs the draft saved first, so
 * what is approved is what was previewed.
 */
export function NoteEditor({
  note,
  items,
  levels,
  stale,
  save,
  approve,
  discard,
}: {
  note: EditorNote;
  /** Every item of the latest version that may go in this note, in that version's words. */
  items: NoteItem[];
  levels: Record<string, string>;
  /** The draft was saved from an older version than the latest. */
  stale: boolean;
  save: Action;
  approve: Action;
  discard: Action;
}) {
  const id = useId();
  const [recipient, setRecipient] = useState(note.recipient);
  const [contact, setContact] = useState(note.new_contact);
  const [details, setDetails] = useState(note.contact_details ?? "");
  const [message, setMessage] = useState(note.message ?? "");
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(note.selected));
  const [state, formAction, pending] = useActionState(save, null);

  const saved = new Set(note.selected);
  const dirty =
    recipient.trim() !== note.recipient ||
    contact.trim() !== note.new_contact ||
    details.trim() !== (note.contact_details ?? "") ||
    message.trim() !== (note.message ?? "") ||
    chosen.size !== saved.size ||
    [...chosen].some((x) => !saved.has(x));

  const doc = useMemo(
    () =>
      renderNote({
        club_name: note.club_name,
        sender_name: note.sender_name,
        recipient: recipient.trim() || note.counterparty,
        new_contact: contact.trim() || "the new contact",
        contact_details: details,
        message,
        items: items.filter((i) => chosen.has(i.obligation_id)),
      }),
    [note.club_name, note.sender_name, note.counterparty, recipient, contact, details, message, items, chosen],
  );

  const toggle = (oid: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(oid)) next.delete(oid);
      else next.add(oid);
      return next;
    });

  const approveBlocked = dirty ? "Save your changes first, so you approve what you see." : stale ? "Save the draft first: a newer version was approved since." : saved.size === 0 ? "Choose at least one item and save." : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <form action={formAction} className="flex flex-col gap-4" aria-busy={pending} data-testid="note-editor">
          <input type="hidden" name="note" value={note.id} />
          <fieldset className="flex flex-col gap-3 rounded-2xl border p-4">
            <legend className="px-1 text-sm font-semibold">1. Who it is to, and the new contact</legend>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">To</span>
              <input className={field} name="recipient" required maxLength={NOTE_LIMITS.recipient} value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">New contact at the club</span>
              <input className={field} name="new_contact" required maxLength={NOTE_LIMITS.newContact} value={contact} onChange={(e) => setContact(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">
                How to reach them <span className="font-normal text-muted-foreground">(optional: an email or phone number)</span>
              </span>
              <input className={field} name="contact_details" maxLength={NOTE_LIMITS.contactDetails} placeholder="e.g. kavya@example.edu" value={details} onChange={(e) => setDetails(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">
                A short message in your own words <span className="font-normal text-muted-foreground">(optional; they will read it)</span>
              </span>
              <textarea className="min-h-20 w-full rounded-lg border bg-background px-3 py-2 text-sm" name="message" maxLength={NOTE_LIMITS.message} value={message} onChange={(e) => setMessage(e.target.value)} />
              <span className="text-xs text-muted-foreground">{message.length} of {NOTE_LIMITS.message}</span>
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-2 rounded-2xl border p-4">
            <legend className="px-1 text-sm font-semibold">2. What goes in the note</legend>
            <p className="text-xs text-muted-foreground">
              Only approved items about {note.counterparty} that the incoming lead may read are offered. Finance and private items never are. Untick anything they should not see. Records marked as the same item are said once in the note.
            </p>
            {items.length === 0 ? (
              <p className="text-sm">Nothing in the latest approved version is owed to them any more. You can discard this draft.</p>
            ) : (
              <ul className="flex flex-col gap-2" aria-label="Items">
                {items.map((i) => (
                  <li key={i.obligation_id}>
                    <label className="flex items-start gap-2 rounded-lg border p-2 text-sm" htmlFor={`${id}-${i.obligation_id}`}>
                      <input
                        id={`${id}-${i.obligation_id}`}
                        type="checkbox"
                        name="items"
                        value={i.obligation_id}
                        checked={chosen.has(i.obligation_id)}
                        onChange={() => toggle(i.obligation_id)}
                        className="mt-1 size-4"
                      />
                      <span className="flex-1">
                        <span className="font-medium">{capitalise(i.description)}</span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline">{KIND_WORDS(i)}</Badge>
                          {levels[i.obligation_id] === "committee" && <Badge variant="secondary">From committee records</Badge>}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant={dirty || stale ? "default" : "outline"} size="sm" disabled={pending}>
              {pending && <Spinner />}
              {pending ? "Saving…" : "Save draft"}
            </Button>
            {dirty && <span className="text-xs text-muted-foreground">You have changes that are not saved.</span>}
          </div>
          {state?.error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state?.ok && !dirty && (
            <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
              {state.ok}
            </p>
          )}
        </form>

        <div className="flex flex-col gap-2 rounded-2xl border border-primary/30 bg-accent/40 p-4">
          <p className="text-sm font-semibold">3. Approve and get the link</p>
          <p className="text-xs text-muted-foreground">Once approved the note never changes, and you get a signed link to send to {note.counterparty}. They need no account to open it.</p>
          {approveBlocked ? (
            <p className="text-sm text-muted-foreground" data-testid="approve-blocked">
              {approveBlocked}
            </p>
          ) : (
            <ActionForm
              action={approve}
              submitLabel="Approve the note"
              pendingLabel="Approving…"
              confirm={{
                title: `Approve the note to ${note.counterparty}?`,
                description: "It is fixed once approved: you cannot edit or discard it. You then get the link to send.",
                confirmLabel: "Yes, approve it",
              }}
              variant="default"
            >
              <input type="hidden" name="note" value={note.id} />
            </ActionForm>
          )}
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Discard this draft</summary>
          <div className="mt-2">
            <ActionForm
              action={discard}
              submitLabel="Discard the draft"
              pendingLabel="Discarding…"
              variant="destructive"
              confirm={{ title: "Discard this draft?", description: "The draft is deleted. You can draft a new note for them afterwards.", confirmLabel: "Yes, discard it" }}
            >
              <input type="hidden" name="note" value={note.id} />
            </ActionForm>
          </div>
        </details>
      </div>

      <div className="flex flex-col gap-2 lg:sticky lg:top-36 lg:self-start">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview: what {note.counterparty} will read</p>
        <NoteDocument doc={doc} from={note.sender_name} />
      </div>
    </div>
  );
}
