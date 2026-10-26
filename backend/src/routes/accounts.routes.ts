import { visible } from "../auth/resource-permissions";
import { body, json } from "../lib/http";
import { uid } from "../lib/identifiers";
import { asDate, asMoney, asText } from "../lib/validation";
import { audit } from "../services/audit-log";
import type { RouteContext } from "../types/route-context";

export async function handleAccountsRoutes(context: RouteContext): Promise<Response | null> {
  const { request, env, member, method, key } = context;
  if (key === "accounts") {
    if (method === "GET") return json(await visible(env, member, "accounts", "account"));
    if (method === "POST") {
      const data = await body(request),
        id = uid(),
        opening = asMoney(data.opening_balance_paise ?? 0);
      await env.DB.prepare(
        "INSERT INTO accounts (id,owner_id,name,institution,masked_number,opening_balance_paise,opening_date,balance_paise,balance_as_of) VALUES (?,?,?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          member.id,
          asText(data.name) || "Indian Bank account",
          asText(data.institution) || "Indian Bank",
          asText(data.masked_number, 20) || null,
          opening,
          data.opening_date ? asDate(data.opening_date) : null,
          opening,
          data.opening_date ? asDate(data.opening_date) : null,
        )
        .run();
      await audit(env, member, "create", "account", id);
      return json({ id }, 201);
    }
  }
  return null;
}
