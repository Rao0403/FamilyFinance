import { readAll } from "../lib/database";
import { asDate, asText } from "../lib/validation";
import type { Env } from "../types/environment";
import type { Member, RecordRow } from "../types/records";

export const currentInvestment = `(COALESCE((SELECT present FROM investment_presence_events pe WHERE pe.investment_id=investments.id ORDER BY pe.as_of DESC, pe.rowid DESC LIMIT 1),1)=1)`;
export const holdingKey = (type: string, name: string, symbol: string) =>
  `${type}\u0000${name.toLowerCase()}\u0000${symbol}`;

export async function compareInvestmentReport(
  env: Env,
  member: Member,
  kind: string,
  rows: RecordRow[],
) {
  if (!rows.length || !["fd", "investment"].includes(kind)) return { date: "", missing: [] };
  const dates = new Set(rows.map((row) => asDate(kind === "fd" ? row.report_date : row.as_of)));
  if (dates.size !== 1) return { date: "", missing: [] };
  const date = [...dates][0];
  const types = new Set(rows.map((row) => (kind === "fd" ? "fd" : asText(row.type))));
  if ([...types].some((type) => !["fd", "stock", "mutual_fund"].includes(type)))
    return { date: "", missing: [] };
  const incoming = new Set(
    rows.map((row) =>
      kind === "fd"
        ? `fd:${asText(row.identity_hash, 64)}`
        : holdingKey(asText(row.type), asText(row.name), asText(row.symbol, 60)),
    ),
  );
  const existing = await readAll<{
    id: string;
    type: string;
    name: string;
    symbol: string | null;
    fd_report_date: string | null;
    last_snapshot: string | null;
  }>(
    env.DB.prepare(
      `SELECT investments.id, investments.type, investments.name, investments.symbol, investments.fd_report_date,
    (SELECT MAX(as_of) FROM investment_snapshots s WHERE s.investment_id=investments.id) AS last_snapshot
    FROM investments WHERE owner_id=? AND created_import_id IS NOT NULL AND ${currentInvestment}
      AND ((type='fd' AND symbol LIKE 'fd:%') OR (type IN ('stock','mutual_fund') AND institution='Groww'))`,
    ).bind(member.id),
  );
  return {
    date,
    missing: existing
      .filter(
        (item) =>
          types.has(item.type) &&
          (item.type === "fd" ? kind === "fd" : kind === "investment") &&
          (item.type === "fd" ? item.fd_report_date : item.last_snapshot) &&
          (item.type === "fd" ? item.fd_report_date! : item.last_snapshot!) <= date &&
          !incoming.has(
            item.type === "fd"
              ? item.symbol || ""
              : holdingKey(item.type, item.name, item.symbol || ""),
          ),
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        symbol: item.type === "fd" ? "" : item.symbol,
      })),
  };
}
