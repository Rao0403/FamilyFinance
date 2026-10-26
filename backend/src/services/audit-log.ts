import { uid } from "../lib/identifiers";
import type { Env } from "../types/environment";
import type { Member } from "../types/records";

export const audit = async (
  env: Env,
  member: Member,
  action: string,
  type: string,
  id: string,
  detail?: unknown,
) =>
  env.DB.prepare(
    "INSERT INTO audit_log (id,actor_id,action,resource_type,resource_id,detail_json) VALUES (?,?,?,?,?,?)",
  )
    .bind(uid(), member.id, action, type, id, detail ? JSON.stringify(detail) : null)
    .run();
