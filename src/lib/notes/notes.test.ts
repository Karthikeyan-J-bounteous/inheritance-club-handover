import { describe, expect, it } from "vitest";
import yearClub from "../demo/year-club.json" with { type: "json" };
import { dueWords, noteCandidates, noteItemFrom, noteParty, noteText, partyKey, promiseState, renderNote, type NoteItem, type VersionRow } from "./notes.ts";

const item = (over: Partial<NoteItem> = {}): NoteItem => ({
  obligation_id: "00000000-0000-4000-8000-000000000001",
  kind: "commitment",
  description: "return the borrowed ESP32 boards",
  due_text: "by Friday 27 Feb",
  due_date: null,
  status: "open",
  ruling: null,
  cadence: null,
  period: null,
  next_due: null,
  approval: null,
  ...over,
});

const row = (id: string, level: string, o: Record<string, unknown>, extra: Partial<VersionRow> = {}): VersionRow => ({
  obligation_id: id,
  access_level: level,
  item: { obligation: { kind: "commitment", description: `item ${id}`, ...o }, conflicts: [] },
  ...extra,
});

describe("partyKey", () => {
  it("groups the same counterparty however the records write it", () => {
    expect(partyKey("all workshop speakers")).toBe("workshop speakers");
    expect(partyKey("Workshop  Speakers.")).toBe("workshop speakers");
    expect(partyKey("the volunteers")).toBe("volunteers");
    expect(partyKey("Brightwave Labs")).toBe("brightwave labs");
    expect(partyKey("Ｍr. Bala")).toBe("mr. bala");
  });

  it("is null for the club itself and its committees, which are not outside the club", () => {
    for (const p of ["the club", "the committee", "the new committee", "the next committee", "Club committee", "all members", "the core team", "", null, "  "]) {
      expect(partyKey(p), String(p)).toBeNull();
    }
  });
});

describe("noteParty", () => {
  it("is who a promise is owed to, and a duty's approver", () => {
    expect(noteParty({ kind: "commitment", owed_to: "Bala sir", approver: "HoD" })).toEqual({ key: "bala sir", label: "Bala sir" });
    expect(noteParty({ kind: "recurring", owed_to: "ECE department", approver: "HoD, ECE" })).toEqual({ key: "hod, ece", label: "HoD, ECE" });
    expect(noteParty({ kind: "recurring", owed_to: "ECE department", approver: null })?.key).toBe("ece department");
    expect(noteParty({ kind: "commitment", owed_to: "the club" })).toBeNull();
  });
});

describe("noteCandidates", () => {
  it("never offers a finance or private item, or a private one with uploaders", () => {
    const rows = [
      row("a", "committee", { owed_to: "Mr. Ganesan" }),
      row("b", "finance", { owed_to: "Mr. Ganesan", description: "Reimburse speaker travel of ₹2,400" }),
      row("c", "private", { owed_to: "Karthik" }),
      row("d", "committee", { owed_to: "Karthik" }, { private_uploaders: ["u1"] }),
    ];
    const out = noteCandidates(rows);
    expect(out.map((c) => c.name)).toEqual(["Mr. Ganesan"]);
    expect(out[0].items.map((i) => i.obligation_id)).toEqual(["a"]);
    expect(JSON.stringify(out)).not.toContain("2,400");
  });

  it("names a counterparty as the records most often do, and takes the most restricted level", () => {
    const out = noteCandidates([
      row("a", "everyone", { owed_to: "workshop speakers" }),
      row("b", "committee", { owed_to: "all workshop speakers" }),
      row("c", "everyone", { owed_to: "workshop speakers" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: "workshop speakers", name: "workshop speakers", level: "committee" });
    expect(out[0].items).toHaveLength(3);
  });

  it("finds the outside parties of the built year club, and leaves out the club itself", () => {
    const rows = yearClub.obligations
      .filter((o) => o.review_state === "accepted")
      .map((o) => row(o.key, o.access_level, o as unknown as Record<string, unknown>, { private_uploaders: o.private_uploaders }));
    const names = noteCandidates(rows).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["Brightwave Labs", "Bala sir", "HoD", "Dean's office", "Dean"]));
    expect(names.some((n) => /speakers/.test(n))).toBe(true);
    // Finance (Mr. Ganesan) and private (Karthik) are never offered; nor the club or its committees.
    for (const n of names) expect(n).not.toMatch(/Ganesan|Karthik|^the (club|committee|new committee|next committee)$/);
  });
});

describe("noteItemFrom", () => {
  it("copies only the whitelisted fields, with the latest ruling", () => {
    const ni = noteItemFrom("x", {
      obligation: { kind: "commitment", description: "Certificates", owed_by: "Arun", owed_to: "speakers", status: "contradicted", access_level: "committee", approver: "HoD" },
      conflicts: [
        { ruling: "not_done", ruled_at: "2026-03-01T10:00:00+05:30" },
        { ruling: "done", ruled_at: "2026-04-01T10:00:00+05:30" },
        { ruling: null },
      ],
    });
    expect(ni).toEqual({
      obligation_id: "x", kind: "commitment", description: "Certificates", due_text: null, due_date: null, status: "contradicted",
      ruling: "done", cadence: null, period: null, next_due: null, approval: null,
    });
  });
});

