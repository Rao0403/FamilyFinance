import type { PdfItem, PdfLine } from "./pdf-text-extractor";

export type Column = { start: number; end: number };

export function columns(
  line: PdfLine,
  patterns: Record<string, RegExp>,
): Record<string, Column> | null {
  let text = "";
  const positions: number[] = [];
  for (const item of line.items) {
    const width = item.width || item.text.length * 4;
    for (let i = 0; i < item.text.length; i++)
      positions.push(item.x + (width * i) / item.text.length);
    text += item.text;
    positions.push(item.x + width);
    text += " ";
  }
  const result: Record<string, Column> = {};
  for (const [name, pattern] of Object.entries(patterns)) {
    const match = pattern.exec(text);
    if (!match || match.index === undefined) return null;
    result[name] = { start: positions[match.index], end: positions[match.index + match[0].length] };
  }
  return result;
}

export function lineText(line: PdfLine): string {
  return line.items.map((item) => item.text).join(" ");
}

export function parseDate(value: string): string | null {
  const input = value.trim();
  let year: number, month: number, day: number;
  const iso = input.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const numeric = input.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  const named = input.match(/^(\d{1,2})[\s/-]+([A-Za-z]{3})[\s,/-]+(\d{4})$/);
  if (iso) [, year, month, day] = iso.map(Number);
  else if (numeric) [, day, month, year] = numeric.map(Number);
  else if (named) {
    day = Number(named[1]);
    month =
      ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
        named[2].toLowerCase(),
      ) + 1;
    year = Number(named[3]);
  } else return null;
  const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date
    ? date
    : null;
}

export function parseAmount(value: string, requireDecimals = false): number | null {
  const clean = value
    .trim()
    .replace(/^(?:₹|rs\.?|inr)\s*/i, "")
    .replace(/,/g, "");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(clean)) return null;
  if (requireDecimals && !/\.\d{2}$/.test(clean)) return null;
  const result = Math.round(Number(clean) * 100);
  return Number.isSafeInteger(result) ? result : null;
}

export function rightEdge(item: PdfItem): number {
  return item.x + (item.width || 0);
}
