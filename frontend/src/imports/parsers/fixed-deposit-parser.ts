import type { Item } from "../../types/finance-record";
import type { PdfLine } from "./pdf-text-extractor";
import { columns, parseAmount, parseDate } from "./pdf-table";

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
const patterns = {
  account: /account\s+(?:number|no\.?)/i,
  holder: /account\s+holder.?s?\s+name/i,
  receipt: /receipt\s+type/i,
  start: /date\s+of\s+deposit/i,
  principal: /deposit\s+amount/i,
  currency: /currency/i,
  tenure: /tenure/i,
  rate: /interest\s+rate/i,
  maturity: /maturity\s+date/i,
  maturityAmount: /maturity\s+amount/i,
};
const required = ["account", "start", "principal", "rate", "maturity", "maturityAmount"] as const;

export function suggestFixedDeposits(lines: PdfLine[]): { rows: Item[]; warnings: string[] } {
  const rows: Item[] = [];
  let header: ReturnType<typeof columns> = null;
  let skipped = 0;
  let pending: { page: number; line: number; values: Record<string, string[]> } | null = null;

  const flush = () => {
    if (!pending) return;
    const { values, page, line } = pending;
    const account = values.account.join("").replace(/\s/g, "");
    const start = parseDate(values.start.join(" "));
    const principal = parseAmount(values.principal.join(" "));
    const maturityDate = parseDate(values.maturity.join(" "));
    const maturityAmount = parseAmount(values.maturityAmount.join(" "));
    const rateText = values.rate.join("").replace(/%/g, "").trim();
    const rate = /^\d+(?:\.\d{1,2})?$/.test(rateText) ? Math.round(Number(rateText) * 100) : null;
    if (!/^\d{4,32}$/.test(account) || !start || principal === null) skipped++;
    else
      rows.push({
        account_ref: account,
        start_date: start,
        principal_paise: principal,
        rate_bps: rate,
        maturity_date: maturityDate || "",
        maturity_amount_paise: maturityAmount,
        report_date: "",
        source_ref: `page ${page}, line ${line}`,
      });
    pending = null;
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    // PDF text extraction can split a heading across successive visual lines.
    let found: ReturnType<typeof columns> = null;
    let used = 0;
    for (let count = 1; count <= 12 && index + count <= lines.length; count++) {
      const group = lines.slice(index, index + count);
      if (group.some((part) => part.page !== line.page)) break;
      const combined: PdfLine = {
        ...line,
        items: group.flatMap((part) => part.items).sort((a, b) => a.x - b.x),
      };
      const detected: NonNullable<ReturnType<typeof columns>> = {};
      for (const [name, pattern] of Object.entries(patterns)) {
        const match = columns(combined, { [name]: pattern });
        if (match) detected[name] = match[name];
      }
      const ordered = required.every(
        (name, i) => !i || detected[name]?.start > detected[required[i - 1]]?.start,
      );
      if (required.every((name) => detected[name]) && ordered) {
        found = detected;
        used = count;
        break;
      }
    }
    if (found) {
      flush();
      header = found;
      index += used - 1;
      continue;
    }
    if (!header) continue;
    if (pending && pending.page !== line.page) flush();
    const current = header;
    const values: Record<string, string[]> = Object.fromEntries(names.map((name) => [name, []]));
    const visibleColumns = names.filter((name) => current[name]);
    for (const item of line.items) {
      const centre = item.x + item.width / 2;
      const column = visibleColumns.find((name, i) => {
        const next = visibleColumns[i + 1];
        const left = i
          ? (current[visibleColumns[i - 1]].end + current[name].start) / 2
          : current[name].start - 20;
        const right = next ? (current[name].end + current[next].start) / 2 : current[name].end + 80;
        return centre >= left && centre < right;
      });
      const text = item.text.trim();
      if (column === "account" && !/^\d+$/.test(text.replace(/\s/g, ""))) continue;
      if ((column === "principal" || column === "maturityAmount") && parseAmount(text) === null)
        continue;
      if ((column === "start" || column === "maturity") && !parseDate(text)) continue;
      if (column === "rate" && !/^\d+(?:\.\d{1,2})?\s*%?$/.test(text)) continue;
      if (column) values[column].push(text);
    }
    const account = values.account.join("").replace(/\s/g, "");
    if (/^\d{4,32}$/.test(account)) {
      flush();
      pending = { page: line.page, line: line.line, values };
    } else if (pending && !account) {
      for (const name of names) pending.values[name].push(...values[name]);
    } else if (account) {
      flush();
      skipped++;
    }
  }
  flush();
  const warnings = ["Check each deposit against the original. Enter the report date."];
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