describe("promiseState and dueWords", () => {
  it("never says done unless the records or the advisor's ruling do", () => {
    expect(promiseState({ status: "fulfilled", ruling: null })).toBe("done");
    expect(promiseState({ status: "contradicted", ruling: "done" })).toBe("done");
    expect(promiseState({ status: "contradicted", ruling: "not_done" })).toBe("open");
    expect(promiseState({ status: "contradicted", ruling: "cannot_tell" })).toBe("unsettled");
    expect(promiseState({ status: "contradicted", ruling: null })).toBe("unsettled");
    expect(promiseState({ status: "likely_fulfilled", ruling: null })).toBe("believed_done");
    expect(promiseState({ status: "no_evidence", ruling: null })).toBe("no_record");
    expect(promiseState({ status: "open", ruling: null })).toBe("open");
  });

  it("uses the records' words, or the date", () => {
    expect(dueWords({ due_text: "by 20 January", due_date: null })).toBe("by 20 January");
    expect(dueWords({ due_text: "2026-02-28", due_date: null })).toBe("by 28 Feb 2026");
    expect(dueWords({ due_text: null, due_date: "2026-03-15" })).toBe("by 15 Mar 2026");
    expect(dueWords({ due_text: null, due_date: null })).toBeNull();
  });
});

describe("renderNote", () => {
  const base = { club_name: "IoT Club", sender_name: "Arun", recipient: "Bala sir", new_contact: "Kavya", contact_details: null, message: null };

  it("says who the new contact is, what is still owed and what is done", () => {
    const doc = renderNote({
      ...base,
      contact_details: "kavya@example.edu",
      items: [item(), item({ obligation_id: "00000000-0000-4000-8000-000000000002", description: "lend the soldering kit", status: "fulfilled", due_text: null })],
    });
    expect(doc.greeting).toBe("Dear Bala sir,");
    expect(doc.intro[0]).toBe("Arun is handing over as lead of IoT Club. From now on, your contact at the club is Kavya. You can reach them at kavya@example.edu.");
    expect(doc.sections.map((s) => s.key)).toEqual(["owed", "done"]);
    expect(doc.sections[0].lines[0]).toEqual({ text: "Return the borrowed ESP32 boards", detail: ["Due by Friday 27 Feb", "Still to be done."] });
    expect(doc.sections[1].lines[0]).toEqual({ text: "Lend the soldering kit", detail: [] });
    expect(doc.signoff).toBe("Arun, for IoT Club");
  });

  it("is honest about what the records do not settle", () => {
    const doc = renderNote({
      ...base,
      items: [
        item({ status: "no_evidence", due_text: null }),
        item({ obligation_id: "00000000-0000-4000-8000-000000000002", description: "send certificates", status: "contradicted", due_text: null }),
        item({ obligation_id: "00000000-0000-4000-8000-000000000003", description: "pay the deposit", status: "likely_fulfilled", due_text: null }),
      ],
    });
    const owed = doc.sections.find((s) => s.key === "owed")!.lines;
    expect(owed.map((l) => l.detail.join(" "))).toEqual([
      "We believe this was done. Please tell Kavya if it was not.",
      "Our records do not show this as done yet.",
      "Our records disagree on whether this was done. Kavya will check with you.",
    ]);
  });

  it("lists a duty with how often, what is asked and when next", () => {
    const doc = renderNote({
      ...base,
      recipient: "HoD",
      items: [item({ kind: "recurring", description: "Get the HoD's permission letter signed before booking the lab", period: "semester", cadence: "every semester", approval: "HoD's permission letter", next_due: "2027-02-14", due_text: null })],
    });
    expect(doc.sections).toEqual([
      { key: "recurring", title: "What the club asks of you each time", lines: [{ text: "Get the HoD's permission letter signed before booking the lab", detail: ["Every semester", "The club will ask you for: HoD's permission letter", "Next expected around February 2027"] }] },
    ]);
  });

  it("keeps the lead's message, and the plain text has everything", () => {
    const doc = renderNote({ ...base, message: "  Thank you for the boards!  ", items: [item()] });
    expect(doc.message).toBe("Thank you for the boards!");
    const text = noteText(doc);
    expect(text).toContain("Dear Bala sir,");
    expect(text).toContain("- Return the borrowed ESP32 boards (Due by Friday 27 Feb Still to be done.)");
    expect(text).toContain("Thank you for the boards!");
    expect(text.endsWith("Arun, for IoT Club")).toBe(true);
  });

  it("orders items the same way whatever order they come in", () => {
    const a = item({ obligation_id: "00000000-0000-4000-8000-00000000000a", description: "b thing" });
    const b = item({ obligation_id: "00000000-0000-4000-8000-00000000000b", description: "a thing" });
    expect(renderNote({ ...base, items: [a, b] })).toEqual(renderNote({ ...base, items: [b, a] }));
  });
});
