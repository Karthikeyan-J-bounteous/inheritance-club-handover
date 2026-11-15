import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2Icon } from "lucide-react";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingBlock } from "@/components/feedback/loading-block";
import { SignInPrompt } from "@/components/feedback/sign-in-prompt";
import { NextStepBar } from "@/components/next-step-bar";
import { CopyLink } from "@/components/notes/copy-link";
import { asNote, loadNotes, NOTE_SELECT } from "@/components/notes/note-data";
import { NoteDocument } from "@/components/notes/note-document";
import { NoteEditor } from "@/components/notes/note-editor";
import { NoteState } from "@/components/notes/note-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatIst } from "@/lib/format";
import { renderNote } from "@/lib/notes/notes";
import { notePath } from "@/lib/notes/server";
import { getViewer } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { approveNote, discardNote, saveNote } from "../actions";

export const metadata: Metadata = { title: "Note · Inheritance" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function NotFound() {
  return (
    <ErrorState title="Note not found">
      It does not exist, was discarded, or your role may not read it.{" "}
      <Link className="underline" href="/handover/notes">
        See all notes
      </Link>
      .
    </ErrorState>
  );
}

async function NoteContent({ params, searchParams }: { params: PageProps<"/handover/notes/[id]">["params"]; searchParams: PageProps<"/handover/notes/[id]">["searchParams"] }) {
  const { id } = await params;
  const justApproved = (await searchParams).approved === "1";
  let viewer;
  try {
    viewer = await getViewer();
  } catch {
    return <ErrorState title="Could not reach the database" />;
  }
  if (!viewer) return <SignInPrompt what="read this note" />;
  if (!viewer.membership) return <p>Your account is not a member of a workspace.</p>;
  if (!UUID.test(id)) return <NotFound />;
  const { role, workspaceId } = viewer.membership;
  const lead = role === "outgoing_lead";
  const supabase = await createSupabaseServerClient();
  const [noteRes, ackRes] = await Promise.all([
    supabase.from("counterparty_notes").select(NOTE_SELECT).eq("id", id).maybeSingle(),
    supabase.from("counterparty_note_acks").select("note_id, name, created_at").eq("note_id", id).maybeSingle(),
  ]);
  if (noteRes.error || ackRes.error) return <ErrorState title="Could not load the note">Nothing was changed. Try again in a minute, or reload the page.</ErrorState>;
  if (!noteRes.data) return <NotFound />;
  const note = asNote(noteRes.data);
  const ack = ackRes.data ?? undefined;

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button asChild variant="ghost" size="sm">
        <Link href="/handover/notes">← All notes</Link>
      </Button>
      <NoteState note={note} ack={ack} />
    </div>
  );

  if (note.state === "draft" && lead) {
    const all = await loadNotes(supabase, workspaceId);
    if (all.error) return <ErrorState title="Could not load the note">Nothing was changed. Try again in a minute, or reload the page.</ErrorState>;
    const party = all.candidates.find((c) => c.key === note.party_key);
    return (
      <div className="flex flex-col gap-4">
        {header}
        <h2 className="text-xl font-semibold">Draft note to {note.counterparty}</h2>
        {all.version && note.version_id !== all.version.id && (
          <p role="status" className="rounded-lg bg-warning-soft px-3 py-2 text-sm">
            Version {all.version.number} was approved after this draft was saved. Save the draft to bring its items up to date before approving it.
          </p>
        )}
        <NoteEditor
          note={{
            id: note.id,
            counterparty: note.counterparty,
            recipient: note.recipient,
            new_contact: note.new_contact,
            contact_details: note.contact_details,
            message: note.message,
            club_name: note.club_name,
            sender_name: note.sender_name,
            selected: note.items.map((i) => i.obligation_id),
          }}
          items={party?.items ?? []}
          levels={all.levels}
          stale={Boolean(all.version && note.version_id !== all.version.id)}
          save={saveNote}
          approve={approveNote}
          discard={discardNote}
        />
      </div>
    );
  }

  const doc = renderNote(note);
  const path = note.state === "approved" && lead ? notePath(note.id) : null;
  return (
    <div className="flex flex-col gap-4">
      {header}
      {justApproved && note.state === "approved" && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success" data-testid="note-approved">
          <CheckCircle2Icon aria-hidden="true" className="size-4" />
          Approved. It can no longer change. Send {note.counterparty} the link below.
        </p>
      )}
      <h2 className="text-xl font-semibold">
        {note.state === "draft" ? "Draft note" : "Note"} to {note.counterparty}
      </h2>
      <p className="text-sm text-muted-foreground">
        {note.state === "approved" ? `Approved by ${note.sender_name} on ${formatIst(note.approved_at)}.` : "A draft: the outgoing lead has not approved it, and nobody outside the club can see it."}
        {role === "incoming_lead" ? ` It names you (${note.new_contact}) as their contact now.` : ""}
      </p>
      {note.state === "approved" && lead && (
        <section className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-accent/40 p-4" aria-label="The link">
          {path ? <CopyLink path={path} who={note.counterparty} /> : <p className="text-sm">The server has no signing key, so it cannot make the link. Set SUPABASE_SECRET_KEY on the server.</p>}
          <p className="text-xs text-muted-foreground">
            The link is signed by the club’s server, so it cannot be guessed or changed. It shows this note and nothing else from the club. Opening it in this browser works too: the page ignores who is signed in.
          </p>
        </section>
      )}
      <NoteDocument doc={doc} from={note.sender_name} />
      {note.state === "approved" &&
        (ack ? (
          <NextStepBar label="Back to the handover" href="/handover">
            {note.counterparty} acknowledged it{ack.name ? ` (as ${ack.name})` : ""} on {formatIst(ack.created_at)}. This shows on the handover too.
          </NextStepBar>
        ) : (
          <NextStepBar label="Back to the handover" href="/handover">
            {lead ? `Waiting for ${note.counterparty} to acknowledge it. In this demo, open the link yourself and press "I have read this note".` : `Waiting for ${note.counterparty} to acknowledge it.`}
          </NextStepBar>
        ))}
    </div>
  );
}

export default function NotePage(props: PageProps<"/handover/notes/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader title="Note to someone outside the club" purpose="One change-of-contact note: what the club still owes them and who to contact now, built from approved items only. The outgoing lead approves it and sends the signed link." />
      <Suspense fallback={<LoadingBlock label="Loading the note…" variant="list" rows={3} />}>
        <NoteContent params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
