import { DATA_FILES } from "./data.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    ? client.from(table).select("id,sha256,original_filename,content_type,byte_size,status,created_at,validated_at,quarantined_reason").order("created_at", { ascending: false }).limit(50)
    : client.from(table).select("id,import_id,release_id,event_type,actor_id,event_at,payload").order("event_at", { ascending: false }).limit(100);
  const { data, error } = await query;
  return error ? json(request, { error: "registry_read_failed" }, 500) : json(request, { data });
}

async function uploadImport(request: Request) {
  const admin = await authenticatedAdmin(request);
  if (!admin) return json(request, { error: "admin_auth_required" }, 401);
  const filename = safeFilename(request.headers.get("x-file-name"));
  const contentType = request.headers.get("content-type")?.split(";")[0] ?? "";
  if (!filename || !["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(contentType)) {
    return json(request, { error: "unsupported_file" }, 400);
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > 26214400) return json(request, { error: "file_size_invalid" }, 413);
  const hash = await sha256(bytes);
  const client = serviceClient();
  const existing = await client.from("crm_import_versions").select("id,status").eq("sha256", hash).maybeSingle();
  if (existing.error) return json(request, { error: "registry_lookup_failed" }, 500);
  if (existing.data) return json(request, { id: existing.data.id, status: existing.data.status, duplicate: true }, 200);
  const storagePath = `imports/${hash.slice(0, 2)}/${hash}/${filename}`;
  const upload = await client.storage.from("crm-imports-private").upload(storagePath, bytes, { contentType, upsert: false, cacheControl: "0" });
  if (upload.error) return json(request, { error: "private_storage_write_failed" }, 500);
  const report = { server_gate: "UPLOADED_PENDING_SERVER_VALIDATION", received_at: new Date().toISOString(), raw_file_unmodified: true };
  const inserted = await client.from("crm_import_versions").insert({
    sha256: hash, storage_path: storagePath, original_filename: filename, content_type: contentType,
    byte_size: bytes.byteLength, created_by: admin.id, preflight_report: report,
  }).select("id,status,created_at").single();
  if (inserted.error) {
    await client.storage.from("crm-imports-private").remove([storagePath]);
    return json(request, { error: "registry_write_failed" }, 500);
  }
  const audit = await client.from("crm_approval_audit").insert({
    import_id: inserted.data.id, event_type: "IMPORT_UPLOADED", actor_id: admin.id,
    payload: { sha256: hash, filename, byte_size: bytes.byteLength, storage_path: storagePath },
  });
  if (audit.error) return json(request, { error: "audit_write_failed", import_id: inserted.data.id }, 500);
  return json(request, { ...inserted.data, sha256: hash, duplicate: false }, 201);
}

Deno.serve(async (request: Request) => {
  const path = routePath(new URL(request.url));
  const dataKey = path.replace(/^\/+/, "");

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(request) });
  if (path === "/imports" && request.method === "POST") return uploadImport(request);
  if (path === "/imports" && request.method === "GET") return listRegistry(request, "crm_import_versions");
  if (path === "/audit" && request.method === "GET") return listRegistry(request, "crm_approval_audit");
  if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);

  if (path === "/health") {
    return json(request, { status: "ok", release: "v0.1-31ed10f5fde0", production_gate: "BLOCKED", data_origin: "SYNTHETIC", auth: "supabase_admin_required" });
  }

  if (!(dataKey in DATA_FILES)) return json(request, { error: "not_found" }, 404);
  if (!(await authenticatedAdmin(request))) return json(request, { error: "admin_auth_required" }, 401);

  return new Response(DATA_FILES[dataKey as keyof typeof DATA_FILES], {
    status: 200,
    headers: responseHeaders(request, "text/csv; charset=utf-8"),
  });
});
