import { esc } from "../utils/formatters";

export const sectionHeader = (
  eyebrow: string,
  title: string,
  desc: string,
  action = "",
) => /* HTML */ `
  <div class="page-head">
    <div>
      <div class="eyebrow">${eyebrow}</div>
      <h1>${title}</h1>
      <p>${desc}</p>
    </div>
    ${action}
  </div>
`;
export const empty = (icon: string, title: string, detail: string) => /* HTML */ `
  <div class="empty">
    <span>${icon}</span>
    <h3>${title}</h3>
    <p>${detail}</p>
  </div>
`;
export const pill = (text: string, tone = "neutral") => /* HTML */ `
  <span class="pill ${tone}">${esc(text)}</span>
`;
export const card = (
  label: string,
  value: string,
  foot: string,
  icon: string,
  tint = "",
) => /* HTML */ `
  <div class="metric ${tint}">
    <div class="metric-top">
      <span>${label}</span>
      <span class="metric-icon">${icon}</span>
    </div>
    <strong>${value}</strong>
    <small>${foot}</small>
  </div>
`;
