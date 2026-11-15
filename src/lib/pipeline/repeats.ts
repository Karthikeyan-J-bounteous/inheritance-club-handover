// Duties nobody wrote down (Round 3, improvement 1). Code, not a model, finds a task that was
// done at about the same time of year in two or more past years, even though no record says it
// repeats. Each such duty rests only on its occurrences: the first record that the task was
// done each year, and the first record that it was under way. Their quotes are verbatim parts
// of those messages (built by code, so they verify), and they are stored as inferred evidence,
// so the trust rule labels the duty Inferred, never as fact. The start-by date comes from how
// long past occurrences took. Mirrored in SQL by add_inferred_duty() (migration 0024), which
// repeats every check that matters for safety: quotes, one visibility, a year apart, the dates.

import { istDayKey } from "../format.ts";
import { visibilityKey, type PipelineEvent } from "./extract.ts";
import { buildIdf, byTime, timeOf, type Idf } from "./related.ts";
import { contentTokens, sentences } from "./text.ts";
import { normaliseForQuote, verifyQuote } from "./verify.ts";

/** "About the same time of year": done dates a whole number of years apart, give or take this. */
export const SAME_TIME_DAYS = 31;
/** How far before it was done to look for the first record that it was under way. */
export const START_WINDOW_DAYS = 60;
/** Two records are the same task when they share at least this many rare words... */
export const MIN_SHARED_WORDS = 2;
/** ...and those words carry at least this share of the smaller record's weight. */
export const MIN_SIMILARITY = 0.5;
/** Two repeating clusters side by side every year need less: being side by side is already strong. */
export const MERGE_SIMILARITY = 0.35;
/** A stated duty covers a repeated task when its words carry this share of the task's words. */
export const STATED_SHARE = 0.5;

const DAY_MS = 86_400_000;
const YEAR_DAYS = 365.25;

