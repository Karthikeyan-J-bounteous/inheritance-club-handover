"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { NOTE_LIMITS } from "@/lib/notes/notes";
import { noteIdFromToken, noteService } from "@/lib/notes/server";

const AckInput = z.object({
  token: z.string().max(120),
  name: z.string().trim().max(NOTE_LIMITS.ackName, `Keep your name under ${NOTE_LIMITS.ackName} characters.`).optional(),
});

const INVALID = "This link is not valid. Ask the club to send it again.";

/**
 * The counterparty acknowledges the note from its signed link. The signature is checked first;
 * only then does the server call the one function that records an acknowledgement (service role,
 * migration 0023). Pressing it twice keeps the first.
 */
export async function acknowledgeNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const input = AckInput.safeParse({ token: formData.get("token"), name: formData.get("name") ?? undefined });
  if (!input.success) return { error: input.error.issues[0]?.message ?? INVALID };
  const id = noteIdFromToken(input.data.token);
  if (!id) return { error: INVALID };
  const db = noteService();
  if (!db) return { error: "The club's server cannot record this right now. Try again later." };
  const { data, error } = await db.rpc("acknowledge_counterparty_note", { p_note: id, p_name: input.data.name ?? "" });
  if (error) return { error: "Could not record your acknowledgement. Try again in a minute." };
  if (!data) return { error: INVALID };
  refresh();
  return { ok: "Thank you. The club can see that you have read this note." };
}
