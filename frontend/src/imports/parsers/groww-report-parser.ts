import type { Item } from "../../types/finance-record";
import { paise, today } from "../../utils/formatters";
import { parseCsv } from "./csv-parser";

export function suggestInvestmentRows(raw: string): Item[] {
  const table = parseCsv(raw);
  if (table.length < 2) return [];
  const headings = table[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const find = (...names: string[]) =>
    headings.findIndex((h) => names.some((name) => h.includes(name)));
  const nameCol = find("schemename", "instrumentname", "stockname", "securityname", "fundname");
  const investedCol = find(
    "investedamount",
    "investedvalue",
    "totalinvestment",
    "costvalue",
    "buyvalue",
  );
  const valueCol = find("currentvalue", "marketvalue", "presentvalue");
  const qtyCol = find("units", "quantity");
  const symbolCol = find("isin", "symbol", "ticker");
  if (nameCol < 0 || investedCol < 0 || valueCol < 0) return [];
  return table
    .slice(1)
    .filter((row) => row[nameCol]?.trim())
    .map((row, i) => ({
      name: row[nameCol].trim(),
      symbol: symbolCol >= 0 ? row[symbolCol]?.trim() : "",
      type: /fund|scheme/i.test(row[nameCol]) ? "mutual_fund" : "stock",
      quantity: qtyCol >= 0 ? row[qtyCol] : "",
      invested_paise: paise((row[investedCol] || "0").replace(/[^\d.-]/g, "")),
      value_paise: paise((row[valueCol] || "0").replace(/[^\d.-]/g, "")),
      as_of: today(),
      source_ref: `csv-row-${i + 2}`,
    }));
}
