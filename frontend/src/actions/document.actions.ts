import { api, post } from "../api/finance-api";
import { showPreview } from "../imports/document-review";
import { upload } from "../imports/document-upload";
import { suggestRows } from "../imports/parsers/bank-statement-parser";
import { suggestInvestmentRows } from "../imports/parsers/groww-report-parser";
import { extractText } from "../imports/parsers/pdf-text-extractor";
import { state } from "../state/finance-state";
import type { RefreshApplication } from "../types/finance-record";

export async function handleDocumentAction(
  type: string,
  id: string | undefined,
  load: RefreshApplication,
) {
  if (type === "rollback") {
    if (
      confirm(
        "Undo all records imported from this document? The original file will remain available.",
      )
    ) {
      await post(`imports/${id}/rollback`, {});
      await load();
    }
    return;
  }
  if (type === "reprocess" && id) {
    const metadata = await api(`imports/${id}`),
      doc = state.documents.find((d) => d.id === id);
    const response = await fetch(`/api/documents/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error("Could not read the stored document");
    const file = new File([await response.blob()], doc?.name || "document", {
      type: doc?.mime_type || "application/pdf",
    });
    const password =
      file.type === "application/pdf"
        ? window.prompt("PDF password, if required (leave blank if none)") || ""
        : "";
    const raw = await extractText(file, password);
    state.preview = {
      file,
      target: metadata.target_id || "",
      kind: metadata.type,
      raw,
      rows: metadata.type === "account" ? suggestRows(raw) : suggestInvestmentRows(raw),
      documentId: id,
    };
    showPreview(load);
    return;
  }
  if (type === "upload" || type === "import-account") return upload(id, load);
}