/** A report that something was done. Broad, because a year apart and the same words also have to hold. */
const DONE_WORDS = /\b(sent|submitted|booked|returned|renewed|paid|reimbursed|filed|printed|collected|received|signed|approved|confirmed|delivered|completed|finished|done|are up|is up|put up)\b/i;
/** Not a report of it being done: a negation, a wait, a question. */
const NOT_DONE = /\b(not|never|nobody|no one|still|yet|pending|waiting|asking)\b|n't\b|\?\s*$/i;
const HEDGE = /\b(maybe|might|perhaps|probably|will see|not sure|someday)\b/i;
/** Not a report either: a promise, plan or rule ("has to be approved"). */
const NOT_REPORT = /\b(i'll|i will|we'll|we will|will|going to|need to|needs to|have to|has to|must|should|plan to|let's)\b/i;
/** A promise or plan by someone: the start of a task. A rule ("has to be approved") is not one. */
const PROMISE = /\b(i'll|i will|we'll|we will|will|going to|plan to|let's)\b/i;
const TRELLO_DONE = /^Moved card "(.+)" from "[^"]*" to "(?:Done|Completed?)"$|^Marked card "(.+)" as complete$/;
const TRELLO_CARD = /^Card: (.+)$/m;

export type RepeatQuote = { event: PipelineEvent; quote: string };

export type Occurrence = {
  /** The IST calendar year it was done in. */
  year: number;
  done: RepeatQuote;
  /** The first record that it was under way (a promise, or the Trello card being made), if any. */
  start: RepeatQuote | null;
  doneDay: string;
  startDay: string | null;
  /** IST calendar days from start to done; null without a start. */
  days: number | null;
};

export type RepeatedDuty = {
  description: string;
  occurrences: Occurrence[];
  /** The longest an occurrence took, in days; null when no occurrence has a start. */
  leadDays: number | null;
  nextDue: string;
  startBy: string | null;
  cadence: string;
  leadTime: string | null;
  basis: string;
  /** The words the occurrences share (stemmed), for tests and for the stated-duty check. */
  core: string[];
};

/** A duty the records state (from the model's duty finder), to avoid adding it a second time. */
export type StatedDuty = { text: string; eventIds: readonly string[] };

export type RepeatsDropReason = "repeat_already_stated" | "repeat_quote_not_found";

const isTrelloDone = (e: PipelineEvent) => e.sourceType === "trello" && TRELLO_DONE.test(e.text);

/** A record that reports the task done: a Trello card moved to Done, or a plain report in chat or minutes. */
export function isDoneRecord(e: PipelineEvent): boolean {
  if (!e.ts) return false;
  if (e.sourceType === "trello") return isTrelloDone(e);
  return doneSentence(e.text) !== null;
}

/** The first sentence of a message that reports something done, or null. */
export function doneSentence(text: string): string | null {
  return sentences(text).find((s) => DONE_WORDS.test(s) && !NOT_DONE.test(s) && !HEDGE.test(s) && !NOT_REPORT.test(s)) ?? null;
}

/** The first sentence of a message that promises or plans something, or null. */
export function promiseSentence(text: string): string | null {
  return sentences(text).find((s) => PROMISE.test(s) && !HEDGE.test(s) && !/\?\s*$/.test(s)) ?? null;
}

/** The task a promise names: "I'll send the proposal to X by 20 January." -> "Send the proposal to X". */
export function taskPhrase(promise: string): string | null {
  const m = promise.match(/\b(?:i'll|i will|we'll|we will|will|going to|plan to|let's)\s+(.+)$/i);
  if (!m) return null;
  const task = m[1]
    .replace(/\s+(?:by|before|till|until|latest by)\s+.*$/i, "")
    .replace(/[\s.,!;:]+$/, "")
    .trim();
  return task.split(/\s+/).length >= 2 ? task.charAt(0).toUpperCase() + task.slice(1) : null;
}

const cardName = (e: PipelineEvent): string | null => {
  const m = e.text.match(TRELLO_DONE);
  return m ? (m[1] ?? m[3] ?? null) : null;
};

/** Similarity words: content words without bare numbers (years and dates would join unrelated cards). */
const words = (text: string): Set<string> => new Set([...contentTokens(text)].filter((w) => !/^\d+$/.test(w) && w !== "due"));

const weightOf = (ws: Iterable<string>, idf: Idf) => {
  let n = 0;
  for (const w of ws) n += idf.weight(w);
  return n;
};

/** Shared words, and their weight as a share of the lighter record's (an overlap coefficient). */
function similarity(a: ReadonlySet<string>, b: ReadonlySet<string>, idf: Idf): { shared: string[]; score: number } {
  const shared = [...a].filter((w) => b.has(w));
  const least = Math.min(weightOf(a, idf), weightOf(b, idf));
  return { shared, score: least > 0 ? weightOf(shared, idf) / least : 0 };
}

const daysBetween = (fromDay: string, toDay: string) => Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / DAY_MS);

/** Done days a whole number (at least one) of years apart, within SAME_TIME_DAYS. */
export function aboutAYearApart(dayA: string, dayB: string): boolean {
  const gap = Math.abs(daysBetween(dayA, dayB));
  const years = Math.round(gap / YEAR_DAYS);
  return years >= 1 && Math.abs(gap - years * YEAR_DAYS) <= SAME_TIME_DAYS;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const humanDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

/** The same month and day in a later year (28 Feb for 29 Feb), the first one after `today`. */
export function nextAnniversary(lastDay: string, today: string): string {
  const [y, m, d] = lastDay.split("-").map(Number);
  for (let year = y + 1; ; year++) {
    const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
    const day = `${year}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
    if (day > today) return day;
  }
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** The words shown for a duty's cadence, lead time and next-due basis. Pure, so the SQL test can compare. */
export function repeatWording(occurrences: readonly Pick<Occurrence, "year" | "doneDay">[], leadDays: number | null) {
  const years = occurrences.map((o) => String(o.year));
  return {
    cadence: `about once a year (done in ${list(years)}; no record says it repeats)`,
    leadTime: leadDays === null ? null : `${leadDays} days (the longest it took before)`,
    basis:
      `Inferred, not stated: done at about this time in ${list(years)} (${list(occurrences.map((o) => humanDay(o.doneDay)))}). ` +
      `Due a year after it was last done` +
      (leadDays === null ? "; no record shows when it was started." : `; start ${leadDays} days ahead, the longest it took from the first record to done.`),
  };
}

/**
 * Tasks done at about the same time in two or more years, that no stated duty covers.
 * `events` are the messages the caller may read; work is done per visibility (as duties are),
 * so a duty's records all share one access level, and it is stored at that level.
 * `today` is an IST calendar day.
 */
export function findRepeatedDuties(
  events: readonly PipelineEvent[],
  stated: readonly StatedDuty[],
  today: string,
): { duties: RepeatedDuty[]; dropped: Partial<Record<RepeatsDropReason, number>> } {
  const dropped: Partial<Record<RepeatsDropReason, number>> = {};
  const drop = (r: RepeatsDropReason) => (dropped[r] = (dropped[r] ?? 0) + 1);
  const idf = buildIdf(events);
  const statedWords = stated.map((d) => ({ words: words(d.text), events: new Set(d.eventIds) }));

  const groups = new Map<string, PipelineEvent[]>();
  for (const e of [...events].sort(byTime)) groups.set(visibilityKey(e), [...(groups.get(visibilityKey(e)) ?? []), e]);

  const duties: RepeatedDuty[] = [];
  for (const group of groups.values()) {
    // A card's words are all of its records up to then: a "Moved to Done" line names only the card.
    const cardText = new Map<string, string>();
    const recordWords = new Map<string, Set<string>>();
    for (const e of group) {
      if (e.sourceType === "trello" && e.threadId) cardText.set(e.threadId, `${cardText.get(e.threadId) ?? ""}\n${e.text}`);
      recordWords.set(e.id, words(e.sourceType === "trello" && e.threadId ? cardText.get(e.threadId)! : e.text));
    }

    const done = group.filter(isDoneRecord);
    const dayOf = (e: PipelineEvent) => istDayKey(e.ts!);

    // Pairs of done records about a year apart with the same rare words; clusters are their connected parts.
    const parent = done.map((_, i) => i);
    const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    for (let i = 0; i < done.length; i++) {
      for (let j = i + 1; j < done.length; j++) {
        if (!aboutAYearApart(dayOf(done[i]), dayOf(done[j]))) continue;
        const s = similarity(recordWords.get(done[i].id)!, recordWords.get(done[j].id)!, idf);
        if (s.shared.length >= MIN_SHARED_WORDS && s.score >= MIN_SIMILARITY) parent[root(j)] = root(i);
      }
    }
    const byRoot = new Map<number, PipelineEvent[]>();
    done.forEach((e, i) => byRoot.set(root(i), [...(byRoot.get(root(i)) ?? []), e]));

    // One occurrence per year: the earliest done record in each year after the cluster's first.
    const yearly = (members: readonly PipelineEvent[]): PipelineEvent[] => {
      const first = dayOf(members[0]);
      const slots = new Map<number, PipelineEvent>();
      for (const e of members) {
        const slot = Math.round(daysBetween(first, dayOf(e)) / YEAR_DAYS);
        if (!slots.has(slot)) slots.set(slot, e);
      }
      return [...slots.entries()].sort((a, b) => a[0] - b[0]).map(([, e]) => e);
    };
    const coreOf = (kept: readonly PipelineEvent[]) => {
      const core = new Set<string>();
      for (let i = 0; i < kept.length; i++) {
        for (let j = i + 1; j < kept.length; j++) for (const w of recordWords.get(kept[i].id)!) if (recordWords.get(kept[j].id)!.has(w)) core.add(w);
      }
      return core;
    };
    let clusters = [...byRoot.values()].filter((m) => yearly(m).length >= 2).map((m) => ({ members: m, kept: yearly(m), core: coreOf(yearly(m)) }));

    // Two steps of one task ("renewal submitted", then "Dean signed the renewal") repeat side by
    // side: each year's records are within a month and a half, with the same words. One duty.
    for (let merged = true; merged; ) {
      merged = false;
      outer: for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const [a, b] = [clusters[i], clusters[j]];
          const s = similarity(a.core, b.core, idf);
          const sideBySide = (x: typeof a, y: typeof a) => x.kept.every((e) => y.kept.some((f) => Math.abs(daysBetween(dayOf(e), dayOf(f))) <= 45));
          if (s.shared.length >= MIN_SHARED_WORDS && s.score >= MERGE_SIMILARITY && (sideBySide(a, b) || sideBySide(b, a))) {
            const members = [...a.members, ...b.members].sort(byTime);
            const kept = yearly(members);
            clusters = [...clusters.filter((_, k) => k !== i && k !== j), { members, kept, core: new Set([...a.core, ...b.core]) }];
            merged = true;
            break outer;
          }
        }
      }
    }

    for (const { kept, core } of clusters) {

      // The first record that each occurrence was under way: the same Trello card, or a promise with the task's words.
      const occurrences: Occurrence[] = [];
      let missingQuote = false;
      for (const d of kept) {
        const doneQuote = isTrelloDone(d) ? d.text : doneSentence(d.text);
        if (!doneQuote || !verifyQuote(doneQuote, d.text).ok) {
          missingQuote = true;
          break;
        }
        const from = timeOf(d) - START_WINDOW_DAYS * DAY_MS;
        const startEvent = group.find((e) => {
          const t = timeOf(e);
          if (e.id === d.id || t < from || t > timeOf(d)) return false;
          if (d.sourceType === "trello" && e.sourceType === "trello" && e.threadId === d.threadId) return TRELLO_CARD.test(e.text);
          if (e.sourceType === "trello") return false;
          const promise = promiseSentence(e.text);
          return promise !== null && [...words(promise)].filter((w) => core.has(w)).length >= MIN_SHARED_WORDS;
        });
        const startQuote = startEvent ? (startEvent.sourceType === "trello" ? startEvent.text.match(TRELLO_CARD)![0] : promiseSentence(startEvent.text)!) : null;
        const doneDay = dayOf(d);
        const startDay = startEvent ? dayOf(startEvent) : null;
        occurrences.push({
          year: Number(doneDay.slice(0, 4)),
          done: { event: d, quote: doneQuote },
          start: startEvent && startQuote ? { event: startEvent, quote: startQuote } : null,
          doneDay,
          startDay,
          days: startDay ? daysBetween(startDay, doneDay) : null,
        });
      }
      if (missingQuote) {
        drop("repeat_quote_not_found");
        continue;
      }

      // Already a stated duty? It cites one of these records, or its words cover the task's.
      const cited = new Set(occurrences.flatMap((o) => [o.done.event.id, ...(o.start ? [o.start.event.id] : [])]));
      const coreWeight = weightOf(core, idf);
      const isStated = statedWords.some(
        (s) => [...cited].some((id) => s.events.has(id)) || (coreWeight > 0 && weightOf([...core].filter((w) => s.words.has(w)), idf) >= STATED_SHARE * coreWeight),
      );
      if (isStated) {
        drop("repeat_already_stated");
        continue;
      }

      const latestFirst = [...occurrences].reverse();
      const description =
        latestFirst.map((o) => (o.start && o.start.event.sourceType !== "trello" ? taskPhrase(o.start.quote) : null)).find(Boolean) ??
        latestFirst.map((o) => cardName(o.done.event)).find(Boolean) ??
        occurrences.at(-1)!.done.quote;
      const spans = occurrences.map((o) => o.days).filter((n): n is number => n !== null);
      const leadDays = spans.length ? Math.max(...spans) : null;
      const nextDue = nextAnniversary(occurrences.at(-1)!.doneDay, today);
      const wording = repeatWording(occurrences, leadDays);
      duties.push({
        description,
        occurrences,
        leadDays,
        nextDue,
        startBy: leadDays === null ? null : addDays(nextDue, -leadDays),
        cadence: wording.cadence,
        leadTime: wording.leadTime,
        basis: wording.basis,
        core: [...core].sort(),
      });
    }
  }
  duties.sort((a, b) => a.nextDue.localeCompare(b.nextDue) || normaliseForQuote(a.description).localeCompare(normaliseForQuote(b.description)));
  return { duties, dropped };
}

/** The text of a stated duty that the stated-duty check compares against. */
export const statedText = (d: { description: string; approval_required?: string | null; approver?: string | null; quotes: readonly string[] }): string =>
  [d.description, d.approval_required, d.approver, ...d.quotes].filter(Boolean).join(" ");
