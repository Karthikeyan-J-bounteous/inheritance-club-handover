-- Phase 17 (Round 3, improvement 1): duties nobody wrote down, inferred from repetition.
--
-- Code, not a model, finds a task reported done at about the same time of year in two or more
-- years (src/lib/pipeline/repeats.ts). It is stored here as a recurring duty that rests only on
-- its occurrences: each year's first record that it was done, and the first that it was under
-- way, cited as evidence marked `inferred`. The trust rule then labels it Inferred, never as
-- fact. This function repeats every check that matters, whatever the caller sends:
--   * the outgoing lead or the advisor only, through RLS (security invoker);
--   * every quote is a verbatim part of its message, and the name is words from one of them;
--   * every record has one visibility (as for any duty);
--   * a start comes before its done record, by at most 60 days;
--   * the done dates are a whole number of years apart, give or take 31 days;
--   * the next due date is an anniversary of the last done day, after it.
-- The occurrences, the lead time (the longest start-to-done gap, in IST calendar days), the
-- start-by date and the wording are computed here from the messages' own times, not taken from
-- the caller. The wording mirrors repeatWording() in repeats.ts (the RLS test compares them).

alter table public.obligations add column occurrences jsonb;
comment on column public.obligations.occurrences is
  'Inferred duties only (Phase 17): one entry per year it was done: year, done_event, done_on, start_event, started_on, days. Written by add_inferred_duty(), never by a model.';

-- The trust rule, as in 0011, plus one case: an item whose only verified evidence is inferred
-- (a duty found from repetition alone) is Inferred. Every other item has a direct quote (its
-- promise or its stated rule), so this changes nothing for them. Linked records still lend
-- their evidence: a duty also stated elsewhere is no longer only inferred.
create or replace function app.trust_rule(p_obligation uuid, p_level public.access_level, p_uploaders uuid[])
returns public.trust_state
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_any boolean;
  v_firm boolean;
  v_done boolean;
  v_direct boolean;
  v_not_done boolean;
  v_independent boolean;
begin
  with ee as materialized (select * from app.effective_evidence(p_obligation, p_level, p_uploaders))
  select count(*) > 0,
         coalesce(bool_or(not ee.inferred), false),
         coalesce(bool_or(ee.relation = 'fulfils'), false),
         coalesce(bool_or(ee.relation = 'fulfils' and not ee.inferred), false),
         coalesce(bool_or(ee.relation = 'contradicts'), false),
         exists (
           select 1 from ee x join ee y on x.event_id <> y.event_id
           where not x.inferred and not y.inferred
             and (x.source_id <> y.source_id
                  or (app.person(x.author) is not null and app.person(y.author) is not null
                      and app.person(x.author) <> app.person(y.author))))
    into v_any, v_firm, v_done, v_direct, v_not_done, v_independent
  from ee;

  return case
    when not v_any then 'gap'
    when v_done and v_not_done then 'contradicted'
    when v_done and not v_direct then 'inferred'
    when not v_firm then 'inferred'
    when v_independent then 'corroborated'
    else 'sourced'
  end::public.trust_state;
end
$$;

-- "a", "a and b", "a, b and c".
create function app.and_list(p text[]) returns text
language sql immutable
set search_path = ''
as $$
  select case
    when coalesce(cardinality(p), 0) = 0 then ''
    when cardinality(p) = 1 then p[1]
    else array_to_string(p[1:cardinality(p) - 1], ', ') || ' and ' || p[cardinality(p)]
  end
$$;

create function public.add_inferred_duty(
  p_workspace uuid,
  p_description text,
  p_occurrences jsonb,
  p_next_due date
) returns table (obligation_id uuid, created boolean)
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_done uuid;
  v_start uuid;
  v_done_quote text;
  v_start_quote text;
  v_text text;
  v_ts timestamptz;
  v_level public.access_level;
  v_key text;
  v_first_key text;
  v_uploader uuid;
  v_max public.access_level;
  v_done_day date;
  v_start_day date;
  v_prev_day date;
  v_gap integer;
  v_years integer;
  v_lead integer;
  v_occ jsonb := '[]';
  v_done_events uuid[] := '{}';
  v_events uuid[] := '{}';
  v_quotes text[] := '{}';
  v_year_words text[] := '{}';
  v_day_words text[] := '{}';
  v_start_by date;
  v_cadence text;
  v_lead_time text;
  v_basis text;
  v_id uuid;
  i integer;
