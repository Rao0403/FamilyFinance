import { readAll } from "../lib/database";
import { json } from "../lib/http";
import type { RouteContext } from "../types/route-context";

export async function handleRemindersRoutes(context: RouteContext): Promise<Response | null> {
  const { env, member, method, key } = context;
  if (key === "reminders" && method === "GET") {
    return json(
      await readAll(
        env.DB.prepare(
          "SELECT d.id,d.payment_id,d.due_date,d.channel,d.status,d.error,d.attempted_at,p.title FROM reminder_deliveries d JOIN payments p ON p.id=d.payment_id WHERE d.recipient_id=? ORDER BY d.attempted_at DESC LIMIT 100",
        ).bind(member.id),
      ),
    );
  }
  return null;
}
