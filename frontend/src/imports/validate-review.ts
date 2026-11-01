import type { Item } from "../types/finance-record";

const moneyPresent = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value);

export async function prepareReviewedRows(
  kind: string,
  rows: Item[],
  ownerId: string,
): Promise<Item[]> {
  const identities = new Set<string>();
  const prepared: Item[] = [];
  for (const [index, row] of rows.entries()) {
    const label = `Row ${index + 1}`;
    if (kind === "account") {
      if (!row.date || !String(row.description || "").trim() || !moneyPresent(row.amount_paise))
        throw new Error(`${label}: enter a date, description and amount.`);
      prepared.push({
        ...row,
        kind: row.amount_paise < 0 ? "expense" : "income",
        source_ref: row.source_ref || `manual-row-${index + 1}`,
      });
    } else if (kind === "investment") {
      if (
        !String(row.name || "").trim() ||
        !["stock", "mutual_fund"].includes(row.type) ||
        !row.as_of ||
        !moneyPresent(row.invested_paise) ||
        !moneyPresent(row.value_paise)
      )
        throw new Error(
          `${label}: enter a name, type, valuation date, invested amount and current value.`,
        );
      if (row.invested_paise < 0 || row.value_paise < 0)
        throw new Error(`${label}: values cannot be negative.`);
      const identity = `${row.type}|${String(row.name).trim().toLowerCase()}|${String(row.symbol || "").trim()}|${row.as_of}`;
      if (identities.has(identity))
        throw new Error(
          `${label}: duplicate holding and folio on the same date. Check the folio numbers.`,
        );
      identities.add(identity);
      prepared.push(row);
    } else if (kind === "fd") {
      const account = String(row.account_ref || "").replace(/\s/g, "");
      if (
        !/^\d{4,32}$/.test(account) ||
        !row.start_date ||
        !row.report_date ||
        !moneyPresent(row.principal_paise) ||
        row.principal_paise <= 0
      )
        throw new Error(
          `${label}: enter the full numeric FD account number, deposit date, principal and report date.`,
        );
      if (row.report_date < row.start_date)
        throw new Error(`${label}: report date cannot be before the deposit date.`);
      if (
        row.rate_bps != null &&
        (!Number.isSafeInteger(row.rate_bps) || row.rate_bps < 0 || row.rate_bps > 10000)
      )
        throw new Error(`${label}: check the interest rate.`);
      if (
        row.maturity_amount_paise != null &&
        (!moneyPresent(row.maturity_amount_paise) || row.maturity_amount_paise < 0)
      )
        throw new Error(`${label}: check the maturity amount.`);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${ownerId}|FD|${account}|${row.start_date}`),
      );
      const identity_hash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      if (identities.has(identity_hash))
        throw new Error(`${label}: another row has the same account number and deposit date.`);
      identities.add(identity_hash);
      prepared.push({
        identity_hash,
        account_suffix: account.slice(-4),
        start_date: row.start_date,
        principal_paise: row.principal_paise,
        rate_bps: row.rate_bps,
        maturity_date: row.maturity_date || null,
        maturity_amount_paise: row.maturity_amount_paise,
        report_date: row.report_date,
        source_ref: row.source_ref || `manual-row-${index + 1}`,
      });
    }
  }
  return prepared;
}
