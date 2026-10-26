import { app } from "../app/app-root";
import { state } from "../state/finance-state";
import { dateLabel, esc, today } from "../utils/formatters";

const nav = [
  "Overview",
  "Accounts",
  "Investments",
  "Payments",
  "Reports",
  "Documents",
  "Sharing",
  "Settings",
];
export function shell(content: string, navigate: (tab: string) => void) {
  const renderNavigationItem = (tab: string) => /* HTML */ `
    <button class="nav-item ${state.tab === tab ? "active" : ""}" data-tab="${tab}">
      <span class="nav-glyph">
        ${{ Overview: "◫", Accounts: "▤", Investments: "◈", Payments: "◷", Reports: "▥", Documents: "▧", Sharing: "♧", Settings: "⚙" }[tab]}
      </span>
      ${tab}
    </button>
  `;

  const initial = state.me?.name?.charAt(0)?.toUpperCase() || "F";
  app.innerHTML = /* HTML */ `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-mark">
            F
            <span>↗</span>
          </span>
          <div>
            <strong>Family Finance</strong>
            <small>PRIVATE WORKSPACE</small>
          </div>
        </div>
        <nav>${nav.map(renderNavigationItem).join("")}</nav>
        <div class="sidebar-bottom">
          <div class="privacy-note">
            <span>◉</span>
            <div>
              <strong>Private by default</strong>
              <small>Only you decide what to share.</small>
            </div>
          </div>
          <div class="profile">
            <span class="avatar">${esc(initial)}</span>
            <div>
              <strong>${esc(state.me?.name)}</strong>
              <small>${esc(state.me?.email)}</small>
            </div>
          </div>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="breadcrumb">
            Family Finance
            <span>/</span>
            <strong>${state.tab}</strong>
          </div>
          <div class="top-actions">
            <span class="date-chip">${dateLabel(today())}</span>
            <span class="avatar mobile-avatar">${esc(initial)}</span>
          </div>
        </header>
        <div class="content">${content}</div>
      </main>
    </div>
  `;
  app.querySelectorAll<HTMLElement>("[data-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      navigate(button.dataset.tab!);
    }),
  );
}
