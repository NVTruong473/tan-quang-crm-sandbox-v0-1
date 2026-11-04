update storage.objects
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('mimetype', 'text/markdown; charset=utf-8')
where bucket_id = 'crm-sandbox-ui'
  and name = 'EXECUTIVE_HANDOFF_TAN_QUANG_CRM_V0_1.md';
