import type { Item } from "../types/finance-record";
import { field, value } from "../components/form-fields";
import { openModal } from "../components/modal";
import { owned } from "../state/finance-selectors";
import { state } from "../state/finance-state";
import type { RefreshApplication } from "../types/finance-record";
import { esc } from "../utils/formatters";
import { showPreview } from "./document-review";
import { parseDocument } from "./parse-document";

export function upload(prefillId: string | undefined, load: RefreshApplication) {
  const renderAccountOption = (a: Item) => /* HTML */ `
    <option value="${esc(a.id)}" ${a.id === prefillId ? "selected" : ""}>${esc(a.name)}</option>
  `;

  const renderInvestmentOption = (i: Item) => /* HTML */ `
    <option value="${esc(i.id)}">${esc(i.name)}</option>
  `;

  const modal = (
    title: string,
    html: string,
    onSubmit?: (form: HTMLFormElement) => Promise<void>,
  ) => openModal(title, html, onSubmit, load);
  const mine = state.accounts.filter(owned);
  const holdings = state.investments.filter(owned);
  const backdrop = modal(
    "Import a document",
    /* HTML */ `
      <label>
        Document type
        <select name="kind">
          <option value="account">Indian Bank statement</option>
          <option value="investment">Groww holdings report</option>
          <option value="fd">Indian Bank term deposit summary</option>
          <option value="other">Other document</option>
        </select>
      </label>
      <label>
        Bank account (for statements)
        <select name="account_target">
          <option value="">Select an account</option>
          ${mine.map(renderAccountOption).join("")}
        </select>
      </label>
      <label>
        Investment (optional, to retain a document for one investment)
        <select name="investment_target">
          <option value="">Portfolio report / no single investment</option>
          ${holdings.map(renderInvestmentOption).join("")}
        </select>
      </label>
      <label>
        File
        <input type="file" name="file" accept=".pdf,.xlsx,.csv,.txt,.png,.jpg,.jpeg" required />
      </label>
      ${field("PDF password (if needed)", "pdf_password", "password", false)}
      <p class="muted">
        The PDF password is used only in your browser for this import and is not saved. Review
        suggested rows before importing.
      </p>
    `,
    async (f) => {
      const file = (f.querySelector<HTMLInputElement>('input[name="file"]')!.files || [])[0];
      if (!file) throw new Error("Select a file");
      if (!file.size || file.size > 15 * 1024 * 1024)
        throw new Error("File must be 1 byte to 15 MB");
      const kind = value(f, "kind"),
        target =
          kind === "account"
            ? value(f, "account_target")
            : kind === "investment"
              ? value(f, "investment_target")
              : "";
      if (kind === "account" && !target) throw new Error("Add your bank account first");
      const result = await parseDocument(file, kind, value(f, "pdf_password"));
      state.preview = {
        file,
        target,
        kind,
        ...result,
      };
      state.tab = "Documents";
      setTimeout(() => showPreview(load), 50);
    },
  );
  return backdrop;
}
