import type { Env } from "../types/environment";
import type { Member } from "../types/records";

export async function sendReminder(env: Env, recipient: Member) {
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
