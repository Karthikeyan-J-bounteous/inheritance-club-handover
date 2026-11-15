# Inheritance

**They left. Their promises didn't.** A handover ledger for university student clubs.

Every year a club's committee changes and knowledge is lost: who was promised what, which duties come round every year, and which of them need someone's permission first. Inheritance reads a club's WhatsApp chat exports, meeting minutes (.md/.docx) and Trello JSON export, and builds a ledger of **obligations**: promises owed to people, and recurring duties with the approvals they need.

- Every claim links to a verbatim quote, and code (not a model) checks that the quote really appears in its source message.
- Anything unsupported is shown as a gap ("No evidence kept"), never as done. An inference is labelled Inferred, never shown as fact.
- The outgoing lead and faculty advisor review and approve a version before the incoming lead sees it. Approved versions never change.
- Each role sees only what it is allowed to, enforced by Postgres row-level security, not by hiding things in the page.

Workflow: **Add files → Build the ledger → Check the records → Review → Hand over**.

> **All demo data is synthetic.** No real people or organisations appear in this repository or the live demo.

Built solo for the CodersInPune Hackathon (Round 3 finale, November 2026).

## Try it (5 minutes, no setup)

Open **<https://inheritance-club-handover.vercel.app>** and press **Sign in**.

1. Press **Explore a built handover**. In about half a minute you get your own private copy of a year of a synthetic IoT club (about 2,250 messages in six files at four access levels: this year's chats, Trello board, minutes and a private chat, plus last year's committee chat), with its ledger already built by Claude and version 1 approved. Nothing you do affects anyone else.
2. The home page tells you your next step and gives you one button for it. You start as **Arun**, the outgoing lead.
3. Use **Switch person** (top right) to become **Dr. Meena** (faculty advisor), **Kavya** (incoming lead) or **Divya** (treasurer). Each sees only what their role may read.
4. Or press **Start from your own files** for an empty club: one click loads four sample files, then build, check, review, approve and hand over yourself.

No password is needed for your own copy. The four **shared demo accounts** and their password are also listed on the sign-in page.

A good path through the three Round 3 improvements, in a built copy:

| As | Go to | What to see |
|---|---|---|
| Arun | Build the ledger → **Yearly duties** | "Duties nobody wrote down (4)": duties found only because they repeat, labelled Inferred, with the years they were done |
| Arun | Check the records → **Questions for you** | Answer a gap (for example "set up the demo kits"); the item's trust changes and the answer is labelled "Stated by the outgoing lead" |
| Arun | Review | Accept it again and mark ready; switch to Dr. Meena and approve version 2 |
| Arun | Hand over → **Notes to people outside the club** | Draft a note to the sponsor, save, approve, copy the signed link, open it in a private window and acknowledge it |
| Kavya | Hand over | People waiting on her, the calendar (the IoT workshop slides say "Start now"), the lead's answers, the note's acknowledgement |

## Features

**Add files (Connect).** WhatsApp `.txt` (Android and iPhone), Trello `.json`, minutes as `.md` or `.docx`, several at once. An access level per file (everyone, committee, finance, private); one-to-one chats start as private and money-related files as finance. A "what was read" report counts every dropped line by reason. Files are parsed, not stored. One-click sample files. Remove a file (audited), name aliases, delete the whole club.

**Build the ledger (Reconstruct).** One button runs small background steps with live progress and time left, and carries on after a refresh:
- promises: who owes whom, what, by when;
- recurring duties: how often, which approval, from whom, how far ahead to start, next due and start-by dates (computed by code);
- follow-up: later records that say it was done, imply it, or say it was not;
- context notes: decisions, contacts, risks, dependencies;
- the same item recorded twice (a chat promise and its Trello card) linked, never merged;
- **duties nobody wrote down**, found by code from repetition across years (Round 3).

**Check the records (Verify).** Every quote opens its source message, highlighted, with its neighbours. Five trust labels set by a fixed rule: Corroborated, Sourced, Inferred, Contradicted, Gap. Conflicts (records that disagree) wait for the advisor's ruling; gaps say what would close them. **Questions for the outgoing lead** turn gaps into answers (Round 3).