begin
  if not app.can_review(p_workspace) then
    raise exception 'only the outgoing lead or the advisor can add recurring duties' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_description), '') = '' or length(p_description) > 300 then
    raise exception 'an inferred duty needs a short description' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_occurrences) is distinct from 'array' or jsonb_array_length(p_occurrences) < 2 then
    raise exception 'an inferred duty needs at least two occurrences' using errcode = 'check_violation';
  end if;
  if p_next_due is null then
    raise exception 'an inferred duty needs a next due date' using errcode = 'check_violation';
  end if;

  for v_item in select * from jsonb_array_elements(p_occurrences) loop
    v_done := app.try_uuid(v_item ->> 'done_event');
    v_done_quote := trim(coalesce(v_item ->> 'done_quote', ''));
    v_start := app.try_uuid(v_item ->> 'start_event');
    v_start_quote := trim(coalesce(v_item ->> 'start_quote', ''));

    -- The done record: readable (RLS), in this workspace, the quote verbatim, one visibility.
    v_text := null;
    select e.text, e.ts, e.access_level, app.visibility_key(e.access_level, e.source_id), s.uploaded_by
      into v_text, v_ts, v_level, v_key, v_uploader
    from public.events e left join public.sources s on s.id = e.source_id
    where e.id = v_done and e.workspace_id = p_workspace;
    if v_text is null or v_ts is null then
      raise exception 'cited message not found' using errcode = 'no_data_found';
    end if;
    if not app.quote_in(v_done_quote, v_text) then
      raise exception 'quote is not a verbatim part of the cited message' using errcode = 'check_violation';
    end if;
    if v_first_key is null then
      v_first_key := v_key;
    elsif v_key <> v_first_key then
      raise exception 'an inferred duty''s records must all have the same access' using errcode = 'check_violation';
    end if;
    v_max := greatest(v_max, v_level);
    v_done_day := (v_ts at time zone 'Asia/Kolkata')::date;

    -- A whole number of years after the previous occurrence, give or take a month.
    if v_prev_day is not null then
      v_gap := v_done_day - v_prev_day;
      v_years := round(v_gap / 365.25);
      if v_years < 1 or abs(v_gap - v_years * 365.25) > 31 then
        raise exception 'occurrences must be about a year apart, oldest first' using errcode = 'check_violation';
      end if;
    end if;
    v_prev_day := v_done_day;

    -- The start, if any: the same checks, before the done record by at most 60 days.
    v_start_day := null;
    if v_start is not null then
      v_text := null;
      select e.text, e.ts, app.visibility_key(e.access_level, e.source_id)
        into v_text, v_ts, v_key
      from public.events e
      where e.id = v_start and e.workspace_id = p_workspace;
      if v_text is null or v_ts is null then
        raise exception 'cited message not found' using errcode = 'no_data_found';
      end if;
      if not app.quote_in(v_start_quote, v_text) then
        raise exception 'quote is not a verbatim part of the cited message' using errcode = 'check_violation';
      end if;
      if v_key <> v_first_key then
        raise exception 'an inferred duty''s records must all have the same access' using errcode = 'check_violation';
      end if;
      v_start_day := (v_ts at time zone 'Asia/Kolkata')::date;
      if v_start_day > v_done_day or v_done_day - v_start_day > 60 then
        raise exception 'a start must come before its done record, by at most 60 days' using errcode = 'check_violation';
      end if;
      v_events := v_events || v_start;
      v_quotes := v_quotes || v_start_quote;
      v_lead := greatest(v_lead, v_done_day - v_start_day);
    elsif v_start_quote <> '' then
      raise exception 'a start quote needs its message' using errcode = 'check_violation';
    end if;

    v_done_events := v_done_events || v_done;
    v_events := v_events || v_done;
    v_quotes := v_quotes || v_done_quote;
    v_year_words := v_year_words || extract(year from v_done_day)::int::text;
    v_day_words := v_day_words || to_char(v_done_day, 'FMDD Mon YYYY');
    v_occ := v_occ || jsonb_build_object(
      'year', extract(year from v_done_day)::int, 'done_event', v_done, 'done_on', v_done_day,
      'start_event', v_start, 'started_on', v_start_day,
      'days', case when v_start_day is null then null else v_done_day - v_start_day end);
  end loop;

  if cardinality(v_year_words) <> (select count(distinct y) from unnest(v_year_words) y) then
    raise exception 'occurrences must be in different years' using errcode = 'check_violation';
  end if;
  if not app.grounded_in(p_description, v_quotes) then
    raise exception 'the description must be words from one of the quotes' using errcode = 'check_violation';
  end if;
  -- An anniversary of the last done day, after it (28 Feb stands for 29 Feb).
  if not (p_next_due > v_prev_day
          and extract(month from p_next_due) = extract(month from v_prev_day)
          and (extract(day from p_next_due) = extract(day from v_prev_day)
               or (extract(month from p_next_due) = 2 and extract(day from v_prev_day) = 29 and extract(day from p_next_due) = 28))) then
    raise exception 'the next due date must be an anniversary of the last time it was done' using errcode = 'check_violation';
  end if;

  -- Found before (by an earlier run)? The same done record, as inferred evidence. Rejected
  -- items count too: a reviewer's "not a duty" is not undone by the next run.
  select o.id into v_id
  from public.obligations o
  where o.workspace_id = p_workspace
    and o.kind = 'recurring'
    and o.occurrences is not null
    and exists (select 1 from public.evidence ev
                where ev.obligation_id = o.id and ev.inferred and ev.event_id = any (v_done_events))
  order by o.created_at
  limit 1;
  if v_id is not null then
    return query select v_id, false;
    return;
  end if;

  v_start_by := case when v_lead is null then null else p_next_due - v_lead end;
  v_cadence := 'about once a year (done in ' || app.and_list(v_year_words) || '; no record says it repeats)';
  v_lead_time := case when v_lead is null then null else v_lead || ' days (the longest it took before)' end;
  v_basis := 'Inferred, not stated: done at about this time in ' || app.and_list(v_year_words)
    || ' (' || app.and_list(v_day_words) || '). Due a year after it was last done'
    || case when v_lead is null then '; no record shows when it was started.'
            else '; start ' || v_lead || ' days ahead, the longest it took from the first record to done.' end;

  perform set_config('app.audit_reason', 'Recurring duty inferred by code from repetition in past years (no model); quotes verified against the source messages', true);

  insert into public.obligations
    (workspace_id, kind, description, period, cadence, lead_time, next_due, start_by, next_due_basis,
     status, trust_state, access_level, private_uploaders, review_state, occurrences)
  values
    (p_workspace, 'recurring', trim(p_description), 'year', v_cadence, v_lead_time, p_next_due, v_start_by, v_basis,
     'open', 'gap', v_max,
     case when v_max = 'private' then array[coalesce(v_uploader, app.nobody())] else '{}'::uuid[] end, 'draft', v_occ)
  returning id into v_id;

  for i in 1 .. cardinality(v_events) loop
    if not exists (select 1 from public.evidence ev
                   where ev.obligation_id = v_id and ev.event_id = v_events[i]
                     and app.norm_quote(ev.quote) = app.norm_quote(v_quotes[i])) then
      insert into public.evidence (obligation_id, event_id, quote, relation, verified, inferred)
      values (v_id, v_events[i], v_quotes[i], 'past_instance', true, true);
    end if;
  end loop;

  perform set_config('app.audit_reason', '', true);
  return query select v_id, true;
end
$$;

revoke execute on function public.add_inferred_duty(uuid, text, jsonb, date) from public, anon;
grant execute on function public.add_inferred_duty(uuid, text, jsonb, date) to authenticated;
grant execute on function app.and_list(text[]) to anon, authenticated, service_role;
