import { describe, expect, it } from "vitest";
import { dayWords, inferredExplainer, occurrenceLine, occurrenceYears, parseOccurrences } from "./repeats-view.ts";

const stored = [
  { year: 2026, done_event: "b", done_on: "2026-01-21", start_event: "s2", started_on: "2026-01-10", days: 11 },
  { year: 2025, done_event: "a", done_on: "2025-01-14", start_event: null, started_on: null, days: null },
];

describe("parseOccurrences", () => {
  it("reads what add_inferred_duty() stores, oldest first", () => {
    expect(parseOccurrences(stored)).toEqual([
      { year: 2025, doneEvent: "a", doneOn: "2025-01-14", startEvent: null, startedOn: null, days: null },
      { year: 2026, doneEvent: "b", doneOn: "2026-01-21", startEvent: "s2", startedOn: "2026-01-10", days: 11 },
    ]);
  });

  it("is null for an item not found from repetition, or a shape it does not know", () => {
    expect(parseOccurrences(null)).toBeNull();
    expect(parseOccurrences(undefined)).toBeNull();
    expect(parseOccurrences([])).toBeNull();
    expect(parseOccurrences([{ year: 2025, done_event: "a" }])).toBeNull();
    expect(parseOccurrences([{ year: "2025", done_event: "a", done_on: "2025-01-14" }])).toBeNull();
    expect(parseOccurrences("nope")).toBeNull();
  });
});

describe("words", () => {
  const occ = parseOccurrences(stored)!;
  it("says each year, with how long it took when the start is known", () => {
    expect(dayWords("2026-11-07")).toBe("7 Nov 2026");
    expect(occurrenceLine(occ[1])).toBe("Under way from 10 Jan 2026, done 21 Jan 2026: 11 days.");
    expect(occurrenceLine(occ[0])).toBe("Done 14 Jan 2025. No record shows when it was started.");
    expect(occurrenceLine({ ...occ[1], days: 1 })).toContain(": 1 day.");
  });

  it("never presents the duty as stated", () => {
    expect(occurrenceYears(occ)).toBe("2025 and 2026");
    expect(inferredExplainer(occ)).toMatch(/^No record says this repeats\. It was done at about the same time of year in 2025 and 2026, so it is probably a yearly duty\./);
    expect(inferredExplainer(occ)).toContain("trust stays Inferred");
  });
});
