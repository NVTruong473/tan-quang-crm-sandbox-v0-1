import { DATA_FILES } from "./data.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { validateAndMaterialize, type InputFile } from "./validator.ts";

const FUNCTION_NAME = "crm-sandbox";
const FRONTEND_ORIGIN = "https://nvtruong473.github.io";

function routePath(url: URL): string {
  const marker = `/${FUNCTION_NAME}`;
  const markerIndex = url.pathname.indexOf(marker);
  const suffix = markerIndex >= 0 ? url.pathname.slice(markerIndex + marker.length) : url.pathname;
  return suffix === "" ? "/" : suffix;
}

function responseHeaders(request: Request, contentType = "application/json; charset=utf-8"): Headers {
  const headers = new Headers({
    "cache-control": "private, no-store, max-age=0",
    "content-type": contentType,
    "vary": "Origin",
    "x-content-type-options": "nosniff",
  });
  if (request.headers.get("origin") === FRONTEND_ORIGIN) {
    headers.set("access-control-allow-origin", FRONTEND_ORIGIN);
    headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
    headers.set("access-control-allow-headers", "authorization, apikey, content-type, x-file-name");
    headers.set("access-control-max-age", "600");
  }
  return headers;
}

function json(request: Request, value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: responseHeaders(request) });
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
}

type AdminContext = { id: string };

async function authenticatedAdmin(request: Request): Promise<AdminContext | null> {
  const token = bearerToken(request);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!token || !supabaseUrl || !anonKey) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null) as { id?: unknown; app_metadata?: { role?: unknown; environment?: unknown } } | null;
  return user?.app_metadata?.role === "admin" && user?.app_metadata?.environment === "sandbox" && typeof user.id === "string" ? { id: user.id } : null;
}

function safeFilename(value: string | null): string | null {
  const filename = decodeURIComponent(value ?? "").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+/, "");
  return filename && filename.length <= 160 && /\.(csv|xlsx)$/i.test(filename) ? filename : null;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) throw new Error("server_configuration_error");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function listRegistry(request: Request, table: "crm_import_versions" | "crm_approval_audit") {
  const admin = await authenticatedAdmin(request);
  if (!admin) return json(request, { error: "admin_auth_required" }, 401);
  const client = serviceClient();
  const query = table === "crm_import_versions"
    ? client.from(table).select("id,sha256,original_filename,content_type,byte_size,status,created_at,validated_at,materialized_at,materialized_row_count,server_validation,quarantined_reason").order("created_at", { ascending: false }).limit(50)
    : client.from(table).select("id,import_id,release_id,event_type,actor_id,event_at,payload").order("event_at", { ascending: false }).limit(100);
  const { data, error } = await query;
  return error ? json(request, { error: "registry_read_failed" }, 500) : json(request, { data });
}

