import { canEdit, canView, visible } from "../auth/resource-permissions";
import { body, fail, json } from "../lib/http";
import { uid } from "../lib/identifiers";
import { asDate, asMoney, asText } from "../lib/validation";
import { audit } from "../services/audit-log";
import type { RecordRow } from "../types/records";
import type { RouteContext } from "../types/route-context";

export async function handleInvestmentsRoutes(context: RouteContext): Promise<Response | null> {
  const { request, env, member, path, method, key } = context;
  if (key === "investments") {
    if (method === "GET") {
      const rows = await visible<RecordRow & { id: string }>(
        env,
        member,
        "investments",
        "investment",
      );
      for (const row of rows)
        row.latest = await env.DB.prepare(
          "SELECT * FROM investment_snapshots WHERE investment_id=? ORDER BY as_of DESC, created_at DESC LIMIT 1",
        )
          .bind(row.id)
          .first();
      return json(rows);
    }
    if (method === "POST" && !path[1]) {
      const data = await body(request),
        id = uid(),
        type = asText(data.type);
      if (!["stock", "mutual_fund", "fd"].includes(type))
        return fail(400, "Invalid investment type");
      await env.DB.prepare(
        "INSERT INTO investments (id,owner_id,type,name,symbol,institution,principal_paise,rate_bps,start_date,maturity_date,maturity_amount_paise,document_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          member.id,
          type,
          asText(data.name),
          asText(data.symbol, 50) || null,
          asText(data.institution) || null,
          data.principal_paise == null ? null : asMoney(data.principal_paise),
          data.rate_bps == null ? null : Number(data.rate_bps),
          data.start_date ? asDate(data.start_date) : null,
          data.maturity_date ? asDate(data.maturity_date) : null,
          data.maturity_amount_paise == null ? null : asMoney(data.maturity_amount_paise),
          null,
        )
        .run();
      await audit(env, member, "create", "investment", id);
      return json({ id }, 201);
    }
    if (path[1] && path[2] === "snapshots" && method === "POST") {
      if (!(await canEdit(env, member, "investment", path[1])))
        return fail(403, "Edit access denied");
      const data = await body(request),
        id = uid();
      if (data.document_id && !(await canView(env, member, "document", asText(data.document_id))))
        return fail(403, "Document access denied");
      await env.DB.prepare(
        "INSERT INTO investment_snapshots (id,investment_id,as_of,quantity,invested_paise,value_paise,document_id,source_ref) VALUES (?,?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          path[1],
          asDate(data.as_of),
          asText(data.quantity, 60) || null,
          asMoney(data.invested_paise),
          asMoney(data.value_paise),
          data.document_id || null,
          asText(data.source_ref) || id,
        )
        .run();
      await audit(env, member, "snapshot", "investment", path[1]);
      return json({ id }, 201);
    }
  }
  return null;
}
