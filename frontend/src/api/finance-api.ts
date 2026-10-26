import type { Item } from "../types/finance-record";

export async function api(path: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: {
      ...(options.body && typeof options.body === "string"
        ? { "content-type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const data: any = await response.json().catch(() => ({}));
    throw new Error(data.error || `${response.status} ${response.statusText}`);
  }
  return response.json();
}

export const post = (path: string, data: Item) =>
  api(path, { method: "POST", body: JSON.stringify(data) });
