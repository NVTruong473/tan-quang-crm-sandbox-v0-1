# Supabase deployment status

## Backend

The CRM API, authentication, database, RLS, private import storage, release registry, audit log and activity capture are deployed on Supabase:

`https://fxwgehtnytdqqwabgemw.supabase.co/functions/v1/crm-sandbox`

## Frontend assets

The UI assets are uploaded to the public `crm-sandbox-ui` bucket. Public buckets are appropriate for static assets only; CRM data remains protected by Supabase Auth and RLS.

## Important hosting limitation

Supabase documentation states that Edge Functions are API/data-processing endpoints and HTML responses on the default function URL are rewritten to `text/plain`. The Storage object endpoint currently returns `index.html` as `text/plain` on this project as well. Therefore the Storage object URL must not be presented as a finished browser application link.

To serve the UI as a real Supabase-hosted website, configure a Supabase custom domain and serve the frontend through a supported HTML-serving route. Until that external domain step is completed, the honest handoff is the Supabase backend/API plus the frozen frontend artifact; do not send the GitHub Pages URL if the requirement is Supabase-only.

Reference: https://supabase.com/docs/guides/functions/http-methods
