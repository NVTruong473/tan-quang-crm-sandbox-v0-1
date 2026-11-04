-- Append-only CSKH activity capture. Activities are evidence of work performed,
-- not source-workbook metrics and never unlock official scoring.
create table public.crm_activity_outcomes (
  id uuid primary key default gen_random_uuid(),
  activity_id text not null unique check (char_length(activity_id) between 3 and 120),
  task_id text not null check (char_length(task_id) between 3 and 160),
  customer_id text not null check (char_length(customer_id) between 1 and 120),
  activity_date date not null,
  activity_type text not null check (activity_type in ('CALL','EMAIL','MEETING','SITE_VISIT','FOLLOW_UP','OTHER')),
  owner text not null check (char_length(owner) between 1 and 160),
  contact_outcome text not null check (char_length(contact_outcome) between 1 and 2000),
  next_action text not null check (char_length(next_action) between 1 and 2000),
  next_due_date date,
  evidence_reference text not null check (char_length(evidence_reference) between 1 and 1000),
  activity_status text not null default 'RECORDED' check (activity_status in ('RECORDED','FOLLOW_UP_REQUIRED','CLOSED')),
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index crm_activity_outcomes_customer_idx on public.crm_activity_outcomes (customer_id, activity_date desc);
create index crm_activity_outcomes_task_idx on public.crm_activity_outcomes (task_id, created_at desc);
alter table public.crm_activity_outcomes enable row level security;
create policy "Sandbox admins read activity outcomes" on public.crm_activity_outcomes for select to authenticated using (public.is_crm_sandbox_admin());

create or replace function public.prevent_crm_activity_mutation()
returns trigger language plpgsql as $$
begin raise exception 'Activity Outcome Ledger is append-only'; end;
$$;
create trigger crm_activity_append_only before update or delete on public.crm_activity_outcomes for each row execute function public.prevent_crm_activity_mutation();

alter table public.crm_approval_audit drop constraint if exists crm_approval_audit_event_type_check;
alter table public.crm_approval_audit add constraint crm_approval_audit_event_type_check check (event_type in ('IMPORT_UPLOADED', 'IMPORT_VALIDATED', 'IMPORT_QUARANTINED', 'RELEASE_CREATED', 'RELEASE_APPROVED', 'RELEASE_ACTIVATED', 'RELEASE_RETIRED', 'ACTIVITY_OUTCOME_RECORDED'));

create or replace function public.append_crm_activity_outcome(
  p_activity_id text, p_task_id text, p_customer_id text, p_activity_date date,
  p_activity_type text, p_owner text, p_contact_outcome text, p_next_action text,
  p_next_due_date date, p_evidence_reference text, p_activity_status text default 'RECORDED', p_notes text default ''
)
returns public.crm_activity_outcomes
language plpgsql security definer set search_path = public
as $$
declare v_task jsonb; v_activity public.crm_activity_outcomes;
begin
  if not public.is_crm_sandbox_admin() then raise exception 'admin_auth_required'; end if;
  select item into v_task
  from public.crm_materialized_payloads mp
  join public.crm_releases r on r.import_id = mp.import_id and r.status = 'ACTIVE'
  cross join lateral jsonb_array_elements(coalesce(mp.payload->'work_queue', '[]'::jsonb)) item
  where item->>'task_id' = p_task_id
  limit 1;
  if v_task is null then raise exception 'work_queue_task_required'; end if;
  if v_task->>'customer_id' <> p_customer_id then raise exception 'task_customer_mismatch'; end if;
  insert into public.crm_activity_outcomes (activity_id, task_id, customer_id, activity_date, activity_type, owner, contact_outcome, next_action, next_due_date, evidence_reference, activity_status, notes, created_by)
    values (p_activity_id, p_task_id, p_customer_id, p_activity_date, upper(p_activity_type), p_owner, p_contact_outcome, p_next_action, p_next_due_date, p_evidence_reference, upper(coalesce(p_activity_status, 'RECORDED')), coalesce(p_notes, ''), auth.uid())
    returning * into v_activity;
  insert into public.crm_approval_audit (event_type, actor_id, payload)
    values ('ACTIVITY_OUTCOME_RECORDED', auth.uid(), jsonb_build_object('activity_id', p_activity_id, 'task_id', p_task_id, 'customer_id', p_customer_id, 'evidence_reference', p_evidence_reference));
  return v_activity;
exception when unique_violation then raise exception 'activity_id_duplicate';
end;
$$;
revoke all on function public.append_crm_activity_outcome(text,text,text,date,text,text,text,text,date,text,text,text) from public;
grant execute on function public.append_crm_activity_outcome(text,text,text,date,text,text,text,text,date,text,text,text) to authenticated;
