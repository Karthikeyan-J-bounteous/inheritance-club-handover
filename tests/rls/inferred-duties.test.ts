// Phase 17: duties inferred from repetition (migration 0024). add_inferred_duty() stores what
// findRepeatedDuties() found, repeats its checks, and the trust rule labels it Inferred.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_WORKSPACE } from "../../src/lib/demo/fixture.ts";
import { sha256Hex } from "../../src/lib/hash.ts";
import { findRepeatedDuties, repeatWording, type RepeatedDuty } from "../../src/lib/pipeline/repeats.ts";
import { loadReadableEvents } from "../../src/lib/pipeline/run-pipeline.ts";
import { admin, cleanup, hasEnv, resetDemo, signInAll, type Client, type Viewer } from "./support.ts";

const WS = DEMO_WORKSPACE.id;
type Level = "everyone" | "committee" | "finance" | "private";
type Msg = { at: string; by: string; text: string };

const ist = (at: string) => `${at.replace(" ", "T")}:00+05:30`;
const filler = Array.from({ length: 30 }, (_, i): Msg => ({ at: `2025-0${(i % 9) + 1}-1${i % 9} 18:00`, by: "Priya", text: i % 2 ? "Reached the canteen, where is everyone?" : "Is the IoT lab open now?" }));

async function importChat(c: Client, filename: string, level: Level, msgs: readonly Msg[]): Promise<string> {
  const r = await c.rpc("import_source", {
    p_workspace: WS, p_type: "whatsapp", p_filename: filename, p_access: level, p_sha256: sha256Hex(new TextEncoder().encode(filename + JSON.stringify(msgs))),
    p_summary: { sourceType: "whatsapp", synthetic: true },
    p_events: msgs.map((m) => ({ author: m.by, ts: ist(m.at), text: m.text, thread_id: null, meta: {} })),
    p_reason: "Synthetic test chat for inferred duties",
  });
  if (r.error) throw new Error(`${filename}: ${r.error.message}`);
  return r.data as string;
}

/** What the pipeline step sends for one detected duty. */
const payload = (d: RepeatedDuty) => ({
  p_workspace: WS,
  p_description: d.description,
  p_next_due: d.nextDue,
  p_occurrences: d.occurrences.map((o) => ({ done_event: o.done.event.id, done_quote: o.done.quote, start_event: o.start?.event.id ?? null, start_quote: o.start?.quote ?? null })),
});

