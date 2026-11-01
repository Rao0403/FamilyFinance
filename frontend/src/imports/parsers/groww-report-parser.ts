import type { Item } from "../../types/finance-record";
import { parseCsv } from "./csv-parser";
import { parseDate } from "./pdf-table";

type Sheet = { sheet: string; data: unknown[][] };
export type InvestmentSuggestions = { rows: Item[]; warnings: string[] };

const text = (value: unknown) => (value == null ? "" : String(value).trim());
const heading = (value: unknown) =>
  text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const find = (headers: string[], names: string[]) =>
  headers.findIndex((header) => names.includes(header));
const nameHeaders = ["schemename", "instrumentname", "stockname", "securityname", "fundname"];
const investedHeaders = [
  "investedvalue",
  "investedamount",
  "totalinvestment",
  "costvalue",
  "buyvalue",
];
const valueHeaders = ["currentvalue", "marketvalue", "presentvalue"];

function money(value: unknown): number | null {
  if (value == null || text(value) === "") return null;
  const clean = text(value).replace(/[₹,\s]/g, "");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(clean)) return null;
  const amount = Math.round(Number(clean) * 100);
  return Number.isSafeInteger(amount) ? amount : null;
}

function reportDate(rows: unknown[][], end: number): string {
  const labels = rows.slice(0, end).flat().map(text);
  for (const label of labels) {
    const match = label.match(/holdings\s+as\s+on\s+(\d{4}-\d{2}-\d{2})/i);
    if (match) return parseDate(match[1]) || "";
  }
  return "";
}

export function parseGrowwSheets(sheets: Sheet[]): InvestmentSuggestions {
  const rows: Item[] = [];
  const warnings: string[] = [];
  let tables = 0;
  for (const sheet of sheets) {
    const table = sheet.data;
    const headerIndex = table.findIndex((row) => {
      const headers = row.map(heading);
      return (
        find(headers, nameHeaders) >= 0 &&
        find(headers, investedHeaders) >= 0 &&
        find(headers, valueHeaders) >= 0
      );
    });
    if (headerIndex < 0) continue;
    tables++;
    const headers = table[headerIndex].map(heading);
    const col = (...names: string[]) => find(headers, names);
    const date = reportDate(table, headerIndex);
    if (!date && col("asof", "valuationdate", "date") < 0)
      warnings.push(`Sheet ${sheet.sheet}: enter the valuation date shown in the report.`);
    for (let index = headerIndex + 1; index < table.length; index++) {
      const cells = table[index] || [];
      const name = text(cells[col(...nameHeaders)]);
      if (!name || /^(grand\s+)?total\b/i.test(name)) continue;
      const invested = money(cells[col(...investedHeaders)]);
      const current = money(cells[col(...valueHeaders)]);
      const identifierColumn = col("foliono", "isin", "symbol", "ticker");
      const folio = identifierColumn < 0 ? "" : text(cells[identifierColumn]);
      const dateCell = cells[col("asof", "valuationdate", "date")];
      const asOf =
        date ||
        (dateCell instanceof Date
          ? dateCell.toISOString().slice(0, 10)
          : parseDate(text(dateCell))) ||
        "";
      if (invested === null || current === null)
        warnings.push(
          `Sheet ${sheet.sheet}, row ${index + 1}: check the invested and current values.`,
        );
      if (!asOf && col("asof", "valuationdate", "date") >= 0)
        warnings.push(`Sheet ${sheet.sheet}, row ${index + 1}: enter a valid valuation date.`);
      rows.push({
        name,
        symbol: folio,
        type:
          headers.includes("schemename") || headers.includes("fundname")
            ? "mutual_fund"
            : headers.includes("stockname")
              ? "stock"
              : "",
        quantity: col("units", "quantity") < 0 ? "" : text(cells[col("units", "quantity")]),
        invested_paise: invested,
        value_paise: current,
        as_of: asOf,
        source_ref: `${sheet.sheet}!row ${index + 1}`,
      });
    }
  }
  if (!tables)
    warnings.push(
      "No supported holdings table was found. Check the file or add holdings manually.",
    );
  return { rows, warnings };
}

export async function suggestInvestmentRows(file: File): Promise<InvestmentSuggestions> {
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const sheets = await readXlsxFile(file);
    return parseGrowwSheets(sheets as unknown as Sheet[]);
  }
  if (/\.(csv|txt)$/i.test(file.name) || /^(text\/csv|text\/plain)$/.test(file.type)) {
    return parseGrowwSheets([{ sheet: "CSV", data: parseCsv(await file.text()) }]);
  }
  return { rows: [], warnings: ["Select a Groww .xlsx or .csv holdings report."] };
}
