import { api, post } from "../api/finance-api";
import { field, value } from "../components/form-fields";
import { openModal } from "../components/modal";
import type { RefreshApplication } from "../types/finance-record";

export async function handleMemberAction(
  type: string,
  id: string | undefined,
  load: RefreshApplication,
) {
  const modal = (
    title: string,
    html: string,
    onSubmit?: (form: HTMLFormElement) => Promise<void>,
  ) => openModal(title, html, onSubmit, load);
  if (type === "deactivate" && id) {
    if (
      confirm(
        "Deactivate this member’s login? Their private records will be kept, and they can be reactivated later.",
      )
    ) {
      await api(`members/${id}`, { method: "PATCH", body: JSON.stringify({ active: false }) });
      await load();
    }
    return;
  }
  if (type === "invite")
    return modal(
      "Invite family member",
      [field("Name", "name"), field("Email", "email", "email")].join(""),
      async (f) => {
        await post("members", { name: value(f, "name"), email: value(f, "email") });
      },
    );
}
