import type { Item } from "../../types/finance-record";
import type { PdfLine } from "./pdf-text-extractor";
import { columns, lineText, parseAmount, parseDate, rightEdge } from "./pdf-table";

export function suggestRows(lines: PdfLine[]): {
  rows: Item[];
  warnings: string[];
  statement: { closing_date: string };
} {
  const rows: Item[] = [];
  let anchors: ReturnType<typeof columns> = null;
  let skipped = 0;
  let continuation: { row: Item; page: number } | null = null;
  for (const line of lines) {
    const header = columns(line, {
      date: /\bdate\b/i,
      details: /transaction\s+details/i,
      debit: /\bdebits?\b/i,
      credit: /\bcredits?\b/i,
      balance: /\bbalance\b/i,
    });
    if (header) {
      anchors = header;
      continuation = null;
      continue;
    }
    if (!anchors) continue;
    const dateLimit = (anchors.date.end + anchors.details.start) / 2;
    const dateItem = line.items.find((item) => item.x < dateLimit && parseDate(item.text) !== null);
    const detailBoundary = (anchors.details.end + anchors.debit.end) / 2;
    if (!dateItem) {
      if (continuation && continuation.page === line.page) {
        const detailItems = line.items.filter(
          (item) => item.x >= dateLimit && rightEdge(item) < detailBoundary,
        );
        if (detailItems.length && detailItems.length === line.items.length) {
          continuation.row.description = `${continuation.row.description} ${detailItems
            .map((item) => item.text.trim())
            .join(" ")}`.trim();
        } else continuation = null;
      }
      continue;
    }
    continuation = null;
    const amounts: { debit: number[]; credit: number[]; balance: number[] } = {
      debit: [],
      credit: [],
      balance: [],
    };
    const description: string[] = [];
    const debitBoundary = (anchors.debit.end + anchors.credit.end) / 2;
    const creditBoundary = (anchors.credit.end + anchors.balance.end) / 2;
    let unclearAmount = false;
    for (const item of line.items) {
      if (item === dateItem) continue;
      const amount = parseAmount(item.text, true);
      const edge = rightEdge(item);
      if (edge >= detailBoundary && amount === null && parseAmount(item.text) !== null)
        unclearAmount = true;
      if (amount !== null && edge >= detailBoundary) {
        const field = edge < debitBoundary ? "debit" : edge < creditBoundary ? "credit" : "balance";
        amounts[field].push(amount);
      } else if (edge < detailBoundary && item.x >= dateItem.x) description.push(item.text.trim());
    }
    if (
      unclearAmount ||
      amounts.debit.length > 1 ||
      amounts.credit.length > 1 ||
      amounts.balance.length > 1
    ) {
      skipped++;
      continue;
    }
    const debit = amounts.debit[0] === 0 && amounts.credit[0] ? undefined : amounts.debit[0];
    const credit = amounts.credit[0] === 0 && amounts.debit[0] ? undefined : amounts.credit[0];
    if ((debit === undefined) === (credit === undefined)) {
      skipped++;
      continue;
    }
    if ((debit !== undefined && debit < 0) || (credit !== undefined && credit < 0)) {
      skipped++;
      continue;
    }
    const row: Item = {
      date: parseDate(dateItem.text),
      description: description.join(" ").trim(),
      amount_paise: debit !== undefined ? -debit : credit,
      balance_paise: amounts.balance[0] ?? null,
      category: "Uncategorized",
      kind: debit !== undefined ? "expense" : "income",
      source_ref: `page ${line.page}, line ${line.line}`,
    };
    rows.push(row);
    continuation = { row, page: line.page };
  }
  const warnings = [
    "Check every date, description, debit, credit and running balance against the statement before importing.",
  ];
  if (!anchors)
    warnings.push(
      "The account activity columns could not be identified. Add rows manually or use a text PDF.",
    );
  if (skipped)
    warnings.push(
      `${skipped} dated line(s) could not be classified safely and were omitted. Add any missing transactions manually.`,
    );
  const period = lines
    .map(lineText)
    .join("\n")
    .match(
      /for\s+period\s*:\s*\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s*[-–]\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i,
    );
  return { rows, warnings, statement: { closing_date: period ? parseDate(period[1]) || "" : "" } };
}
