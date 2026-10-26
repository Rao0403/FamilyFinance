import { canView, owns, visible } from "../auth/resource-permissions";
import { fail, json } from "../lib/http";
import { uid } from "../lib/identifiers";
import { audit } from "../services/audit-log";
import type { RecordRow } from "../types/records";
import type { RouteContext } from "../types/route-context";

export async function handleDocumentsRoutes(context: RouteContext): Promise<Response | null> {
  const { request, env, member, path, method, key } = context;
  if (key === "documents") {
    if (method === "GET" && !path[1]) {
      const rows = await visible<RecordRow & { id: string }>(env, member, "documents", "document");
      return json(rows.map(({ storage_key, ...row }) => row));
    }
    if (method === "GET" && path[1]) {
      if (!(await canView(env, member, "document", path[1]))) return fail(403, "Access denied");
      const doc = await env.DB.prepare("SELECT * FROM documents WHERE id=?")
        .bind(path[1])
        .first<RecordRow>();
      if (!doc) return fail(404, "Document not found");
      const object = await env.DOCUMENTS.get(String(doc.storage_key));
      if (!object) return fail(404, "Stored file not found");
      await audit(env, member, "download", "document", path[1]);
      return new Response(object.body, {
        headers: {
          "content-type": String(doc.mime_type),
          "content-disposition": `attachment; filename="${String(doc.name).replace(/["\r\n]/g, "_")}"`,
          "cache-control": "private, no-store",
        },
      });
    }
    if (method === "POST") {
      const type = request.headers.get("x-document-type") || "other",
        name = request.headers.get("x-file-name") || "document";
      const target = request.headers.get("x-target-id");
      if (!["account", "investment", "other"].includes(type))
        return fail(400, "Invalid document type");
      if (
        target &&
        (type === "other" ||
          !(await owns(env, member, type === "account" ? "accounts" : "investments", target)))
      )
        return fail(403, "Target must be owned by uploader");
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > 15 * 1024 * 1024)
        return fail(400, "File must be 1 byte to 15 MB");
      const mime = request.headers.get("content-type") || "application/octet-stream";
      if (
        ![
          "application/pdf",
          "text/csv",
          "text/plain",
          "image/jpeg",
          "image/png",
          "application/vnd.ms-excel",
        ].includes(mime)
      )
        return fail(400, "Unsupported file type");
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const existing = await env.DB.prepare(
        "SELECT id FROM documents WHERE owner_id=? AND sha256=?",
      )
        .bind(member.id, digest)
        .first();
      if (existing) return fail(409, "This file was already uploaded");
      const id = uid(),
        storageKey = `${member.id}/${id}`;
      await env.DOCUMENTS.put(storageKey, bytes, { httpMetadata: { contentType: mime } });
      await env.DB.prepare(
        "INSERT INTO documents (id,owner_id,type,name,mime_type,size_bytes,sha256,storage_key) VALUES (?,?,?,?,?,?,?,?)",
      )
        .bind(id, member.id, type, name.slice(0, 200), mime, bytes.byteLength, digest, storageKey)
        .run();
      await env.DB.prepare(
        "INSERT INTO imports (id,owner_id,document_id,target_id,type) VALUES (?,?,?,?,?)",
      )
        .bind(uid(), member.id, id, target, type)
        .run();
      await audit(env, member, "upload", "document", id);
      return json({ id }, 201);
    }
  }
  return null;
}
