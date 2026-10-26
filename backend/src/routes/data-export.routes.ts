import { readAll } from "../lib/database";
import { now } from "../lib/identifiers";
import { audit } from "../services/audit-log";
import type { RouteContext } from "../types/route-context";

export async function handleDataExportRoutes(context: RouteContext): Promise<Response | null> {
  const { env, member, method, key } = context;
  if (key === "export" && method === "GET") {
    const accounts = await readAll(
      env.DB.prepare("SELECT * FROM accounts WHERE owner_id=?").bind(member.id),
    );
    const transactions = await readAll(
      env.DB.prepare("SELECT * FROM transactions WHERE owner_id=?").bind(member.id),
    );
    const investments = await readAll(
      env.DB.prepare("SELECT * FROM investments WHERE owner_id=?").bind(member.id),
    );
    const investmentIds = investments.map((x) => String(x.id));
    const snapshots = investmentIds.length
      ? await readAll(
          env.DB.prepare(
            `SELECT * FROM investment_snapshots WHERE investment_id IN (${investmentIds.map(() => "?").join(",")})`,
          ).bind(...investmentIds),
        )
      : [];
    const payments = await readAll(
      env.DB.prepare("SELECT * FROM payments WHERE owner_id=?").bind(member.id),
    );
    const documents = (
      await readAll(env.DB.prepare("SELECT * FROM documents WHERE owner_id=?").bind(member.id))
    ).map(({ storage_key, ...record }) => record);
    const shares = await readAll(
      env.DB.prepare("SELECT * FROM shares WHERE owner_id=?").bind(member.id),
    );
    await audit(env, member, "export", "member", member.id);
    return new Response(
      JSON.stringify(
        {
          exported_at: now(),
          accounts,
          transactions,
          investments,
          snapshots,
          payments,
          documents,
          shares,
        },
        null,
        2,
      ),
      {
        headers: {
          "content-type": "application/json",
          "content-disposition": "attachment; filename=family-finance-export.json",
          "cache-control": "private, no-store",
        },
      },
    );
  }
  return null;
}
