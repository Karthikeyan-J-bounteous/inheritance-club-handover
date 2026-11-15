import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatIst } from "@/lib/format";
import { inferredExplainer, INFERRED_BADGE, occurrenceLine, type OccurrenceView } from "@/lib/repeats-view";

/** A quoted message, as far as the viewer may read it (RLS decides what is in the map). */
export type OccurrenceQuote = { quote: string; author?: string | null; ts?: string | null; where?: string | null; href?: string };

function Quote({ label, q }: { label: string; q: OccurrenceQuote | undefined }) {
  if (!q) return null;
  return (
    <div className="mt-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <blockquote className="border-l-2 pl-3">“{q.quote}”</blockquote>
      <p className="mt-0.5 pl-3 text-xs text-muted-foreground">
        {q.author || q.ts ? `${q.author ?? "Unknown"}${q.ts ? `, ${formatIst(q.ts)}` : ""}` : "Quote shared with your role"}
        {q.where ? ` · ${q.where}` : ""} · quote checked against the message
        {q.href && (
          <>
            {" · "}
            <Link href={q.href} className="underline">
              Open source message
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

/**
 * The years a duty found from repetition was done, each with its first record and its done
 * record. Used instead of the usual list of quotes: these quotes are all the duty rests on.
 */
export function Occurrences({ occurrences, quotes, compact = false }: { occurrences: readonly OccurrenceView[]; quotes: ReadonlyMap<string, OccurrenceQuote>; compact?: boolean }) {
  return (
    <div className="mt-2 rounded-lg border border-dashed border-primary/40 bg-accent/40 p-3" data-testid="occurrences">
      <p className="flex flex-wrap items-center gap-2 font-medium">
        <Badge variant="secondary">{INFERRED_BADGE}</Badge>
        Not written down anywhere
      </p>
      <p className="mt-1 text-muted-foreground">{inferredExplainer(occurrences)}</p>
      <ol className="mt-2 flex flex-col gap-2" aria-label="When it was done">
        {occurrences.map((o) => (
          <li key={o.doneEvent} className="rounded-md bg-card p-2" data-testid="occurrence">
            <p>
              <strong>{o.year}</strong>: {occurrenceLine(o)}
            </p>
            {!compact && o.startEvent && <Quote label="First record that it was under way" q={quotes.get(o.startEvent)} />}
            <Quote label="Record that it was done" q={quotes.get(o.doneEvent)} />
          </li>
        ))}
      </ol>
    </div>
  );
}
