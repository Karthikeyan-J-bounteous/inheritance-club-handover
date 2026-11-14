import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NoteState } from "@/components/notes/note-state";
import type { NoteAck, NoteRow } from "@/components/notes/note-data";
import { formatIst } from "@/lib/format";
import type { AppRole } from "@/lib/access";

/**
 * The handover's view of the notes sent to people outside the club, and whether each was
 * acknowledged. Rows come through RLS: approved notes for any role whose clearance covers them,
 * drafts only for the roles that read the working ledger.
 */
export function HandoverNotes({ role, notes, acks, toWrite }: { role: AppRole; notes: NoteRow[]; acks: Map<string, NoteAck>; toWrite: number }) {
  const lead = role === "outgoing_lead";
  const sent = notes.filter((n) => n.state === "approved");
  return (
    <section aria-labelledby="notes-h" className="flex flex-col gap-3" data-testid="handover-notes-section">
      <div>
        <h2 id="notes-h" className="text-xl font-semibold">Notes to people outside the club</h2>
        <p className="text-sm text-muted-foreground">
          {role === "incoming_lead"
            ? "The outgoing lead told these people and offices that you are their contact now, and what the club still owes them."
            : "Change-of-contact notes, built from approved items only, so people outside the club learn of the handover too."}
        </p>
      </div>
      {sent.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="handover-notes-empty">
          No note has been sent yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Notes sent" data-testid="handover-notes">
          {sent.map((n) => {
            const ack = acks.get(n.id);
            return (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm" data-testid="handover-note">
                <div>
                  <p className="font-medium">{n.counterparty}</p>
                  <p className="text-xs text-muted-foreground" data-testid="handover-note-ack">
                    {ack
                      ? `Acknowledged${ack.name ? ` by ${ack.name}` : ""} on ${formatIst(ack.created_at)}.`
                      : `Sent ${formatIst(n.approved_at)}. Not acknowledged yet.`}{" "}
                    New contact: {n.new_contact}.
                  </p>
                </div>
                <span className="flex flex-wrap items-center gap-2">
                  <NoteState note={n} ack={ack} />
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/handover/notes/${n.id}`}>Read the note</Link>
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {lead && (
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="sm" variant={toWrite > 0 && sent.length === 0 ? "default" : "outline"}>
            <Link href="/handover/notes">{toWrite > 0 ? (sent.length === 0 ? "Write the notes" : "Write more notes") : "See all notes"}</Link>
          </Button>
          {toWrite > 0 && (
            <span className="text-sm text-muted-foreground">
              {toWrite} {toWrite === 1 ? "person or office" : "people or offices"} outside the club {toWrite === 1 ? "has" : "have"} no approved note yet.
            </span>
          )}
        </div>
      )}
    </section>
  );
}
