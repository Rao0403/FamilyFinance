import type { Item } from "../types/finance-record";
import { empty, pill, sectionHeader } from "../components/page-elements";
import { nameOf, owned } from "../state/finance-selectors";
import { state } from "../state/finance-state";
import { dateLabel, esc } from "../utils/formatters";

export function documentsView() {
  const renderDocumentRow = (d: Item) => /* HTML */ `
    <div class="list-row">
      <span class="round-icon">▧</span>
      <div class="grow">
        <strong>${esc(d.name)}</strong>
        <small>
          ${dateLabel(d.created_at?.slice(0, 10))} · ${esc(nameOf(d.owner_id))} ·
          ${Math.round(d.size_bytes / 1024)} KB
        </small>
      </div>
      ${pill(d.status)}${
        owned(d) && d.status === "imported"
          ? /* HTML */ `
              <button class="text-button danger" data-action="rollback" data-id="${esc(d.id)}">
                Undo import
              </button>
            `
          : ""
      }${
        owned(d) && d.status === "uploaded" && ["account", "investment", "fd"].includes(d.type)
          ? /* HTML */ `
              <button class="text-button" data-action="reprocess" data-id="${esc(d.id)}">
                Review import
              </button>
            `
          : ""
      }
      <a class="text-button" href="/api/documents/${encodeURIComponent(d.id)}">Download ↗</a>
    </div>
  `;

  return /* HTML */ `
    ${sectionHeader(
      "SOURCE FILES",
      "Documents",
      "Your original uploads stay available alongside extracted records.",
      /* HTML */ `
        <button class="primary" data-action="upload">↑ Upload document</button>
      `,
    )}
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Uploaded files</h2>
          <p>Private unless you share their account or investment</p>
        </div>
      </div>
      ${
        state.documents.length
          ? state.documents.map(renderDocumentRow).join("")
          : empty(
              "▧",
              "No documents uploaded",
              "Upload a bank statement, FD receipt or Groww report.",
            )
      }
    </section>
  `;
}
