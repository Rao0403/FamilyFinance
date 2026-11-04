import { readAll } from "../lib/database";
import { uid } from "../lib/identifiers";
import { sendReminder } from "../services/reminder-delivery";
import type { Env } from "../types/environment";
import type { Member, RecordRow } from "../types/records";

export async function runReminders(env: Env, at = new Date()) {
  const todayIst = at.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const rows = await readAll<RecordRow>(
    env.DB.prepare(
      "SELECT p.*,m.email,m.phone,m.name,m.active AS member_active FROM payments p JOIN members m ON m.id=p.owner_id WHERE p.active=1 AND m.active=1 AND p.next_due_date>=?",
    ).bind(todayIst),
  );
  for (const row of rows) {
    const days = Math.round(
      (Date.parse(`${row.next_due_date}T00:00:00Z`) - Date.parse(`${todayIst}T00:00:00Z`)) /
        86400000,
    );
    if (days !== Number(row.remind_days)) continue;
    const recipient: Member = {
      id: String(row.owner_id),
      email: String(row.email),
      phone: row.phone ? String(row.phone) : null,
      name: String(row.name),
      role: "member",
      active: 1,
    };
    for (const channel of ["email"] as const) {
      if (!row[`${channel}_enabled`]) continue;
      const existing = await env.DB.prepare(
        "SELECT id FROM reminder_deliveries WHERE payment_id=? AND due_date=? AND channel=? AND recipient_id=?",
      )
        .bind(row.id, row.next_due_date, channel, recipient.id)
        .first();
      if (existing) continue;
      const id = uid();
      await env.DB.prepare(
        "INSERT INTO reminder_deliveries (id,payment_id,due_date,channel,recipient_id,status) VALUES (?,?,?,?,?,'pending')",
      )
        .bind(id, row.id, row.next_due_date, channel, recipient.id)
        .run();
      try {
        const providerId = await sendReminder(env, recipient);
        await env.DB.prepare(
          "UPDATE reminder_deliveries SET status='accepted',provider_id=? WHERE id=?",
        )
          .bind(providerId, id)
          .run();
      } catch (error) {
        await env.DB.prepare("UPDATE reminder_deliveries SET status='failed',error=? WHERE id=?")
          .bind(error instanceof Error ? error.message.slice(0, 200) : "Unknown error", id)
          .run();
      }
    }
  }
}
