// Phase 18: "Explore a built handover" must be built from few calls. On the hosted app the
// function (Vercel) and the database (Supabase) are in different places, so every call is a
// round trip, and one request may not run past 60 seconds. At 90 calls (one update per accepted
// item) a copy took 47 s from a far region and sometimes never finished. This test counts the
// HTTP calls one year-club copy makes; if it fails, batch the new calls instead of raising the limit.
import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createSandbox, purgeOne } from "../../src/lib/demo/sandbox.ts";
import { env, hasEnv } from "./support.ts";

const CALL_BUDGET = 60;

describe.skipIf(!hasEnv)("the built year club's copy is made from few calls", () => {
  const made: { id: string; user_ids: string[] }[] = [];
  afterAll(async () => {
    const admin = createClient(env!.url, env!.secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const row of made) await purgeOne(admin as never, row).catch(() => {});
  });

  it(`takes at most ${CALL_BUDGET} calls, and no per-item update`, async () => {
    const opts = { auth: { persistSession: false, autoRefreshToken: false } } as const;
    const calls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url);
      calls.push(`${init?.method ?? "GET"} ${url.pathname.replace("/rest/v1/", "")}`);
      return real(input, init);
    }) as typeof fetch;
    let copy;
    try {
      const admin = createClient(env!.url, env!.secretKey, opts);
      copy = await createSandbox({
        club: "year", admin, secret: env!.secretKey,
        signIn: async (_key, email, password) => {
          const c = createClient(env!.url, env!.publishableKey, opts);
          await c.auth.signInWithPassword({ email, password });
          return c as never;
        },
      });
    } finally {
      globalThis.fetch = real;
    }
    const admin = createClient(env!.url, env!.secretKey, opts);
    made.push((await admin.from("demo_sandboxes").select("id, user_ids").eq("id", copy.workspaceId).single()).data!);

    expect(calls.length, calls.join("\n")).toBeLessThanOrEqual(CALL_BUDGET);
    // The items share a handful of status/trust pairs; one update each, never one per item.
    expect(calls.filter((c) => c === "PATCH obligations").length).toBeLessThanOrEqual(12);
  }, 120_000);
});
