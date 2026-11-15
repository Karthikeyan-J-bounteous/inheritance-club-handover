-- Phase 18 (hardening): the same sign-off twice.
--
-- Found by pressing "Approve this version" a second time: the outgoing lead's mark still
-- matched the pending items, so approve_version() made version 2, identical to version 1, and
-- the incoming lead was asked about every item again. Now a version is refused when it would be
-- identical to the latest one: the same items with the same content (their stored hashes, which
-- include the conflicts and rulings they carry) and the same context notes. A ruling made after
-- an approval still changes the items, so the advisor can approve a version that carries it.
--   * a trigger on versions refuses the identical version, so every path obeys it;
--   * marking ready is refused while the draft equals the latest version;
--   * signoff_status() says which version the draft already equals, so the page stops offering
--     "Approve" and says why.
-- Direct inserts by users are left to RLS (which refuses them); the service role (no
-- auth.uid(); seeds and tests) is exempt, as for other derived rules.

-- The number of the latest version, if the accepted draft would make exactly that version again.
create function app.unchanged_since(p_ws uuid)
returns integer
language sql stable security definer
set search_path = ''
as $$
  with latest as (
    select v.id, v.number, v.snapshot -> 'hashes' as hashes
    from public.versions v where v.workspace_id = p_ws order by v.number desc limit 1
  ), pending as (
    select o.id from public.obligations o
    where o.workspace_id = p_ws and o.review_state in ('accepted', 'edited')
  )
  select l.number from latest l
  where l.hashes = (select coalesce(jsonb_object_agg(p.id::text, md5(app.version_item(p.id)::text)), '{}') from pending p)
    and (select coalesce(md5(string_agg(c.context_item_id::text || c.text || c.access_level::text, '|' order by c.context_item_id)), '')
           from public.version_context_items c where c.version_id = l.id)
      = (select coalesce(md5(string_agg(c.id::text || c.text || c.access_level::text, '|' order by c.id)), '')
           from public.context_items c join pending p on p.id = c.obligation_id)
$$;

-- Security invoker, so current_user says who inserts: approve_version() runs as its owner, a
-- signed-in user's direct insert runs as `authenticated` (and is refused by RLS).
create function app.refuse_identical_version()
returns trigger
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_same integer;
begin
  -- A signed-in user's own insert is refused by RLS; only approve_version() (run as its owner) is checked here.
  if (select auth.uid()) is null or current_user in ('authenticated', 'anon') then
    return new;
  end if;
  v_same := app.unchanged_since(new.workspace_id);
  if v_same is not null then
    raise exception 'nothing has changed since version % was approved, so there is nothing new to approve. Accept, edit, reject or rule on something first', v_same
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger versions_refuse_identical before insert on public.versions
  for each row execute function app.refuse_identical_version();

-- mark_ready() as in 0013, plus: nothing to mark while the draft equals the latest version.
create or replace function public.mark_ready(p_workspace uuid, p_reason text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_hash text;
  v_count integer;
  v_same integer;
begin
  if not app.has_role(p_workspace, array['outgoing_lead']::public.app_role[]) then
    raise exception 'only the outgoing lead can mark the draft ready for the advisor' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required to mark the draft ready' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtext('approve_version:' || p_workspace::text));
  if exists (select 1 from public.obligations o where o.workspace_id = p_workspace and app.needs_rereview(o)) then
    raise exception 'some accepted items changed since they were accepted: review them again first' using errcode = 'check_violation';
  end if;
  select count(*) into v_count from public.obligations o where o.workspace_id = p_workspace and o.review_state in ('accepted', 'edited');
  if v_count = 0 then
    raise exception 'accept at least one item first' using errcode = 'check_violation';
  end if;
  v_same := app.unchanged_since(p_workspace);
  if v_same is not null then
    raise exception 'nothing has changed since version % was approved: accept, edit or reject an item first', v_same
      using errcode = 'check_violation';
  end if;
  v_hash := app.pending_hash(p_workspace);
  insert into public.review_signoffs (workspace_id, signed_by, pending_hash, item_count, reason)
  values (p_workspace, (select auth.uid()), v_hash, v_count, trim(p_reason))
  returning id into v_id;
  insert into public.audit_log (workspace_id, actor, action, target_type, target_id, reason, before, after, access_level)
  values (p_workspace, (select auth.uid()), 'mark_ready', 'review_signoffs', v_id::text, trim(p_reason),
          null, jsonb_build_object('item_count', v_count, 'pending_hash', v_hash), 'everyone');
  return v_id;
end
$$;

-- signoff_status() as in 0015, plus the version the draft already equals (null when it differs).
drop function public.signoff_status(uuid);
create function public.signoff_status(p_workspace uuid)
returns table (marked_at timestamptz, marked_by uuid, item_count integer, reason text, is_current boolean, approved_as integer)
language sql stable security definer
set search_path = ''
as $$
  select s.created_at, s.signed_by, s.item_count, s.reason, s.pending_hash = app.pending_hash(p_workspace),
         app.unchanged_since(p_workspace)
  from public.review_signoffs s
  where s.workspace_id = p_workspace and app.can_review(p_workspace)
  order by s.seq desc
  limit 1
$$;

revoke execute on function public.signoff_status(uuid) from public, anon;
grant execute on function public.signoff_status(uuid) to authenticated;
revoke execute on function app.unchanged_since(uuid) from public, anon;
