-- Inheritance: counterparty handoff notes (Phase 16, Round 3 improvement 3).
--
-- For each person or office outside the club that the approved handover owes something to
-- (a sponsor, a lab in-charge, a department office), the outgoing lead can send a short
-- change-of-contact note: what is still owed, by when, and the new contact.
--
--   - A note is built only from items of the LATEST APPROVED VERSION whose counterparty is that
--     person, and only items the incoming lead may read (level everyone or committee, no
--     private uploaders). Finance and private items are never offered, whoever asks. The item
--     fields are copied here, by code, from version_items; the browser only says which items.
--   - The rest of the note is the outgoing lead's own fields (who it is to, the new contact,
--     how to reach them, a short message). No model writes any of it.
--   - Only the outgoing lead drafts, edits, approves or discards a note. An approved note never
--     changes (it is what was sent).
--   - The counterparty opens it from a signed link (/n/<token>; the signature is checked on the
--     server with a server-only key) and may acknowledge it. Opening and acknowledging run as the
--     service role through two functions that only the service role may call; they read and
--     write the note and its acknowledgement only, never the ledger.
--   - Every change is audited at the note's level, with before and after.

create table public.counterparty_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- The approved version the items were copied from.
  version_id uuid not null references public.versions (id) on delete cascade,
  -- The counterparty as the records name them, and the key that groups their items.
  counterparty text not null check (length(trim(counterparty)) between 1 and 120),
  party_key text not null,
  recipient text not null check (length(trim(recipient)) between 1 and 80),
  new_contact text not null check (length(trim(new_contact)) between 1 and 80),
  contact_details text check (contact_details is null or length(contact_details) <= 120),
  message text check (message is null or length(message) <= 600),
  -- Copied from the workspace and the outgoing lead's account when drafted, so the public page
  -- needs nothing but this row.
  club_name text not null,
  sender_name text not null,
  -- [{obligation_id, kind, description, due_text, due_date, status, ruling, cadence, period, next_due, approval, linked_same}]
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array'),
  -- The most restrictive level among the items: everyone or committee, never higher.
  access_level public.access_level not null default 'everyone' check (access_level <= 'committee'),
  state text not null default 'draft' check (state in ('draft', 'approved')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  check ((state = 'approved') = (approved_at is not null)),
  unique (workspace_id, party_key)
);
create index counterparty_notes_workspace_idx on public.counterparty_notes (workspace_id);

