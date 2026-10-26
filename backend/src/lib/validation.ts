export const asText = (v: unknown, max = 300) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
export const asMoney = (v: unknown) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error("Amount must be an integer number of paise");
  return n;
};
export const asDate = (v: unknown) => {
  const s = asText(v, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ||
    new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s
  )
    throw new Error("Invalid date");
  return s;
};
