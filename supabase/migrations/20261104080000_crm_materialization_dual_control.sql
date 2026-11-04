-- Server materialization is an immutable, bounded representation used by sandbox releases.
create table public.crm_materialized_payloads (
  import_id uuid primary key references public.crm_import_versions(id) on delete restrict,
  payload jsonb not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  record_counts jsonb not null,
  validator_version text not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);

alter table public.crm_materialized_payloads enable row level security;
create policy "Sandbox admins read materialized data"
  on public.crm_materialized_payloads for select to authenticated
  using (public.is_crm_sandbox_admin());

alter table public.crm_import_versions
  add column materialized_at timestamptz,
  add column materialized_row_count integer,
  add column validator_version text;

create or replace function public.create_crm_release(p_import_id uuid, p_release_code text, p_notes text default null)
returns public.crm_releases language plpgsql security definer set search_path = public as $$
declare v_import public.crm_import_versions; v_release public.crm_releases;
begin
  if not public.is_crm_sandbox_admin() then raise exception 'admin_auth_required'; end if;
  select * into v_import from public.crm_import_versions where id = p_import_id for update;
  if not found or v_import.status <> 'VALIDATED' or v_import.materialized_at is null
     or not exists (select 1 from public.crm_materialized_payloads where import_id = p_import_id) then
    raise exception 'validated_materialized_import_required';
  end if;
  insert into public.crm_releases (import_id, release_code, created_by, release_notes)
    values (p_import_id, upper(p_release_code), auth.uid(), p_notes) returning * into v_release;
  insert into public.crm_approval_audit (import_id, release_id, event_type, actor_id, payload)
    values (p_import_id, v_release.id, 'RELEASE_CREATED', auth.uid(), jsonb_build_object('release_code', v_release.release_code, 'materialized', true));
  return v_release;
end $$;

create or replace function public.approve_crm_release(p_release_id uuid)
returns public.crm_releases language plpgsql security definer set search_path = public as $$
declare v_release public.crm_releases;
begin
  if not public.is_crm_sandbox_admin() then raise exception 'admin_auth_required'; end if;
  select * into v_release from public.crm_releases where id = p_release_id for update;
  if not found or v_release.status <> 'PENDING_APPROVAL' then raise exception 'pending_release_required'; end if;
  if v_release.created_by = auth.uid() then raise exception 'maker_checker_separation_required'; end if;
  update public.crm_releases set status = 'APPROVED', approved_at = now(), approved_by = auth.uid() where id = p_release_id returning * into v_release;
  update public.crm_import_versions set status = 'APPROVED' where id = v_release.import_id;
  insert into public.crm_approval_audit (import_id, release_id, event_type, actor_id, payload)
    values (v_release.import_id, v_release.id, 'RELEASE_APPROVED', auth.uid(), jsonb_build_object('maker_checker_separation', true));
  return v_release;
end $$;

create or replace function public.activate_crm_release(p_release_id uuid)
returns public.crm_releases language plpgsql security definer set search_path = public as $$
declare v_release public.crm_releases; v_old uuid;
begin
  if not public.is_crm_sandbox_admin() then raise exception 'admin_auth_required'; end if;
  select * into v_release from public.crm_releases where id = p_release_id for update;
  if not found or v_release.status <> 'APPROVED' then raise exception 'approved_release_required'; end if;
  select id into v_old from public.crm_releases where status = 'ACTIVE' for update;
  if v_old is not null then
    update public.crm_releases set status = 'RETIRED' where id = v_old;
    update public.crm_import_versions set status = 'RETIRED' where id = (select import_id from public.crm_releases where id = v_old);
    insert into public.crm_approval_audit (import_id, release_id, event_type, actor_id)
      select import_id, id, 'RELEASE_RETIRED', auth.uid() from public.crm_releases where id = v_old;
  end if;
  update public.crm_releases set status = 'ACTIVE', activated_at = now(), activated_by = auth.uid() where id = p_release_id returning * into v_release;
  update public.crm_import_versions set status = 'ACTIVE' where id = v_release.import_id;
  update public.crm_runtime_state set active_release_id = v_release.id, updated_at = now(), updated_by = auth.uid() where singleton;
  insert into public.crm_approval_audit (import_id, release_id, event_type, actor_id)
    values (v_release.import_id, v_release.id, 'RELEASE_ACTIVATED', auth.uid());
  return v_release;
end $$;

revoke all on table public.crm_materialized_payloads from anon, authenticated;
grant select on table public.crm_materialized_payloads to authenticated;