-- One acknowledgement per note, from the signed link. Immutable.
create table public.counterparty_note_acks (
  note_id uuid primary key references public.counterparty_notes (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text check (name is null or length(name) <= 80),
  created_at timestamptz not null default now()
);

alter table public.counterparty_notes enable row level security;
alter table public.counterparty_note_acks enable row level security;

-- Drafts: the roles that read the working ledger. Approved notes: any member whose clearance
-- covers the note's level (the incoming lead reads the notes that name her as the contact).
create policy counterparty_notes_select on public.counterparty_notes for select to authenticated
  using (
    (state = 'approved' or app.sees_working_ledger(workspace_id))
    and app.can_read(workspace_id, access_level, '{}', null, null)
  );

-- Runs under the caller's RLS on notes, so an acknowledgement is visible exactly when its note is.
create policy counterparty_note_acks_select on public.counterparty_note_acks for select to authenticated
  using (exists (select 1 from public.counterparty_notes n where n.id = counterparty_note_acks.note_id));

-- No write policies: rows are written only by the functions below.
revoke all on public.counterparty_notes from anon;
revoke all on public.counterparty_note_acks from anon;
revoke insert, update, delete, truncate on public.counterparty_notes from authenticated;
revoke insert, update, delete, truncate on public.counterparty_note_acks from authenticated;
grant select on public.counterparty_notes to authenticated;
grant select on public.counterparty_note_acks to authenticated;

-- An approved note never changes; it may go only with its workspace.
create function app.counterparty_note_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.state = 'approved' and not (tg_op = 'DELETE' and app.flag('app.allow_workspace_delete')) then
    raise exception 'an approved note cannot change: % is not allowed', tg_op
      using errcode = 'insufficient_privilege', hint = 'Approved notes are what was sent.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create trigger counterparty_notes_guard before update or delete on public.counterparty_notes
  for each row execute function app.counterparty_note_guard();
create trigger counterparty_notes_no_truncate before truncate on public.counterparty_notes
  for each statement execute function app.forbid_mutation();
create trigger counterparty_note_acks_immutable before update or delete on public.counterparty_note_acks
  for each row execute function app.forbid_mutation();
create trigger counterparty_note_acks_no_truncate before truncate on public.counterparty_note_acks
  for each statement execute function app.forbid_mutation();

----------------------------------------------------------------------------------------
-- Who a note is for
----------------------------------------------------------------------------------------

-- The key that groups a counterparty's items: app.person() (case, spaces, NFKC), without a
-- leading "the", "all" or "our". Null for the club itself and its committees, which are not
-- outside the club. Mirrors partyKey() in src/lib/notes/notes.ts; keep the two in sync.
create function app.party_key(p text) returns text
language sql immutable
set search_path = ''
as $$
  select case
    when k is null or k = '' then null
    when k ~ '^((new|next|incoming|outgoing|old|current|core|club)\s+)*(club|committee|team|members|committee members)$' then null
    else k
  end
  from (
    select regexp_replace(regexp_replace(coalesce(app.person(p), ''), '[\s.,;:!]+$', ''), '^((the|all|our)\s+)+', '') as k
  ) x
$$;

-- Who an approved item is owed to, for a note: a promise's counterparty, or the approver of a
-- recurring duty (else whoever the duty is owed to).
create function app.note_party(o jsonb) returns text
language sql immutable
set search_path = ''
as $$
  select app.party_key(case
    when o ->> 'kind' = 'recurring' then coalesce(nullif(trim(o ->> 'approver'), ''), o ->> 'owed_to')
    else o ->> 'owed_to'
  end)
$$;

-- The fields of one approved item a note may carry. A whitelist: no quotes, no notes, no people
-- other than the counterparty, no access level.
create function app.note_item(p_obligation uuid, p_item jsonb) returns jsonb
language sql immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'obligation_id', p_obligation,
    'kind', o ->> 'kind',
    'description', o ->> 'description',
    'due_text', o ->> 'due_text',
    'due_date', o ->> 'due_date',
    'status', o ->> 'status',
    -- The advisor's ruling on a conflict, as it stood in the version (the latest one, if several).
    'ruling', (select c ->> 'ruling' from jsonb_array_elements(coalesce(p_item -> 'conflicts', '[]')) c
               where c ->> 'ruling' is not null order by c ->> 'ruled_at' desc nulls last limit 1),
    'cadence', o ->> 'cadence',
    'period', o ->> 'period',
    'next_due', o ->> 'next_due',
    'approval', o ->> 'approval_required',
    -- Records the reviewers marked as the same item, so the note can say it once.
    'linked_same', coalesce(p_item -> 'linked_same', '[]')
  )
  from (select p_item -> 'obligation' as o) x
$$;

-- The latest approved version's items that may go in a note for this party: at most committee
-- level (what the incoming lead may read), never private, owed to that party.
create function app.note_candidates(p_ws uuid, p_party_key text)
returns table (obligation_id uuid, access_level public.access_level, item jsonb, description text)
language sql stable security definer
set search_path = ''
as $$
  select vi.obligation_id, vi.access_level, app.note_item(vi.obligation_id, vi.item), vi.item -> 'obligation' ->> 'description'
  from public.version_items vi
  where vi.version_id = (select v.id from public.versions v where v.workspace_id = p_ws order by v.number desc limit 1)
    and vi.access_level <= 'committee'
    and cardinality(vi.private_uploaders) = 0
    and app.note_party(vi.item -> 'obligation') = p_party_key
$$;

create function app.note_public(n public.counterparty_notes) returns jsonb
language sql immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'counterparty', n.counterparty, 'recipient', n.recipient, 'new_contact', n.new_contact,
    'contact_details', n.contact_details, 'message', n.message, 'items', n.items,
    'access_level', n.access_level, 'state', n.state, 'version_id', n.version_id)
$$;

create function app.audit_note(p_note public.counterparty_notes, p_action text, p_reason text, p_before jsonb, p_after jsonb, p_actor uuid)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.audit_log (workspace_id, actor, action, target_type, target_id, obligation_id, reason, before, after, access_level, private_uploaders)
  values (p_note.workspace_id, p_actor, p_action, 'counterparty_notes', p_note.id::text, null, p_reason, p_before, p_after,
          -- At the more restricted of before and after (an edit may drop the only committee item).
          greatest(p_note.access_level, coalesce((p_before ->> 'access_level')::public.access_level, 'everyone')), '{}')
$$;

-- The outgoing lead of the note's workspace, or an error. Returns the note, locked.
create function app.lead_note(p_note uuid) returns public.counterparty_notes
language plpgsql security definer
set search_path = ''
as $$
declare
  n public.counterparty_notes;
begin
  select * into n from public.counterparty_notes c where c.id = p_note for update;
  if n.id is null or not app.is_member(n.workspace_id) then
    raise exception 'note not found' using errcode = 'no_data_found';
  end if;
  if not app.has_role(n.workspace_id, array['outgoing_lead']::public.app_role[]) then
    raise exception 'only the outgoing lead can change a note' using errcode = 'insufficient_privilege';
  end if;
  return n;
