import type { Item } from "../types/finance-record";
import { suggestRows } from "./parsers/bank-statement-parser";
import { suggestFixedDeposits } from "./parsers/fixed-deposit-parser";
import { suggestInvestmentRows } from "./parsers/groww-report-parser";
import { extractPdf, extractText } from "./parsers/pdf-text-extractor";

export type DocumentSuggestions = {
  raw: string;
  rows: Item[];
  warnings: string[];
  statement?: { closing_date: string };
};

export async function parseDocument(
  file: File,
  kind: string,
  password = "",
): Promise<DocumentSuggestions> {
  if (kind === "investment") {
    const result = await suggestInvestmentRows(file);
    return { raw: "", ...result };
  }
  if (kind === "account" || kind === "fd") {
    const pdf = await extractPdf(file, password);
    const result = kind === "account" ? suggestRows(pdf.lines) : suggestFixedDeposits(pdf.lines);
    if (!pdf.lines.length)
      result.warnings.push(
        "No readable PDF text was found. Scanned PDFs and images need manual entry.",
      );
    return { raw: pdf.text, ...result };
  }
  return { raw: await extractText(file, password), rows: [], warnings: [] };
}
