import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { noteCandidates, type Counterparty, type NoteItem } from "@/lib/notes/notes";
import { loadLatestVersion, type VersionRow } from "@/components/review/version-data";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type NoteRow = {
  id: string;
  counterparty: string;
  party_key: string;
  state: "draft" | "approved";
  recipient: string;
  new_contact: string;
  contact_details: string | null;
  message: string | null;
  club_name: string;
  sender_name: string;
  items: NoteItem[];
  access_level: string;
  version_id: string;
  approved_at: string | null;
  updated_at: string;
};

export type NoteAck = { note_id: string; name: string | null; created_at: string };

export const NOTE_SELECT =
  "id, counterparty, party_key, state, recipient, new_contact, contact_details, message, club_name, sender_name, items, access_level, version_id, approved_at, updated_at";

export const asNote = (r: Record<string, unknown>): NoteRow => ({ ...(r as unknown as NoteRow), items: Array.isArray(r.items) ? (r.items as NoteItem[]) : [] });

/**
 * Everything the notes pages need, read through the viewer's own session, so RLS decides:
 * the latest version, who outside the club its readable items are owed to, the notes this role
 * may read (drafts only for the working-ledger roles) and their acknowledgements.
 */
export async function loadNotes(
  supabase: Client,
  workspaceId: string,
): Promise<{ version: VersionRow | null; candidates: Counterparty[]; levels: Record<string, string>; notes: NoteRow[]; acks: Map<string, NoteAck>; error: boolean }> {
  const empty = { version: null, candidates: [], levels: {}, notes: [], acks: new Map<string, NoteAck>() };
  const { version, error } = await loadLatestVersion(supabase, workspaceId);
  if (error) return { ...empty, error: true };
  const [rows, notes, acks] = await Promise.all([
    version
      ? supabase.from("version_items").select("obligation_id, access_level, private_uploaders, item").eq("version_id", version.id)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("counterparty_notes").select(NOTE_SELECT).eq("workspace_id", workspaceId).order("counterparty"),
    supabase.from("counterparty_note_acks").select("note_id, name, created_at").eq("workspace_id", workspaceId),
  ]);
  if (rows.error || notes.error || acks.error) return { ...empty, version, error: true };
  return {
    version,
    candidates: noteCandidates(rows.data ?? []),
    levels: Object.fromEntries((rows.data ?? []).map((r) => [r.obligation_id, r.access_level])),
    notes: (notes.data ?? []).map((n) => asNote(n)),
    acks: new Map((acks.data ?? []).map((a) => [a.note_id, a])),
    error: false,
  };
}

/** Counterparties in the latest version with no approved note yet. */
export function withoutApprovedNote(candidates: readonly Counterparty[], notes: readonly NoteRow[]): Counterparty[] {
  const approved = new Set(notes.filter((n) => n.state === "approved").map((n) => n.party_key));
  return candidates.filter((c) => !approved.has(c.key));
}
