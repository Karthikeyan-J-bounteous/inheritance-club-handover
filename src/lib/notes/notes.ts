// Counterparty handoff notes (Phase 16, Round 3 improvement 3). Pure and tested.
//
// Who outside the club the approved handover owes something to, and the note each of them
// gets: a fixed template filled from the approved items and the outgoing lead's own fields.
// No model writes any of it. The database (migration 0023) decides which items a note may
// carry; `partyKey`, `noteParty` and `noteCandidates` mirror it so the page can offer the same
// choice, and an RLS test checks the two agree.

import { formatIstDate } from "../format.ts";

export type NoteItem = {
  obligation_id: string;
  kind: "commitment" | "recurring";
  description: string;
  due_text: string | null;
  due_date: string | null;
  status: string | null;
  /** The advisor's ruling on a conflict, as it stood in the version. */
  ruling: string | null;
  cadence: string | null;
  /** year, semester, … for a recurring duty. */
  period: string | null;
  next_due: string | null;
  approval: string | null;
  /** When the record was made: of records marked as the same item, the oldest speaks for them. */
  created_at: string | null;
  /** Other records marked as the same item (version_items.item.linked_same). */
  linked_same: string[];
};

const INTERNAL = /^((new|next|incoming|outgoing|old|current|core|club)\s+)*(club|committee|team|members|committee members)$/u;

/**
 * The key that groups a counterparty's items. Mirrors `app.party_key()`: NFKC, spaces collapsed,
 * lower case, trailing punctuation and a leading "the", "all" or "our" dropped. Null for the
 * club itself and its committees, which are not outside the club.
 */
