import type { RecordRow } from "../types/records";

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
export const fail = (status: number, error: string) => json({ error }, status);
export const body = async (request: Request) => {
  const value: unknown = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a JSON object");
  return value as RecordRow;
};
