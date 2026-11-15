import "server-only";
import { sandboxConfig, serviceClient } from "@/lib/demo/sandbox-server";
import { readNoteToken, signNoteToken } from "./link";

// Server-only pieces of the signed note links. The signing key is derived from the secret
// (service-role) key, which never reaches the browser; rotating that key invalidates every link,
// as it does the demo copies' passwords.

function secret(): string | null {
  return process.env.SUPABASE_SECRET_KEY || null;
}

/** The path a counterparty opens (`/n/<id>.<signature>`), or null when the server has no key. */
export function notePath(noteId: string): string | null {
  const key = secret();
  return key ? `/n/${signNoteToken(noteId, key)}` : null;
}

/** The note a token was signed for, or null. Nothing is read before this says yes. */
export function noteIdFromToken(token: string): string | null {
  return readNoteToken(token, secret());
}

/**
 * The service-role client for the two functions the signed page may call
 * (`public_counterparty_note`, `acknowledge_counterparty_note`). They read and write the note
 * and its acknowledgement only.
 */
export function noteService() {
  const cfg = sandboxConfig();
  return cfg ? serviceClient(cfg) : null;
}
