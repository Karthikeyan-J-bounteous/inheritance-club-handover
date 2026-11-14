import { Badge } from "@/components/ui/badge";
import { formatIst } from "@/lib/format";
import type { NoteAck, NoteRow } from "./note-data";

/** Where one counterparty's note stands: none, draft, approved, or acknowledged (and by whom). */
export function NoteState({ note, ack }: { note: NoteRow | undefined; ack: NoteAck | undefined }) {
  if (!note) return <Badge variant="outline">No note yet</Badge>;
  if (note.state === "draft") return <Badge variant="outline">Draft</Badge>;
  if (ack)
    return (
      <Badge variant="secondary" data-testid="note-state-acked">
        Acknowledged{ack.name ? ` by ${ack.name}` : ""}, {formatIst(ack.created_at)}
      </Badge>
    );
  return <Badge variant="secondary">Approved, not acknowledged yet</Badge>;
}
