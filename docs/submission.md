# Round 3 submission: answers for the form

Paste-ready answers for the Round 3 submission form (CodersInPune, closes 16 Nov 2026, 11:59 pm, no late window). One submission per team, by the team leader. Each answer stands on its own, because a form field is read without the others.

---

## Team

- **Team name:** PCIe 6.0
- **Team leader:** Karthikeyan J (solo; team size 1)
- **Project name:** Inheritance: a handover ledger for university student clubs

## Final working project link

https://inheritance.karthikeyanj.com

How to use it alone: press **Sign in**, then **Explore a built handover**. In about half a minute you get your own private copy of a synthetic IoT club (2,255 messages in six files) with its ledger built and version 1 approved. No password is needed. The home page shows your next step; "Switch person" (top right) moves between Arun (outgoing lead), Dr. Meena (faculty advisor), Kavya (incoming lead) and Divya (treasurer). The shared demo accounts and their password are also shown on the sign-in page. All data is synthetic.

## Final source-code repository

https://github.com/Karthikeyan-J-bounteous/inheritance-club-handover

Public, MIT licence. The README explains how to clone and run it locally in about 15 minutes (Node 24, pnpm, Docker); no API key is needed.

## Final product PDF

Upload `docs/Inheritance_Round3_Product.pdf` (rendered with `pnpm report` from `docs/report/round3.html`).

## Complete list of features

Inheritance reads a club's WhatsApp exports, meeting minutes and Trello board and builds a ledger of what the outgoing committee owes: promises to people and recurring duties with their approvals. Every claim links to a quote checked by code; nothing reaches the incoming lead until the outgoing lead and faculty advisor approve it; each role sees only what the database allows.

