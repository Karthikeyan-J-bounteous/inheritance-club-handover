// Pure view helpers for duties found from repetition (Phase 17): reading the occurrences that
// add_inferred_duty() stored (obligations.occurrences, copied into approved versions), and the
// words every page uses for them. Inputs are rows RLS already filtered.

export type OccurrenceView = {
  year: number;
  doneEvent: string;
  doneOn: string;
  startEvent: string | null;
  startedOn: string | null;
  days: number | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** The stored occurrences, oldest first; null for an item that was not found from repetition (or a bad shape). */
export function parseOccurrences(value: unknown): OccurrenceView[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: OccurrenceView[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const doneEvent = str(r.done_event);
    const doneOn = str(r.done_on);
    if (typeof r.year !== "number" || !doneEvent || !doneOn || !DAY.test(doneOn)) return null;
    const startedOn = str(r.started_on);
    out.push({
      year: r.year,
      doneEvent,
      doneOn,
      startEvent: str(r.start_event),
      startedOn: startedOn && DAY.test(startedOn) ? startedOn : null,
      days: typeof r.days === "number" ? r.days : null,
    });
  }
  return out.sort((a, b) => a.doneOn.localeCompare(b.doneOn));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2025-01-14" -> "14 Jan 2025". */
export function dayWords(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const and = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** "2025 and 2026". */
export const occurrenceYears = (occ: readonly OccurrenceView[]): string => and(occ.map((o) => String(o.year)));

/** One year's line: "Under way from 3 Jan 2025, done 14 Jan 2025: 11 days." */
export function occurrenceLine(o: OccurrenceView): string {
  if (!o.startedOn) return `Done ${dayWords(o.doneOn)}. No record shows when it was started.`;
  return `Under way from ${dayWords(o.startedOn)}, done ${dayWords(o.doneOn)}: ${o.days === 1 ? "1 day" : `${o.days} days`}.`;
}

/** What the duty rests on, in one paragraph. */
export function inferredExplainer(occ: readonly OccurrenceView[]): string {
  return (
    `No record says this repeats. It was done at about the same time of year in ${occurrenceYears(occ)}, so it is probably a yearly duty. ` +
    "Code found it from those dates, not a model, and its trust stays Inferred: only a record that states the duty can change that."
  );
}

export const INFERRED_CADENCE = "About once a year (inferred, not stated)";
export const INFERRED_BADGE = "Found from repetition";
