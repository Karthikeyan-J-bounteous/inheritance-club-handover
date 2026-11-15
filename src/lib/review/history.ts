import { FIELD_LABELS } from "./fields.ts";
import { rulingLabel } from "./labels.ts";

// The review history: audit rows written by the review actions, in words.

export const REVIEW_ACTIONS = ["accept", "edit", "reject", "reopen", "rule", "link_same", "link_distinct", "mark_ready", "approve_version", "release", "answer_gap", "note_draft", "note_edit", "note_approve", "note_discard", "note_ack"] as const;

const ACTION_LABELS: Record<string, string> = {
  accept: "Accepted",
  edit: "Edited",
  reject: "Rejected",
  reopen: "Moved back to draft",
  rule: "Ruled on a conflict",
  link_same: "Marked two records as the same item",
  link_distinct: "Marked two records as not the same",
  mark_ready: "Marked the draft ready for the advisor",
  approve_version: "Approved a version",
  release: "Released to another role",
  answer_gap: "Answered a gap question",
  note_draft: "Drafted a note to someone outside the club",
  note_edit: "Edited a note to someone outside the club",
  note_approve: "Approved a note to someone outside the club",
  note_discard: "Discarded a draft note",
  note_ack: "A note was acknowledged",
};

const NOTE_FIELDS: [string, string][] = [
  ["recipient", "To"],
  ["new_contact", "New contact"],
  ["contact_details", "How to reach them"],
  ["message", "Message"],
];

/** Who did it, when the row has no member as actor: an acknowledgement comes from the signed link. */
export function actorFallback(action: string): string {
  return action === "note_ack" ? "Someone outside the club, from the signed link" : "The system";
}

const GAP_FIELDS: [string, string][] = [
  ["status", "Status"],
  ["trust_state", "Trust"],
  ["approver", "Approver"],
  ["next_due", "Next due"],
  ["start_by", "Start by"],
  ["access_level", "Access level"],
];

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

type Json = unknown;
export type AuditLike = { action: string; before: Json; after: Json };

const asRecord = (v: Json): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const show = (v: unknown): string => (v === null || v === undefined || v === "" ? "nothing" : String(v));

export type HistoryChange = { label: string; before: string; after: string };

/** What an audit row changed, for the actions that change something worth showing. */
export function describeChanges(row: AuditLike): HistoryChange[] {
  const before = asRecord(row.before);
  const after = asRecord(row.after);
  if (row.action === "edit") {
    return Object.keys(FIELD_LABELS)
      .filter((f) => f in after && show(before[f]) !== show(after[f]))
      .map((f) => ({ label: FIELD_LABELS[f], before: show(before[f]), after: show(after[f]) }));
  }
  if (row.action === "rule") {
    return [{ label: "Ruling", before: rulingLabel(before.ruling as string | null), after: rulingLabel(after.ruling as string | null) }];
  }
  if (row.action === "accept" || row.action === "reject" || row.action === "reopen") {
    return [{ label: "Review", before: show(before.review_state), after: show(after.review_state) }];
  }
  if (row.action === "link_same" || row.action === "link_distinct") {
    return [{ label: "Link", before: show(before.verdict), after: show(after.verdict) }];
  }
  if (row.action === "mark_ready") {
    return [{ label: "Items marked ready", before: "nothing", after: show(after.item_count) }];
  }
  if (row.action === "answer_gap") {
    return GAP_FIELDS.filter(([f]) => show(before[f]) !== show(after[f])).map(([f, label]) => ({ label, before: show(before[f]), after: show(after[f]) }));
  }
  if (row.action === "note_draft") {
    return [{ label: "Note", before: "nothing", after: `to ${show(after.counterparty)}, ${itemCount(after.items)}` }];
  }
  if (row.action === "note_edit") {
    const fields = NOTE_FIELDS.filter(([f]) => show(before[f]) !== show(after[f])).map(([f, label]) => ({ label, before: show(before[f]), after: show(after[f]) }));
    const b = itemCount(before.items);
    const a = itemCount(after.items);
    return b === a && sameItems(before.items, after.items) ? fields : [...fields, { label: "Items", before: b, after: a }];
  }
  if (row.action === "note_approve") {
    return [{ label: "Note", before: "draft", after: "approved" }];
  }
  if (row.action === "note_discard") {
    return [{ label: "Note", before: "draft", after: "discarded" }];
  }
  if (row.action === "approve_version") {
    return [{ label: "Version", before: "nothing", after: `number ${show(after.number)}` }];
  }
  return [];
}

const ids = (v: Json): string[] => (Array.isArray(v) ? v.map((x) => String(asRecord(x).obligation_id ?? "")) : []);
function itemCount(v: Json): string {
  const n = ids(v).length;
  return `${n} ${n === 1 ? "item" : "items"}`;
}
function sameItems(a: Json, b: Json): boolean {
  const x = ids(a).sort();
  const y = ids(b).sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