describe.skipIf(!hasEnv)("inferred duties: stored by code, checked by the database, labelled Inferred", () => {
  let as: Record<Viewer, Client>;
  let duty: RepeatedDuty;
  let id: string;
  const ev: Record<string, string> = {};

  beforeAll(async () => {
    await resetDemo();
    as = await signInAll();
    await importChat(as.arun, "committee-2024-25.txt", "committee", [
      ...filler,
      { at: "2025-01-03 20:15", by: "Nikhil", text: "I'll send the sponsorship proposal to Brightwave Labs by 15 January." },
      { at: "2025-01-14 11:30", by: "Nikhil", text: "Sent the sponsorship proposal to Brightwave Labs today." },
      { at: "2025-06-13 18:05", by: "Sneha", text: "Sent the sponsorship proposal to Zentro Systems." },
    ]);
    await importChat(as.arun, "committee-2025-26.txt", "committee", [
      { at: "2026-01-10 19:42", by: "Arun", text: "I'll send the sponsorship proposal to Brightwave Labs by 20 January." },
      { at: "2026-01-21 10:05", by: "Arun", text: "Sponsorship proposal sent to Brightwave Labs this morning." },
    ]);
    await importChat(as.arun, "finance-2026.txt", "finance", [{ at: "2026-01-20 12:00", by: "Divya", text: "Sent the sponsorship proposal invoice to Brightwave Labs." }]);
    await importChat(as.meena, "private-2026.txt", "private", [{ at: "2026-01-19 12:00", by: "Dr. Meena", text: "Sent the sponsorship proposal note to Brightwave Labs." }]);
    const { data } = await admin().from("events").select("id, text").eq("workspace_id", WS);
    for (const e of data ?? []) ev[e.text] = e.id;

    const found = findRepeatedDuties(await loadReadableEvents(as.arun, WS), [], "2026-11-10");
    expect(found.duties.map((d) => d.description)).toEqual(["Send the sponsorship proposal to Brightwave Labs"]);
    duty = found.duties[0];
  });
  afterAll(async () => {
    await cleanup();
  });

  it("only the outgoing lead and the advisor may add one", async () => {
    for (const v of ["kavya", "divya", "member"] as const) {
      const r = await as[v].rpc("add_inferred_duty", payload(duty));
      expect(r.error, v).not.toBeNull();
    }
    expect((await admin().from("obligations").select("id").not("occurrences", "is", null)).data).toEqual([]);
  });

  it("refuses what the records do not show", async () => {
    const p = payload(duty);
    const bad = async (change: Partial<ReturnType<typeof payload>>, message: RegExp) => {
      const r = await as.arun.rpc("add_inferred_duty", { ...p, ...change });
      expect(r.error?.message, JSON.stringify(change).slice(0, 120)).toMatch(message);
    };
    const [first, second] = p.p_occurrences;
    await bad({ p_occurrences: [first] }, /at least two occurrences/);
    await bad({ p_occurrences: [first, { ...second, done_quote: "Sponsorship proposal sent to Zentro" }] }, /verbatim/);
    await bad({ p_occurrences: [second, first] }, /about a year apart/);
    await bad({ p_occurrences: [first, { done_event: ev["Sent the sponsorship proposal to Zentro Systems."], done_quote: "Sent the sponsorship proposal to Zentro Systems.", start_event: null, start_quote: null }] }, /about a year apart/);
    await bad({ p_occurrences: [first, { done_event: ev["Sent the sponsorship proposal invoice to Brightwave Labs."], done_quote: "Sent the sponsorship proposal invoice to Brightwave Labs.", start_event: null, start_quote: null }] }, /same access/);
    // The advisor's private message is not readable by the outgoing lead: as if it did not exist.
    await bad({ p_occurrences: [first, { done_event: ev["Sent the sponsorship proposal note to Brightwave Labs."], done_quote: "Sent the sponsorship proposal note to Brightwave Labs.", start_event: null, start_quote: null }] }, /not found/);
    await bad({ p_occurrences: [first, { ...second, start_event: ev["I'll send the sponsorship proposal to Brightwave Labs by 15 January."] }] }, /verbatim|before its done record/);
    await bad({ p_occurrences: [first, { ...second, start_event: first.start_event, start_quote: first.start_quote }] }, /at most 60 days/);
    await bad({ p_next_due: "2027-01-22" }, /anniversary/);
    await bad({ p_next_due: "2026-01-21" }, /anniversary/);
    await bad({ p_description: "Book the auditorium for the fest" }, /words from one of the quotes/);
    expect((await admin().from("obligations").select("id").not("occurrences", "is", null)).data).toEqual([]);
  });

  it("stores a draft duty resting only on inferred quotes, so trust is Inferred, with its occurrences and dates", async () => {
    const r = await as.arun.rpc("add_inferred_duty", payload(duty));
    expect(r.error).toBeNull();
    expect(r.data?.[0]?.created).toBe(true);
    id = r.data![0].obligation_id;
    const { data: o } = await admin().from("obligations").select("*").eq("id", id).single();
    expect(o).toMatchObject({
      kind: "recurring", description: "Send the sponsorship proposal to Brightwave Labs", period: "year", status: "open",
      trust_state: "inferred", review_state: "draft", access_level: "committee", approver: null, owed_by: null,
      next_due: "2027-01-21", start_by: "2027-01-10",
      // The database's wording equals the code's (repeatWording), from the messages' own times.
      cadence: duty.cadence, lead_time: duty.leadTime, next_due_basis: duty.basis,
    });
    expect(repeatWording(duty.occurrences, duty.leadDays).basis).toBe(o!.next_due_basis);
    expect(o!.occurrences).toEqual([
      { year: 2025, done_event: ev["Sent the sponsorship proposal to Brightwave Labs today."], done_on: "2025-01-14", start_event: ev["I'll send the sponsorship proposal to Brightwave Labs by 15 January."], started_on: "2025-01-03", days: 11 },
      { year: 2026, done_event: ev["Sponsorship proposal sent to Brightwave Labs this morning."], done_on: "2026-01-21", start_event: ev["I'll send the sponsorship proposal to Brightwave Labs by 20 January."], started_on: "2026-01-10", days: 11 },
    ]);
    const { data: evidence } = await admin().from("evidence").select("relation, inferred, verified, quote").eq("obligation_id", id);
    expect(evidence).toHaveLength(4);
    expect(evidence!.every((e) => e.relation === "past_instance" && e.inferred && e.verified)).toBe(true);
  });

  it("is audited as an inference by code, readable by reviewers only", async () => {
    const q = (c: Client) => c.from("audit_log").select("action, reason").eq("target_id", id);
    const rows = (await q(as.arun)).data ?? [];
    expect(rows.some((a) => /inferred by code from repetition/.test(a.reason ?? ""))).toBe(true);
    expect((await q(as.kavya)).data ?? []).toEqual([]);
  });

  it("a second run finds the same duty and adds nothing; a rejected one stays rejected", async () => {
    const again = await as.meena.rpc("add_inferred_duty", payload(duty));
    expect(again.data?.[0]).toEqual({ obligation_id: id, created: false });
    expect((await as.arun.rpc("review_obligation", { p_id: id, p_action: "reject", p_reason: "Test: not a duty" })).error).toBeNull();
    const afterReject = await as.arun.rpc("add_inferred_duty", payload(duty));
    expect(afterReject.data?.[0]).toEqual({ obligation_id: id, created: false });
    expect((await admin().from("obligations").select("id").not("occurrences", "is", null)).data).toHaveLength(1);
    expect((await as.arun.rpc("review_obligation", { p_id: id, p_action: "reopen", p_reason: "Test: look again" })).error).toBeNull();
  });

  it("once a record states it, it is no longer only inferred", async () => {
    const a = admin();
    const stated = ev["Sponsorship proposal sent to Brightwave Labs this morning."];
    const ins = await a.from("evidence").insert({ obligation_id: id, event_id: stated, quote: "Sponsorship proposal sent to Brightwave Labs", relation: "supports", verified: true }).select("id").single();
    expect(ins.error).toBeNull();
    expect((await a.from("obligations").select("trust_state").eq("id", id).single()).data?.trust_state).toBe("sourced");
    await a.from("evidence").delete().eq("id", ins.data!.id);
    expect((await a.from("obligations").select("trust_state").eq("id", id).single()).data?.trust_state).toBe("inferred");
  });

  it("the approved version carries its occurrences to the incoming lead, still Inferred", async () => {
    expect((await as.arun.rpc("review_obligation", { p_id: id, p_action: "accept", p_reason: "Checked the occurrences" })).error).toBeNull();
    expect((await as.arun.rpc("mark_ready", { p_workspace: WS, p_reason: "Ready" })).error).toBeNull();
    const v = await as.meena.rpc("approve_version", { p_workspace: WS, p_reason: "Approved" });
    expect(v.error).toBeNull();
    const { data } = await as.kavya.from("version_items").select("item").eq("version_id", v.data as string).eq("obligation_id", id).single();
    const item = data!.item as { obligation: { trust_state: string; occurrences: { year: number }[]; start_by: string }; evidence: { inferred: boolean }[] };
    expect(item.obligation.trust_state).toBe("inferred");
    expect(item.obligation.occurrences.map((o) => o.year)).toEqual([2025, 2026]);
    expect(item.obligation.start_by).toBe("2027-01-10");
    expect(item.evidence.every((e) => e.inferred)).toBe(true);
  });
});
