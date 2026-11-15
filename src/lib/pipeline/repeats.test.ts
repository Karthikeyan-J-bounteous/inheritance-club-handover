import { describe, expect, it } from "vitest";
import type { PipelineEvent } from "./extract.ts";
import { aboutAYearApart, doneSentence, findRepeatedDuties, nextAnniversary, promiseSentence, repeatWording, statedText, taskPhrase } from "./repeats.ts";
import { verifyQuote } from "./verify.ts";

let n = 0;
/** A chat message at an IST wall-clock time. */
const msg = (at: string, text: string, extra: Partial<PipelineEvent> = {}): PipelineEvent => ({
  id: `e${++n}`, author: "Arun", ts: `${at.replace(" ", "T")}:00+05:30`, text, threadId: null, sourceType: "whatsapp", accessLevel: "committee", uploaderId: null, sourceId: "chat", ...extra,
});
const card = (at: string, cardId: string, text: string) => msg(at, text, { sourceType: "trello", threadId: `trello:card:${cardId}`, sourceId: "board" });

// Filler so that rare words weigh more than common ones, as in a real chat.
const filler = Array.from({ length: 40 }, (_, i) => msg(`2025-0${(i % 9) + 1}-1${i % 9} 18:00`, i % 2 ? "Reached the canteen, where is everyone?" : "Is the IoT lab open now?"));

const sponsorship = [
  msg("2025-01-03 20:15", "I'll send the sponsorship proposal to Brightwave Labs by 15 January."),
  msg("2025-01-14 11:30", "Sent the sponsorship proposal to Brightwave Labs today."),
  msg("2026-01-10 19:42", "I'll send the sponsorship proposal to Brightwave Labs by 20 January."),
  msg("2026-01-21 10:05", "Sponsorship proposal sent to Brightwave Labs this morning."),
];

describe("record shapes", () => {
  it("a report is done; a promise, a rule, a question, a hedge or a negation is not", () => {
    expect(doneSentence("Sent the sponsorship proposal to Brightwave Labs today.")).toBe("Sent the sponsorship proposal to Brightwave Labs today.");
    expect(doneSentence("Recruitment posters are up in all the first-year blocks.")).not.toBeNull();
    expect(doneSentence("I'll send the proposal by Friday.")).toBeNull();
    expect(doneSentence("The permission letter has to be approved before we book the lab.")).toBeNull();
    expect(doneSentence("Has anyone sent the proposal?")).toBeNull();
    expect(doneSentence("Maybe the posters are printed, will see.")).toBeNull();
    expect(doneSentence("Speakers are still asking, nobody has sent them yet.")).toBeNull();
    expect(doneSentence("Is the lab open now?")).toBeNull();
  });

  it("a promise is a start, and names the task without its date", () => {
    expect(promiseSentence("Ok. I'll return the ESP32 boards to Bala sir by 28 Feb.")).toBe("I'll return the ESP32 boards to Bala sir by 28 Feb.");
    expect(promiseSentence("The letter has to be approved every semester.")).toBeNull();
    expect(promiseSentence("Maybe I'll check the projector too, will see.")).toBeNull();
    expect(taskPhrase("I'll send the sponsorship proposal to Brightwave Labs by 20 January.")).toBe("Send the sponsorship proposal to Brightwave Labs");
    expect(taskPhrase("I will book the auditorium before the fest.")).toBe("Book the auditorium");
    expect(taskPhrase("I'll go.")).toBeNull();
  });

  it("about a year apart means a whole number of years, give or take a month", () => {
    expect(aboutAYearApart("2025-01-14", "2026-01-21")).toBe(true);
    expect(aboutAYearApart("2025-01-14", "2026-02-13")).toBe(true);
    expect(aboutAYearApart("2025-01-14", "2026-02-20")).toBe(false);
    expect(aboutAYearApart("2025-01-14", "2025-06-13")).toBe(false);
    expect(aboutAYearApart("2025-01-14", "2025-01-20")).toBe(false);
    expect(aboutAYearApart("2024-01-10", "2026-01-12")).toBe(true);
  });

  it("the next due date is the first anniversary after today (28 Feb for 29 Feb)", () => {
    expect(nextAnniversary("2026-01-21", "2026-11-10")).toBe("2027-01-21");
    expect(nextAnniversary("2025-11-27", "2026-11-10")).toBe("2026-11-27");
    expect(nextAnniversary("2025-11-27", "2026-11-27")).toBe("2027-11-27");
    expect(nextAnniversary("2024-02-29", "2024-11-10")).toBe("2025-02-28");
  });
});

