-- CRM Private Storage + Release Registry + Approval Audit Log (Sandbox only)
-- Raw data is immutable; only the Edge Function (service role) may create or progress records.

create type public.crm_import_status as enum (
  'UPLOADED',
  'VALIDATED',
  'QUARANTINED',
  'APPROVED',
  'ACTIVE',
  'RETIRED'
);

create type public.crm_release_status as enum (
  'PENDING_APPROVAL',
  'APPROVED',
  'ACTIVE',
  'RETIRED'
);

create table public.crm_import_versions (
  id uuid primary key default gen_random_uuid(),
  sha256 text not null unique check (sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text not null unique,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  content_type text not null,
  byte_size integer not null check (byte_size > 0 and byte_size <= 26214400),
  contract_version text not null default 'DATA_CONTRACT_V1',
  status public.crm_import_status not null default 'UPLOADED',
  preflight_report jsonb not null default '{}'::jsonb,
  server_validation jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  validated_by uuid references auth.users(id),
  quarantined_reason text,
  notes text
);

create index crm_import_versions_status_created_idx on public.crm_import_versions (status, created_at desc);
create index crm_import_versions_created_by_idx on public.crm_import_versions (created_by, created_at desc);

create table public.crm_releases (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null unique references public.crm_import_versions(id),
  release_code text not null unique check (release_code ~ '^SBX-[A-Z0-9-]{8,80}$'),
  status public.crm_release_status not null default 'PENDING_APPROVAL',
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  activated_at timestamptz,
  activated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  release_notes text
);

create unique index crm_one_active_release_idx on public.crm_releases ((status = 'ACTIVE')) where status = 'ACTIVE';

create table public.crm_runtime_state (
  singleton boolean primary key default true check (singleton),
  active_release_id uuid references public.crm_releases(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.crm_runtime_state (singleton) values (true) on conflict (singleton) do nothing;

create table public.crm_approval_audit (
  id bigint generated always as identity primary key,
  import_id uuid references public.crm_import_versions(id),
  release_id uuid references public.crm_releases(id),
  event_type text not null check (event_type in ('IMPORT_UPLOADED', 'IMPORT_VALIDATED', 'IMPORT_QUARANTINED', 'RELEASE_CREATED', 'RELEASE_APPROVED', 'RELEASE_ACTIVATED', 'RELEASE_RETIRED')),
  actor_id uuid references auth.users(id),
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index crm_approval_audit_event_idx on public.crm_approval_audit (event_at desc);
create index crm_approval_audit_import_idx on public.crm_approval_audit (import_id, event_at desc);

create or replace function public.is_crm_sandbox_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and (auth.jwt() -> 'app_metadata' ->> 'environment') = 'sandbox',
    false
  );
$$;

alter table public.crm_import_versions enable row level security;
alter table public.crm_releases enable row level security;
alter table public.crm_runtime_state enable row level security;
alter table public.crm_approval_audit enable row level security;

create policy "Sandbox admins read import registry"
  on public.crm_import_versions for select to authenticated
  using (public.is_crm_sandbox_admin());
create policy "Sandbox admins read releases"
  on public.crm_releases for select to authenticated
  using (public.is_crm_sandbox_admin());
create policy "Sandbox admins read runtime state"
  on public.crm_runtime_state for select to authenticated
  using (public.is_crm_sandbox_admin());
create policy "Sandbox admins read approval audit"
  on public.crm_approval_audit for select to authenticated
  using (public.is_crm_sandbox_admin());

-- No client INSERT/UPDATE/DELETE policies: all mutations pass through server-side controls.

create or replace function public.prevent_crm_import_raw_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.sha256 <> old.sha256
     or new.storage_path <> old.storage_path
     or new.original_filename <> old.original_filename
     or new.content_type <> old.content_type
     or new.byte_size <> old.byte_size
     or new.contract_version <> old.contract_version
     or new.created_by <> old.created_by
     or new.created_at <> old.created_at then
    raise exception 'Raw import evidence is immutable';
  end if;
  return new;
end;
$$;

create trigger crm_import_raw_immutable
before update on public.crm_import_versions
for each row execute function public.prevent_crm_import_raw_mutation();

create or replace function public.prevent_crm_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Approval audit is append-only';
end;
$$;

create trigger crm_audit_append_only
before update or delete on public.crm_approval_audit
for each row execute function public.prevent_crm_audit_mutation();

create or replace function public.create_crm_release(p_import_id uuid, p_release_code text, p_notes text default null)
returns public.crm_releases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_import public.crm_import_versions;
  v_release public.crm_releases;
begin
  if not public.is_crm_sandbox_admin() then raise exception 'admin_auth_required'; end if;
  select * into v_import from public.crm_import_versions where id = p_import_id for update;
  if not found or v_import.status <> 'VALIDATED' then raise exception 'validated_import_required'; end if;
  insert into public.crm_releases (import_id, release_code, created_by, release_notes)
    values (p_import_id, upper(p_release_code), auth.uid(), p_notes) returning * into v_release;
  insert into public.crm_approval_audit (import_id, release_id, event_type, actor_id, payload)
    values (p_import_id, v_release.id, 'RELEASE_CREATED', auth.uid(), jsonb_build_object('release_code', v_release.release_code));
  return v_release;
end;
$$;

create or replace function public.approve_crm_release(p_release_id uuid)
returns public.crm_releases
language plpgsql
security definer
set search_path = public
as $$
declare v_release public.crm_releases;
begin
  if not public.is_crm_sandbox_admin() then raise exception 'admin_auth_required'; end if;
  update public.crm_releases set status = 'APPROVED', approved_at = now(), approved_by = auth.uid()
    where id = p_release_id and status = 'PENDING_APPROVAL' returning * into v_release;
  if not found then raise exception 'pending_release_required'; end if;
  update public.crm_import_versions set status = 'APPROVED' where id = v_release.import_id;
  insert into public.crm_approval_audit (import_id, release_id, event_type, actor_id)
    values (v_release.import_id, v_release.id, 'RELEASE_APPROVED', auth.uid());
  return v_release;
end;
$$;

create or replace function public.activate_crm_release(p_release_id uuid)
returns public.crm_releases
language plpgsql
security definer
set search_path = public
as $$
declare v_release public.crm_releases;
begin
  if not public.is_crm_sandbox_admin() then raise exception 'admin_auth_required'; end if;
  select * into v_release from public.crm_releases where id = p_release_id for update;
  if not found or v_release.status <> 'APPROVED' then raise exception 'approved_release_required'; end if;
  update public.crm_releases set status = 'RETIRED' where status = 'ACTIVE';
  update public.crm_releases set status = 'ACTIVE', activated_at = now(), activated_by = auth.uid()
    where id = p_release_id returning * into v_release;
  update public.crm_import_versions set status = 'ACTIVE' where id = v_release.import_id;
  update public.crm_runtime_state set active_release_id = v_release.id, updated_at = now(), updated_by = auth.uid() where singleton;
  insert into public.crm_approval_audit (import_id, release_id, event_type, actor_id)
    values (v_release.import_id, v_release.id, 'RELEASE_ACTIVATED', auth.uid());
  return v_release;
end;
$$;

revoke all on function public.create_crm_release(uuid, text, text) from public;
revoke all on function public.approve_crm_release(uuid) from public;
revoke all on function public.activate_crm_release(uuid) from public;
grant execute on function public.create_crm_release(uuid, text, text) to authenticated;
grant execute on function public.approve_crm_release(uuid) to authenticated;
grant execute on function public.activate_crm_release(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'crm-imports-private',
  'crm-imports-private',
  false,
  26214400,
  array['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects policies are deliberately created. Files can only be moved/read by
-- the authenticated Edge Function using the service role, never directly from a browser.