**Review.** Accept, edit, reject or reopen each item with a reason; "same item" or "not the same" on linked records. Two-step sign-off: the outgoing lead marks the draft ready, the advisor approves an immutable version (one version per mark, so a double press cannot make two). A diff between versions. Full audit history with actor, reason, before and after.

**Hand over.** The incoming lead's view of the latest approved version: people waiting on her, a duty calendar with "Start now" and "Overdue", already-done items, conflicts with both sides and the ruling, sealed placeholders for what she may not read. She accepts, questions or declines each item; the outgoing lead and advisor reply. **Notes to people outside the club**, sent by signed link and acknowledged without an account (Round 3).

**Guidance and reliability.** No walkthrough needed: a home page with each person's next step, a one-line purpose on every page, a next-step bar at the end of every step, empty, error and loading states everywhere, confirmation before anything destructive, buttons that cannot be pressed twice, odd addresses explained instead of crashing, and a phone layout.

**Demo mode.** A private copy per visitor (four accounts of its own, passwords derived on the server, deleted after seven days), a daily keep-alive and clean-up job, and a daily budget on model calls.

## Round 3: the three improvements committed in Round 2

| # | Improvement | What was built |
|---|---|---|
| 1 | **Find recurring duties nobody wrote down** | Code finds a task reported done at about the same time of year in two or more years that no stated duty covers. It is stored as a duty labelled Inferred, lists the years it was done (each a verified quote), and gets a start-by date from the longest past lead time. In the built club: 4 of 4 planted duties found, dates right, none extra. |
| 2 | **Gap questions for the outgoing lead** | A promise with no follow-up, a duty with no approver or date, and an unruled conflict each become one question. The answer is saved as a message in a "Stated by the outgoing lead" file at a chosen level, so the quote check, trust rule, audit log, re-review and version diff all apply unchanged. |
| 3 | **Counterparty handoff notes** | For each person or office the approved version names (a sponsor, the lab in-charge, the Dean's office), a change-of-contact note from a fixed template plus the lead's own fields, copied by the database from approved items the incoming lead may read. The lead edits and approves it; the counterparty opens a signed link without an account and acknowledges it; the acknowledgement shows on the handover. |

Phase 14 removed the guided tour and rebuilt the interface so it guides a first-time visitor by itself; Phase 18 hardened it (odd addresses, refreshes, the same action twice) and wrote these docs. Details: [docs/status.md](docs/status.md) and [docs/changes-from-round1.md](docs/changes-from-round1.md).

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Scaffold, health route, test tooling, CI | done |
| 1 | Schema, RLS, seed, demo login, role switcher | done |
| 2 | Parsers: WhatsApp, Trello, minutes (.md/.docx), all stamped in IST | done |
| 3 | Connect (import) page and timeline | done |
| 4 | LLM adapter, commitment extraction, quote verifier | done |
| 5 | Fulfilment, recurring duties with approvals, context notes | done |
| 6 | Matching, trust rule, docket | done |
| 7 | Ledger UI and evidence pane | done |
| 8 | Review: two-step sign-off, rulings, immutable versions, audit | done |
| 9 | Handover: people waiting, duty calendar, sealed placeholders, acknowledgements | done |
| 10 | Demo mode: a private copy per visitor, daily keep-alive and clean-up | done |
| 11 | Synthetic year generator with hand-written ground truth | done |
| 12 | Scoring, leak tests, a second synthetic club, end-to-end tests | done |
| 13 | Two stricter checks, the built year club in demo copies, replies to questions | done |
| 14 | Round 3: no walkthrough; UI/UX overhaul so the app guides itself | done |
| 15 | Round 3, improvement 2: gap questions for the outgoing lead | done |
| 16 | Round 3, improvement 3: counterparty handoff notes | done |
| 17 | Round 3, improvement 1: duties found from repetition | done |
| 18 | Round 3: hardening, end-to-end sweeps, README, final report | done |

## Stack

Next.js 16 (App Router, TypeScript strict), Tailwind CSS + shadcn/ui, Supabase (Postgres, Auth, RLS, `pg_trgm`), Anthropic SDK (Claude Haiku 5.5) behind a single adapter, Zod, `whatsapp-chat-parser`, `mammoth`, Vitest, Playwright. Hosted on Vercel Hobby and Supabase Free.

## Run it yourself

Requirements: **Node 24**, **pnpm** (through corepack), **Docker Desktop** (running), and macOS, Linux or Windows with WSL 2. About 15 minutes, most of it Docker pulling the Supabase images. **No Anthropic API key is needed** to run the app, the demo club or the tests.

```bash
# 1. Get the code and its packages
git clone https://github.com/Karthikeyan-J-bounteous/inheritance-club-handover.git
cd inheritance-club-handover
export COREPACK_NPM_REGISTRY=https://registry.npmjs.org   # this shell only; lets corepack fetch pnpm
corepack enable pnpm
pnpm install
pnpm exec playwright install chromium   # for the end-to-end tests and the report renderer

# 2. Start a local Supabase (Postgres, Auth) in Docker; this also creates the database
pnpm db:start                # prints the API URL, the publishable key and the secret key

# 3. Configure
cp .env.example .env.local
#    In .env.local set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and
#    SUPABASE_SECRET_KEY from step 2's output, and choose any DEMO_USER_PASSWORD.
#    Leave ANTHROPIC_API_KEY empty unless you want to call the real model.

# 4. Seed the demo accounts and club, and load the saved model answers
pnpm seed                    # four shared demo accounts + a small synthetic club, version 1 approved
pnpm cache:local             # saved answers for the sample files, so building from them needs no API key

# 5. Run
pnpm dev                     # http://localhost:3000
```

Then open <http://localhost:3000>, press **Sign in** and **Explore a built handover** (as in "Try it" above).

- **Building from your own files** uses the real model and needs `ANTHROPIC_API_KEY`. Without a key, set `LLM_PROVIDER=fake` in `.env.local`: an offline rule-based stand-in (what the tests use) builds a rougher ledger at no cost. The sample files work either way after `pnpm cache:local`.
- **Check it works:** <http://localhost:3000/api/health> returns `"status": "ok"` and `"db": "ok"`; `pnpm test` runs the unit and database tests; `pnpm e2e` runs the browser tests.
- Supabase Studio (a database browser) runs at <http://127.0.0.1:54323> while the local stack is up. `pnpm db:stop` stops it.
- **Deploying** to hosted Supabase and Vercel: [docs/deploy.md](docs/deploy.md). A second development machine: [docs/dev-setup.md](docs/dev-setup.md).
- **The product document** (the Round 3 PDF) is rendered from [docs/report/round3.html](docs/report/round3.html) with `pnpm report`.

Packages always come from the public npm registry. The project `.npmrc` contains only `registry=https://registry.npmjs.org/`, with no tokens or auth. The `COREPACK_NPM_REGISTRY` export applies only to the current shell session, and no global config is changed.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Production build (what Vercel runs) |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `pnpm test` | All Vitest projects. RLS tests are skipped (with a count) if Supabase env is missing |
| `pnpm test:unit` | Unit tests only |
| `pnpm test:rls` | RLS integration tests against local Supabase (fails if env is missing) |
| `pnpm e2e` | Playwright: re-seeds, clears the fake model's saved answers, starts its own dev server (port 3100) with the fake model, and runs every journey. Set `E2E_BASE_URL` to test a deployment (tests that change data are skipped) |
| `pnpm db:start` / `db:stop` / `db:status` | Local Supabase stack |
| `pnpm db:reset` | Re-create the local database from `supabase/migrations` |
| `pnpm db:push` | Apply migrations to the linked hosted project (`--remote`; the CLI targets local by default) |
| `pnpm gen:scenario` | Regenerate every generated scenario (`data/scenarios/*/world.yaml`) or one (`-- year`); `-- --check` only compares |
| `pnpm db:types` | Regenerate `src/lib/supabase/database.types.ts` |
| `pnpm seed` / `seed:hosted` | Seed demo accounts and the synthetic club (local / hosted) |
| `pnpm eval:extract` | Extraction quality on the mini scenario (dry run; `-- --yes` calls the model) |
| `pnpm demo:freeze` | Builds a scenario's ledger through the app's own pipeline on local Supabase with the real model, scores it, and (for `--scenario year`) writes the frozen club for demo copies. Estimate only without `-- --yes` |
| `pnpm cache:export` / `cache:warm` / `cache:local` | Copy the saved model answers for the synthetic scenarios from the local cache to `data/demo/llm-cache.json`; load that file into the hosted cache (`warm`) or the local one (`local`) |
| `pnpm report` | Render the Round 3 product document (`docs/report/round3.html`) to `docs/Inheritance_Round3_Product.pdf` (git-ignored) |
| `pnpm eval:pipeline` | Scores the whole pipeline against a scenario's ground truth: `--scenario mini\|year\|photo` (default mini). Dry run with a cost estimate by default; `-- --fake` scores the offline stand-in for free; `-- --yes` calls the model; `--model <id>` compares another |

## Parsers

`src/lib/parsers/` turns uploads into one `ParsedEvent` shape (author, IST timestamp, text, thread, small metadata). They are pure: no database access, no network.

| Source | Parser | Notes |
|---|---|---|
| WhatsApp `.txt` (Android or iPhone) | `parseWhatsApp` | Drops system lines, deleted messages and attachments without text, and counts each. Unknown formats raise a clear error. |
| Trello board `.json` | `parseTrello` | Cards, comments, member additions, list moves (a move into "Done" is flagged), completion and due-date changes. |
| Minutes `.md` or `.docx` | `parseMinutesMarkdown`, `parseMinutesDocx` | One event per dated heading. |

`parseUpload(filename, bytes)` picks the parser from the extension. Every parser returns `{ events, summary }`; the summary is the "what was read" report (counts, dropped items by reason, first and last date, warnings).

**Everything is IST.** WhatsApp exports carry no time zone, so their times are read as IST, and Trello's UTC times are converted to IST. Timestamps are ISO 8601 strings ending `+05:30` (`src/lib/time.ts`). Numeric dates in minutes are read day-first.

`data/samples/` holds format samples and year-long files; `data/scenarios/mini/` is a small scenario with a `ground-truth.json` that the tests check the parsers against. Two generated scenarios come from a `world.yaml` each (`pnpm gen:scenario`, seeded and deterministic, no model), with a hand-written `ground_truth.yaml`:

- `data/scenarios/year/`: an IoT club over a year (about 2,000 messages): committee chat, volunteers chat, Trello board, finance-level minutes, and the advisor's private one-to-one chat.
- `data/scenarios/photo/`: a photography club over a term, with a different cast and different file shapes: an iPhone committee chat, a finance chat, the outgoing lead's private chat with the advisor, and Word (`.docx`) minutes with dates in words. No Trello.

## Connect (import) and timeline

- **`/import`**: the outgoing lead or advisor chooses files, and the app suggests who may see each one. One-to-one chats start as private, and files whose names mention money start as finance. The uploader confirms they are authorised to use the data and sees a notice naming the LLM provider. Each file is parsed on the server and saved with its events in one transaction by `import_source()`, running as the signed-in user, so RLS checks every row. The raw file is not stored; only its events, a "what was read" summary and its SHA-256 are kept. The page also lists the files your role may read, lets the uploader or advisor remove a file (with a reason, audited), edits aliases, and holds the delete-workspace control. The shared demo club cannot be deleted.
- **`/messages`**: every message your role may read, grouped by IST day, filterable by file and text.
- **Upload limit**: about 3.9 MB per import, because Vercel caps request bodies at about 4.5 MB. A year of text-only chat is usually well under that.
- **Sample files**: "Use the 4 sample files" loads the synthetic photography club (`public/samples/photo/`) at preset levels; the files can also be downloaded from the page.

## Building the ledger (LLM)

One button on `/ledger`, **Build the ledger**, runs every step in order as small jobs. The browser calls `POST /api/jobs/run-next` until all are done, showing progress for each stage. Each step runs as the signed-in user, so the model only sees messages that user may read. Job records hold ids and counts, never text. Results are drafts for review.

1. **Commitments** (`src/lib/pipeline/extract.ts`). Messages are chunked by thread. The model returns candidates citing short message references. Code keeps a candidate only if its quote is verbatim in the cited message, it isn't hedged ("maybe", "will see"), and it names a counterparty and a deliverable. Everything else is dropped and counted by reason.
2. **Recurring duties** (`cycles.ts`). Code picks messages that mention cycles, rules or approvals. The model groups them into duties: how often, what approval is needed and from whom, how far ahead to start. The cadence, approver and lead time must appear in the duty's own quotes, or they are left blank (or the duty is dropped). Next-due and start-by dates are computed by code, from a stated month or one period after the last recorded instance, and the ledger says which ("Stated in the records" or "Estimated"). When neither is possible it says "Not derivable from the records".
3. **Follow-up and context** (`fulfilment.ts`, `related.ts`). For each item, code picks the related messages: rare shared words, plus the same Trello card. The model reports later messages that say it was done, imply it was done, or say it was not done, plus up to five context notes: decisions, contacts, risks and dependencies. Code drops follow-ups that are unverified, dated before the promise, the promise itself, hedged or a question. It also drops notes that name a person or number not in their own message, or that are about something else.
4. **Status from evidence alone** (`status.ts`, mirrored by `app.followup_status()` in SQL). Says done and not done: **Contradicted**. Says done: **Done**. Only implies done: **Likely done (inferred)**. Only says not done: **Open**. Nothing: **No evidence kept**. An item not yet checked says so.

Safeguards:

- **One adapter.** Every model call goes through `generateStructured()` in `src/lib/llm/adapter.ts`. It uses structured output validated with Zod, retries once on invalid output, caches responses by prompt hash in `llm_cache`, enforces a daily call budget (`LLM_MAX_CALLS_PER_DAY`), and returns typed errors. Tiers map to `LLM_MODEL_FAST` and `LLM_MODEL_STRONG`; every task currently uses the fast tier. Providers are swappable: `anthropic`, or `fake` for offline tests.
- **Every check runs twice.** Quotes, dates and grounding are checked in TypeScript, then again inside the database functions that store them (`add_extracted_commitment()`, `add_recurring_duty()`, `record_followup()`). A claim without a verified quote cannot be saved.
- **Prompts never mix access levels.** Commitment chunks and duty batches hold messages of one access level only (and one uploader for private files), so nothing the model writes can carry restricted text into a more open row. The database refuses a duty whose quotes span levels.
- **Levels follow the evidence.** An item inherits the most restrictive message it cites, including follow-up evidence, so a status learned from finance minutes is visible only to finance readers. Each context note has the level of its own message.
- **Audited.** Every stored item, quote, note and status change writes an audit row with the reason. Re-running finds nothing new, reuses saved answers and writes no new audit rows.

**`pnpm eval:pipeline`** scores the whole pipeline against a scenario's ground truth (`src/lib/eval/score.ts`): commitments found and kept wrongly (decoys, unplanned), status, trust and access level, follow-up quotes, contradictions, duties and approvers, wrong links, and **leaks** (restricted text in anything stored at a more open level). It estimates cost without `--yes`, and calls the model only with `-- --yes`. Results on Claude Haiku 5.5:

| Scenario | Commitments | Status | Follow-up quotes | Contradictions | Duties (approver) | Decoys kept | Leaks | Cost |
|---|---|---|---|---|---|---|---|---|
| mini (9 Nov 2026) | 5/5 | 5/5 | 5/5 | 1/1 | 2/2 (2/2) | 0 | — | about $0.005 |
| photo (10 Nov 2026) | 9/9 | 8/9 | 9/9 | 1/1 | 4/4 (4/4) | 0 | 0 | about $0.013 |
| year (10 Nov 2026) | 19/19 | 17/19* | 24/24* | 2/2 | 3/4 (3/3) | 0 | 0 | about $0.053 |

Phase 13, through the database path the app itself uses (`pnpm demo:freeze`: files imported by their uploaders, the ledger built as the outgoing lead and then the advisor, Claude Haiku 5.5, 10 Nov 2026), after the two stricter checks:

| Scenario | Commitments | Status | Trust | Follow-up quotes | Contradictions | Duties (approver) | Precision | Decoys kept | Leaks | Cost |
|---|---|---|---|---|---|---|---|---|---|---|
| mini | 5/5 | 5/5 | 5/5 | 5/5 | 1/1 | 2/2 (2/2) | 100% | 0 | 0 | about $0.004 |
| photo | 9/9 | 9/9 | 9/9 | 9/9 | 1/1 | 4/4 (4/4) | 90% | 0 | 0 | about $0.013 |
| year | 19/19 | 18/19 | 15/16 | 26/26 | 2/2 | 3/4 (3/3) | 83% | 0 | 0 | about $0.053 |

The year build is the ledger visitors see in "Explore a built handover". What it gets wrong is listed in [docs/known-gaps.md](docs/known-gaps.md).

\* Scored against the truth as first written. One of the two "wrong" statuses was a mistake in the truth: the model marked C18 Open from two "still waiting" reports, which is what the status rule says; the truth now agrees (18/19, and the two reports make 26/26 follow-up quotes). What the model got wrong is listed in [docs/known-gaps.md](docs/known-gaps.md). The year run found a matching bug that is now fixed: two semesters' identical promises were linked by rule.

## Review and versions

`/review` is the fourth step. Nothing reaches the incoming lead until it has been checked and approved.

- **Draft** (outgoing lead and advisor): every item with its quotes, grouped as *Changed since accepted*, *Draft*, *Accepted* and *Rejected*. Each can be accepted, edited (a fixed list of fields; status and trust are never editable), rejected or moved back to draft, always with a reason. Linked records can be marked "Same item" or "Not the same"; a verdict stands, and later runs leave that pair alone.
- **Sign-off in two steps.** The outgoing lead marks the accepted draft ready; the faculty advisor approves it as a new version, and only while that mark still matches. Any change to an accepted item or note afterwards means a new mark. An accepted item whose status or trust moved because a later run found new records is flagged, and blocks both steps until it is accepted again or rejected.
- **Conflicts.** The advisor rules on each (done, not done, cannot tell) with a reason. A ruling is the advisor's decision, shown as such; the item stays contradicted because the records still disagree.
- **Versions** are immutable, even for the service role. Each holds the items with their evidence (including which quotes are only inferred), the same-item links, the conflicts with their rulings, and context notes, each at its own access level. Every role sees the diff from the previous version built only from the rows it can read.
- **History** lists every review action from the audit log with its actor, reason and what changed.

On **`/handover`** the incoming lead accepts, questions or declines each item of the latest approved version. The outgoing lead and the advisor see the answers and can **reply** to a question or a decline; the incoming lead reads the reply under her question. Replies are append-only and audited (`ack_replies`, migration 0020).

## Roles and permissions

Permissions are enforced by Postgres row-level security (`supabase/migrations/0003`–`0004`, and `0014` for the working ledger). The UI never decides what a role can see.

| Role | Can read |
|---|---|
| Faculty advisor | Everything |
| Outgoing lead | Everyone, committee, finance, plus private items built only from files they uploaded |
| Treasurer | Everyone, committee, finance |
| Incoming lead | Approved versions only (items at everyone or committee level, plus items released to the role), never the working ledger |
| Member | Approved versions only (items at everyone level) |

Any role can also read items explicitly released to it, through `release_item()`, which is audited.

How the guarantees are enforced:

- **Inherited levels.** An obligation inherits the most restrictive level of the messages it cites; a trigger does this, so it doesn't depend on the import code.
- **Immutable records.** Approved versions, version items, acknowledgements and audit rows can't be changed, even with the service role. Only `delete_workspace()` can remove them.
- **Tests.** `tests/rls/` proves each role sees exactly its expected rows.

Demo accounts (synthetic): `arun.demo@example.com` (outgoing lead), `meena.demo@example.com` (advisor), `kavya.demo@example.com` (incoming lead), `divya.demo@example.com` (treasurer). These are shared by every visitor.

## Demo mode

- **Your own demo club** (on `/login`): a private workspace with four accounts of its own. Nothing a visitor does reaches anyone else, and RLS applies as in any club. The role menu switches only among the accounts of the visitor's own copy. Two choices:
  - **Explore a built handover**: the synthetic year club (2,255 messages; volunteers chat, committee chat, Trello board, finance minutes, the advisor's private chat, and last year's committee chat) with the ledger a real model built from it (49 items, 4 of them duties found from repetition), frozen in `src/lib/demo/year-club.json` and loaded without a model call (`src/lib/demo/frozen-club.ts`). Version 1 is approved by the copy's own outgoing lead and advisor; the model's five extra items are left as drafts to review.
  - **Start from your own files**: the four people and nothing else. Connect offers the photography club's four sample files (`public/samples/photo/`) with the level to set for each.
- The shared accounts below use the small Phase 1 fixture (`src/lib/demo/fixture.ts`, loaded by `load-club.ts`), which the RLS tests assert row by row.
- Copy accounts have no stored password: the server derives each from the account's email with an HMAC under `SUPABASE_SECRET_KEY`. A signed, http-only cookie offers "Return to your demo club" after signing out.
- A copy is deleted after 7 days, when its visitor deletes it on Connect, or when they start a fresh one. Bookkeeping is in `demo_sandboxes` (service role only; migration `0017`). At most 300 copies are active and 60 start per hour.
- **Daily cron** (`vercel.json` → `GET /api/cron/daily`, guarded by `CRON_SECRET`): queries the database so the free Supabase project is not paused, and deletes expired copies.

## Troubleshooting

- **`unable to get local issuer certificate` when calling the Anthropic API locally.** Your network re-signs HTTPS traffic with its own certificate, which your operating system trusts but Node's built-in list does not. `pnpm dev`, `pnpm eval:extract` and `pnpm eval:pipeline` already pass Node's `--use-system-ca`, so Node uses the operating system's trusted certificates. Certificate checking stays on. Vercel is not affected.

## Tests

- **Unit** (`pnpm test:unit`): parsers, pipeline rules, review and handover logic, the generator, and the offline pipeline over every scenario, scored (no decoys, no wrong links, no leaks, no prompt that writes stored text mixing access levels).
- **RLS** (`pnpm test:rls`, local Supabase): each role's rows, the database functions, and a **leak test**: both generated scenarios imported by their real uploaders, the ledger built by the outgoing lead and the advisor, a version signed off, then every row of every table, view and read function searched, per role, for finance amounts and private subjects that role may not read.
- **End to end** (`pnpm e2e`, Playwright, offline model): login, roles, import, building the ledger, review, handover, demo copies, and the **whole flow** on the second club in a visitor's copy (four files at four levels → build → review → approve → hand over), followed by every page and every source-message URL opened as every role and searched for restricted text.
- **Round 3 journeys** (e2e, each in a visitor's own copy of the built club): gap questions (answer → trust changes → accept again → approve version 2 → the incoming lead reads it), counterparty notes (draft → approve → open the signed link in a fresh browser → acknowledge → shown on the handover), duties found from repetition (labelled, their years, on the calendar with "Start now"), and the guidance with no walkthrough.
- **Robustness** (`e2e/robustness.spec.ts`, Phase 18): every page signed out, odd addresses (bad ids, unknown versions, pages past the end, invalid note links), a refresh on every page and in the middle of a build, and the same action twice (a double-pressed approval makes one version).

Latest run (15 Nov 2026): 497 unit, 220 database and 73 end-to-end tests, all passing.

## Health check

`GET /api/health` → `{ "status": "ok", "service": "inheritance", "commit": "abc1234", "db": "ok", "time": "..." }`

`db` is `ok`, `error` or `not_configured`; `status` is `degraded` unless `db` is `ok`.

## Docs

- [docs/status.md](docs/status.md): where the build is, and the Round 3 plan
- [docs/report/round3.html](docs/report/round3.html): the Round 3 product document (`pnpm report` renders the PDF)
- [docs/submission.md](docs/submission.md): the answers for the Round 3 submission form
- [docs/dev-setup.md](docs/dev-setup.md): setting up another computer
- [docs/deploy.md](docs/deploy.md): hosted Supabase, Vercel, and the after-every-phase checklist
- [docs/architecture.md](docs/architecture.md): migrations, library code, routes, tests
- [docs/decisions.md](docs/decisions.md): design decisions and why
- [docs/gotchas.md](docs/gotchas.md): pitfalls found while building
- [docs/known-gaps.md](docs/known-gaps.md): known gaps and model errors
- [docs/changes-from-round1.md](docs/changes-from-round1.md)
- [docs/ai-disclosure.md](docs/ai-disclosure.md)
- [docs/archive/round2/report.html](docs/archive/round2/report.html): the Round 2 project document (render with `node scripts/render-report.ts docs/archive/round2/report.html docs/round2.pdf`)

## Licence

MIT, see [LICENSE](LICENSE).
