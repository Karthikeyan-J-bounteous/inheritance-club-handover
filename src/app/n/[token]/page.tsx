import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckCircle2Icon } from "lucide-react";
import { LoadingBlock } from "@/components/feedback/loading-block";
import { NoteAckForm } from "@/components/notes/note-ack-form";
import { NoteDocument } from "@/components/notes/note-document";
import { formatIst } from "@/lib/format";
import { renderNote, type NoteItem } from "@/lib/notes/notes";
import { noteIdFromToken, noteService } from "@/lib/notes/server";
import { acknowledgeNote } from "./actions";

// The page a counterparty opens from the signed link. It needs no account: the server checks the
// link's signature, then reads this one note (and its acknowledgement) through a function only
// the service role may call. It never reads the ledger, the messages or any other note.

export const metadata: Metadata = {
  title: "A handover note",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type PublicNote = {
  id: string;
  club_name: string;
  sender_name: string;
  recipient: string;
  counterparty: string;
  new_contact: string;
  contact_details: string | null;
  message: string | null;
  items: NoteItem[];
  approved_at: string;
  ack: { name: string | null; created_at: string } | null;
};

function NotValid() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-dashed p-6 text-sm" data-testid="note-invalid">
      <h1 className="text-lg font-semibold">This link is not valid</h1>
      <p className="text-muted-foreground">It may be incomplete, or it was never sent by the club. Ask the person who sent it to send it again.</p>
    </div>
  );
}

async function NoteContent({ params }: { params: PageProps<"/n/[token]">["params"] }) {
  const { token } = await params;
  const id = noteIdFromToken(token);
  if (!id) return <NotValid />;
  const db = noteService();
  if (!db) return <p className="text-sm">The club’s server cannot open notes right now. Try again later.</p>;
  const { data, error } = await db.rpc("public_counterparty_note", { p_note: id });
  if (error) return <p role="alert" className="text-sm">Could not open the note. Try again in a minute.</p>;
  if (!data) return <NotValid />;
  const n = data as unknown as PublicNote;
  const doc = renderNote(n);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">A change of contact from {n.club_name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">A note for {n.recipient}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sent by {n.sender_name}, approved on {formatIst(n.approved_at)}.</p>
      </div>
      <NoteDocument doc={doc} from={n.sender_name} />
      <section aria-labelledby="ack-h" className="flex flex-col gap-3 rounded-2xl border p-5">
        <h2 id="ack-h" className="text-base font-semibold">Let the club know you have read it</h2>
        {n.ack ? (
          <p className="flex items-center gap-2 text-sm text-success" data-testid="note-acknowledged">
            <CheckCircle2Icon aria-hidden="true" className="size-4" />
            Acknowledged{n.ack.name ? ` by ${n.ack.name}` : ""} on {formatIst(n.ack.created_at)}. Thank you; the club can see this.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Pressing the button tells the club, and {n.new_contact} as the new contact, that this note reached you. It sends nothing else. Questions go to {n.new_contact}.
            </p>
            <NoteAckForm action={acknowledgeNote} token={token} />
          </>
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        Built by the club with Inheritance from its approved handover records, and approved by {n.sender_name}. This is a demo: every person and club in it is invented.
      </p>
    </div>
  );
}

export default function NotePage(props: PageProps<"/n/[token]">) {
  return (
    <main data-public-note className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <Suspense fallback={<LoadingBlock label="Opening the note…" variant="list" rows={3} />}>
        <NoteContent params={props.params} />
      </Suspense>
    </main>
  );
}
