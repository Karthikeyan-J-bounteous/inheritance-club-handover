// The signed link a counterparty opens: /n/<note id>.<signature>. The signature is an HMAC of the
// note id under a server-only key, so nobody can make a link for a note they were not sent, and
// the server checks it before reading anything. Pure: the key is passed in.

import { createHmac, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SIG = /^[A-Za-z0-9_-]{43}$/;

const sign = (noteId: string, secret: string) => createHmac("sha256", secret).update(`inheritance-note-link:v1:${noteId}`).digest("base64url");

export function signNoteToken(noteId: string, secret: string): string {
  if (!UUID.test(noteId)) throw new Error("not a note id");
  if (!secret) throw new Error("no signing key");
  return `${noteId}.${sign(noteId, secret)}`;
}

/** The note id a token was signed for, or null for anything else (wrong key, edited, malformed). */
export function readNoteToken(token: string | null | undefined, secret: string | null | undefined): string | null {
  if (!token || !secret || token.length > 120) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const id = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!UUID.test(id) || !SIG.test(sig)) return null;
  const expected = Buffer.from(sign(id, secret));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}
