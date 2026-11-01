export type PdfItem = { text: string; x: number; width: number };
export type PdfLine = { page: number; line: number; items: PdfItem[] };
export type ExtractedPdf = { text: string; lines: PdfLine[] };

export async function extractPdf(file: File, password?: string): Promise<ExtractedPdf> {
  if (/pdf/i.test(file.type) || file.name.toLowerCase().endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      password: password || undefined,
    }).promise;
    const pages: string[] = [];
    const allLines: PdfLine[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const content = await (await pdf.getPage(p)).getTextContent();
      const lines = new Map<number, PdfItem[]>();
      for (const item of content.items) {
        if (!("str" in item) || !("transform" in item)) continue;
        const y = Math.round(item.transform[5] / 3) * 3;
        if (!item.str.trim()) continue;
        lines.set(y, [
          ...(lines.get(y) || []),
          { text: item.str, x: item.transform[4], width: item.width },
        ]);
      }
      const ordered = [...lines.entries()].sort((a, b) => b[0] - a[0]);
      const pageLines = ordered.map(([, items], index) => ({
        page: p,
        line: index + 1,
        items: items.sort((a, b) => a.x - b.x),
      }));
      allLines.push(...pageLines);
      pages.push(pageLines.map((line) => line.items.map((item) => item.text).join(" ")).join("\n"));
    }
    return { text: pages.join("\n"), lines: allLines };
  }
  return { text: "", lines: [] };
}

export async function extractText(file: File, password?: string): Promise<string> {
  if (/pdf/i.test(file.type) || file.name.toLowerCase().endsWith(".pdf"))
    return (await extractPdf(file, password)).text;
  if (file.type.startsWith("image/")) return "";
  return file.text();
}