end
$$;

----------------------------------------------------------------------------------------
-- The outgoing lead's actions
----------------------------------------------------------------------------------------

-- Draft a note for one counterparty, with every item it may carry chosen.
create function public.draft_counterparty_note(p_workspace uuid, p_counterparty text, p_new_contact text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_key text := app.party_key(p_counterparty);
  v_version uuid;
  v_items jsonb;
  v_level public.access_level;
  n public.counterparty_notes;
begin
  if not app.has_role(p_workspace, array['outgoing_lead']::public.app_role[]) then
    raise exception 'only the outgoing lead can write a note to someone outside the club' using errcode = 'insufficient_privilege';
  end if;
  if v_key is null then
    raise exception 'a note goes to someone outside the club, not to the club or its committee' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_new_contact), '') = '' then
    raise exception 'say who the new contact is' using errcode = 'check_violation';
  end if;
  select v.id into v_version from public.versions v where v.workspace_id = p_workspace order by v.number desc limit 1;
  if v_version is null then
    raise exception 'there is no approved version yet: a note is built from approved items only' using errcode = 'check_violation';
  end if;
  select jsonb_agg(c.item order by c.description, c.obligation_id), max(c.access_level)
    into v_items, v_level
    from app.note_candidates(p_workspace, v_key) c;
  if v_items is null then
    raise exception 'nothing in the approved version that the incoming lead may read is owed to them' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.counterparty_notes c where c.workspace_id = p_workspace and c.party_key = v_key) then
    raise exception 'there is already a note for them' using errcode = 'unique_violation';
  end if;

  insert into public.counterparty_notes (workspace_id, version_id, counterparty, party_key, recipient, new_contact,
                                         club_name, sender_name, items, access_level, created_by)
  values (p_workspace, v_version, trim(p_counterparty), v_key, left(trim(p_counterparty), 80), left(trim(p_new_contact), 80),
          (select w.name from public.workspaces w where w.id = p_workspace),
          coalesce(nullif(trim((select auth.jwt()) -> 'user_metadata' ->> 'name'), ''), 'The outgoing lead'),
          v_items, v_level, (select auth.uid()))
  returning * into n;

  perform app.audit_note(n, 'note_draft', 'Drafted a note to ' || n.counterparty, null, app.note_public(n), (select auth.uid()));
  return n.id;
end
$$;

-- Save the lead's fields and choice of items. The items are copied again from the latest
-- approved version, so a draft saved after a new version carries that version's wording.
create function public.update_counterparty_note(
  p_note uuid,
  p_recipient text,
  p_new_contact text,
  p_contact_details text,
  p_message text,
  p_items uuid[]
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  n public.counterparty_notes := app.lead_note(p_note);
  v_before jsonb;
  v_version uuid;
  v_items jsonb;
  v_level public.access_level;
  v_chosen uuid[] := coalesce(p_items, '{}');
begin
  if n.state <> 'draft' then
    raise exception 'an approved note cannot change' using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(v_chosen) x(id)
             where x.id not in (select c.obligation_id from app.note_candidates(n.workspace_id, n.party_key) c)) then
    raise exception 'one of the chosen items cannot go in this note: only approved items owed to them that the incoming lead may read'
      using errcode = 'check_violation';
  end if;
  v_before := app.note_public(n);
  select v.id into v_version from public.versions v where v.workspace_id = n.workspace_id order by v.number desc limit 1;
  select coalesce(jsonb_agg(c.item order by c.description, c.obligation_id), '[]'), coalesce(max(c.access_level), 'everyone')
    into v_items, v_level
    from app.note_candidates(n.workspace_id, n.party_key) c
   where c.obligation_id = any (v_chosen);

  update public.counterparty_notes c
     set recipient = trim(p_recipient),
         new_contact = trim(p_new_contact),
         contact_details = nullif(trim(coalesce(p_contact_details, '')), ''),
         message = nullif(trim(coalesce(p_message, '')), ''),
         items = v_items, access_level = v_level, version_id = v_version, updated_at = now()
   where c.id = n.id
  returning * into n;

  perform app.audit_note(n, 'note_edit', 'Edited the note to ' || n.counterparty, v_before, app.note_public(n), (select auth.uid()));
end
$$;

