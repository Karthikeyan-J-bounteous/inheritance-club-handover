-- Phase 18 (hardening): the same sign-off twice.
--
-- Found by pressing "Approve this version" a second time: the outgoing lead's mark still
-- matched the pending items, so approve_version() made version 2, identical to version 1, and
-- the incoming lead was asked about every item again. Now:
--   * a mark approves at most one version (a trigger on versions, so every path obeys it);
--   * marking ready again when nothing has changed since the last approved version is refused;
--   * signoff_status() says which version a mark became, so the page stops offering "Approve".
-- The service role (no auth.uid(); seeds and tests) is exempt, as for other derived rules.

-- The version, if any, approved from a mark: the first one created at or after it. Marks and
-- approvals are separate transactions serialised by one advisory lock (0013), so this is exact.
create function app.version_from_mark(p_workspace uuid, p_marked_at timestamptz)
returns integer
language sql stable security definer
set search_path = ''
as $$
  select min(v.number) from public.versions v
  where v.workspace_id = p_workspace and v.created_at >= p_marked_at
$$;

create function app.one_version_per_mark()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_marked timestamptz;
  v_number integer;
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  select s.created_at into v_marked from public.review_signoffs s
   where s.workspace_id = new.workspace_id order by s.seq desc limit 1;
  v_number := app.version_from_mark(new.workspace_id, v_marked);
  if v_number is not null then
    raise exception 'this draft is already approved as version %. Nothing has changed since; to approve another version, the outgoing lead changes the draft and marks it ready again', v_number
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger versions_one_per_mark before insert on public.versions
  for each row execute function app.one_version_per_mark();

-- mark_ready() as in 0013, plus: nothing to mark when the draft equals the last approved one.
create or replace function public.mark_ready(p_workspace uuid, p_reason text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_hash text;
  v_count integer;
  v_last_at timestamptz;
  v_last_hash text;
  v_used integer;
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
  v_hash := app.pending_hash(p_workspace);

  select s.created_at, s.pending_hash into v_last_at, v_last_hash from public.review_signoffs s
   where s.workspace_id = p_workspace order by s.seq desc limit 1;
  if v_last_hash = v_hash then
    v_used := app.version_from_mark(p_workspace, v_last_at);
    if v_used is not null then
      raise exception 'nothing has changed since version % was approved: accept, edit or reject an item first', v_used
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.review_signoffs (workspace_id, signed_by, pending_hash, item_count, reason)
  values (p_workspace, (select auth.uid()), v_hash, v_count, trim(p_reason))
  returning id into v_id;
  insert into public.audit_log (workspace_id, actor, action, target_type, target_id, reason, before, after, access_level)
  values (p_workspace, (select auth.uid()), 'mark_ready', 'review_signoffs', v_id::text, trim(p_reason),
          null, jsonb_build_object('item_count', v_count, 'pending_hash', v_hash), 'everyone');
  return v_id;
end
$$;

-- signoff_status() as in 0015, plus the version the mark was approved as (null while waiting).
drop function public.signoff_status(uuid);
create function public.signoff_status(p_workspace uuid)
returns table (marked_at timestamptz, marked_by uuid, item_count integer, reason text, is_current boolean, approved_as integer)
language sql stable security definer
set search_path = ''
as $$
  select s.created_at, s.signed_by, s.item_count, s.reason, s.pending_hash = app.pending_hash(p_workspace),
         app.version_from_mark(p_workspace, s.created_at)
  from public.review_signoffs s
  where s.workspace_id = p_workspace and app.can_review(p_workspace)
  order by s.seq desc
  limit 1
$$;

revoke execute on function public.signoff_status(uuid) from public, anon;
grant execute on function public.signoff_status(uuid) to authenticated;
revoke execute on function app.version_from_mark(uuid, timestamptz) from public, anon;
