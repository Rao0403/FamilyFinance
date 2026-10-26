import * as pdfjs from "pdfjs-dist";
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();
export async function extractText(file: File, password?: string): Promise<string> {
  if (/pdf/i.test(file.type) || file.name.toLowerCase().endsWith(".pdf")) {
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      password: password || undefined,
    }).promise;
    const pages: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const content = await (await pdf.getPage(p)).getTextContent();
      const lines = new Map<number, string[]>();
      for (const item of content.items) {
        if (!("str" in item) || !("transform" in item)) continue;
        const y = Math.round(item.transform[5] / 3) * 3;
        lines.set(y, [...(lines.get(y) || []), item.str]);
      }
      pages.push(
        [...lines.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([, parts]) => parts.join(" "))
          .join("\n"),
      );
    }
    return pages.join("\n");
  }
  if (file.type.startsWith("image/")) return "";
  return file.text();
}
