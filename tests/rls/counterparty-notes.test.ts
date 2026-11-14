// Phase 16: counterparty handoff notes (migration 0023). A note is built from the latest
// approved version only, never carries a finance or private item, is changed only by the
// outgoing lead, never changes once approved, and is opened and acknowledged only through two
// functions the service role alone may call (the server checks the signed link first).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_WORKSPACE, EVENTS, OBLIGATIONS, byKey } from "../../src/lib/demo/fixture.ts";
import { noteCandidates, renderNote, type NoteItem } from "../../src/lib/notes/notes.ts";
import { admin, anon, cleanup, hasEnv, resetDemo, signInAll, type Client, type Viewer } from "./support.ts";

const WS = DEMO_WORKSPACE.id;
const O = (k: string) => byKey(OBLIGATIONS, k).id;
// Restricted text in the shared fixture: O3 (finance), O4 and O6 (private).
const RESTRICTED = ["2,400", "Ganesan", "DHT22", "Robotics", "soldering"];
const ITEM_KEYS = ["approval", "cadence", "description", "due_date", "due_text", "kind", "linked_same", "next_due", "obligation_id", "period", "ruling", "status"];

describe.skipIf(!hasEnv)("counterparty notes", () => {
  let as: Record<Viewer, Client>;
  let noVersionError: string | undefined;
  let speakers: string; // committee-level note (O2)
  let hod: string; // everyone-level note (O1's approver)

  const draft = (c: Client, who: string) => c.rpc("draft_counterparty_note", { p_workspace: WS, p_counterparty: who, p_new_contact: "Kavya" });
  const update = (c: Client, note: string, items: string[], over: Partial<Record<string, string>> = {}) =>
    c.rpc("update_counterparty_note", {
      p_note: note,
      p_recipient: over.recipient ?? "Workshop speakers",
      p_new_contact: over.new_contact ?? "Kavya",
      p_contact_details: over.contact_details ?? "kavya@example.edu",
      p_message: over.message ?? "Thank you for the talks.",
      p_items: items,
    });
  const row = async (id: string) => (await admin().from("counterparty_notes").select("*").eq("id", id).single()).data!;
  const audits = async (id: string) => (await admin().from("audit_log").select("action, actor, reason, before, after, access_level").eq("target_id", id).order("id")).data!;

  beforeAll(async () => {
    await resetDemo();
    as = await signInAll();
    noVersionError = (await draft(as.arun, "Workshop speakers")).error?.message;
    expect((await as.arun.rpc("mark_ready", { p_workspace: WS, p_reason: "Ready" })).error).toBeNull();
    expect((await as.meena.rpc("approve_version", { p_workspace: WS, p_reason: "Approved" })).error).toBeNull();
  });
  afterAll(async () => {
    await cleanup();
  });

  it("needs an approved version first", () => {
    expect(noVersionError).toMatch(/no approved version yet/);
  });

  it("only the outgoing lead drafts a note", async () => {
    for (const v of ["meena", "kavya", "divya", "member"] as const) {
      expect((await draft(as[v], "Workshop speakers")).error, v).not.toBeNull();
    }
    expect((await draft(anon(), "Workshop speakers")).error).not.toBeNull();
    expect((await admin().from("counterparty_notes").select("id")).data).toEqual([]);
  });

  it("refuses the club itself, and anyone whose only items are finance or private", async () => {
    expect((await draft(as.arun, "the committee")).error?.message).toMatch(/outside the club/);
    for (const who of ["Mr. R. Ganesan", "Mr. Bala (lab in-charge)", "Robotics club", "Nobody at all"]) {
      expect((await draft(as.arun, who)).error?.message, who).toMatch(/nothing in the approved version/);
    }
  });

  it("drafts from the approved version, copying only whitelisted fields, at the item's level, audited", async () => {
    const r = await draft(as.arun, "Workshop speakers");
    expect(r.error).toBeNull();
    speakers = r.data!;
    const n = await row(speakers);
    expect(n).toMatchObject({ state: "draft", counterparty: "Workshop speakers", party_key: "workshop speakers", access_level: "committee", new_contact: "Kavya", sender_name: "Arun" });
    const items = n.items as NoteItem[];
    expect(items.map((i) => i.obligation_id)).toEqual([O("O2")]);
    expect(Object.keys(items[0]).sort()).toEqual(ITEM_KEYS);
    expect(items[0]).toMatchObject({ kind: "commitment", status: "contradicted" });
    const log = await audits(speakers);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: "note_draft", access_level: "committee", before: null });
    expect(log[0].actor).not.toBeNull();
    // One note per counterparty, however it is written.
    expect((await draft(as.arun, "all workshop speakers")).error?.message).toMatch(/already a note/);
  });

  it("offers exactly what the page offers (the TypeScript mirror agrees with the database)", async () => {
    const rows = (await as.arun.from("version_items").select("obligation_id, access_level, private_uploaders, item")).data!;
    const offered = noteCandidates(rows);
    expect(offered.map((c) => c.key).sort()).toEqual(["hod, ece", "workshop speakers"]);
    const r = await draft(as.arun, offered.find((c) => c.key === "hod, ece")!.name);
    expect(r.error).toBeNull();
    hod = r.data!;
    for (const c of offered) {
      const note = await row(c.key === "hod, ece" ? hod : speakers);
      expect((note.items as NoteItem[]).map((i) => i.obligation_id).sort()).toEqual(c.items.map((i) => i.obligation_id).sort());
      // The same fields, so the preview is the note.
      expect(renderNote({ ...note, items: note.items as NoteItem[] })).toEqual(renderNote({ ...note, items: c.items }));
    }
    expect((await row(hod)).access_level).toBe("everyone");
  });

  it("will not take a finance, private, unapproved or someone else's item, and saves the lead's fields with an audit row", async () => {
    for (const k of ["O3", "O4", "O5", "O6", "O1"]) {
      expect((await update(as.arun, speakers, [O("O2"), O(k)])).error?.message, k).toMatch(/cannot go in this note/);
    }
    expect((await update(as.kavya, speakers, [O("O2")])).error).not.toBeNull();
    expect((await update(as.meena, speakers, [O("O2")])).error).not.toBeNull();
    const before = await row(speakers);
    expect((await update(as.arun, speakers, [O("O2")], { recipient: "Dear speakers" })).error).toBeNull();
    const after = await row(speakers);
    expect(after).toMatchObject({ recipient: "Dear speakers", contact_details: "kavya@example.edu", message: "Thank you for the talks." });
    expect(after.items).toEqual(before.items);
    const edit = (await audits(speakers)).at(-1)!;
    expect(edit).toMatchObject({ action: "note_edit", access_level: "committee" });
    expect((edit.before as Record<string, unknown>).recipient).toBe("Workshop speakers");
    expect((edit.after as Record<string, unknown>).recipient).toBe("Dear speakers");
    // Clients cannot write the table directly.
    expect((await as.arun.from("counterparty_notes").update({ message: "x" }).eq("id", speakers).select()).data ?? []).toEqual([]);
    expect((await as.arun.from("counterparty_notes").insert({ workspace_id: WS, version_id: after.version_id, counterparty: "X", party_key: "x", recipient: "X", new_contact: "Y", club_name: "C", sender_name: "S" })).error).not.toBeNull();
    expect((await row(speakers)).message).toBe("Thank you for the talks.");
  });

  it("drafts are read by the working-ledger roles only", async () => {
    for (const v of ["arun", "meena", "divya"] as const) {
      expect((await as[v].from("counterparty_notes").select("id").eq("id", speakers)).data, v).toHaveLength(1);
    }
    for (const v of ["kavya", "member"] as const) {
      expect((await as[v].from("counterparty_notes").select("id")).data, v).toEqual([]);
    }
    expect((await anon().from("counterparty_notes").select("id")).data ?? []).toEqual([]);
  });

  it("the signed-link functions cannot be called by anyone but the server", async () => {
    for (const c of [anon(), as.arun, as.kavya]) {
      expect((await c.rpc("public_counterparty_note", { p_note: speakers })).error).not.toBeNull();
      expect((await c.rpc("acknowledge_counterparty_note", { p_note: speakers, p_name: "x" })).error).not.toBeNull();
    }
    // A draft is not shown, nor acknowledged, even to the server.
    expect((await admin().rpc("public_counterparty_note", { p_note: speakers })).data).toBeNull();
    expect((await admin().rpc("acknowledge_counterparty_note", { p_note: speakers, p_name: "x" })).data).toBeNull();
    expect((await admin().from("counterparty_note_acks").select("note_id")).data).toEqual([]);
  });

  it("approving is the outgoing lead's, once, and the note never changes after", async () => {
    expect((await as.kavya.rpc("approve_counterparty_note", { p_note: speakers })).error).not.toBeNull();
    expect((await as.meena.rpc("approve_counterparty_note", { p_note: speakers })).error).not.toBeNull();
    expect((await as.arun.rpc("approve_counterparty_note", { p_note: speakers })).error).toBeNull();
    const n = await row(speakers);
    expect(n.state).toBe("approved");
    expect(n.approved_at).not.toBeNull();
    expect((await as.arun.rpc("approve_counterparty_note", { p_note: speakers })).error?.message).toMatch(/already approved/);
    expect((await update(as.arun, speakers, [O("O2")])).error?.message).toMatch(/approved note cannot change/);
    expect((await as.arun.rpc("discard_counterparty_note", { p_note: speakers })).error?.message).toMatch(/cannot be discarded/);
    // Not even the service role can edit or delete an approved note.
    expect((await admin().from("counterparty_notes").update({ message: "changed" }).eq("id", speakers)).error?.message).toMatch(/approved note cannot change/);
    expect((await admin().from("counterparty_notes").delete().eq("id", speakers)).error?.message).toMatch(/approved note cannot change/);
    expect((await audits(speakers)).at(-1)).toMatchObject({ action: "note_approve", access_level: "committee" });
  });

  it("approved notes are read by every role whose clearance covers them", async () => {
    expect((await as.kavya.from("counterparty_notes").select("id")).data!.map((r) => r.id)).toEqual([speakers]);
    // Committee level: not for members.
    expect((await as.member.from("counterparty_notes").select("id")).data).toEqual([]);
    expect((await as.arun.rpc("approve_counterparty_note", { p_note: hod })).error).toBeNull();
    expect((await as.member.from("counterparty_notes").select("id")).data!.map((r) => r.id)).toEqual([hod]);
  });

  it("the signed page shows the note's own fields and nothing restricted", async () => {
    const { data, error } = await admin().rpc("public_counterparty_note", { p_note: speakers });
    expect(error).toBeNull();
    const shown = data as Record<string, unknown>;
    expect(Object.keys(shown).sort()).toEqual(["ack", "approved_at", "club_name", "contact_details", "counterparty", "id", "items", "message", "new_contact", "recipient", "sender_name"]);
    expect(shown.ack).toBeNull();
    const text = JSON.stringify(shown);
    for (const s of RESTRICTED) expect(text, s).not.toContain(s);
    // The restricted text is really in the database, readable by someone allowed.
    expect(JSON.stringify((await as.meena.from("obligations").select("description")).data)).toContain("Robotics");
  });

  it("an acknowledgement is recorded once, audited, and read with its note", async () => {
    const first = await admin().rpc("acknowledge_counterparty_note", { p_note: speakers, p_name: "  Dr. Iyer  " });
    expect(first.error).toBeNull();
    const again = await admin().rpc("acknowledge_counterparty_note", { p_note: speakers, p_name: "Someone else" });
    expect(again.data).toEqual(first.data);
    expect((first.data as { name: string }).name).toBe("Dr. Iyer");
    const acks = (await audits(speakers)).filter((a) => a.action === "note_ack");
    expect(acks).toHaveLength(1);
    expect(acks[0]).toMatchObject({ actor: null, access_level: "committee", reason: "Acknowledged by Dr. Iyer from the signed link" });
    expect((await as.kavya.from("counterparty_note_acks").select("name").eq("note_id", speakers)).data).toEqual([{ name: "Dr. Iyer" }]);
    expect((await as.member.from("counterparty_note_acks").select("name")).data).toEqual([]);
    expect(((await admin().rpc("public_counterparty_note", { p_note: speakers })).data as { ack: { name: string } }).ack.name).toBe("Dr. Iyer");
    expect((await admin().from("counterparty_note_acks").update({ name: "x" }).eq("note_id", speakers)).error).not.toBeNull();
    // Audit rows of a committee note are not for the member.
    expect((await as.member.from("audit_log").select("id").eq("target_id", speakers)).data ?? []).toEqual([]);
  });

  it("a draft saved before a newer version must be saved again before it is approved; discarding is audited", async () => {
    // A third counterparty, added after version 1: a new accepted promise to the ECE department.
    const a = admin();
    const ins = await a
      .from("obligations")
      .insert({ workspace_id: WS, kind: "commitment", description: "Return the lab keys", owed_by: "Arun", owed_to: "ECE department", status: "open", review_state: "accepted", access_level: "everyone" } as never)
      .select("id")
      .single();
    const keysItem = ins.data!.id;
    await a.from("evidence").insert({ obligation_id: keysItem, event_id: byKey(EVENTS, "E1").id, quote: "get permission letter signed by HoD before booking the lab", relation: "supports", verified: true });
    const now = (await a.from("obligations").select("status, trust_state").eq("id", keysItem).single()).data!;
    await a.from("obligations").update({ reviewed_status: now.status, reviewed_trust: now.trust_state }).eq("id", keysItem);
    expect((await draft(as.arun, "ECE department")).error?.message).toMatch(/nothing in the approved version/);
    expect((await as.arun.rpc("mark_ready", { p_workspace: WS, p_reason: "Ready" })).error).toBeNull();
    expect((await as.meena.rpc("approve_version", { p_workspace: WS, p_reason: "Version 2" })).error).toBeNull();
    const d = await draft(as.arun, "ECE department");
    expect(d.error).toBeNull();
    const ece = d.data!;
    // Version 3 comes after the draft.
    expect((await as.arun.rpc("mark_ready", { p_workspace: WS, p_reason: "Ready" })).error).toBeNull();
    expect((await as.meena.rpc("approve_version", { p_workspace: WS, p_reason: "Version 3" })).error).toBeNull();
    expect((await as.arun.rpc("approve_counterparty_note", { p_note: ece })).error?.message).toMatch(/newer version/);
    expect((await update(as.arun, ece, [keysItem], { recipient: "ECE department" })).error).toBeNull();
    const v3 = (await a.from("versions").select("id").eq("workspace_id", WS).order("number", { ascending: false }).limit(1).single()).data!.id;
    expect((await row(ece)).version_id).toBe(v3);
    // An empty note cannot be approved.
    expect((await update(as.arun, ece, [], { recipient: "ECE department" })).error).toBeNull();
    expect((await as.arun.rpc("approve_counterparty_note", { p_note: ece })).error?.message).toMatch(/at least one item/);
    expect((await as.kavya.rpc("discard_counterparty_note", { p_note: ece })).error).not.toBeNull();
    expect((await as.arun.rpc("discard_counterparty_note", { p_note: ece })).error).toBeNull();
    expect((await a.from("counterparty_notes").select("id").eq("id", ece)).data).toEqual([]);
    expect((await audits(ece)).map((r) => r.action)).toEqual(["note_draft", "note_edit", "note_edit", "note_discard"]);
  });

  it("an approved note goes with its workspace", async () => {
    expect((await admin().rpc("delete_workspace", { p_workspace: WS, p_reason: "test" })).error).toBeNull();
    expect((await admin().from("counterparty_notes").select("id")).data).toEqual([]);
    expect((await admin().from("counterparty_note_acks").select("note_id")).data).toEqual([]);
  });
});