export function partyKey(p: string | null | undefined): string | null {
  const k = (p ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase()
    .replace(/[\s.,;:!]+$/u, "")
    .replace(/^((the|all|our)\s+)+/u, "");
  if (k === "" || INTERNAL.test(k)) return null;
  return k;
}

type Obligation = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** Who an item is owed to, for a note: a promise's counterparty, or a recurring duty's approver (else whoever it is owed to). Mirrors `app.note_party()`. */
export function noteParty(o: Obligation | null | undefined): { key: string; label: string } | null {
  if (!o) return null;
  const label = o.kind === "recurring" ? (str(o.approver) ?? str(o.owed_to)) : str(o.owed_to);
  const key = partyKey(label);
  return key && label ? { key, label: label.trim() } : null;
}

type Conflict = { ruling?: unknown; ruled_at?: unknown };

/** The fields of one approved item a note may carry. Mirrors `app.note_item()`. */
export function noteItemFrom(obligationId: string, item: { obligation?: Obligation; conflicts?: unknown; linked_same?: unknown } | null | undefined): NoteItem | null {
  const o = item?.obligation;
  if (!o) return null;
  const ruled = (Array.isArray(item?.conflicts) ? (item!.conflicts as Conflict[]) : [])
    .filter((c) => typeof c?.ruling === "string")
    .sort((a, b) => String(b.ruled_at ?? "").localeCompare(String(a.ruled_at ?? "")));
  return {
    obligation_id: obligationId,
    kind: o.kind === "recurring" ? "recurring" : "commitment",
    description: str(o.description) ?? "Untitled item",
    due_text: str(o.due_text),
    due_date: str(o.due_date),
    status: str(o.status),
    ruling: (ruled[0]?.ruling as string | undefined) ?? null,
    cadence: str(o.cadence),
    period: str(o.period),
    next_due: str(o.next_due),
    approval: str(o.approval_required),
    created_at: str(o.created_at),
    linked_same: Array.isArray((item as { linked_same?: unknown }).linked_same) ? ((item as { linked_same: unknown[] }).linked_same.filter((x) => typeof x === "string") as string[]) : [],
  };
}

export type VersionRow = { obligation_id: string; access_level: string; private_uploaders?: readonly string[] | null; item: unknown };
export type Counterparty = { key: string; name: string; items: NoteItem[]; level: "everyone" | "committee" };

/**
 * Everyone outside the club that the version's items are owed to, with the items a note to them
 * may carry: at most committee level (what the incoming lead may read), never private. Mirrors
 * `app.note_candidates()`. The name shown is the one the records use most often for them (the
 * shortest, on a tie).
 */
export function noteCandidates(rows: readonly VersionRow[]): Counterparty[] {
  const groups = new Map<string, { labels: Map<string, number>; items: NoteItem[]; level: Counterparty["level"] }>();
  for (const r of rows) {
    if (r.access_level !== "everyone" && r.access_level !== "committee") continue;
    if ((r.private_uploaders ?? []).length > 0) continue;
    const item = r.item as { obligation?: Obligation; conflicts?: unknown } | null;
    const party = noteParty(item?.obligation);
    const ni = noteItemFrom(r.obligation_id, item);
    if (!party || !ni) continue;
    const g = groups.get(party.key) ?? { labels: new Map<string, number>(), items: [] as NoteItem[], level: "everyone" as Counterparty["level"] };
    g.labels.set(party.label, (g.labels.get(party.label) ?? 0) + 1);
    g.items.push(ni);
    if (r.access_level === "committee") g.level = "committee";
    groups.set(party.key, g);
  }
  return [...groups]
    .map(([key, g]) => ({
      key,
      name: [...g.labels].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))[0][0],
      items: sortItems(g.items),
      level: g.level,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Records marked as the same item are said once, in the words of the oldest of them, as the
 * ledger's card does. Links are direct only, as on the ledger (A-B and B-C do not fold A and C).
 */
export function foldLinked(items: readonly NoteItem[]): NoteItem[] {
  const oldestFirst = [...items].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.obligation_id.localeCompare(b.obligation_id));
  const kept: NoteItem[] = [];
  for (const i of oldestFirst) {
    if (kept.some((k) => k.linked_same.includes(i.obligation_id) || i.linked_same.includes(k.obligation_id))) continue;
    kept.push(i);
  }
  return sortItems(kept);
}

/** By description, then id (code-point order, so the same everywhere). */
export function sortItems(items: readonly NoteItem[]): NoteItem[] {
  return [...items].sort((a, b) => (a.description < b.description ? -1 : a.description > b.description ? 1 : a.obligation_id.localeCompare(b.obligation_id)));
}

export type NoteFields = {
  club_name: string;
  sender_name: string;
  recipient: string;
  new_contact: string;
  contact_details: string | null;
  message: string | null;
  items: readonly NoteItem[];
};

export type NoteLine = { text: string; detail: string[] };
export type NoteSection = { key: "owed" | "done" | "recurring"; title: string; lines: NoteLine[] };
export type NoteDoc = { greeting: string; intro: string[]; sections: NoteSection[]; message: string | null; signoff: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (d: string) => formatIstDate(`${d}T00:00:00+05:30`);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const month = (d: string) => {
  const m = /^(\d{4})-(\d{2})/.exec(d);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : d;
};
const sentence = (s: string) => {
  const t = s.trim().replace(/[\s.]+$/u, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** When a promise is due, in words: the records' own words, or the date. */
export function dueWords(i: Pick<NoteItem, "due_text" | "due_date">): string | null {
  if (i.due_text) return ISO_DAY.test(i.due_text) ? `by ${day(i.due_text)}` : i.due_text.trim();
  return i.due_date ? `by ${day(i.due_date)}` : null;
}

/** Where a promise stands, as the counterparty should read it. Never says done unless the records (or the advisor's ruling) do. */
export function promiseState(i: Pick<NoteItem, "status" | "ruling">): "done" | "open" | "no_record" | "believed_done" | "unsettled" {
  if (i.status === "fulfilled") return "done";
  if (i.status === "contradicted") return i.ruling === "done" ? "done" : i.ruling === "not_done" ? "open" : "unsettled";
  if (i.status === "likely_fulfilled") return "believed_done";
  if (i.status === "no_evidence") return "no_record";
  return "open";
}

/** The note as the counterparty reads it. The same function renders the lead's preview and the signed page. */
export function renderNote(n: NoteFields): NoteDoc {
  const contact = n.new_contact.trim();
  const owed: NoteLine[] = [];
  const done: NoteLine[] = [];
  const recurring: NoteLine[] = [];
  for (const i of foldLinked(n.items)) {
    if (i.kind === "recurring") {
      recurring.push({
        text: sentence(i.description),
        detail: [
          i.period && /^[a-z]+$/u.test(i.period) ? `Every ${i.period}` : i.cadence ? sentence(i.cadence) : null,
          i.approval ? `The club will ask you for: ${i.approval.trim()}` : null,
          i.next_due ? `Next expected around ${month(i.next_due)}` : null,
        ].filter((x): x is string => x !== null),
      });
      continue;
    }
    const due = dueWords(i);
    const state = promiseState(i);
    if (state === "done") {
      done.push({ text: sentence(i.description), detail: due ? [`Was due ${due}`] : [] });
      continue;
    }
    const phrase = {
      open: "Still to be done.",
      no_record: "Our records do not show this as done yet.",
      believed_done: `We believe this was done. Please tell ${contact} if it was not.`,
      unsettled: `Our records disagree on whether this was done. ${contact} will check with you.`,
    }[state];
    owed.push({ text: sentence(i.description), detail: [...(due ? [`Due ${due}`] : []), phrase] });
  }
  const sections: NoteSection[] = [
    { key: "owed" as const, title: "What the club still owes you", lines: owed },
    { key: "recurring" as const, title: "What the club asks of you each time", lines: recurring },
    { key: "done" as const, title: "Already done", lines: done },
  ].filter((s) => s.lines.length > 0);
  const details = n.contact_details?.trim();
  return {
    greeting: `Dear ${n.recipient.trim()},`,
    intro: [
      `${n.sender_name} is handing over as lead of ${n.club_name}. From now on, your contact at the club is ${contact}.${details ? ` You can reach them at ${details}.` : ""}`,
      "This is what the club's approved handover records about you.",
    ],
    sections,
    message: n.message?.trim() || null,
    signoff: `${n.sender_name}, for ${n.club_name}`,
  };
}

/** The note as plain text, for copying into an email or chat. */
export function noteText(doc: NoteDoc): string {
  const out = [doc.greeting, "", ...doc.intro];
  for (const s of doc.sections) {
    out.push("", `${s.title}:`);
    for (const l of s.lines) out.push(`- ${l.text}${l.detail.length ? ` (${l.detail.join(" ")})` : ""}`);
  }
  if (doc.message) out.push("", doc.message);
  out.push("", doc.signoff);
  return out.join("\n");
}

export const NOTE_LIMITS = { recipient: 80, newContact: 80, contactDetails: 120, message: 600, ackName: 80 } as const;