-- Approve: the note is then fixed and its link may be sent. Only a note built from the latest
-- approved version, with at least one item.
create function public.approve_counterparty_note(p_note uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  n public.counterparty_notes := app.lead_note(p_note);
  v_before jsonb := app.note_public(n);
begin
  if n.state = 'approved' then
    raise exception 'this note is already approved' using errcode = 'check_violation';
  end if;
  if n.version_id <> (select v.id from public.versions v where v.workspace_id = n.workspace_id order by v.number desc limit 1) then
    raise exception 'a newer version was approved since this draft was saved: save the draft again to update it' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(n.items) = 0 then
    raise exception 'choose at least one item for the note' using errcode = 'check_violation';
  end if;
  update public.counterparty_notes c
     set state = 'approved', approved_by = (select auth.uid()), approved_at = now(), updated_at = now()
   where c.id = n.id
  returning * into n;
  perform app.audit_note(n, 'note_approve', 'Approved the note to ' || n.counterparty, v_before, app.note_public(n), (select auth.uid()));
end
$$;

-- Discard a draft. An approved note cannot be discarded.
create function public.discard_counterparty_note(p_note uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  n public.counterparty_notes := app.lead_note(p_note);
begin
  if n.state <> 'draft' then
    raise exception 'an approved note cannot be discarded' using errcode = 'check_violation';
  end if;
  perform app.audit_note(n, 'note_discard', 'Discarded the draft note to ' || n.counterparty, app.note_public(n), null, (select auth.uid()));
  delete from public.counterparty_notes c where c.id = n.id;
end
$$;

----------------------------------------------------------------------------------------
-- The signed link (service role only; the server checks the signature first)
----------------------------------------------------------------------------------------

-- What the counterparty may see: the note's own fields, and its acknowledgement. Null for a
-- note that does not exist or is not approved.
create function public.public_counterparty_note(p_note uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', n.id, 'club_name', n.club_name, 'sender_name', n.sender_name, 'recipient', n.recipient,
    'counterparty', n.counterparty, 'new_contact', n.new_contact, 'contact_details', n.contact_details,
    'message', n.message, 'items', n.items, 'approved_at', n.approved_at,
    'ack', (select jsonb_build_object('name', a.name, 'created_at', a.created_at)
              from public.counterparty_note_acks a where a.note_id = n.id))
  from public.counterparty_notes n
  where n.id = p_note and n.state = 'approved' and app.is_service_role()
$$;

-- Acknowledge from the link. Pressing it twice keeps the first. Returns the acknowledgement, or
-- null for a note that does not exist or is not approved.
create function public.acknowledge_counterparty_note(p_note uuid, p_name text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  n public.counterparty_notes;
  a public.counterparty_note_acks;
  v_name text := nullif(left(trim(coalesce(p_name, '')), 80), '');
begin
  if not app.is_service_role() then
    raise exception 'acknowledgements come from the signed link only' using errcode = 'insufficient_privilege';
  end if;
  select * into n from public.counterparty_notes c where c.id = p_note and c.state = 'approved';
  if n.id is null then
    return null;
  end if;
  insert into public.counterparty_note_acks (note_id, workspace_id, name)
  values (n.id, n.workspace_id, v_name)
  on conflict (note_id) do nothing
  returning * into a;
  if a.note_id is not null then
    perform app.audit_note(n, 'note_ack', coalesce('Acknowledged by ' || v_name, 'Acknowledged') || ' from the signed link',
                           null, jsonb_build_object('name', v_name, 'note_id', n.id), null);
  else
    select * into a from public.counterparty_note_acks x where x.note_id = n.id;
  end if;
  return jsonb_build_object('name', a.name, 'created_at', a.created_at);
end
$$;

revoke execute on function public.draft_counterparty_note(uuid, text, text) from public, anon;
revoke execute on function public.update_counterparty_note(uuid, text, text, text, text, uuid[]) from public, anon;
revoke execute on function public.approve_counterparty_note(uuid) from public, anon;
revoke execute on function public.discard_counterparty_note(uuid) from public, anon;
grant execute on function public.draft_counterparty_note(uuid, text, text) to authenticated;
grant execute on function public.update_counterparty_note(uuid, text, text, text, text, uuid[]) to authenticated;
grant execute on function public.approve_counterparty_note(uuid) to authenticated;
grant execute on function public.discard_counterparty_note(uuid) to authenticated;

revoke execute on function public.public_counterparty_note(uuid) from public, anon, authenticated;
revoke execute on function public.acknowledge_counterparty_note(uuid, text) from public, anon, authenticated;
grant execute on function public.public_counterparty_note(uuid) to service_role;
grant execute on function public.acknowledge_counterparty_note(uuid, text) to service_role;

-- The definer helpers in app are called only from the functions above (which run as their
-- owner), never by a client.
revoke execute on function app.note_candidates(uuid, text) from public, anon, authenticated;
revoke execute on function app.audit_note(public.counterparty_notes, text, text, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke execute on function app.lead_note(uuid) from public, anon, authenticated;
