import type { Item } from "../types/finance-record";
import { state } from "./finance-state";

export const owned = (row: Item) => row.owner_id === state.me?.id;
export const canEditAccount = (id: string) => !!state.accounts.find((a) => a.id === id)?.can_edit;
export const nameOf = (id: string) =>
  state.members.find((x) => x.id === id)?.name || "Family member";
