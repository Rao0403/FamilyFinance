import { readAll } from "../lib/database";
import type { Env } from "../types/environment";

export async function clearDeletedDocuments(env: Env) {
  const pending = await readAll<{ id: string; storage_key: string }>(
    env.DB.prepare(
      "SELECT id,storage_key FROM document_deletion_queue WHERE completed_at IS NULL LIMIT 100",
    ),
  );
  for (const item of pending) {
    try {
      await env.DOCUMENTS.delete(item.storage_key);
      await env.DB.prepare("DELETE FROM document_deletion_queue WHERE id=?").bind(item.id).run();
    } catch (error) {
      console.error("Document deletion will be retried", error);
    }
  }
}
