import { uid } from "../lib/identifiers";
import type { Env } from "../types/environment";
import type { Member } from "../types/records";

import { createRemoteJWKSet, jwtVerify } from "jose";
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function identity(request: Request, env: Env): Promise<Member | null> {
  let email: string | undefined;
  if (env.DEV_EMAIL && ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname))
    email = env.DEV_EMAIL.toLowerCase();
  else {
    if (
      !env.ACCESS_AUD ||
      !env.ACCESS_TEAM_DOMAIN ||
      env.ACCESS_AUD.startsWith("REPLACE") ||
      env.ACCESS_TEAM_DOMAIN.startsWith("REPLACE")
    )
      return null;
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) return null;
    const domain = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const issuer = `https://${domain}`;
    let jwks = jwksCache.get(domain);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
      jwksCache.set(domain, jwks);
    }
    const verified = await jwtVerify(token, jwks, { issuer, audience: env.ACCESS_AUD });
    email =
      typeof verified.payload.email === "string" ? verified.payload.email.toLowerCase() : undefined;
  }
  if (!email) return null;
  let member = await env.DB.prepare("SELECT * FROM members WHERE email=? AND active=1")
    .bind(email)
    .first<Member>();
  if (!member && email === env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
    const id = uid();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO members (id,email,name,role) VALUES (?,?,?,'admin')",
    )
      .bind(id, email, email.split("@")[0])
      .run();
    member = await env.DB.prepare("SELECT * FROM members WHERE email=? AND active=1")
      .bind(email)
      .first<Member>();
  }
  return member;
}
