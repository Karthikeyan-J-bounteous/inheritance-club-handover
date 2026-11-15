import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACCESS_LABELS } from "@/lib/access";
import { formatIst, formatIstDate, formatIstTime, istDayKey } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TIMELINE_PAGE_SIZE, likePattern, timelineHref, type TimelineParams } from "@/lib/timeline-query";
import { ErrorState } from "@/components/feedback/error-state";
import { EmptyState } from "@/components/feedback/empty-state";

const TYPE_LABELS = { whatsapp: "WhatsApp", trello: "Trello", minutes: "Minutes", statement: "Stated by the outgoing lead" } as const;

/** Every message this role may read, oldest first, in IST. RLS filters before anything renders. */
type TimelineRow = {
  id: string; author: string | null; ts: string | null; text: string; access_level: keyof typeof ACCESS_LABELS;
  meta: unknown; source_id: string; sources: { filename: string; type: keyof typeof TYPE_LABELS } | null;
};

export async function Timeline({ workspaceId, params: asked }: { workspaceId: string; params: TimelineParams }) {
  let params = asked;
  const supabase = await createSupabaseServerClient();
  const filteredQuery = (columns: string, head = false) => {
    let query = supabase.from("events").select(columns, { count: "exact", head }).eq("workspace_id", workspaceId);
    if (params.source) query = query.eq("source_id", params.source);
    if (params.q) query = query.ilike("text", likePattern(params.q));
    return query;
  };
  const pageOf = (page: number) => {
    const from = (page - 1) * TIMELINE_PAGE_SIZE;
    return filteredQuery("id, author, ts, text, access_level, meta, source_id, sources(filename, type)")
      .order("ts", { ascending: true, nullsFirst: false }).order("id").range(from, from + TIMELINE_PAGE_SIZE - 1)
      .overrideTypes<TimelineRow[], { merge: false }>();
  };

  const [first, { data: sources }] = await Promise.all([
    pageOf(params.page),
    supabase.from("sources").select("id, filename").eq("workspace_id", workspaceId).order("filename"),
  ]);
  let { data: events, count, error } = first;
  // A page past the end (an old link, or a hand-typed number): show the last page instead.
  let pastEnd = false;
  if (error?.code === "PGRST103" && params.page > 1) {
    const { count: n } = await filteredQuery("id", true);
    const last = Math.max(1, Math.ceil((n ?? 0) / TIMELINE_PAGE_SIZE));
    ({ data: events, count, error } = await pageOf(last));
    params = { ...params, page: last };
    pastEnd = true;
  }

  if (error) return <ErrorState title="Could not load the timeline">Nothing was changed. Try again in a minute, or reload the page.</ErrorState>;
  const total = count ?? 0;
  const filtered = Boolean(params.source || params.q);

  if (total === 0 && !filtered) {
    return (
      <EmptyState title="No messages yet" body="Nothing you are allowed to read has been imported. Add a WhatsApp chat, Trello board or minutes and every message appears here.">
        <Button asChild size="sm">
          <Link href="/import">Add files</Link>
        </Button>
      </EmptyState>
    );
  }

  const pages = Math.max(1, Math.ceil(total / TIMELINE_PAGE_SIZE));
  const rows = events ?? [];
  const dayOf = (ts: string | null) => (ts ? istDayKey(ts) : "undated");
  return (
    <div className="flex flex-col gap-4">
      <form method="get" action="/messages" className="flex flex-wrap items-end gap-3 text-sm" role="search" aria-label="Filter the timeline">
        <label className="flex flex-col gap-1">
          File
          <select name="source" defaultValue={params.source ?? ""} className="rounded-md border bg-background px-2 py-1">
            <option value="">All files</option>
            {(sources ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.filename}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Contains
          <input name="q" defaultValue={params.q} className="rounded-md border bg-background px-2 py-1" placeholder="permission letter" />
        </label>
        <Button type="submit" size="sm" variant="outline">
          Apply
        </Button>
        {filtered && (
          <Link href={timelineHref({ source: null, q: "", page: 1 }, {})} className="underline">
            Clear filters
          </Link>
        )}
      </form>

      <p className="text-sm text-muted-foreground" role="status">
        {total === 0
          ? "No entries match these filters."
          : `${pastEnd ? "That page is past the end, so this is the last one. " : ""}${total} ${total === 1 ? "entry" : "entries"} you can read${filtered ? " match" : ""}. Page ${params.page} of ${pages}. Times are IST.`}
      </p>

      <ol className="flex flex-col gap-2" data-testid="timeline">
        {rows.map((e, i) => {
          const meta = (e.meta ?? {}) as Record<string, unknown>;
          const header = i === 0 || dayOf(rows[i - 1].ts) !== dayOf(e.ts);
          return (
            <li key={e.id} className="flex flex-col gap-2">
              {header && (
                <h3 className="mt-3 border-b pb-1 text-sm font-medium">{e.ts ? formatIstDate(e.ts) : "Undated"}</h3>
              )}
              <article className="rounded-md border p-3 text-sm" aria-label={`${e.author ?? "Unknown"}, ${formatIst(e.ts)}`}>
                <div className="mb-1 flex flex-wrap items-center gap-2 text-muted-foreground">
                  <span className="font-mono tabular-nums">{meta.dateOnly ? "Meeting" : formatIstTime(e.ts)}</span>
                  <span className="font-medium text-foreground">{e.author ?? "Unknown"}</span>
                  <Badge variant="outline">
                    {e.sources ? `${TYPE_LABELS[e.sources.type]} · ${e.sources.filename}` : "Source"}
                  </Badge>
                  <Badge variant={e.access_level === "everyone" ? "outline" : "secondary"}>{ACCESS_LABELS[e.access_level]}</Badge>
                  {meta.movedToDone === true && <Badge variant="secondary">Marked done on Trello</Badge>}
                  {meta.edited === true && <span>(edited)</span>}
                </div>
                <p className="whitespace-pre-wrap break-words">{e.text}</p>
              </article>
            </li>
          );
        })}
      </ol>

      {pages > 1 && (
        <nav aria-label="Timeline pages" className="flex items-center gap-3 text-sm">
          {params.page > 1 ? (
            <Link className="underline" href={timelineHref(params, { page: params.page - 1 })}>
              Previous page
            </Link>
          ) : (
            <span className="text-muted-foreground">Previous page</span>
          )}
          {params.page < pages ? (
            <Link className="underline" href={timelineHref(params, { page: params.page + 1 })}>
              Next page
            </Link>
          ) : (
            <span className="text-muted-foreground">Next page</span>
          )}
        </nav>
      )}
    </div>
  );
}
