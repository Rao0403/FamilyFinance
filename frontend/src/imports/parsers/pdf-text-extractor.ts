export type PdfItem = { text: string; x: number; width: number };
export type PdfLine = { page: number; line: number; items: PdfItem[] };
export type ExtractedPdf = { text: string; lines: PdfLine[] };

/** Convert PDF coordinates into the page's displayed orientation. */
export function displayedPosition(
  transform: number[],
  viewport: number[],
): { x: number; y: number } {
  const x = viewport[0] * transform[4] + viewport[2] * transform[5] + viewport[4];
  const y = -(viewport[1] * transform[4] + viewport[3] * transform[5] + viewport[5]);
  return { x, y };
}

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
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const lines = new Map<number, PdfItem[]>();
      for (const item of content.items) {
        if (!("str" in item) || !("transform" in item)) continue;
        const position = displayedPosition(item.transform, viewport.transform);
        const y = Math.round(position.y / 3) * 3;
        if (!item.str.trim()) continue;
        lines.set(y, [
          ...(lines.get(y) || []),
          { text: item.str, x: position.x, width: item.width },
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
