// Prints only generic heading words and text-item positions, never document values.
// Run locally: node scripts/inspect-fd-layout.mjs "C:\path\to\report.pdf"
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/inspect-fd-layout.mjs "path-to-report.pdf"');
  process.exitCode = 1;
} else {
  try {
    const pdf = await getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 })
      .promise;
    const allowed = new Set([
      "account",
      "number",
      "no",
      "holder",
      "holders",
      "s",
      "name",
      "receipt",
      "type",
      "date",
      "of",
      "deposit",
      "amount",
      "currency",
      "tenure",
      "interest",
      "rate",
      "maturity",
    ]);
    console.log("--- BEGIN FD LAYOUT (no document values) ---");
    console.log(`Pages: ${pdf.numPages}`);
    for (let page = 1; page <= Math.min(pdf.numPages, 3); page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      const lines = new Map();
      for (const item of content.items) {
        if (!("str" in item) || !("transform" in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5] / 3) * 3;
        const words = (item.str.toLowerCase().match(/[a-z]+/g) || []).filter((word) =>
          allowed.has(word),
        );
        const type = words.length
          ? `H(${words.join("+")})`
          : /^\s*[\d,./%₹\-]+\s*$/.test(item.str)
            ? "N"
            : "X";
        const details = `${type}@${Math.round(item.transform[4])}/${Math.round(item.width)}`;
        lines.set(y, [...(lines.get(y) || []), { x: item.transform[4], details }]);
      }
      console.log(`Page ${page}: ${lines.size} text lines`);
      const ordered = [...lines.entries()].sort((a, b) => b[0] - a[0]);
      for (const [y, items] of ordered.slice(0, 80)) {
        console.log(
          `y=${y}: ${items
            .sort((a, b) => a.x - b.x)
            .map((item) => item.details)
            .join(" ")}`,
        );
      }
      if (ordered.length > 80) console.log("Additional lines omitted.");
    }
    console.log("--- END FD LAYOUT ---");
  } catch {
    console.error(
      "Could not read the PDF. Check the path and whether the PDF requires a password.",
    );
    process.exitCode = 1;
  }
}
