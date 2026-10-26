import type { RefreshApplication } from "../types/finance-record";
import { alertError } from "../utils/notify-error";

export function openModal(
  title: string,
  html: string,
  onSubmit: ((form: HTMLFormElement) => Promise<void>) | undefined,
  refresh: RefreshApplication,
) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = /* HTML */ `
    <div class="modal">
      <div class="modal-head">
        <h2>${title}</h2>
        <button class="icon-button" type="button" data-close>×</button>
      </div>
      <form class="stack-form" id="modal-form">
        ${html}
        <div class="modal-actions">
          <button class="secondary" type="button" data-close>Cancel</button>
          <button class="primary" type="submit">Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.append(backdrop);
  backdrop
    .querySelectorAll("[data-close]")
    .forEach((b) => b.addEventListener("click", () => backdrop.remove()));
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) backdrop.remove();
  });
  backdrop.querySelector("form")!.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!onSubmit) return;
    const submit = backdrop.querySelector<HTMLButtonElement>("button[type=submit]")!;
    submit.disabled = true;
    try {
      await onSubmit(event.currentTarget as HTMLFormElement);
      backdrop.remove();
      await refresh();
    } catch (error) {
      alertError(error);
    } finally {
      submit.disabled = false;
    }
  });
  return backdrop;
}
