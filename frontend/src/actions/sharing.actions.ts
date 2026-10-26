import { api } from "../api/finance-api";
import type { RefreshApplication } from "../types/finance-record";

export async function handleSharingAction(
  type: string,
  id: string | undefined,
  load: RefreshApplication,
) {
  if (type === "revoke") {
    if (confirm("Revoke this person's access?")) {
      await api(`shares/${id}`, { method: "DELETE" });
      await load();
    }
    return;
  }
}