1. Add files: WhatsApp .txt (Android and iPhone), Trello .json, minutes .md and .docx, several at once, each at an access level (everyone, committee, finance, private) with suggested defaults; a "what was read" report counting dropped lines; clear refusal of bad or duplicate files; files parsed, never stored; one-click sample files; remove a file with a reason; aliases; delete a club.
2. Build the ledger with one button: promises (who owes whom, what, by when), recurring duties (cadence, approval, approver, lead time, next due and start-by dates computed by code), follow-up (done, implied, not done), context notes, the same item across files linked (never merged); live progress with time left; resumes after a refresh; saved answers reused; a daily model-call budget.
3. NEW (Round 3): duties nobody wrote down, found by code from repetition across years, labelled Inferred with the years they were done and a start-by date.
4. Check the records: every quote opens its source message, highlighted; five trust labels set by a fixed rule (Corroborated, Sourced, Inferred, Contradicted, Gap); a conflicts docket for the advisor's ruling; a gaps list; a searchable timeline of all messages.
5. NEW (Round 3): questions for the outgoing lead about each gap; each answer becomes a labelled, verified source.
6. Review: accept, edit, reject or reopen with a reason; "same item" or "not the same"; two-step sign-off (lead marks ready, advisor approves); immutable versions with a diff; a full audit history (actor, reason, before and after).
7. Hand over: the incoming lead's view of the approved version: people waiting on her, a duty calendar with "Start now" and "Overdue", already-done items, conflicts with both sides and the ruling, sealed placeholders; accept, question or decline each item; reviewers reply.
8. NEW (Round 3): notes to people outside the club (sponsor, lab in-charge, Dean's office), built from approved items, approved by the outgoing lead, opened from a signed link with no account, and acknowledged; the acknowledgement shows on the handover.
9. Permissions: five roles enforced by Postgres row-level security on every table; items inherit the strictest level of their sources; audited releases; leak tests at three layers.
10. Guidance and reliability: no walkthrough needed (home page with each person's next step, a one-line purpose on every page, next-step bars); empty, error and loading states; confirmation before destructive actions; buttons that cannot be pressed twice; odd addresses explained; phone layout.
11. Demo mode: a private copy per visitor (built or empty), four accounts each, deleted after 7 days; daily keep-alive and clean-up; health endpoint.

## Technical architecture and implementation summary

- Next.js 16 (App Router, TypeScript strict) on Vercel Hobby; Supabase Free for Postgres, Auth and row-level security; Tailwind CSS and shadcn/ui; Anthropic Claude API (Haiku 5.5); Zod; Vitest and Playwright.
- Import: a server action parses each file into one event shape (IST timestamps) and calls a database function as the signed-in user, so RLS checks every row written. Only events, a counts-only summary and a SHA-256 are kept.
- Build: the work is split into small jobs in a `jobs` table; the browser calls `POST /api/jobs/run-next` until all are done, so no request exceeds Vercel's time limit. Each job reads only what its user may read.
- Model calls go through one adapter: a Zod schema as structured output, validated again, one retry, cached by prompt hash, a daily budget. Prompts never mix access levels.
- The model proposes; code decides. A claim is stored only if its quote is a verbatim (normalised) part of the cited message, checked in TypeScript and again in SQL. Status and trust come from fixed rules in database triggers; dates come from code; each item inherits the strictest level of its sources.
- Review and versions go through database functions that check the role, require a reason and write the audit log. Versions, acknowledgements, replies, approved notes and audit rows are immutable even for the service role. A version identical to the last is refused.
- Pages filter first, then render: every query runs as the viewer. The incoming lead reads only approved version rows. Counterparty notes are copied by the database from the approved version; the public page checks an HMAC signature, then reads that one note through a server-only function.
- Round 3 additions use no model: repetition is found by code and stored by `add_inferred_duty()`; gap answers are stored as statements by `answer_gap()`; notes are a fixed template filled by the database.
- 25 SQL migrations; per-visitor demo copies created on the server with derived passwords; a daily cron for keep-alive and clean-up.

## Improvements completed after Round 2 (including the three named)

The three improvements committed in the Round 2 report were all delivered, each beyond its minimum. None was impossible.

1. Find recurring duties nobody wrote down (committed improvement 1): code finds a task done at about the same time of year in two or more years that no record calls a duty, stores it as a duty labelled Inferred with each year's records as verified quotes, and computes a start-by date from the longest past lead time. In the built club it found 4 of 4 planted duties with the right dates and no extras; the IoT workshop slides appear on the incoming lead's calendar with "Start now".
2. Gap questions for the outgoing lead (committed improvement 2): a promise with no follow-up, a duty with no approver or date, and an unruled conflict each become one question. The answer is saved as a message in a "Stated by the outgoing lead" source, so the quote check, trust rule, audit log, re-review and version diff apply unchanged; the item's trust changes at once and the incoming lead sees the labelled answer in the next version.
3. Counterparty handoff notes (committed improvement 3): one note per outside person or office the approved version names, built only from approved items she may read, edited and approved by the outgoing lead, opened from a signed link without an account, acknowledged, and shown on the handover.

Also after Round 2: the guided tour and walkthrough page were removed and the interface rebuilt so it guides a first-time visitor by itself (home page with each person's next step, a purpose line on every page, next-step bars, plain labels, loading, empty and error states, confirmations, phone layout, accessibility pass); the handover page now shows already-done promises and explains conflicts with the ruling; and a hardening sweep fixed a double-pressed approval creating a duplicate version, repeated answers stored twice, errors on odd addresses, and a build stopping after a refresh.

## Testing details

- Unit tests (Vitest): 497: parsers, the trust and status rules, repetition finding, gap questions, notes, signed links, the next-step logic, and the offline pipeline over every scenario, scored.
- Database tests on a local Supabase: 220: each role's rows, every database function's refusals, audit rows, immutability, the identical-version rule, and a leak test over two generated clubs.
- End-to-end browser tests (Playwright): 73: every journey (sign-in and roles, import, build, check, review and sign-off, handover), the whole flow on a second club, each Round 3 improvement in a visitor's copy, guidance with no walkthrough, a robustness suite (pages signed out, odd addresses, refresh on every page and mid-build, the same action twice), and a per-role leak sweep of every page.
- Each new test was first shown to fail with its fix removed.
- Quality against hand-written ground truth (Claude Haiku 5.5, through the app's own pipeline): year club 24/24 promises, 23/24 statuses, 31/31 follow-up quotes, 2/2 conflicts, 3/4 stated duties, 4/4 duties found from repetition, 88% precision, 0 decoys, 0 leaks, about $0.04; photography club 9/9, 9/9, 90% precision, 0 leaks; mini club 5/5, 100%.
- Lint, type check and production build are clean. No user testing was done (the Round 1 interviews were not carried out; the PDF says so).

## Product roadmap and future development plan

- Next 4 weeks: pilot with 3 to 5 real clubs at one university at the end of the academic year, with consent; run the office-bearer interviews and a usability test promised in Round 1.
- Next 3 months: close the known gaps: the lead confirms or denies an inferred duty, edit or withdraw a gap answer, re-issue a note, send notes by email or WhatsApp and record that they were sent, group counterparties through aliases, semester and per-event repetition, paraphrase-aware leak checks, a formal accessibility audit.
- Next 6 months: import directly from Google Drive and the Trello API, a share-sheet path for WhatsApp exports, larger files, and calendar reminders before each start-by date.
- Next year: a student-affairs view across all clubs of a university with the same row-level security, templates per club type, Tamil and Hindi interfaces.
- Later: keep the ledger live during the year so the handover is approving what is already there; a self-hosted package and a local-model option for universities that cannot send chats to an external API.
- Sustainability: free for student clubs (a year of chat costs about four US cents of model time to build); a paid plan for universities (all-clubs view, single sign-on, self-hosting).
