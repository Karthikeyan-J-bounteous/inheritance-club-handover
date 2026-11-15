"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { DEMO_USERS } from "@/lib/demo/demo-users";
import { NOTE_LIMITS } from "@/lib/notes/notes";
import { getViewer } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The outgoing lead's actions on counterparty notes. Each calls one database function
// (migration 0023), which checks the role, copies the items from the approved version itself
// and writes the audit row; nothing here decides what a note may contain.

const Id = z.uuid("Invalid request.");

type DbError = { code?: string; message: string } | null;

function explain(error: DbError, fallback: string): string {
  if (!error) return fallback;
  if (error.code === "42501") return "Only the outgoing lead can write, change or approve a note.";
  if (error.code === "P0002") return "That note no longer exists. Reload the page.";
  // The database's own words for a refusal (check or uniqueness), which are written for people.
  if (error.code === "23514" || error.code === "23505") return error.message.charAt(0).toUpperCase() + error.message.slice(1) + ".";
  return fallback;
}

/** Who the incoming lead is, by default, as the note's new contact. The lead can change it. */
function defaultContact(): string {
  return DEMO_USERS.find((u) => u.role === "incoming_lead")?.name ?? "The incoming lead";
}

const DraftInput = z.object({ counterparty: z.string().trim().min(1, "Choose who the note is for.").max(120) });

export async function draftNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer?.membership) return { error: "Please sign in first." };
  const input = DraftInput.safeParse(Object.fromEntries(formData));
  if (!input.success) return { error: input.error.issues[0]?.message ?? "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("draft_counterparty_note", {
    p_workspace: viewer.membership.workspaceId,
    p_counterparty: input.data.counterparty,
    p_new_contact: defaultContact(),
  });
  if (error || !data) return { error: explain(error, "Could not draft the note. Nothing was saved.") };
  redirect(`/handover/notes/${data}`);
}

const Fields = z.object({
  note: Id,
  recipient: z.string().trim().min(1, "Say who the note is to.").max(NOTE_LIMITS.recipient, `Keep "To" under ${NOTE_LIMITS.recipient} characters.`),
  new_contact: z.string().trim().min(1, "Say who the new contact is.").max(NOTE_LIMITS.newContact, `Keep the new contact under ${NOTE_LIMITS.newContact} characters.`),
  contact_details: z.string().trim().max(NOTE_LIMITS.contactDetails, `Keep "How to reach them" under ${NOTE_LIMITS.contactDetails} characters.`).optional(),
  message: z.string().trim().max(NOTE_LIMITS.message, `Keep the message under ${NOTE_LIMITS.message} characters.`).optional(),
  items: z.array(Id).max(200),
});

function readFields(formData: FormData) {
  return Fields.safeParse({
    note: formData.get("note"),
    recipient: formData.get("recipient") ?? "",
    new_contact: formData.get("new_contact") ?? "",
    contact_details: formData.get("contact_details") ?? undefined,
    message: formData.get("message") ?? undefined,
    items: formData.getAll("items"),
  });
}

/** Save the draft: the lead's fields and which items to include. The database copies the items itself. */
export async function saveNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer?.membership) return { error: "Please sign in first." };
  const input = readFields(formData);
  if (!input.success) return { error: input.error.issues[0]?.message ?? "Invalid request." };
  const f = input.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_counterparty_note", {
    p_note: f.note,
    p_recipient: f.recipient,
    p_new_contact: f.new_contact,
    p_contact_details: f.contact_details ?? "",
    p_message: f.message ?? "",
    p_items: f.items,
  });
  if (error) return { error: explain(error, "Could not save the draft. Nothing was changed.") };
  refresh();
  return { ok: "Draft saved. Nobody outside the club can see it until you approve it." };
}

const NoteInput = z.object({ note: Id });

/** Approve the saved draft exactly as it is. It can never change afterwards. */
export async function approveNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer?.membership) return { error: "Please sign in first." };
  const input = NoteInput.safeParse(Object.fromEntries(formData));
  if (!input.success) return { error: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("approve_counterparty_note", { p_note: input.data.note });
  if (error) {
    // Pressed twice: the first press approved it.
    if (/already approved/.test(error.message)) redirect(`/handover/notes/${input.data.note}`);
    return { error: explain(error, "Could not approve the note. Nothing was changed.") };
  }
  redirect(`/handover/notes/${input.data.note}?approved=1`);
}

export async function discardNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer?.membership) return { error: "Please sign in first." };
  const input = NoteInput.safeParse(Object.fromEntries(formData));
  if (!input.success) return { error: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("discard_counterparty_note", { p_note: input.data.note });
  if (error) return { error: explain(error, "Could not discard the draft.") };
  redirect("/handover/notes");
}
