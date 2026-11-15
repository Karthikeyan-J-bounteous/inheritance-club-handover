import type { NoteDoc } from "@/lib/notes/notes";

/** One note as the counterparty reads it. Used for the lead's preview, the handover and the signed page, so all three show the same words. */
export function NoteDocument({ doc, from }: { doc: NoteDoc; from?: string }) {
  return (
    <article className="flex flex-col gap-4 rounded-2xl border bg-card p-5 text-sm leading-relaxed sm:p-6" data-testid="note-document">
      <p className="font-medium">{doc.greeting}</p>
      {doc.intro.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {doc.sections.map((s) => (
        <section key={s.key} aria-label={s.title} className="flex flex-col gap-2" data-testid={`note-section-${s.key}`}>
          <h3 className="text-base font-semibold">{s.title}</h3>
          <ul className="flex flex-col gap-2">
            {s.lines.map((l, i) => (
              <li key={i} className="rounded-lg border-l-4 border-primary/40 bg-muted/40 px-3 py-2">
                <p className="font-medium">{l.text}</p>
                {l.detail.length > 0 && <p className="text-muted-foreground">{l.detail.join(" · ")}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {doc.message && (
        <div className="rounded-lg bg-accent/60 p-3" data-testid="note-message">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{from ? `A note from ${from}` : "A note from the sender"}</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{doc.message}</p>
        </div>
      )}
      <p>{doc.signoff}</p>
    </article>
  );
}
