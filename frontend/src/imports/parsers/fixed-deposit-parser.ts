import type { Item } from "../../types/finance-record";
import type { PdfLine } from "./pdf-text-extractor";
import { columns, parseAmount, parseDate } from "./pdf-table";

export function suggestFixedDeposits(lines: PdfLine[]): { rows: Item[]; warnings: string[] } {
  const rows: Item[] = [];
  const names = [
    "account",
    "holder",
    "receipt",
    "start",
    "principal",
    "currency",
    "tenure",
    "rate",
    "maturity",
    "maturityAmount",
  ] as const;
  let header: ReturnType<typeof columns> = null;
  let skipped = 0;
  for (const line of lines) {
    const found = columns(line, {
      account: /account\s+number/i,
      holder: /account\s+holder.?s?\s+name/i,
      receipt: /receipt\s+type/i,
      start: /date\s+of\s+deposit/i,
      principal: /deposit\s+amount/i,
      currency: /currency/i,
      tenure: /tenure/i,
      rate: /interest\s+rate/i,
      maturity: /maturity\s+date/i,
      maturityAmount: /maturity\s+amount/i,
    });
    if (found) {
      header = found;
      continue;
    }
    if (!header) continue;
    const current = header;
    const values: Record<string, string[]> = Object.fromEntries(names.map((name) => [name, []]));
    for (const item of line.items) {
      const centre = item.x + item.width / 2;
      const index = names.findIndex((name, i) => {
        const next = names[i + 1];
        const left = i
          ? (current[names[i - 1]].end + current[name].start) / 2
          : current[name].start - 20;
        const right = next ? (current[name].end + current[next].start) / 2 : current[name].end + 80;
        return centre >= left && centre < right;
      });
      if (index >= 0) values[names[index]].push(item.text.trim());
    }
    const account = values.account.join("").replace(/\s/g, "");
    const start = parseDate(values.start.join(" "));
    const principal = parseAmount(values.principal.join(" "));
    const maturityDate = parseDate(values.maturity.join(" "));
    const maturityAmount = parseAmount(values.maturityAmount.join(" "));
    const rateText = values.rate.join("").replace(/%/g, "").trim();
    const rate = /^\d+(?:\.\d{1,2})?$/.test(rateText) ? Math.round(Number(rateText) * 100) : null;
    if (!account && !start && principal === null) continue;
    if (!account || !start || principal === null) {
      skipped++;
      continue;
    }
    rows.push({
      account_ref: account,
      start_date: start,
      principal_paise: principal,
      rate_bps: rate,
      maturity_date: maturityDate || "",
      maturity_amount_paise: maturityAmount,
      report_date: "",
      source_ref: `page ${line.page}, line ${line.line}`,
    });
  }
  const warnings = [
    "Check each deposit against the original. Enter the report date; the screenshot does not show one.",
  ];
  if (!header)
    warnings.push(
      "The term deposit columns could not be identified. Add deposits manually or use a text PDF.",
    );
  if (skipped)
    warnings.push(
      `${skipped} possible deposit line(s) were not clear enough to suggest. Add any missing deposits manually.`,
    );
  return { rows, warnings };
}
