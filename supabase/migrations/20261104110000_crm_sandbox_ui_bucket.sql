-- Static frontend assets only. CRM data/API remain protected by Supabase Auth and RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'crm-sandbox-ui',
  'crm-sandbox-ui',
  true,
  10485760,
  null
)
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = null;