async function uploadImport(request: Request) {
  const admin = await authenticatedAdmin(request);
  if (!admin) return json(request, { error: "admin_auth_required" }, 401);
  const incoming: InputFile[] = [];
  const requestType = request.headers.get("content-type") ?? "";
  if (requestType.startsWith("multipart/form-data")) {
    const form = await request.formData();
    for (const value of form.getAll("files")) {
      if (!(value instanceof File)) return json(request, { error: "unsupported_file" }, 400);
      const filename = safeFilename(value.name);
      if (!filename || !/\.(csv|xlsx)$/i.test(filename)) return json(request, { error: "unsupported_file" }, 400);
      incoming.push({ name: filename, type: value.type, bytes: new Uint8Array(await value.arrayBuffer()) });
    }
  } else {
    const filename = safeFilename(request.headers.get("x-file-name"));
    const contentType = requestType.split(";")[0];
    if (!filename || !["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(contentType)) return json(request, { error: "unsupported_file" }, 400);
    incoming.push({ name: filename, type: contentType, bytes: new Uint8Array(await request.arrayBuffer()) });
  }
  if (!incoming.length || incoming.some((file) => !file.bytes.byteLength)) return json(request, { error: "file_size_invalid" }, 413);
  let materialized;
  try { materialized = await validateAndMaterialize(incoming); }
  catch (error) { return json(request, { error: "server_validation_failed", reason: error instanceof Error ? error.message : "VALIDATION_FAILED" }, 422); }
  const fileHashes = await Promise.all(incoming.map((file) => sha256(file.bytes)));
  const bundleHash = await sha256(new TextEncoder().encode(JSON.stringify(incoming.map((file, index) => ({ name: file.name, sha256: fileHashes[index]})))));
  const client = serviceClient();
  const existing = await client.from("crm_import_versions").select("id,status").eq("sha256", bundleHash).maybeSingle();
  if (existing.error) return json(request, { error: "registry_lookup_failed" }, 500);
  if (existing.data) return json(request, { id: existing.data.id, status: existing.data.status, duplicate: true }, 200);
  const uploaded: string[] = [];
  for (let index = 0; index < incoming.length; index += 1) {
    const file = incoming[index], path = `imports/${bundleHash.slice(0, 2)}/${bundleHash}/${fileHashes[index]}-${file.name}`;
    const safeType = file.name.endsWith(".csv") ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const upload = await client.storage.from("crm-imports-private").upload(path, file.bytes, { contentType: safeType, upsert: false, cacheControl: "0" });
    if (upload.error) { await client.storage.from("crm-imports-private").remove(uploaded); return json(request, { error: "private_storage_write_failed" }, 500); }
    uploaded.push(path);
  }
  const storagePath = uploaded[0];
  const report = { ...materialized.report, server_gate: "VALIDATED_AND_MATERIALIZED", received_at: new Date().toISOString(), raw_file_unmodified: true, file_hashes: fileHashes };
  const inserted = await client.from("crm_import_versions").insert({
    sha256: bundleHash, storage_path: storagePath, original_filename: incoming.map((file) => file.name).join(", ").slice(0, 255), content_type: incoming.length === 1 ? (incoming[0].type || "application/octet-stream") : "application/x-crm-csv-bundle",
    byte_size: incoming.reduce((sum, file) => sum + file.bytes.byteLength, 0), created_by: admin.id, preflight_report: {}, server_validation: report,
    status: "VALIDATED", validated_at: new Date().toISOString(), validated_by: admin.id, materialized_at: new Date().toISOString(), materialized_row_count: Object.values(materialized.record_counts).reduce((sum, value) => sum + value, 0), validator_version: "SERVER_VALIDATOR_V1",
  }).select("id,status,created_at").single();
  if (inserted.error) {
    await client.storage.from("crm-imports-private").remove(uploaded);
    return json(request, { error: "registry_write_failed" }, 500);
  }
  const payloadText = JSON.stringify(materialized.tables);
  const payload = await client.from("crm_materialized_payloads").insert({ import_id: inserted.data.id, payload: materialized.tables, payload_sha256: await sha256(new TextEncoder().encode(payloadText)), record_counts: materialized.record_counts, validator_version: "SERVER_VALIDATOR_V1", created_by: admin.id });
  if (payload.error) { return json(request, { error: "materialization_write_failed", import_id: inserted.data.id }, 500); }
  const audit = await client.from("crm_approval_audit").insert({
    import_id: inserted.data.id, event_type: "IMPORT_UPLOADED", actor_id: admin.id,
    payload: { sha256: bundleHash, filenames: incoming.map((file) => file.name), byte_size: incoming.reduce((sum, file) => sum + file.bytes.byteLength, 0), storage_path: storagePath },
  });
  if (audit.error) return json(request, { error: "audit_write_failed", import_id: inserted.data.id }, 500);
  await client.from("crm_approval_audit").insert({ import_id: inserted.data.id, event_type: "IMPORT_VALIDATED", actor_id: admin.id, payload: { ...materialized.report, record_counts: materialized.record_counts } });
  return json(request, { ...inserted.data, sha256: bundleHash, duplicate: false, record_counts: materialized.record_counts }, 201);
}

async function releaseAction(request: Request, action: "create" | "approve" | "activate") {
  const admin = await authenticatedAdmin(request);
  if (!admin) return json(request, { error: "admin_auth_required" }, 401);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const client = serviceClient();
  const args = action === "create"
    ? { p_import_id: body.import_id, p_release_code: body.release_code, p_notes: body.notes ?? null }
    : { p_release_id: body.release_id };
  const rpc = await client.rpc(action === "create" ? "create_crm_release" : action === "approve" ? "approve_crm_release" : "activate_crm_release", args);
  return rpc.error ? json(request, { error: "release_transition_rejected", reason: rpc.error.message }, 409) : json(request, { data: rpc.data });
}

async function releases(request: Request) {
  if (!(await authenticatedAdmin(request))) return json(request, { error: "admin_auth_required" }, 401);
  const client = serviceClient();
  const result = await client.from("crm_releases").select("id,import_id,release_code,status,created_at,created_by,approved_at,approved_by,activated_at,activated_by,release_notes").order("created_at", { ascending: false }).limit(50);
  return result.error ? json(request, { error: "release_read_failed" }, 500) : json(request, { data: result.data });
}

function csvValue(value: unknown) { const raw = String(value ?? ""); return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw; }
function rowsCsv(rows: Array<Record<string, unknown>>) { const headers = Object.keys(rows[0] ?? {}); return [headers.join(","), ...rows.map((row) => headers.map((h) => csvValue(row[h])).join(","))].join("\n"); }

async function activeData(request: Request, key: keyof typeof DATA_FILES) {
  if (!(await authenticatedAdmin(request))) return json(request, { error: "admin_auth_required" }, 401);
  const client = serviceClient();
  const active = await client.from("crm_runtime_state").select("active_release_id,crm_releases!inner(import_id,status)").eq("singleton", true).maybeSingle();
  const release = active.data?.crm_releases as unknown as { import_id?: string; status?: string } | null;
  if (active.error || !active.data?.active_release_id || release?.status !== "ACTIVE" || !release.import_id) return new Response(DATA_FILES[key], { status: 200, headers: responseHeaders(request, "text/csv; charset=utf-8") });
  const materialized = await client.from("crm_materialized_payloads").select("payload").eq("import_id", release.import_id).maybeSingle();
  const table = key.replace(/\.csv$/, "") === "scoring_sandbox" ? "scoring_sandbox" : key.replace(/\.csv$/, "").replace("customer_360", "customer_360");
  const rows = (materialized.data?.payload as Record<string, Array<Record<string, unknown>>> | undefined)?.[table];
  if (!rows?.length) return json(request, { error: "active_materialization_invalid" }, 500);
  return new Response(rowsCsv(rows), { status: 200, headers: responseHeaders(request, "text/csv; charset=utf-8") });
}

Deno.serve(async (request: Request) => {
  const path = routePath(new URL(request.url));
  const dataKey = path.replace(/^\/+/, "");

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(request) });
  if (path === "/imports" && request.method === "POST") return uploadImport(request);
  if (path === "/imports" && request.method === "GET") return listRegistry(request, "crm_import_versions");
  if (path === "/audit" && request.method === "GET") return listRegistry(request, "crm_approval_audit");
  if (path === "/releases" && request.method === "GET") return releases(request);
  if (path === "/releases/create" && request.method === "POST") return releaseAction(request, "create");
  if (path === "/releases/approve" && request.method === "POST") return releaseAction(request, "approve");
  if (path === "/releases/activate" && request.method === "POST") return releaseAction(request, "activate");
  if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);

  if (path === "/health") {
    return json(request, { status: "ok", release: "v0.1-31ed10f5fde0", production_gate: "BLOCKED", data_origin: "SYNTHETIC", auth: "supabase_admin_required" });
  }

  if (!(dataKey in DATA_FILES)) return json(request, { error: "not_found" }, 404);
  return activeData(request, dataKey as keyof typeof DATA_FILES);
});
