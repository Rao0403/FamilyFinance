import type { Item } from "../types/finance-record";
import { post } from "../api/finance-api";
import { state } from "../state/finance-state";
import type { RefreshApplication } from "../types/finance-record";
import { esc, paise, today } from "../utils/formatters";
import { alertError } from "../utils/notify-error";
import { prepareReviewedRows } from "./validate-review";

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
      ${p.warnings
        .map(
          (warning) => /* HTML */ `
            <p class="notice small">${esc(warning)}</p>
          `,
        )
        .join("")}
      ${
        p.kind === "account"
          ? /* HTML */ `
              <p class="notice small">
                Check debit and credit signs, running balances, and missing transactions.
              </p>
              <div class="stack-form">
                <label>
                  Statement end date
                  <input
                    id="statement-closing-date"
                    type="date"
                    value="${esc(p.statement?.closing_date || "")}"
                  />
                </label>
                <label>
                  Ending balance shown on statement (₹)
                  <input id="statement-closing-balance" type="number" step="0.01" />
                </label>
                <p class="muted">
                  Confirm both values from the statement’s account summary. They determine the
                  account balance.
                </p>
              </div>
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
                  Check every holding, folio, units, invested amount, value and valuation date.
                </p>
                <div class="review-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Folio / symbol</th>
                        <th>Units</th>
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
            : p.kind === "fd"
              ? /* HTML */ `
                  <p class="notice small">
                    Review each deposit. The app stores a masked account reference and a matching
                    key; the retained original PDF contains its original details.
                  </p>
                  <div class="report-date-control">
                    <label for="fd-report-date">Report date for all deposits</label>
                    <input id="fd-report-date" type="date" />
                    <button class="secondary" id="fd-report-today" type="button">Use today</button>
                    <p class="muted">
                      Choose the report date or use today. You can still change individual rows.
                    </p>
                  </div>
                  <div class="review-table">
                    <table>
                      <thead>
                        <tr>
                          <th>FD account number</th>
                          <th>Deposit date</th>
                          <th>Principal ₹</th>
                          <th>Rate %</th>
                          <th>Maturity date</th>
                          <th>Maturity amount ₹</th>
                          <th>Report date</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody id="preview-body"></tbody>
                    </table>
                  </div>
                  <button class="secondary" id="add-preview" type="button">＋ Add deposit</button>
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
          ${p.rows.length && (p.kind === "account" || p.kind === "fd" || (p.kind === "investment" && !p.target)) ? "Confirm import" : "Save document"}
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
                  value="${r.amount_paise == null ? "" : (r.amount_paise / 100).toFixed(2)}"
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
        : p.kind === "fd"
          ? /* HTML */ `
              <tr>
                <td>
                  <input
                    data-i="${i}"
                    data-key="account_ref"
                    value="${esc(r.account_ref)}"
                    autocomplete="off"
                  />
                </td>
                <td>
                  <input
                    data-i="${i}"
                    data-key="start_date"
                    type="date"
                    value="${esc(r.start_date)}"
                  />
                </td>
                <td>
                  <input
                    data-i="${i}"
                    data-key="principal"
                    type="number"
                    step="0.01"
                    value="${r.principal_paise == null ? "" : (r.principal_paise / 100).toFixed(2)}"
                  />
                </td>
                <td>
                  <input
                    data-i="${i}"
                    data-key="rate"
                    type="number"
                    step="0.01"
                    value="${r.rate_bps == null ? "" : (r.rate_bps / 100).toFixed(2)}"
                  />
                </td>
                <td>
                  <input
                    data-i="${i}"
                    data-key="maturity_date"
                    type="date"
                    value="${esc(r.maturity_date)}"
                  />
                </td>
                <td>
                  <input
                    data-i="${i}"
                    data-key="maturity_amount"
                    type="number"
                    step="0.01"
                    value="${r.maturity_amount_paise == null ? "" : (r.maturity_amount_paise / 100).toFixed(2)}"
                  />
                </td>
                <td>
                  <input
                    data-i="${i}"
                    data-key="report_date"
                    type="date"
                    value="${esc(r.report_date)}"
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
                    <option value="" ${!r.type ? "selected" : ""}>Select type</option>
                    <option value="stock" ${r.type === "stock" ? "selected" : ""}>Stock</option>
                    <option value="mutual_fund" ${r.type === "mutual_fund" ? "selected" : ""}>
                      Mutual fund
                    </option>
                  </select>
                </td>
                <td><input data-i="${i}" data-key="symbol" value="${esc(r.symbol)}" /></td>
                <td><input data-i="${i}" data-key="quantity" value="${esc(r.quantity)}" /></td>
                <td>
                  <input
                    data-i="${i}"
                    data-key="invested"
                    type="number"
                    step="0.01"
                    value="${r.invested_paise == null ? "" : (r.invested_paise / 100).toFixed(2)}"
                  />
                </td>
                <td>
                  <input
                    data-i="${i}"
                    data-key="current"
                    type="number"
                    step="0.01"
                    value="${r.value_paise == null ? "" : (r.value_paise / 100).toFixed(2)}"
                  />
                </td>
                <td>
                  <input data-i="${i}" data-key="as_of" type="date" value="${esc(r.as_of)}" />
                </td>
                <td><button class="icon-button" data-remove="${i}">×</button></td>
              </tr>
            `;

    if (!tableBody) return;
    const confirmButton = backdrop.querySelector<HTMLButtonElement>("#confirm-import")!;
    confirmButton.textContent = p.rows.length ? "Confirm import" : "Save document";
    tableBody.innerHTML = p.rows.map(renderReviewRow).join("");
    tableBody
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select")
      .forEach((input) =>
        input.addEventListener("change", () => {
          const row = p.rows[Number(input.dataset.i)],
            key = input.dataset.key!;
          if (key === "amount") row.amount_paise = input.value ? paise(input.value) : null;
          else if (key === "balance") row.balance_paise = input.value ? paise(input.value) : null;
          else if (key === "invested") row.invested_paise = input.value ? paise(input.value) : null;
          else if (key === "current") row.value_paise = input.value ? paise(input.value) : null;
          else if (key === "principal")
            row.principal_paise = input.value ? paise(input.value) : null;
          else if (key === "maturity_amount")
            row.maturity_amount_paise = input.value ? paise(input.value) : null;
          else if (key === "rate")
            row.rate_bps = input.value ? Math.round(Number(input.value) * 100) : null;
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
  const reportDate = backdrop.querySelector<HTMLInputElement>("#fd-report-date");
  const applyReportDate = (date: string) => {
    if (!date) return;
    for (const row of p.rows) row.report_date = date;
    tableBody
      ?.querySelectorAll<HTMLInputElement>('input[data-key="report_date"]')
      .forEach((input) => {
        input.value = date;
      });
  };
  reportDate?.addEventListener("change", () => applyReportDate(reportDate.value));
  backdrop.querySelector<HTMLButtonElement>("#fd-report-today")?.addEventListener("click", () => {
    if (!reportDate) return;
    reportDate.value = today();
    applyReportDate(reportDate.value);
  });
  backdrop.querySelector("#add-preview")?.addEventListener("click", () => {
    p.rows.push(
      p.kind === "account"
        ? {
            date: today(),
            description: "",
            amount_paise: null,
            balance_paise: null,
            category: "Uncategorized",
            kind: "expense",
          }
        : p.kind === "fd"
          ? {
              account_ref: "",
              start_date: "",
              principal_paise: null,
              rate_bps: null,
              maturity_date: "",
              maturity_amount_paise: null,
              report_date: reportDate?.value || "",
              source_ref: `manual-row-${p.rows.length + 1}`,
            }
          : {
              name: "",
              symbol: "",
              type: "mutual_fund",
              quantity: "",
              invested_paise: null,
              value_paise: null,
              as_of: "",
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
      const shouldImport =
        p.kind === "account" || p.kind === "fd" || (p.kind === "investment" && !p.target);
      const reviewedRows = shouldImport
        ? await prepareReviewedRows(p.kind, p.rows, String(state.me?.id || ""))
        : [];
      let closedIds: string[] = [];
      if ((p.kind === "fd" || (p.kind === "investment" && !p.target)) && reviewedRows.length) {
        const comparison = await post("imports/compare", { kind: p.kind, rows: reviewedRows });
        for (const item of comparison.missing as Item[]) {
          const identifier = item.symbol ? ` (${item.symbol})` : "";
          if (
            window.confirm(
              `${item.name}${identifier} is missing from this report.\n\nIs it no longer held? Select OK to remove it from current investments. Its history and reports will be kept.\n\nSelect Cancel if it is still held or the report is incomplete.`,
            )
          )
            closedIds.push(item.id);
        }
      }
      let statement: { closing_date: string; balance_paise: number } | undefined;
      if (p.kind === "account" && reviewedRows.length) {
        const closingDate =
          backdrop.querySelector<HTMLInputElement>("#statement-closing-date")!.value;
        const balance = backdrop.querySelector<HTMLInputElement>(
          "#statement-closing-balance",
        )!.value;
        if (!closingDate || !/^-?\d+(?:\.\d{1,2})?$/.test(balance))
          throw new Error(
            "Enter the statement end date and its ending balance before importing transactions.",
          );
        const balancePaise = paise(balance);
        if (
          !Number.isSafeInteger(balancePaise) ||
          reviewedRows.some((row) => row.date > closingDate)
        )
          throw new Error("Check the statement end date, ending balance and transaction dates.");
        statement = { closing_date: closingDate, balance_paise: balancePaise };
      }
      let uploaded: any = { id: p.documentId };
      if (!p.documentId) {
        const fileResponse = await fetch("/api/documents", {
          method: "POST",
          headers: {
            "content-type": /\.xlsx$/i.test(p.file.name)
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : p.file.type || "application/pdf",
            "x-document-type": p.kind,
            "x-file-name": p.file.name,
            ...(p.target ? { "x-target-id": p.target } : {}),
          },
          body: p.file,
        });
        uploaded = await fileResponse.json();
        if (!fileResponse.ok) throw new Error(uploaded.error || "Upload failed");
        p.documentId = uploaded.id;
      }
      if (p.kind === "account" && p.rows.length) {
        const result = await post(`imports/${uploaded.id}/commit`, {
          rows: reviewedRows,
          statement,
        });
        if (result.duplicates)
          window.alert(
            `${result.duplicates} transaction(s) matched existing records. Check the statement if any are separate transactions.`,
          );
      }
      if (p.kind === "investment" && !p.target && p.rows.length)
        await post(`imports/${uploaded.id}/commit`, { rows: reviewedRows, closed_ids: closedIds });
      if (p.kind === "fd" && p.rows.length)
        await post(`imports/${uploaded.id}/commit`, { rows: reviewedRows, closed_ids: closedIds });
      backdrop.remove();
      state.preview = undefined;
      await load();
    } catch (error) {
      alertError(error);
      button.disabled = false;
    }
  });
}
