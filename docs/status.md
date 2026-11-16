# Build status

Read this first when resuming work, on any machine. Last updated: 2026-11-16, Phase 19 (three interface fixes found by a first-time-visitor pass on the live app) built on `build/phase-19`, branched from `main` after Phase 18 and the demo-copy timeout fix.

Other docs:
- [dev-setup.md](dev-setup.md): setting up a new computer (tools, secrets, local database, hosted project).
- [architecture.md](architecture.md): migrations, `src/lib`, routes and tests.
- [decisions.md](decisions.md): why things are built this way (Phases 5 to 17).
- [gotchas.md](gotchas.md): things that broke once; read before touching the database, pipeline, demo copies or tests.
- [known-gaps.md](known-gaps.md): what is knowingly unfinished, and what the model still gets wrong.
- [deploy.md](deploy.md): hosted Supabase and Vercel, and the after-every-phase checklist.
- [changes-from-round1.md](changes-from-round1.md), [ai-disclosure.md](ai-disclosure.md): kept up to date whenever direction or AI use changes (CLAUDE.md).
- [archive/round2/](archive/round2/): the Round 2 project document. Section 10 holds the three improvements Round 3 is judged on.

## Where things stand

Round 2 (Phases 0 to 13, plus the guided tour) is merged and was submitted; the team qualified for the Round 3 finale. Round 2 built: parsers, Connect, the LLM pipeline with quote verification, matching and the trust rule, the docket, the ledger and evidence pane, two-step review with immutable versions, the handover page with acknowledgements and replies, per-visitor demo copies, the synthetic scenario generator, scoring and leak tests.

| Phase | Scope | State |
|---|---|---|
| 0 to 13 | Round 2 (see the README status table and [decisions.md](decisions.md)) | merged |
| 14 | Round 3: remove both walkthroughs; UI/UX overhaul so the app guides itself | merged (deploy: see outstanding tasks) |
| 15 | Round 3, improvement 2: gap questions for the outgoing lead | merged (deploy: see outstanding tasks) |
| 16 | Round 3, improvement 3: counterparty handoff notes | merged (deploy: see outstanding tasks) |
| 17 | Round 3, improvement 1: inferred recurring duties | merged (deploy: see outstanding tasks) |
| 18 | Round 3: hardening, end-to-end sweeps, README, final report PDF, form answers | merged |
| 19 | Round 3, rule 4 ("tighten the interface"): three small fixes from a first-time-visitor pass | built, awaiting merge and deploy |

Tests on `build/phase-18`: 497 unit and 220 database (`pnpm test`, 717 in all; Phase 17 had 715), 73 Playwright (new: `robustness.spec.ts`); lint, typecheck and production build clean.

### Phase 19 (built, awaiting merge)

Round 3 rule 4: "someone who did not build it must be able to complete the main journey without a walkthrough". A first-time-visitor pass on the live app (sign-in, answer a gap question, review, mark ready, approve as the advisor, read the handover as Kavya) needed no help. It found three small things, fixed here; no migration, no new variable, no dependency, no model call.

