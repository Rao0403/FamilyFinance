import type { Env } from "../types/environment";
import type { Member } from "../types/records";

export async function sendReminder(env: Env, channel: "email" | "sms", recipient: Member) {
  if (channel === "email") {
    if (!env.RESEND_API_KEY || !env.RESEND_FROM)
      throw new Error("Email provider is not configured");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: [recipient.email],
        subject: "Family Finance payment reminder",
        text: "A payment is coming due. Sign in to Family Finance to review it.",
      }),
    });
    if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
    return String(((await response.json()) as { id?: string }).id || "accepted");
  }
  if (!env.MSG91_AUTHKEY || !env.MSG91_TEMPLATE_ID)
    throw new Error("SMS provider is not configured");
  if (!recipient.phone) throw new Error("Member has no phone number");
  const response = await fetch("https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: {
      authkey: env.MSG91_AUTHKEY,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      template_id: env.MSG91_TEMPLATE_ID,
      recipients: [{ mobiles: recipient.phone }],
    }),
  });
  if (!response.ok) throw new Error(`SMS provider returned ${response.status}`);
  const result = (await response.json()) as { type?: string; message?: string };
  if (result.type === "error") throw new Error("SMS provider rejected the reminder");
  return result.message || "accepted";
}
