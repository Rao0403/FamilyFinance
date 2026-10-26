import type { Item } from "../../types/finance-record";

export function suggestRows(raw: string): Item[] {
  const lines = raw.split(/\r?\n/);
  const result: Item[] = [];
  for (const line of lines) {
    const match = line.match(/\b(\d{2})[\/-](\d{2})[\/-](\d{4})\b/);
    if (!match) continue;
    const date = `${match[3]}-${match[2]}-${match[1]}`;
    const numbers = [...line.matchAll(/(?:^|\s)(?:₹\s*)?([\d,]+\.\d{2})(?=\s|$)/g)].map((m) =>
      Number(m[1].replace(/,/g, "")),
    );
    if (!numbers.length) continue;
    const description = line
      .slice(match.index! + match[0].length)
      .replace(/(?:₹\s*)?[\d,]+\.\d{2}/g, "")
      .trim();
    result.push({
      date,
      description,
      amount_paise: -Math.round(numbers[0] * 100),
      balance_paise: numbers.length > 1 ? Math.round(numbers.at(-1)! * 100) : null,
      category: "Uncategorized",
      kind: "expense",
    });
  }
  return result;
}