- **Raw stored values in the "Changed since version N" box and the Audit history** (`no_evidence → fulfilled`, `draft → accepted`). They now use the app's own words ("No evidence kept → Done"). The label maps moved to `src/lib/review/labels.ts` (re-exported from `commitments.tsx`), with one pure `diffValueLabel`.
- **The progress strip said "Review and approve" was done while approval or a second look was still the next step** (Dr. Meena's home page: "Approve the version" beside "4 of 5 steps done"; Arun with step 4 ticked and step 3 current). The stage is done only when a version exists, no mark waits for the advisor and no accepted item changed since (`src/lib/journey.ts`).
- **Kavya's "What you can read" panel said "Nothing visible to this role… once the advisor approves a version"** while version 2 was approved and 46 items waited for her. That panel lists live ledger rows (RLS keeps them from her); the copy now says so and points to the Handover page.
- **Two bits of demo chrome quietened** (asked for after the pass): the "Your own demo club is ready" note on the home page has a dismiss button that also takes `?welcome=copy` off the address, so a refresh does not bring it back (`src/components/home/welcome-banner.tsx`); and the "What … can read" table is now a closed `<details>` titled "How permissions are enforced" (still there as proof, with the same counts and test ids). The switcher, the "Synthetic demo" badge and the "kept until" pill stay: the handover needs three people and CLAUDE.md requires synthetic data to be labelled.
- Tests: 503 unit (6 new or changed: the review stage under four conditions, `diffValueLabel`, the history wording); each was shown to fail with its fix reverted. Lint, typecheck and production build clean. The RLS and Playwright suites need the local database (Docker was not running), so they were not re-run; no SQL changed and the only e2e check on the strip matches `\d of 5 steps done`. Run them with Docker up before merging if you can. **The new Playwright test** ("the welcome note can be dismissed for good, and the permissions table starts closed", `e2e/demo-club.spec.ts`) was written but never run, and was not shown to fail; run it first.
- Left as is: a lower-case duplicate item name in the diff ("write the handover document" next to "Write the handover document") is the extracted data (two records of one promise), not the interface; "Reason" on accept/reject is not marked required (the browser asks if it is empty).

### Phase 18 (merged)

Hardening and documentation. Every item on the submission list is ready except the steps only the user can do (outstanding tasks 1 to 4).

- **Sweeps** for what a judge does unasked, now in `e2e/robustness.spec.ts`: every page signed out, odd addresses (bad ids, unknown versions, version 0, a messages page past the end, forged note links, unknown tabs, odd search text), a refresh on every page, a refresh mid-build, and the same action twice. Bad files were probed against the parsers: every case already had a clear message.
- **Fixed:** Approve pressed twice made an identical version 2 (migration 0025: a version identical to the last is refused, and an unchanged draft cannot be marked; a ruling after approval can still be approved); a repeated acknowledgement, reply or placeholder was stored twice; drafting a note twice showed an error; a messages page past the end showed an error; a refresh mid-build left the build stopped (it now resumes); the sign-in page's message count (2,255 in six files since Phase 17). Each fix's test was shown to fail without it.
- **README** rewritten: what it is, try it in five minutes, the three improvements, features, and a numbered clone-and-run with no API key (`pnpm cache:local`, new).
- **Product document:** `docs/report/round3.html` with six screenshots from a fresh year copy (fake model, no paid call); `pnpm report` renders `docs/Inheritance_Round3_Product.pdf` (git-ignored, so render it on the machine you submit from). `docs/report/home.png` was retaken on 16 Nov 2026 from the live site after Phase 19 (the progress strip changed); `pnpm report:home [base-url] [output.png]` makes a fresh synthetic copy and retakes it.
- **Form answers:** `docs/submission.md`, one paste-ready answer per form field.
- Decisions: [decisions.md](decisions.md#phase-18-decisions-hardening-end-to-end-sweeps-docs). Open points: [known-gaps.md](known-gaps.md#known-gaps-phase-18).

### Phase 17 (merged)

Inferred recurring duties, Round 3 improvement 1, delivered to its minimum: in a year copy, the ledger's Yearly duties tab lists four "Duties nobody wrote down", each labelled Inferred with the years it was done (first record and done record, each a verified quote); Kavya's handover calendar has them in their months, and the IoT basics workshop slides (due 27 Nov 2026, start by 10 Nov 2026) show "Start now" (covered end to end by `e2e/inferred-duties.spec.ts`).

- **Detection is code, not a model** (`src/lib/pipeline/repeats.ts`): a task reported done at about the same time of year in two or more years (a whole number of years apart, give or take 31 days, the same rare words, one access level), that no stated duty covers. Lead time is the longest past start-to-done gap; the next due date is a year after it was last done.
- **Stored by `add_inferred_duty()`** (migration 0024), which repeats the checks and computes the dates and wording itself. Each record is cited as inferred `past_instance` evidence, and the trust rule now says Inferred for an item that rests only on inferred records. A later build never adds it twice, even after a rejection.
- **Pipeline stage 7** (`infer_duties`), after matching, one job, no model call. The build panel reports it.
- **The year club has a second past year:** `data/scenarios/year/whatsapp-committee-2024-25.txt` (the previous committee's chat), with four planted unstated duties (I1 to I4), three repeats of stated duties and a look-alike, in `ground_truth.yaml`. The five existing files are unchanged.
- **The demo club was re-frozen** with it (one paid run, approved: Haiku 5.5, 185 calls, 129 cached, about $0.040). Scorecard: 4/4 inferred duties with the right dates and label, none extra; 24/24 commitments, 23/24 statuses, 0 decoys, 0 leaks. New model errors are in [known-gaps.md](known-gaps.md#what-the-model-got-wrong-phase-17-build-database-path-15-nov-2026) (notably C15 is now a false conflict).
- **UI:** "Found from repetition" badge, "About once a year (inferred, not stated)", who did it each year, and the occurrences in place of the quote list, on the ledger, the review card, approved versions and the handover calendar. No gap question is asked about them.
- Decisions and open points: [decisions.md](decisions.md#phase-17-decisions-inferred-duties-round-3-improvement-1), [known-gaps.md](known-gaps.md#known-gaps-phase-17).

### Phase 16 (merged)

Counterparty handoff notes, Round 3 improvement 3, delivered to its minimum: in a year copy, Arun drafts a note to Brightwave Labs (the sponsor), adds how to reach Kavya and a message, saves, approves, copies the signed link; the link opens in a fresh browser with no account, "Ms. Rao" acknowledges it; the acknowledgement shows on the handover for Arun and Kavya and in the review History (covered end to end by `e2e/counterparty-notes.spec.ts`).

- **Who:** every person or office outside the club the latest approved version names (a promise's counterparty, a duty's approver). In the year club: Brightwave Labs, Bala sir, workshop speakers, the volunteers, the HoD, the Dean's office, the Dean. The club and its committees are not counterparties.
- **What:** only approved items the incoming lead may read (everyone or committee; never finance or private), chosen and copied by the database (migration 0023). A fixed template, no model text: still owed and by when, what they approve each time, already done, and Kavya as the new contact. Honest about what the records do not settle. A promise and its linked Trello card are said once.
- **Who acts:** only the outgoing lead drafts, edits, approves or discards (`/handover/notes`, live preview of the exact note; approve only once saved). An approved note never changes. Every action is audited with before and after.
- **The link:** `/n/<id>.<signature>`, an HMAC under a key derived from `SUPABASE_SECRET_KEY` (no new environment variable). The server checks it, then reads that one note through a service-role-only function; the page has no app header and records one acknowledgement.
- **Guidance:** after approval, the home page sends Arun to write the notes before handing on to Kavya, and offers a note beside the questions and the review. The handover has a "Notes to people outside the club" section.
- Also fixed: a year copy's 39 items all had the same `created_at` (one insert), so "oldest first" ties fell back to random ids; they now keep the build's order.
- Decisions and open points: [decisions.md](decisions.md#phase-16-decisions-counterparty-notes-round-3-improvement-3) (please check the one on levels: committee items are offered, finance and private never, even when released), [known-gaps.md](known-gaps.md#known-gaps-phase-16).

### Phase 15 (merged)

Gap questions, Round 3 improvement 2, delivered to its minimum and beyond: in a year copy, Arun answers "set up the demo kits" on the Questions tab of `/check`, sees "It is now Open, trust Corroborated", accepts it again, marks ready; Dr. Meena approves version 2; Kavya's handover shows the answer labelled "Stated by the outgoing lead (Arun, …)" (covered end to end by `e2e/gap-questions.spec.ts`).

- Questions for four gaps: promise with no follow-up, unruled conflict, duty with no approver, duty with no next date. Answers: done / not done / I don't know; an approver / no approval needed / I don't know; a date / I don't know.
- Each answer is a message from the lead in a "Stated by the outgoing lead" file at a chosen level (never below the item's), cited as verified evidence (or, for "I don't know", a verified note), through `public.answer_gap()` (migrations 0021, 0022). Quote check, trust and status rules, provenance, audit (`answer_gap` row with before and after), re-review, sign-off and version diff all apply unchanged. No model calls.
- The form previews the exact message and warns when a more restricted level would hide the item from someone. Only the outgoing lead answers; the advisor sees the lead's answer beside each conflict.
- Stated quotes are labelled on the ledger, the approved version, its diff and the handover. On the handover the lead's own words are on the card face, and promises already done are listed under "Already done" (they used to be counted but hidden, so the incoming lead could not answer them); the handover also shows each item's notes, and each conflict with both sides and the advisor's ruling.
- The home page sends the outgoing lead to open questions before review; the check page's next-step bar does too.
- Also fixed: the review page's "Accepted." confirmation was hidden under the sticky header when scrolled; it is now a bottom toast (shared with the questions page).
- Decisions and open points: [decisions.md](decisions.md#phase-15-decisions-gap-questions-round-3-improvement-2) (please check the one on trust: a promise plus the lead's own "done" counts as corroborated, by the unchanged Phase 6 rule), [known-gaps.md](known-gaps.md#known-gaps-phase-15).

### Phase 14 (merged)

Tour and `/guide` removed; one page per step (new `/check` and `/messages`; old ledger tab URLs redirect); next-step bar on every step page; instant build feedback with time left; one-click sample files; purple pastel theme; home page with the next step per role (`src/lib/journey.ts`); one-line purpose on every page; plain-language labels; person switcher shows "Switch person" with who-is-who; skeleton, route-bar and progress-bar loading states; confirm dialogs for removing a file and deleting a club; empty and error states on every list; mobile and accessibility pass. Details: [decisions.md](decisions.md#phase-14-decisions-uiux-no-walkthrough), [changes-from-round1.md](changes-from-round1.md).

Not done in Phase 14, by choice: a dark mode, and a Lighthouse or axe run (the pass was manual: focus rings, contrast by palette, labels, skip link, reduced motion). Worth checking on the live link after deploy: sign in on a phone-sized window and complete the flow as Arun, Dr. Meena and Kavya.

## How the user works

- One branch per phase (`build/phase-N`), small commits, one concern per commit. The user merges through GitHub pull requests; never push or merge.
- Stop at the end of each phase with a summary, and update this file. Wait for "start phase N".
- Ask before adding a dependency not named in CLAUDE.md.
- Ask before any paid model call. Show a cost estimate first.
- Prove a new test can fail (a deliberate one-off mutation, then restore).
- The user chooses the Claude Code model per phase. Round 3 suggestion: Sonnet 5.5 for 14 and 18 (UI, docs); Opus 5.5 for 15 to 17 (RLS, signed links, trust rule). Run `/code-review` on Opus before merging a Sonnet-built phase.

## Outstanding user tasks

Round 3 closes **16 Nov 2026, 11:59 pm, no late window**. Aim to submit by about 8 pm.

0. **Redeploy once more: the demo copy hung on the live app** (found 15 Nov 2026 after Phase 18 was deployed: it took 47 s of the 60 s limit, so judges would see an endless spinner). Merge the fix commit `fix(demo): a built copy loads in seconds…`, redeploy `main`, then check: `curl -sI https://inheritance.karthikeyanj.com/api/health | grep x-vercel-id` ends `::syd1::…` (not `::iad1::`), and "Explore a built handover" lands on the home page in a few seconds. If it still says `iad1`, set Vercel → Project → Settings → Functions → Function Regions to Sydney (`syd1`) too. No migration, no seed, no new variable. Cause and fix: [decisions.md](decisions.md#demo-copy-loading-forever-on-the-live-app-15-nov-2026-after-the-phase-18-deploy).

1. **Merge `build/phase-18` and deploy once** (checklist in [deploy.md](deploy.md#after-every-phase)). Phases 16 and 17 are merged but, as far as this file knows, not deployed: if so, this one deploy covers all three.
   - `pnpm db:push` **before** redeploying. It applies whichever of 0021 to 0025 the hosted database lacks (0023 and 0024 are needed by the Phase 16 and 17 code; 0025 is Phase 18's). Without it the handover, ledger and review pages fail on the hosted app.
   - `pnpm cache:warm` (if not run since Phase 17): loads the 182 saved answers so building from the sample files on the hosted app costs nothing.
   - Redeploy `main` in Vercel; check `/api/health` shows `"db": "ok"` and the merge commit.
   - No new environment variable, no seed change.
2. **Check the live app in a private window, as a judge would:** Sign in → Explore a built handover → follow the home page as Arun; Build the ledger → Yearly duties → "Duties nobody wrote down (4)"; Check the records → Questions for you → answer "set up the demo kits"; Review → accept it again → mark ready; Switch person → Dr. Meena → approve version 2 (pressing Approve again must now say it is already approved); Arun → Hand over → Notes → draft, save, approve the sponsor's note, open its link in another private window, acknowledge; Kavya → Hand over (calendar "Start now", the answer, the acknowledgement). Then once on a phone-sized window.
3. **Before judging:** in the Supabase dashboard raise **Authentication → Rate Limits → Sign-ups and sign-ins** (every visitor's sign-ins come from Vercel's few IPs; the default is 30 per 5 minutes per IP; see [deploy.md](deploy.md#notes)).
4. **Submit** (team leader only) at https://forms.gle/FxhT5Z1NupvGTGSw6: render the PDF with `pnpm report` (needs `pnpm exec playwright install chromium` once), upload `docs/Inheritance_Round3_Product.pdf`, and paste the answers from [submission.md](submission.md).
5. The Round 1 user interviews were not done. The docs say so. Do not add interview answers unless real people gave them.

## Environment facts

- **Live app:** `https://inheritance.karthikeyanj.com` (also reachable at `https://inheritance-club-handover.vercel.app`; both serve the same deployment). Hosted Supabase project ref: `gmlsskizjxhtoxnwhywj` (link it on a new machine; see [dev-setup.md](dev-setup.md)). Vercel deploys are manual.
- **Local stack:** `pnpm db:start` (Docker must be running), then `pnpm db:reset && pnpm seed`. `.env.local` holds local Supabase keys, `DEMO_USER_PASSWORD`, `ANTHROPIC_API_KEY` and the model names; `.env.hosted.local` holds hosted values for `pnpm seed:hosted` and `pnpm cache:warm`. Never print or commit either file's values.
- **npm registry:** the project `.npmrc` pins public npm. On the user's work Mac the global `~/.npmrc` points at an expired company mirror; never touch it. For corepack and `pnpm dlx`, prefix commands with `COREPACK_NPM_REGISTRY=https://registry.npmjs.org` (and `npm_config_registry` if needed), for that shell only.
- **TLS:** the user's work network re-signs HTTPS. Node needs `--use-system-ca`, which is already in `pnpm dev`, `eval:*` and `demo:freeze`. Never disable certificate checks.
- **Supabase CLI 3.0** (a dev dependency): `supabase db push` targets **local** by default; `pnpm db:push` adds `--remote`. Regenerate types with `pnpm db:types`.
- **New-style keys:** `sb_publishable_…` and `sb_secret_…` work with supabase-js. The local gateway translates a key only if it matches exactly.

## Round 3 plan (Phases 14 to 18)

Round 3 (the finale) opened 13 Nov 2026, 11:59 pm and **closes 16 Nov 2026, 11:59 pm, with no late window**. Aim to submit by about 8 pm on 16 Nov. Judges open the live link and use it alone, with no walkthrough. Marks: completeness 25, the three improvements 20, reliability 20, usability 20, documentation and roadmap 15. Everything must be built inside the event window. **No video** (the brief rules it out). Submission: live link, repository, product PDF, feature list, architecture and implementation summary, improvements after Round 2 (the three named), testing details, roadmap.

Decisions confirmed with the user (14 Nov):
- **Remove both walkthroughs:** the docked guided tour and the `/guide` page. The app itself must guide a first-time visitor.
- **UI/UX first**, then the three improvements, then hardening and docs.
- **Merge and deploy every phase.** Apply any new migrations (`pnpm db:push`) and redeploy on Vercel after each merge, then check `/api/health` shows the new commit. Hosted-only problems (the 60-second limit, migrations) then show up in the phase that caused them.

The three improvements were committed in the Round 2 report (section 10) and Round 3 is judged on exactly these. Each phase has a minimum that counts as delivered. If a phase overruns, cut scope down to that minimum rather than skip it. If something is genuinely impossible, the PDF must say so and why.

| Phase | Target | Scope | Minimum that counts as delivered |
|---|---|---|---|
| 14 UI/UX | 14 Nov | Remove the tour (`src/components/tour/`, `src/lib/tour/`, `src/app/actions/tour.ts`, `e2e/tour.spec.ts`, the tour cookie in `demo-club.ts`, the highlight CSS) and `/guide` (the header link, the sign-in link, the checks in `e2e/auth.spec.ts`). Keep `src/lib/demo/switch-user.ts` (the role menu uses it). Start with screenshots of every page as each person. Then: a home page showing each person their next step, with one primary button and handover progress worked out from the data; a one-line "what this page is for" on each page; an easier-to-find person switcher; empty, error and loading states on every list; buttons that cannot be pressed twice; confirmation before destructive actions; plain-language labels; a mobile layout check; an accessibility pass. | A first-time visitor gets from sign-in to the handover with no guide. |
| 15 Gap questions (improvement 2) | 15 Nov, morning | One page of questions for the outgoing lead: no follow-up, missing approver or date, unruled conflict. Each answer becomes a message in a "Stated by the outgoing lead" source at a chosen access level, so the existing quote check, trust rule, audit log and version diff all apply. No new model calls. | Answer a gap, see its trust change, approve, and the incoming lead sees it in the next version. |
| 16 Counterparty notes (improvement 3) | 15 Nov, afternoon | One note per counterparty, from a template plus fields, built from approved items only (no model text). The outgoing lead edits and approves it. The counterparty opens a public `/n/[token]` page signed with a key. It is served on the server and reads the note row only. It has an acknowledge button, and the acknowledgement shows on the handover. Audit rows and leak tests included. | One note goes from draft to approved, is opened and acknowledged, and the acknowledgement shows on the handover. |
| 17 Inferred duties (improvement 1) | 16 Nov, morning | Code (not a model) finds repeated items: the same task at about the same point in two or more past cycles. The year club gets a second past cycle containing 3 to 4 unstated duties, plus their ground truth. The trust rule labels them "inferred" and lists the occurrences. The start-by date comes from past lead times and shows on the calendar. A small paid eval, with a cost estimate shown before it runs. | Duties are detected in the built club, labelled Inferred with their occurrences, and placed on the calendar. |
| 18 Hardening and docs | 16 Nov, afternoon | Sweeps for bad input, refresh, the same action twice, and empty and error states; end-to-end tests of each journey. A README that someone else can clone and run from. The Round 3 PDF (feature list, architecture, improvements, testing, roadmap), rendered with `scripts/render-report.ts`. Update `docs/changes-from-round1.md` and `docs/ai-disclosure.md`. Final deploy and a check in a private window. | Every item on the submission list is ready. |
