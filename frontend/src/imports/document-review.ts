import type { Item } from "../types/finance-record";
import { post } from "../api/finance-api";
import { state } from "../state/finance-state";
import type { RefreshApplication } from "../types/finance-record";
import { esc, paise, today } from "../utils/formatters";
import { alertError } from "../utils/notify-error";

export function showPreview(load: RefreshApplication) {
  const p = state.preview;
  if (!p) return;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = /* HTML */ `
    <div class="modal wide">
      <div class="modal-head">
        <div>
          <h2>Review ${esc(p.file.name)}</h2>
          <p class="muted">Nothing affects your totals until you confirm.</p>
        </div>
        <button class="icon-button" data-close>×</button>
      </div>
      ${
        p.kind === "account"
          ? /* HTML */ `
              <p class="notice small">
                Suggestions are approximate until we have an Indian Bank sample. Check debit/credit
                signs and balances carefully.
              </p>
              <div class="review-table">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Amount ₹</th>
                      <th>Balance ₹</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody id="preview-body"></tbody>
                </table>
              </div>
              <button class="secondary" id="add-preview" type="button">＋ Add row</button>
            `
          : p.kind === "investment" && !p.target
            ? /* HTML */ `
                <p class="notice small">
                  Check every holding, type, invested amount and value. Unknown CSV columns can be
                  entered manually.
                </p>
                <div class="review-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Invested ₹</th>
                        <th>Value ₹</th>
                        <th>As of</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody id="preview-body"></tbody>
                  </table>
                </div>
                <button class="secondary" id="add-preview" type="button">＋ Add holding</button>
              `
            : /* HTML */ `
                <p class="notice small">
                  This file will be stored privately and linked to the selected investment if
                  supplied. Enter or update FD figures from Investments.
                </p>
                <textarea readonly rows="12" class="raw-preview">
${esc(p.raw.slice(0, 4000))}</textarea>
              `
      }
      <div class="modal-actions">
        <button class="secondary" data-close>Cancel</button>
        <button class="primary" id="confirm-import">
          ${p.kind === "account" || (p.kind === "investment" && !p.target && p.rows.length) ? "Confirm import" : "Save document"}
        </button>
      </div>
    </div>
  `;
  document.body.append(backdrop);
  const tableBody = backdrop.querySelector<HTMLTableSectionElement>("#preview-body");
  const drawRows = () => {
    const renderReviewRow = (r: Item, i: number) =>
      p.kind === "account"
        ? /* HTML */ `
            <tr>
              <td><input data-i="${i}" data-key="date" type="date" value="${esc(r.date)}" /></td>
              <td><input data-i="${i}" data-key="description" value="${esc(r.description)}" /></td>
              <td>
                <input
                  data-i="${i}"
                  data-key="amount"
                  type="number"
                  step="0.01"
                  value="${(r.amount_paise / 100).toFixed(2)}"
                />
              </td>
              <td>
                <input
                  data-i="${i}"
                  data-key="balance"
                  type="number"
                  step="0.01"
                  value="${r.balance_paise == null ? "" : (r.balance_paise / 100).toFixed(2)}"
                />
              </td>
              <td><button class="icon-button" data-remove="${i}">×</button></td>
            </tr>
          `
        : /* HTML */ `
            <tr>
              <td><input data-i="${i}" data-key="name" value="${esc(r.name)}" /></td>
              <td>
                <select data-i="${i}" data-key="type">
                  <option value="stock" ${r.type === "stock" ? "selected" : ""}>Stock</option>
                  <option value="mutual_fund" ${r.type === "mutual_fund" ? "selected" : ""}>
                    Mutual fund
                  </option>
                </select>
              </td>
              <td>
                <input
                  data-i="${i}"
                  data-key="invested"
                  type="number"
                  step="0.01"
                  value="${(r.invested_paise / 100).toFixed(2)}"
                />
              </td>
              <td>
                <input
                  data-i="${i}"
                  data-key="current"
                  type="number"
                  step="0.01"
                  value="${(r.value_paise / 100).toFixed(2)}"
                />
              </td>
              <td><input data-i="${i}" data-key="as_of" type="date" value="${esc(r.as_of)}" /></td>
              <td><button class="icon-button" data-remove="${i}">×</button></td>
            </tr>
          `;

    if (!tableBody) return;
    tableBody.innerHTML = p.rows.map(renderReviewRow).join("");
    tableBody
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select")
      .forEach((input) =>
        input.addEventListener("change", () => {
          const row = p.rows[Number(input.dataset.i)],
            key = input.dataset.key!;
          if (key === "amount") row.amount_paise = paise(input.value);
          else if (key === "balance") row.balance_paise = input.value ? paise(input.value) : null;
          else if (key === "invested") row.invested_paise = paise(input.value);
          else if (key === "current") row.value_paise = paise(input.value);
          else row[key] = input.value;
        }),
      );
    tableBody.querySelectorAll<HTMLElement>("[data-remove]").forEach((el) =>
      el.addEventListener("click", () => {
        p.rows.splice(Number(el.dataset.remove), 1);
        drawRows();
      }),
    );
  };
  drawRows();
  backdrop.querySelector("#add-preview")?.addEventListener("click", () => {
    p.rows.push(
      p.kind === "account"
        ? {
            date: today(),
            description: "",
            amount_paise: 0,
            balance_paise: null,
            category: "Uncategorized",
            kind: "expense",
          }
        : {
            name: "",
            symbol: "",
            type: "mutual_fund",
            quantity: "",
            invested_paise: 0,
            value_paise: 0,
            as_of: today(),
            source_ref: `manual-row-${p.rows.length + 1}`,
          },
    );
    drawRows();
  });
  backdrop.querySelectorAll("[data-close]").forEach((el) =>
    el.addEventListener("click", () => {
      backdrop.remove();
      state.preview = undefined;
    }),
  );
  backdrop.querySelector("#confirm-import")!.addEventListener("click", async () => {
    const button = backdrop.querySelector<HTMLButtonElement>("#confirm-import")!;
    button.disabled = true;
    try {
      let uploaded: any = { id: p.documentId };
      if (!p.documentId) {
        const fileResponse = await fetch("/api/documents", {
          method: "POST",
          headers: {
            "content-type": p.file.type || "application/pdf",
            "x-document-type": p.kind,
            "x-file-name": p.file.name,
            ...(p.target ? { "x-target-id": p.target } : {}),
          },
          body: p.file,
        });
        uploaded = await fileResponse.json();
        if (!fileResponse.ok) throw new Error(uploaded.error || "Upload failed");
      }
      if (p.kind === "account" && p.rows.length)
        await post(`imports/${uploaded.id}/commit`, {
          rows: p.rows.map((r, i) => ({
            ...r,
            kind: r.amount_paise < 0 ? "expense" : "income",
            source_ref: `review-row-${i + 1}`,
          })),
        });
      if (p.kind === "investment" && !p.target && p.rows.length)
        await post(`imports/${uploaded.id}/commit`, { rows: p.rows });
      backdrop.remove();
      state.preview = undefined;
      await load();
    } catch (error) {
      alertError(error);
      button.disabled = false;
    }
  });
}
