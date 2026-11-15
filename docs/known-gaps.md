# Known gaps and model errors

What is knowingly unfinished, and what the model still gets wrong on the synthetic clubs. Use this for the roadmap and the "Testing" section of the Round 3 report. Closed items are removed; git history has them.

## Known gaps (Phases 7 to 9, and matching)

- **Phase 7 (left):** the Gaps tab lists linked records separately (only the Commitments and Recurring tabs fold them into one card); each gap names its linked twins and why their evidence does not count.
- **Phase 8 (left):** a reviewer who *deletes* a link (instead of "Not the same") is not remembered. The Draft tab only offers the two verdicts, so this is reachable only through the API.
- **Phase 8 (left):** the re-review flag watches status and trust only. A later run that fills a blank field of an accepted item (for example a duty's approver) changes the item's content without flagging it; it does invalidate the lead's ready mark and shows in the pending diff.
- **Phase 8 (left):** the lead's mark covers items the lead cannot read (the advisor's private items), so the advisor's own change to such an item also needs a new mark. The count shown to the lead is of readable items.
- **Phase 8 (left):** no RLS test runs the pipeline's `plan_matches` step over a `distinct` pair; the skip is covered by a unit test of `planMatches` and the SQL by `link_obligations`.
- **Phase 9:** `release_item()` and `audit_row()` still use the obligation's private uploaders for context items. This is safe (more restrictive), but the outgoing lead cannot release or read the audit of a private note built from their own file.
- **Phase 9:** a released private item may borrow from a linked private item of the same uploader that the receiving role cannot read, so its trust can reflect a record they cannot see. The releaser sees this when releasing; consider showing "trust based on records you cannot see" to the receiver.
- **Matching:** links are not transitive (A–B and B–C do not make A borrow C's evidence). Duty pairs are scored on descriptions and approvers only. The fake's duty wording is poor, so offline runs do not link the finance copy of the HoD rule; the live probe does.

## Known gaps (Phase 10)

- Each account is recorded right after it is created, so a function that dies in between leaves at most one account unrecorded. It carries `user_metadata.sandbox`; nothing removes it automatically.
- A purged copy's session token stays valid until it expires (about an hour), but the account has no membership, so it reads nothing.
- A copy is built from the small Phase 1 fixture (9 messages, 6 items). Phase 11's generator should feed `insertClub` a richer club.
- `getViewer()` still takes the first membership; copy accounts have exactly one, but a real user in two workspaces would be ambiguous.

## Known gaps (Phase 11)

- The filler repeats phrases more than real chat does. Tamil-English lines come from a list of eight.
- Trello `dueComplete` is always false in the generated board (moves carry the evidence, as in the mini board).

## Known gaps (Phase 12)

- The year eval was not re-run after the matching fix (another about $0.05). A unit test covers the exact pair.
- Leak checks search for the planted restricted strings. A paraphrase of a restricted fact (an amount in words) would not be caught; the in-memory check covers model-written text for the literal strings only.
- The browser leak sweep uses the photo club (plus the copy's 9-message fixture); the RLS leak test covers both generated clubs.
- The offline fake does not know "Chief Warden" or "faculty advisor" as approvers, and still extracts Trello card names as promises.
- The P6 finding above is a design question, not fixed.

## Known gaps (Phase 13)

- A reply belongs to one acknowledgement; when the incoming lead answers an item again, older replies are not shown on the handover page (they remain in the audit log).
- The built club's dates were computed for 10 Nov 2026 (`built.today`). "Overdue" and "Start now" are computed live, so they drift as time passes; next-due dates do not roll forward until the ledger is rebuilt.
- Building a year copy on the hosted database was timed on 15 Nov 2026: 47 s, because the functions ran in Washington and the database is in Sydney (90 sequential calls). Fixed in Phase 18 (54 calls, functions in `syd1`); the new time on the live app is in [status.md](status.md).
- `pnpm cache:warm` is a manual step; a new deployment against a fresh database needs it again.
- No accessibility audit yet.

## Known gaps (Phase 15)

- Only the four gaps in the Round 2 report become questions. An item with no verified quote at all (trust "gap") and a promise not yet checked for follow-up are still shown on the Gaps tab only.
- An answer cannot be edited or withdrawn on its own. Removing the statement file (on Add files) removes every answer at that level, and their questions come back. "I don't know" can be followed by one real answer.
- A promise plus the lead's own "done" counts as corroborated (two files). The quote is labelled as the lead's statement everywhere, but the trust badge alone does not say so.
- Questions are asked per record: two records linked as the same item may each ask, until an answer on one lends its evidence to the other.
- The built year club has no duty without an approver or a date, so those two kinds of question appear only for clubs built from other files.
- `tests/rls/leak.test.ts` does not walk `gap_answers`; its read rules are covered by `tests/rls/gap-questions.test.ts`.
- A ruling made after a version is approved shows on the handover only from the next version (versions are frozen), so the incoming lead can see "Nobody had ruled on it" while the advisor already has.
- The audit history shows status and trust changes by their stored names (`no_evidence` → `fulfilled`), as it does for other review actions.

## Known gaps (Phase 16)

- An approved note cannot be withdrawn, corrected or re-issued; there is one note per counterparty. A later version does not update it (it is what was sent). A new note would need the old one to be superseded, which is not built.
- No email or chat is sent: the outgoing lead copies the link and sends it themselves. Nothing records that it was sent, only that it was acknowledged.
- The acknowledgement is one button with an optional name. The counterparty cannot reply or say "this is wrong"; the note tells them to contact the new contact.
- Anyone holding the link can acknowledge it, and can give any name. The name is shown as given.
- Counterparties are grouped by name only. "Dean" and "Dean's office", or "fest volunteers" and "the volunteers", are separate notes; aliases (`aliases` table) are not used yet.
- Items released to the incoming lead from finance or private are never offered for a note, even though she may read them.
- The default new contact is the incoming lead's demo name (Kavya); in a real club the lead would type it.
- `tests/rls/leak.test.ts` does not walk `counterparty_notes`; its rules are covered by `tests/rls/counterparty-notes.test.ts`, and the e2e sweep includes `/handover/notes`.

## Known gaps (Phase 17)

- Only yearly repetition is inferred. A task repeated every semester, every month or before every event is found only when a record states it.
- "The same task" is decided by shared rare words. Two records of one task in different words ("posters are up" and "the noticeboards are done") are not matched; two different tasks that share a rare name could be. Each inferred duty is a draft for the reviewer, and its quotes are shown.
- A task already stated as a duty is skipped, not added to: the old year's records do not become past instances of the stated duty.
- The next due date is a year after the last time it was done. If the club moved the event, the date is wrong until the records say so; the card shows its basis.
- The outgoing lead cannot confirm or deny an inferred duty through a gap question; the reviewer accepts or rejects it. A confirmation by the lead (which would lift it out of Inferred, on the lead's word) is not built. The database would still accept an approver answer for one through the API.
- Stated duties the model finds are still re-proposed after a reviewer rejects them (the inferred ones are not).
- The live build's stage 7 reads every message the user can read in one step. A club with several years of chat would need it split.

## What the model got wrong (Phase 12 paid runs)

- **Photo P6** (hand over the camera and keys): the follow-up check took "the passbook stays in the cupboard", from the finance chat, as implying it was done. Status became Likely done, and, by the provenance rule, the committee item became finance-level, so the incoming lead would not see it. See outstanding task 4.
- **Photo:** "Sent the lab licence request to the IT cell." was extracted as a promise (it is a report), and shows as No evidence kept.
- **Year precision 79%:** 8 unplanned commitments, mostly Trello card descriptions ("Count what the lab has.", "Keep updated with receipts.", "Posters in first-year blocks.") and reports ("Posters printed, collecting tomorrow morning.").
- **Year C15:** "Registration desk is ready, forms are printed." judged only implied (Likely done).
- **Year R4** (hold the annual IoT Fest, no approval) not found apart from R2 (the auditorium), which shares its message.
- 23 context notes were dropped by code for naming people or numbers not in their message: the check is doing its job.

## What the model got wrong (Phase 17 build, database path, 15 Nov 2026)

The year club rebuilt with the 2024-25 chat. Scorecard: 24/24 commitments, 23/24 statuses, 19/21 trust, 2/2 levels, 31/31 follow-up quotes, 2/2 contradictions, 3/4 stated duties with 3/3 approvers, 4/4 duties found from repetition with 4/4 dates right and 4/4 labelled Inferred (no extra, no decoy), 0 decoys, 0 wrong links, 0 leaks, precision 88%.

- **Year C15** ("I'll handle the registration desk on the day"): the follow-up check took two filler lines ("Lakshmi where are you, we are at the parking") as saying it was not done, so the item is Contradicted and has a conflict for the advisor, although "Registration desk is ready, forms are printed" says it was done. The new chat changed the word weights, so this prompt was asked afresh. The advisor can rule it done; the demo leaves it unruled, as the build made it.
- **Year C21** (last year's sponsorship proposal): this year's "sent" messages were also cited as its follow-up, so it is Corroborated instead of Sourced. Its status (done) is right.
- **Year R4** (hold the annual IoT Fest) is still missed.
- 18 extra commitments, 13 of them Trello cards or minutes lines restating planted promises (accepted with them) and 5 unplanned (drafts).

## What the model got wrong (Phase 13 builds, database path)

- **Year: 6 unplanned items** (the drafts in the built club): "collect the printed posters" (a report), "registration renewal status report" (a report), and four Trello cards with due dates (banner design, registration form, recruitment posters, an October permission-letter card).
- **Year: one wrong link.** The card "Lab permission letter (Nov workshop)" was linked to the January promise (C2) as well as to C1. The scorer counts a wrong link only between two planted items, so this is not in its count.
- **Year C15** ("Registration desk is ready, forms are printed.") is still only Likely done.
- **Year R4** (hold the annual IoT Fest, no approval) is still missed; it shares its message with R2.
- **Photo:** "Sent the lab licence request to the IT cell." is still extracted as a promise (a report). The P6 item (camera and keys) is now right: status and trust 9/9.

## Known gaps (Phase 18)

- Repeated acknowledgements, replies and placeholders are kept once by the server actions; a client calling the API directly twice still stores two rows (the pages show one acknowledgement per item; a duplicate reply or placeholder would show twice).
- Acknowledgements by the incoming lead are not in the review History (they are on the handover page); only replies, notes and review actions are.
- A counterparty note can list two promises with the same name from different years (the year club's 2025 and 2026 sponsorship proposals) with due dates written without a year ("by 15 January", "by 20 January"), so they read like a duplicate. The due text is shown as the record wrote it.
- The build resumes after a refresh only for runs started in the last 30 minutes by the same person.
- Once, `next dev` on port 3200 went into a reload loop ("Compiled" after every request), so a form never submitted; the cause was not found. `next build && next start` worked, and the e2e dev server (port 3100) did not show it. Not seen on the deployed app.
