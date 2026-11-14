import { describe, expect, it } from "vitest";
import { readNoteToken, signNoteToken } from "./link.ts";

const ID = "3f2b8a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const KEY = "test-secret-key";

describe("signed note links", () => {
  it("reads back the note it was signed for", () => {
    const t = signNoteToken(ID, KEY);
    expect(t.startsWith(`${ID}.`)).toBe(true);
    expect(readNoteToken(t, KEY)).toBe(ID);
  });

  it("refuses another key, an edited id or signature, and junk", () => {
    const t = signNoteToken(ID, KEY);
    const other = "3f2b8a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5c";
    expect(readNoteToken(t, "another-key")).toBeNull();
    expect(readNoteToken(t.replace(ID, other), KEY)).toBeNull();
    const sig = t.slice(ID.length + 1);
    const flipped = `${ID}.${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`;
    expect(readNoteToken(flipped, KEY)).toBeNull();
    for (const junk of ["", ID, `${ID}.`, `${ID}.short`, "not-a-uuid.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", `${t}x`, `${"a".repeat(200)}`]) {
      expect(readNoteToken(junk, KEY), junk).toBeNull();
    }
    expect(readNoteToken(t, "")).toBeNull();
    expect(readNoteToken(null, KEY)).toBeNull();
  });

  it("will not sign without a key or for something that is not a note id", () => {
    expect(() => signNoteToken(ID, "")).toThrow();
    expect(() => signNoteToken("../../etc", KEY)).toThrow();
  });
});
