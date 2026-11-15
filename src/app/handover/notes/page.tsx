import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingBlock } from "@/components/feedback/loading-block";
import { SignInPrompt } from "@/components/feedback/sign-in-prompt";
import { NextStepBar } from "@/components/next-step-bar";
import { loadNotes } from "@/components/notes/note-data";
import { NoteState } from "@/components/notes/note-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { promiseState, type Counterparty } from "@/lib/notes/notes";
import { getViewer } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { draftNote } from "./actions";

export const metadata: Metadata = { title: "Notes to people outside the club · Inheritance" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function counts(c: Counterparty): string {
  const owed = c.items.filter((i) => i.kind === "commitment" && promiseState(i) !== "done").length;
  const done = c.items.filter((i) => i.kind === "commitment" && promiseState(i) === "done").length;
  const each = c.items.filter((i) => i.kind === "recurring").length;
  return [owed && `${owed} still owed`, each && `${plural(each, "duty", "duties")} they approve`, done && `${done} done`].filter(Boolean).join(" · ");
}

async function NotesContent() {
  let viewer;
  try {
    viewer = await getViewer();
  } catch {
    return <ErrorState title="Could not reach the database" />;
  }
  if (!viewer) return <SignInPrompt what="see the notes to people outside the club" />;
  if (!viewer.membership) return <p>Your account is not a member of a workspace.</p>;
  const { role, workspaceId } = viewer.membership;
  const supabase = await createSupabaseServerClient();
  const { version, candidates, notes, acks, error } = await loadNotes(supabase, workspaceId);
  if (error) return <ErrorState title="Could not load the notes">Nothing was changed. Try again in a minute, or reload the page.</ErrorState>;
  const lead = role === "outgoing_lead";

  if (!version) {
    return (
      <EmptyState title="Nothing is approved yet" body="Notes are built from the approved handover only. Once the faculty advisor approves a version, the people outside the club it names appear here.">
        <Button asChild size="sm">
          <Link href="/">See the next step</Link>
        </Button>
      </EmptyState>
    );
  }

  const byKey = new Map(notes.map((n) => [n.party_key, n]));
  // Notes for someone no longer in the latest version still show, after the current ones.
  const orphans = notes.filter((n) => !candidates.some((c) => c.key === n.party_key));
  const approved = notes.filter((n) => n.state === "approved");
  const acked = approved.filter((n) => acks.has(n.id));

  if (!lead && notes.length === 0) {
    return (
      <EmptyState
        title="No notes have been sent yet"
        body={`The outgoing lead writes and approves these. ${candidates.length > 0 ? `Version ${version.number} names ${plural(candidates.length, "person or office", "people or offices")} outside the club.` : ""}`}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground" data-testid="notes-summary">
        From version {version.number}: {plural(candidates.length, "person or office", "people or offices")} outside the club {candidates.length === 1 ? "is" : "are"} named. {plural(approved.length, "note")} approved, {acked.length} acknowledged.
      </p>
      {lead && candidates.length === 0 && (
        <EmptyState title="Nobody outside the club is named" body="No approved item that the incoming lead may read is owed to a person or office outside the club. Finance and private items are never put in a note." />
      )}
      <ul className="flex flex-col gap-3" aria-label="People outside the club">
        {candidates.map((c) => {
          const note = byKey.get(c.key);
          if (!lead && !note) return null;
          return (
            <li key={c.key} className="flex flex-col gap-2 rounded-2xl border p-4" data-testid="note-party">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-sm text-muted-foreground">{counts(c)}</p>
                </div>
                <NoteState note={note} ack={note ? acks.get(note.id) : undefined} />
              </div>
              <div>
                {note ? (
                  <Button asChild size="sm" variant={note.state === "draft" && lead ? "default" : "outline"}>
                    <Link href={`/handover/notes/${note.id}`}>{note.state === "draft" ? (lead ? "Edit the draft" : "Read the draft") : lead ? "Read it and get the link" : "Read the note"}</Link>
                  </Button>
                ) : (
                  <ActionForm action={draftNote} submitLabel={`Draft a note to ${c.name}`} pendingLabel="Drafting…" className="flex flex-col gap-2">
                    <input type="hidden" name="counterparty" value={c.name} />
                  </ActionForm>
                )}
              </div>
            </li>
          );
        })}
        {orphans.map((n) => (
          <li key={n.id} className="flex flex-col gap-2 rounded-2xl border border-dashed p-4" data-testid="note-party">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{n.counterparty}</p>
                <p className="text-sm text-muted-foreground">Not named in the latest version.</p>
              </div>
              <NoteState note={n} ack={acks.get(n.id)} />
            </div>
            <div>
              <Button asChild size="sm" variant="outline">
                <Link href={`/handover/notes/${n.id}`}>Read the note</Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <NextStepBar label="Back to the handover" href="/handover">
        {lead ? "When a note is approved, send its link. Their acknowledgement shows here and on the handover." : "Acknowledgements also show on the handover."}
      </NextStepBar>
    </div>
  );
}

export default function NotesPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        title="Notes to people outside the club"
        purpose="A short change-of-contact note for each person or office the handover names: what the club still owes them, by when, and who to contact now. Built from approved items only; the outgoing lead approves each one and sends its link."
      />
      <Suspense fallback={<LoadingBlock label="Loading the notes…" variant="list" rows={4} />}>
        <NotesContent />
      </Suspense>
    </main>
  );
}
