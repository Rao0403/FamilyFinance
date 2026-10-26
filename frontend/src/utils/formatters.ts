export const money = (paise: number | null | undefined) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format((paise || 0) / 100);
export const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export const paise = (value: string) => Math.round(Number(value || 0) * 100);
export const dateLabel = (d: string | undefined) =>
  d
    ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      })
    : "—";