describe("findRepeatedDuties", () => {
  it("finds a task done at about the same time in two years, with its occurrences, lead time and dates", () => {
    const { duties, dropped } = findRepeatedDuties([...filler, ...sponsorship], [], "2026-11-10");
    expect(dropped).toEqual({});
    expect(duties).toHaveLength(1);
    const d = duties[0];
    expect(d.description).toBe("Send the sponsorship proposal to Brightwave Labs");
    expect(d.occurrences.map((o) => [o.year, o.doneDay, o.startDay, o.days])).toEqual([
      [2025, "2025-01-14", "2025-01-03", 11],
      [2026, "2026-01-21", "2026-01-10", 11],
    ]);
    expect([d.leadDays, d.nextDue, d.startBy]).toEqual([11, "2027-01-21", "2027-01-10"]);
    expect(d.cadence).toBe("about once a year (done in 2025 and 2026; no record says it repeats)");
    expect(d.leadTime).toBe("11 days (the longest it took before)");
    expect(d.basis).toContain("Inferred, not stated");
    // Every quote is a verbatim part of its message.
    for (const o of d.occurrences) {
      expect(verifyQuote(o.done.quote, o.done.event.text).ok).toBe(true);
      expect(verifyQuote(o.start!.quote, o.start!.event.text).ok).toBe(true);
    }
  });

  it("needs two different years: the same task twice in one year, or once, is not a duty", () => {
    expect(findRepeatedDuties([...filler, ...sponsorship.slice(0, 2)], [], "2026-11-10").duties).toEqual([]);
    const twiceInAYear = [msg("2025-01-14 11:30", "Sent the sponsorship proposal to Brightwave Labs today."), msg("2025-02-14 11:30", "Sent the sponsorship proposal to Brightwave Labs again.")];
    expect(findRepeatedDuties([...filler, ...twiceInAYear], [], "2026-11-10").duties).toEqual([]);
  });

  it("not at the same time of year: no duty", () => {
    const events = [...filler, msg("2025-01-14 11:30", "Sent the sponsorship proposal to Brightwave Labs today."), msg("2026-06-13 18:05", "Sent the sponsorship proposal to Brightwave Labs.")];
    expect(findRepeatedDuties(events, [], "2026-11-10").duties).toEqual([]);
  });

  it("the same time of year but a different task: no duty", () => {
    const events = [...filler, msg("2025-01-14 11:30", "Sent the sponsorship proposal to Brightwave Labs today."), msg("2026-01-15 11:30", "Returned the ESP32 boards to Bala sir today.")];
    expect(findRepeatedDuties(events, [], "2026-11-10").duties).toEqual([]);
  });

  it("a report that it was not done does not count as an occurrence", () => {
    const events = [...filler, sponsorship[1], msg("2026-01-21 10:05", "Sponsorship proposal still not sent to Brightwave Labs.")];
    expect(findRepeatedDuties(events, [], "2026-11-10").duties).toEqual([]);
  });

  it("never mixes access levels: a committee record and a finance record are not one duty", () => {
    const events = [...filler, sponsorship[1], { ...sponsorship[3], accessLevel: "finance" as const }];
    expect(findRepeatedDuties(events, [], "2026-11-10").duties).toEqual([]);
  });

  it("a duty the records already state is not added again, by its words or by a cited record", () => {
    const byWords = findRepeatedDuties([...filler, ...sponsorship], [{ text: statedText({ description: "Send the yearly sponsorship proposal", approver: "Brightwave Labs", quotes: [] }), eventIds: [] }], "2026-11-10");
    expect(byWords).toEqual({ duties: [], dropped: { repeat_already_stated: 1 } });
    const byRecord = findRepeatedDuties([...filler, ...sponsorship], [{ text: "Something else entirely", eventIds: [sponsorship[3].id] }], "2026-11-10");
    expect(byRecord).toEqual({ duties: [], dropped: { repeat_already_stated: 1 } });
    // A stated duty about something else does not hide it.
    const other = findRepeatedDuties([...filler, ...sponsorship], [{ text: "Get the HoD's permission letter before booking the lab", eventIds: [] }], "2026-11-10");
    expect(other.duties).toHaveLength(1);
  });

  it("a Trello card is an occurrence: made is the start, moved to Done is done, its name the duty", () => {
    const events = [
      ...filler,
      msg("2024-11-24 21:10", "IoT basics workshop slides are done, shared them in the drive."),
      card("2025-11-10 21:00", "slides", "Card: Workshop slides\nIoT basics deck."),
      card("2025-11-27 20:00", "slides", 'Moved card "Workshop slides" from "Doing" to "Done"'),
    ];
    const { duties } = findRepeatedDuties(events, [], "2026-11-10");
    expect(duties).toHaveLength(1);
    expect(duties[0].description).toBe("Workshop slides");
    expect(duties[0].occurrences.map((o) => [o.year, o.start?.quote ?? null, o.days])).toEqual([
      [2024, null, null],
      [2025, "Card: Workshop slides", 17],
    ]);
    expect([duties[0].nextDue, duties[0].startBy]).toEqual(["2026-11-27", "2026-11-10"]);
  });

  it("three years give three occurrences; with no start recorded there is no start-by date", () => {
    const events = [
      ...filler,
      msg("2024-02-20 16:00", "Returned the ESP32 boards to Bala sir, he signed the register."),
      msg("2025-02-24 16:20", "Returned the ESP32 boards to Bala sir today, he signed the register."),
      msg("2026-02-27 16:30", "Returned all 8 boards, Bala sir signed the register."),
    ];
    const { duties } = findRepeatedDuties(events, [], "2026-11-10");
    expect(duties).toHaveLength(1);
    expect(duties[0].occurrences.map((o) => o.year)).toEqual([2024, 2025, 2026]);
    expect([duties[0].leadDays, duties[0].startBy, duties[0].leadTime]).toEqual([null, null, null]);
    expect(duties[0].basis).toContain("no record shows when it was started");
    expect(duties[0].description).toBe("Returned all 8 boards, Bala sir signed the register.");
  });

  it("two steps of one task that repeat side by side are one duty", () => {
    const events = [
      ...filler,
      msg("2025-08-12 12:10", "Registration renewal submitted to Student Affairs today."),
      msg("2025-08-27 17:35", "Dean finally signed the registration renewal."),
      msg("2026-08-09 17:25", "Registration renewal submitted to Student Affairs today."),
      msg("2026-08-30 13:10", "Dean signed the registration renewal, we are registered."),
    ];
    const { duties } = findRepeatedDuties(events, [], "2026-11-10");
    expect(duties).toHaveLength(1);
    expect(duties[0].occurrences.map((o) => o.doneDay)).toEqual(["2025-08-12", "2026-08-09"]);
  });
});

describe("repeatWording", () => {
  it("names the years and days, and says when nothing shows the start", () => {
    const w = repeatWording([{ year: 2024, doneDay: "2024-11-24" }, { year: 2025, doneDay: "2025-11-27" }], 17);
    expect(w.basis).toBe(
      "Inferred, not stated: done at about this time in 2024 and 2025 (24 Nov 2024 and 27 Nov 2025). Due a year after it was last done; start 17 days ahead, the longest it took from the first record to done.",
    );
    expect(repeatWording([{ year: 2024, doneDay: "2024-11-24" }, { year: 2025, doneDay: "2025-11-27" }, { year: 2026, doneDay: "2026-11-20" }], null).cadence).toBe(
      "about once a year (done in 2024, 2025 and 2026; no record says it repeats)",
    );
  });
});
