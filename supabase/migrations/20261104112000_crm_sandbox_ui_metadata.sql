update storage.objects
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('mimetype', case
  when name in ('index.html', 'data-guide.html') then 'text/html'
  when name like '%.css' then 'text/css'
  when name like '%.js' then 'application/javascript'
  else coalesce(metadata->>'mimetype', 'application/octet-stream')
end)
where bucket_id = 'crm-sandbox-ui'
  and (name in ('index.html', 'data-guide.html') or name like '%.css' or name like '%.js');
