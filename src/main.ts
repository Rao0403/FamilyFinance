import * as pdfjs from "pdfjs-dist";
import "./style.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

type Item = Record<string, any>;
const app = document.querySelector<HTMLDivElement>("#app")!;
const money = (paise: number | null | undefined) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format((paise || 0) / 100);
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const paise = (value: string) => Math.round(Number(value || 0) * 100);
const state: { me?: Item; members: Item[]; accounts: Item[]; investments: Item[]; payments: Item[]; documents: Item[]; transactions: Item[]; shares: Item[]; reports?: Item; dashboard?: Item; tab: string; preview?: { file: File; target: string; kind: string; rows: Item[]; raw: string; documentId?: string } } = { members: [], accounts: [], investments: [], payments: [], documents: [], transactions: [], shares: [], tab: "Overview" };

async function api(path: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`/api/${path}`, { ...options, headers: { ...(options.body && typeof options.body === "string" ? { "content-type": "application/json" } : {}), ...options.headers } });
  if (!response.ok) { const data: any = await response.json().catch(() => ({})); throw new Error(data.error || `${response.status} ${response.statusText}`); }
  return response.json();
}
const post = (path: string, data: Item) => api(path, { method: "POST", body: JSON.stringify(data) });
const alertError = (error: unknown) => { window.alert(error instanceof Error ? error.message : String(error)); };
const owned = (row: Item) => row.owner_id === state.me?.id;
const canEditAccount = (id: string) => !!state.accounts.find(a => a.id === id)?.can_edit;
const nameOf = (id: string) => state.members.find(x => x.id === id)?.name || "Family member";
const dateLabel = (d: string | undefined) => d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";

async function load() {
  try {
    state.me = await api("me");
    const [members, accounts, investments, payments, documents, transactions, shares, dashboard, reports] = await Promise.all(["members", "accounts", "investments", "payments", "documents", "transactions", "shares", "dashboard", "reports"].map(path => api(path)));
    Object.assign(state, { members, accounts, investments, payments, documents, transactions, shares, dashboard, reports });
    render();
  } catch (error) {
    app.innerHTML = `<main class="locked"><div class="lock-icon">◆</div><h1>Family Finance</h1><p>${esc(error instanceof Error ? error.message : error)}</p><p class="muted">This private app needs a valid family login. For local development, configure the worker's DEV_EMAIL in .dev.vars.</p></main>`;
  }
}

const nav = ["Overview", "Accounts", "Investments", "Payments", "Reports", "Documents", "Sharing", "Settings"];
function shell(content: string) {
  const initial = state.me?.name?.charAt(0)?.toUpperCase() || "F";
  app.innerHTML = `<div class="layout"><aside class="sidebar"><div class="brand"><span class="brand-mark">F<span>↗</span></span><div><strong>Family Finance</strong><small>PRIVATE WORKSPACE</small></div></div><nav>${nav.map(tab => `<button class="nav-item ${state.tab === tab ? "active" : ""}" data-tab="${tab}"><span class="nav-glyph">${{ Overview: "◫", Accounts: "▤", Investments: "◈", Payments: "◷", Reports: "▥", Documents: "▧", Sharing: "♧", Settings: "⚙" }[tab]}</span>${tab}</button>`).join("")}</nav><div class="sidebar-bottom"><div class="privacy-note"><span>◉</span><div><strong>Private by default</strong><small>Only you decide what to share.</small></div></div><div class="profile"><span class="avatar">${esc(initial)}</span><div><strong>${esc(state.me?.name)}</strong><small>${esc(state.me?.email)}</small></div></div></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">Family Finance <span>/</span> <strong>${state.tab}</strong></div><div class="top-actions"><span class="date-chip">${dateLabel(today())}</span><span class="avatar mobile-avatar">${esc(initial)}</span></div></header><div class="content">${content}</div></main></div>`;
  app.querySelectorAll<HTMLElement>("[data-tab]").forEach(button => button.addEventListener("click", () => { state.tab = button.dataset.tab!; render(); }));
  bind();
}
const sectionHeader = (eyebrow: string, title: string, desc: string, action = "") => `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${desc}</p></div>${action}</div>`;
const empty = (icon: string, title: string, detail: string) => `<div class="empty"><span>${icon}</span><h3>${title}</h3><p>${detail}</p></div>`;
const pill = (text: string, tone = "neutral") => `<span class="pill ${tone}">${esc(text)}</span>`;
const card = (label: string, value: string, foot: string, icon: string, tint = "") => `<div class="metric ${tint}"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon}</span></div><strong>${value}</strong><small>${foot}</small></div>`;

function overview() {
  const d = state.dashboard || {};
  const total = (d.bank_paise || 0) + (d.investment_paise || 0);
  const upcoming = state.payments.filter(p => p.active && p.next_due_date >= today()).sort((a, b) => a.next_due_date.localeCompare(b.next_due_date)).slice(0, 4);
  const recent = state.transactions.slice(0, 5);
  return `${sectionHeader("YOUR FINANCIAL PICTURE", "Good to see you, " + esc(state.me?.name?.split(" ")[0] || "there") + ".", "Your personal records and anything family members have shared with you.", `<button class="primary" data-action="upload">＋ Import document</button>`)}<div class="notice"><span>◉</span><div><strong>Visible to you</strong><p>Totals include only records you own or can view. Values reflect the most recent uploaded documents.</p></div></div><div class="metrics">${card("Visible net worth", money(total), "Bank balances + investment values", "↗", "hero")}${card("Bank balances", money(d.bank_paise), `${state.accounts.length} visible account${state.accounts.length === 1 ? "" : "s"}`, "▤")}${card("Investments", money(d.investment_paise), `${state.investments.length} visible holding${state.investments.length === 1 ? "" : "s"}`, "◈")}${card("Spent this month", money(d.spending_paise), d.month || "Current month", "↘")}</div><div class="two-col"><section class="panel"><div class="panel-head"><div><h2>Upcoming payments</h2><p>Stay ahead of what’s due</p></div><button class="text-button" data-tab="Payments">View all →</button></div>${upcoming.length ? upcoming.map(p => `<div class="list-row"><span class="round-icon">◷</span><div class="grow"><strong>${esc(p.title)}</strong><small>${dateLabel(p.next_due_date)} · ${esc(nameOf(p.owner_id))}</small></div><strong>${money(p.amount_paise)}</strong></div>`).join("") : empty("◷", "No upcoming payments", "Add a bill or recurring payment to see it here.")}</section><section class="panel"><div class="panel-head"><div><h2>Recent activity</h2><p>Latest visible transactions</p></div><button class="text-button" data-tab="Accounts">View all →</button></div>${recent.length ? recent.map(t => `<div class="list-row"><span class="round-icon ${t.amount_paise < 0 ? "out" : "in"}">${t.amount_paise < 0 ? "↗" : "↙"}</span><div class="grow"><strong>${esc(t.description)}</strong><small>${dateLabel(t.date)} · ${esc(t.category)}</small></div><strong class="${t.amount_paise < 0 ? "negative" : "positive"}">${t.amount_paise < 0 ? "−" : "+"}${money(Math.abs(t.amount_paise))}</strong></div>`).join("") : empty("↔", "No transactions yet", "Import an Indian Bank PDF or add a transaction.")}</section></div>`;
}

function accounts() {
  const rows = state.transactions;
  return `${sectionHeader("CASH FLOW", "Accounts & transactions", "Track balances and understand where money goes.", `<div class="head-actions"><button class="secondary" data-action="transaction">＋ Transaction</button><button class="primary" data-action="account">＋ Add account</button></div>`)}<div class="account-grid">${state.accounts.map(a => `<div class="account-card"><div class="account-top"><span class="round-icon">▤</span>${pill(owned(a) ? "Yours" : `Shared by ${nameOf(a.owner_id)}`)}</div><h3>${esc(a.name)}</h3><small>${esc(a.institution)} ${esc(a.masked_number || "")}</small><strong>${money(a.balance_paise)}</strong><div class="account-bottom"><span>As of ${dateLabel(a.balance_as_of)}</span>${owned(a) ? `<button class="text-button" data-action="import-account" data-id="${esc(a.id)}">Import statement →</button>` : ""}</div></div>`).join("") || empty("▤", "No accounts yet", "Add an Indian Bank account to start tracking its statements.")}</div><section class="panel table-panel"><div class="panel-head"><div><h2>Transactions</h2><p>${rows.length} visible entries</p></div></div>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th class="right">Amount</th></tr></thead><tbody>${rows.map(t => `<tr><td>${dateLabel(t.date)}</td><td><strong>${esc(t.description)}</strong></td><td>${pill(t.category)}</td><td>${esc(state.accounts.find(a => a.id === t.account_id)?.name || "Account")}</td><td class="right ${t.amount_paise < 0 ? "negative" : "positive"}">${t.amount_paise < 0 ? "−" : "+"}${money(Math.abs(t.amount_paise))}</td></tr>`).join("")}</tbody></table></div>` : empty("↔", "No transactions", "Import a statement or add a transaction manually.")}</section>`;
}

function investments() {
  const list = state.investments;
  return `${sectionHeader("YOUR PORTFOLIO", "Investments", "Stocks, mutual funds and fixed deposits in one place.", `<div class="head-actions"><button class="secondary" data-action="upload">↑ Upload report</button><button class="primary" data-action="investment">＋ Add investment</button></div>`)}<div class="summary-bar"><div><small>Total current value</small><strong>${money(list.reduce((n, x) => n + Number(x.latest?.value_paise ?? x.principal_paise ?? 0), 0))}</strong></div><div><small>Invested amount</small><strong>${money(list.reduce((n, x) => n + Number(x.latest?.invested_paise ?? x.principal_paise ?? 0), 0))}</strong></div><div><small>Holdings</small><strong>${list.length}</strong></div></div><section class="panel table-panel"><div class="panel-head"><div><h2>All holdings</h2><p>Values come from your latest report or entry</p></div></div>${list.length ? `<div class="table-wrap"><table><thead><tr><th>Holding</th><th>Type</th><th>Owner</th><th>As of</th><th class="right">Invested</th><th class="right">Value</th><th></th></tr></thead><tbody>${list.map(i => `<tr><td><strong>${esc(i.name)}</strong><small class="table-sub">${esc(i.symbol || i.institution || "")}</small></td><td>${pill(i.type === "mutual_fund" ? "Mutual fund" : i.type === "fd" ? "Fixed deposit" : "Stock")}</td><td>${esc(nameOf(i.owner_id))}</td><td>${dateLabel(i.latest?.as_of || i.start_date)}</td><td class="right">${money(i.latest?.invested_paise ?? i.principal_paise)}</td><td class="right"><strong>${money(i.latest?.value_paise ?? i.principal_paise)}</strong></td><td>${i.can_edit && i.type !== "fd" ? `<button class="text-button" data-action="snapshot" data-id="${esc(i.id)}">Update</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : empty("◈", "No investments yet", "Add a holding or upload a Groww report when available.")}</section>`;
}

function payments() {
  const list = [...state.payments].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));
  return `${sectionHeader("BILLS & DUES", "Upcoming payments", "Know what is due and choose how to be reminded.", `<button class="primary" data-action="payment">＋ Add payment</button>`)}<div class="notice subtle"><span>✉</span><div><strong>Reminder delivery</strong><p>Email and SMS sending requires provider credentials and sender setup. Payment tracking works independently.</p></div></div><section class="panel"><div class="panel-head"><div><h2>Payment schedule</h2><p>All visible payments</p></div></div>${list.length ? list.map(p => `<div class="payment-row"><div class="date-box"><strong>${esc(p.next_due_date.slice(8))}</strong><small>${new Date(`${p.next_due_date}T12:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "Asia/Kolkata" })}</small></div><div class="grow"><strong>${esc(p.title)}</strong><small>${esc(p.frequency)} · ${esc(nameOf(p.owner_id))} · ${p.email_enabled ? "Email" : ""}${p.email_enabled && p.sms_enabled ? " + " : ""}${p.sms_enabled ? "SMS" : ""}</small></div><div class="payment-end"><strong>${money(p.amount_paise)}</strong>${p.can_edit && p.active ? `<button class="text-button" data-action="paid" data-id="${esc(p.id)}">Mark paid</button>` : ""}</div></div>`).join("") : empty("◷", "No payments scheduled", "Add a payment to plan ahead.")}</section>`;
}

function reports() {
  const months: Item[] = state.reports?.monthly || [];
  const categories: Item[] = state.reports?.categories || [];
  const max = Math.max(1, ...months.map(m => Math.max(m.spending_paise, m.income_paise)));
  return `${sectionHeader("YOUR TRENDS", "Reports", "Income and spending from the transactions you can see.", `<a class="secondary" href="/api/export" download>↓ Export my data</a>`)}<div class="two-col"><section class="panel"><div class="panel-head"><div><h2>Monthly cash flow</h2><p>Only months with recorded transactions are shown</p></div></div>${months.length ? `<div class="chart">${months.slice(-12).map(m => `<div class="chart-group"><div class="bars"><div class="bar income" style="height:${Math.max(3, Math.round(m.income_paise / max * 130))}px" title="Income ${money(m.income_paise)}"></div><div class="bar spending" style="height:${Math.max(3, Math.round(m.spending_paise / max * 130))}px" title="Spending ${money(m.spending_paise)}"></div></div><span>${esc(m.month.slice(5))}/${esc(m.month.slice(2, 4))}</span></div>`).join("")}</div><div class="legend"><span><i class="income"></i> Income</span><span><i class="spending"></i> Spending</span></div>` : empty("▥", "No trends yet", "Import transactions to see monthly income and spending.")}</section><section class="panel"><div class="panel-head"><div><h2>Spending by category</h2><p>Visible transactions across recorded months</p></div></div>${categories.length ? categories.slice(0, 10).map(c => `<div class="list-row"><span class="round-icon">↗</span><div class="grow"><strong>${esc(c.category)}</strong></div><strong>${money(c.amount_paise)}</strong></div>`).join("") : empty("▥", "No spending categories", "Categorize expenses to see the breakdown.")}</section></div><p class="report-note">Net worth history needs multiple dated balance and investment snapshots. Missing periods are never shown as zero.</p>`;
}

function documentsView() {
  return `${sectionHeader("SOURCE FILES", "Documents", "Your original uploads stay available alongside extracted records.", `<button class="primary" data-action="upload">↑ Upload document</button>`)}<section class="panel"><div class="panel-head"><div><h2>Uploaded files</h2><p>Private unless you share their account or investment</p></div></div>${state.documents.length ? state.documents.map(d => `<div class="list-row"><span class="round-icon">▧</span><div class="grow"><strong>${esc(d.name)}</strong><small>${dateLabel(d.created_at?.slice(0, 10))} · ${esc(nameOf(d.owner_id))} · ${Math.round(d.size_bytes / 1024)} KB</small></div>${pill(d.status)}${owned(d) && d.status === "imported" ? `<button class="text-button danger" data-action="rollback" data-id="${esc(d.id)}">Undo import</button>` : ""}${owned(d) && d.status === "uploaded" && ["account", "investment"].includes(d.type) ? `<button class="text-button" data-action="reprocess" data-id="${esc(d.id)}">Review import</button>` : ""}<a class="text-button" href="/api/documents/${encodeURIComponent(d.id)}">Download ↗</a></div>`).join("") : empty("▧", "No documents uploaded", "Upload a bank statement, FD receipt or Groww report.")}</section>`;
}

function sharing() {
  const resources: Item[] = [...state.accounts.map(x => ({ ...x, resource_type: "account" })), ...state.investments.map(x => ({ ...x, resource_type: "investment" })), ...state.payments.map(x => ({ ...x, resource_type: "payment", name: x.title }))].filter(owned);
  return `${sectionHeader("ACCESS CONTROL", "Family sharing", "Your records are private until you choose who may see them.", state.me?.role === "admin" ? `<button class="primary" data-action="invite">＋ Invite member</button>` : "")}<div class="two-col"><section class="panel"><div class="panel-head"><div><h2>Share a record</h2><p>Account sharing includes transactions and statements</p></div></div>${resources.length && state.members.length > 1 ? `<form id="share-form" class="stack-form"><label>Record<select name="resource" required>${resources.map(r => `<option value="${esc(r.resource_type)}:${esc(r.id)}">${esc(r.name)} (${r.resource_type})</option>`).join("")}</select></label><label>Family member<select name="recipient_id" required>${state.members.filter(m => m.id !== state.me?.id).map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("")}</select></label><label>Permission<select name="permission"><option value="view">Can view</option><option value="edit">Can edit</option></select></label><button class="primary" type="submit">Grant access</button></form>` : empty("♧", "Nothing to share yet", "Add a record or invite another member.")}</section><section class="panel"><div class="panel-head"><div><h2>Access you've granted</h2><p>You can revoke access at any time</p></div></div>${state.shares.length ? state.shares.map(s => `<div class="list-row"><span class="round-icon">♧</span><div class="grow"><strong>${esc(nameOf(s.recipient_id))}</strong><small>${esc(s.resource_type)} · ${esc(s.permission)}</small></div><button class="text-button danger" data-action="revoke" data-id="${esc(s.id)}">Revoke</button></div>`).join("") : empty("♧", "No access granted", "Your financial records are visible only to you.")}</section></div>`;
}

function settings() {
  return `${sectionHeader("YOUR PREFERENCES", "Settings", "Update the details used for your reminders.")}<div class="two-col"><section class="panel"><div class="panel-head"><div><h2>Your profile</h2><p>Your phone number is private to your account</p></div></div><form id="profile-form" class="stack-form">${field("Display name", "name", "text", true, `value="${esc(state.me?.name)}"`)}${field("Mobile number with 91 prefix", "phone", "tel", false, `value="${esc(state.me?.phone || "")}" placeholder="919876543210"`)}<label>Email<input value="${esc(state.me?.email)}" disabled></label><button class="primary" type="submit">Save profile</button></form></section><section class="panel"><div class="panel-head"><div><h2>Privacy</h2><p>Access is always your decision</p></div></div><div class="settings-copy"><p>Your records are private unless you share them. An administrator can invite members and manage app settings but cannot see your finances without your permission.</p><p>Sharing a bank account includes its transactions and linked statements. You can revoke sharing on the Sharing page.</p><p><a class="text-button" href="/api/export" download>Download my data →</a></p></div></section></div>`;
}

function render() {
  const content = ({ Overview: overview, Accounts: accounts, Investments: investments, Payments: payments, Reports: reports, Documents: documentsView, Sharing: sharing, Settings: settings } as Record<string, () => string>)[state.tab]?.() || overview();
  const history: Item[] = state.reports?.history || [];
  const historyPanel = state.tab === "Reports" ? `<section class="panel"><div class="panel-head"><div><h2>Recorded net worth checkpoints</h2><p>Shown only when every visible account and investment has a dated baseline</p></div></div>${history.length ? history.map(point => `<div class="list-row"><span class="round-icon">◈</span><div class="grow"><strong>${esc(point.month)}</strong><small>${point.stale ? "At least one value was over 45 days old" : "Based on dated records"}</small></div><strong>${money(point.net_worth_paise)}</strong></div>`).join("") : empty("◈", "No complete checkpoints yet", "Add dated account balances and investment values to build history.")}</section>` : "";
  shell(content + historyPanel);
  if (state.tab === "Payments") {
    const ordered = [...state.payments].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));
    app.querySelectorAll<HTMLElement>(".payment-row").forEach((row, index) => {
      const payment = ordered[index], detail = document.createElement("small");
      detail.textContent = payment.active ? (payment.next_due_date < today() ? "Overdue" : "Scheduled") : "Completed";
      if (payment.last_paid) detail.textContent += ` · Last paid ${dateLabel(payment.last_paid.due_date)}${payment.last_paid.transaction_id ? " · transaction linked" : ""}`;
      row.querySelector(".grow")?.append(detail);
    });
  }
}

function modal(title: string, html: string, onSubmit?: (form: HTMLFormElement) => Promise<void>) {
  const backdrop = document.createElement("div"); backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal"><div class="modal-head"><h2>${title}</h2><button class="icon-button" type="button" data-close>×</button></div><form class="stack-form" id="modal-form">${html}<div class="modal-actions"><button class="secondary" type="button" data-close>Cancel</button><button class="primary" type="submit">Save</button></div></form></div>`;
  document.body.append(backdrop);
  backdrop.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => backdrop.remove()));
  backdrop.addEventListener("click", event => { if (event.target === backdrop) backdrop.remove(); });
  backdrop.querySelector("form")!.addEventListener("submit", async event => { event.preventDefault(); if (!onSubmit) return; const submit = backdrop.querySelector<HTMLButtonElement>("button[type=submit]")!; submit.disabled = true; try { await onSubmit(event.currentTarget as HTMLFormElement); backdrop.remove(); await load(); } catch (error) { alertError(error); } finally { submit.disabled = false; } });
  return backdrop;
}
const value = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) || "");
const field = (label: string, name: string, type = "text", required = true, extra = "") => `<label>${label}<input name="${name}" type="${type}" ${required ? "required" : ""} ${extra}></label>`;

function bind() {
  app.querySelectorAll<HTMLElement>("[data-action]").forEach(element => element.addEventListener("click", () => action(element.dataset.action!, element.dataset.id).catch(alertError)));
  if (state.tab === "Accounts") app.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row, index) => {
    const tx = state.transactions[index];
    if (!tx || !canEditAccount(tx.account_id)) return;
    const button = document.createElement("button"); button.className = "text-button"; button.textContent = "Edit";
    button.addEventListener("click", () => action("transaction-edit", tx.id).catch(alertError));
    row.cells[1]?.appendChild(button);
  });
  const shareForm = app.querySelector<HTMLFormElement>("#share-form");
  shareForm?.addEventListener("submit", async event => { event.preventDefault(); try { const [resource_type, resource_id] = value(shareForm, "resource").split(":"); await post("shares", { resource_type, resource_id, recipient_id: value(shareForm, "recipient_id"), permission: value(shareForm, "permission") }); await load(); } catch (error) { alertError(error); } });
  const profileForm = app.querySelector<HTMLFormElement>("#profile-form");
  profileForm?.addEventListener("submit", async event => { event.preventDefault(); try { await api("me", { method: "PATCH", body: JSON.stringify({ name: value(profileForm, "name"), phone: value(profileForm, "phone") }) }); await load(); } catch (error) { alertError(error); } });
}

async function action(type: string, id?: string) {
  if (type === "account") return modal("Add bank account", `${field("Account name", "name", "text", true, 'placeholder="e.g. Savings account"')}${field("Masked account number", "masked_number", "text", false, 'placeholder="e.g. •••• 1234"')}${field("Opening balance (₹)", "opening_balance", "number", true, 'step="0.01" value="0"')}${field("Balance date", "opening_date", "date", false)}`, async f => { await post("accounts", { name: value(f, "name"), masked_number: value(f, "masked_number"), opening_balance_paise: paise(value(f, "opening_balance")), opening_date: value(f, "opening_date") || null }); });
  if (type === "transaction") {
    const mine = state.accounts.filter(owned);
    if (!mine.length) return window.alert("Add your account first.");
    return modal("Add transaction", `<label>Account<select name="account_id">${mine.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("")}</select></label>${field("Date", "date", "date", true, `value="${today()}"`)}${field("Description", "description")}${field("Amount (₹, negative for spending)", "amount", "number", true, 'step="0.01"')}${field("Category", "category", "text", true, 'placeholder="e.g. Groceries"')}<label>Type<select name="kind"><option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option><option value="investment">Investment contribution</option><option value="refund">Refund</option></select></label>`, async f => { await post("transactions", { account_id: value(f, "account_id"), date: value(f, "date"), description: value(f, "description"), amount_paise: paise(value(f, "amount")), category: value(f, "category"), kind: value(f, "kind") }); });
  }
  if (type === "transaction-edit" && id) {
    const tx = state.transactions.find(t => t.id === id);
    if (!tx) throw new Error("Transaction not found");
    return modal("Edit transaction", `${field("Date", "date", "date", true, `value="${esc(tx.date)}"`)}${field("Description", "description", "text", true, `value="${esc(tx.description)}"`)}${field("Amount (₹)", "amount", "number", true, `step="0.01" value="${(tx.amount_paise / 100).toFixed(2)}"`)}${field("Category", "category", "text", true, `value="${esc(tx.category)}"`)}<label>Type<select name="kind">${["expense", "income", "transfer", "investment", "refund", "fee"].map(k => `<option value="${k}" ${k === tx.kind ? "selected" : ""}>${k}</option>`).join("")}</select></label>`, async f => { await api(`transactions/${id}`, { method: "PATCH", body: JSON.stringify({ date: value(f, "date"), description: value(f, "description"), amount_paise: paise(value(f, "amount")), category: value(f, "category"), kind: value(f, "kind") }) }); });
  }
  if (type === "investment") return modal("Add investment", `<label>Type<select name="type"><option value="stock">Stock</option><option value="mutual_fund">Mutual fund</option><option value="fd">Fixed deposit</option></select></label>${field("Name", "name")}${field("Symbol or folio", "symbol", "text", false)}${field("Institution", "institution", "text", false)}${field("FD principal / starting amount (₹)", "principal", "number", false, 'step="0.01"')}${field("FD interest rate (%)", "rate", "number", false, 'step="0.01"')}${field("FD start date", "start_date", "date", false)}${field("FD maturity date", "maturity_date", "date", false)}${field("FD maturity amount (₹)", "maturity", "number", false, 'step="0.01"')}`, async f => { await post("investments", { type: value(f, "type"), name: value(f, "name"), symbol: value(f, "symbol"), institution: value(f, "institution"), principal_paise: value(f, "principal") ? paise(value(f, "principal")) : null, rate_bps: value(f, "rate") ? Math.round(Number(value(f, "rate")) * 100) : null, start_date: value(f, "start_date") || null, maturity_date: value(f, "maturity_date") || null, maturity_amount_paise: value(f, "maturity") ? paise(value(f, "maturity")) : null }); });
  if (type === "snapshot") return modal("Update investment value", `${field("Value date", "as_of", "date", true, `value="${today()}"`)}${field("Quantity / units", "quantity", "text", false)}${field("Amount invested (₹)", "invested", "number", true, 'step="0.01"')}${field("Current value (₹)", "current", "number", true, 'step="0.01"')}`, async f => { await post(`investments/${id}/snapshots`, { as_of: value(f, "as_of"), quantity: value(f, "quantity"), invested_paise: paise(value(f, "invested")), value_paise: paise(value(f, "current")) }); });
  if (type === "payment") return modal("Add payment", `${field("Payment name", "title")}${field("Amount (₹)", "amount", "number", true, 'step="0.01"')}${field("Next due date", "next_due_date", "date")}<label>Repeats<select name="frequency"><option value="once">Once</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></label>${field("Remind me days before", "remind_days", "number", true, 'min="0" max="30" value="3"')}<div class="checkboxes"><label><input name="email_enabled" type="checkbox" checked> Email</label><label><input name="sms_enabled" type="checkbox"> SMS</label></div>`, async f => { const fd = new FormData(f); await post("payments", { title: value(f, "title"), amount_paise: paise(value(f, "amount")), next_due_date: value(f, "next_due_date"), frequency: value(f, "frequency"), remind_days: Number(value(f, "remind_days")), email_enabled: fd.has("email_enabled"), sms_enabled: fd.has("sms_enabled") }); });
  if (type === "paid" && id) {
    const payment = state.payments.find(p => p.id === id);
    if (!payment) throw new Error("Payment not found");
    const matches = state.transactions.filter(t => t.owner_id === payment.owner_id && t.amount_paise === -payment.amount_paise);
    return modal("Confirm payment", `<p>Confirm that ${esc(payment.title)} was paid. You can link a matching transaction for reference.</p><label>Matching transaction<select name="transaction_id"><option value="">No linked transaction</option>${matches.map(t => `<option value="${esc(t.id)}">${dateLabel(t.date)} · ${esc(t.description)} · ${money(Math.abs(t.amount_paise))}</option>`).join("")}</select></label>`, async f => { await post(`payments/${id}/paid`, { transaction_id: value(f, "transaction_id") || null }); });
  }
  if (type === "revoke") { if (confirm("Revoke this person's access?")) { await api(`shares/${id}`, { method: "DELETE" }); await load(); } return; }
  if (type === "rollback") { if (confirm("Undo all records imported from this document? The original file will remain available.")) { await post(`imports/${id}/rollback`, {}); await load(); } return; }
  if (type === "reprocess" && id) {
    const metadata = await api(`imports/${id}`), doc = state.documents.find(d => d.id === id);
    const response = await fetch(`/api/documents/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error("Could not read the stored document");
    const file = new File([await response.blob()], doc?.name || "document", { type: doc?.mime_type || "application/pdf" });
    const password = file.type === "application/pdf" ? window.prompt("PDF password, if required (leave blank if none)") || "" : "";
    const raw = await extractText(file, password);
    state.preview = { file, target: metadata.target_id || "", kind: metadata.type, raw, rows: metadata.type === "account" ? suggestRows(raw) : suggestInvestmentRows(raw), documentId: id };
    showPreview(); return;
  }
  if (type === "invite") return modal("Invite family member", `${field("Name", "name")}${field("Email", "email", "email")}`, async f => { await post("members", { name: value(f, "name"), email: value(f, "email") }); });
  if (type === "upload" || type === "import-account") return upload(id);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  row.push(cell); if (row.some(Boolean)) rows.push(row);
  return rows;
}

async function extractText(file: File, password?: string): Promise<string> {
  if (/pdf/i.test(file.type) || file.name.toLowerCase().endsWith(".pdf")) {
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password: password || undefined }).promise;
    const pages: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const content = await (await pdf.getPage(p)).getTextContent();
      const lines = new Map<number, string[]>();
      for (const item of content.items) {
        if (!("str" in item) || !("transform" in item)) continue;
        const y = Math.round(item.transform[5] / 3) * 3;
        lines.set(y, [...(lines.get(y) || []), item.str]);
      }
      pages.push([...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, parts]) => parts.join(" ")).join("\n"));
    }
    return pages.join("\n");
  }
  if (file.type.startsWith("image/")) return "";
  return file.text();
}

function suggestRows(raw: string): Item[] {
  const lines = raw.split(/\r?\n/);
  const result: Item[] = [];
  for (const line of lines) {
    const match = line.match(/\b(\d{2})[\/-](\d{2})[\/-](\d{4})\b/);
    if (!match) continue;
    const date = `${match[3]}-${match[2]}-${match[1]}`;
    const numbers = [...line.matchAll(/(?:^|\s)(?:₹\s*)?([\d,]+\.\d{2})(?=\s|$)/g)].map(m => Number(m[1].replace(/,/g, "")));
    if (!numbers.length) continue;
    const description = line.slice(match.index! + match[0].length).replace(/(?:₹\s*)?[\d,]+\.\d{2}/g, "").trim();
    result.push({ date, description, amount_paise: -Math.round(numbers[0] * 100), balance_paise: numbers.length > 1 ? Math.round(numbers.at(-1)! * 100) : null, category: "Uncategorized", kind: "expense" });
  }
  return result;
}

function suggestInvestmentRows(raw: string): Item[] {
  const table = parseCsv(raw);
  if (table.length < 2) return [];
  const headings = table[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const find = (...names: string[]) => headings.findIndex(h => names.some(name => h.includes(name)));
  const nameCol = find("schemename", "instrumentname", "stockname", "securityname", "fundname");
  const investedCol = find("investedamount", "investedvalue", "totalinvestment", "costvalue", "buyvalue");
  const valueCol = find("currentvalue", "marketvalue", "presentvalue");
  const qtyCol = find("units", "quantity");
  const symbolCol = find("isin", "symbol", "ticker");
  if (nameCol < 0 || investedCol < 0 || valueCol < 0) return [];
  return table.slice(1).filter(row => row[nameCol]?.trim()).map((row, i) => ({ name: row[nameCol].trim(), symbol: symbolCol >= 0 ? row[symbolCol]?.trim() : "", type: /fund|scheme/i.test(row[nameCol]) ? "mutual_fund" : "stock", quantity: qtyCol >= 0 ? row[qtyCol] : "", invested_paise: paise((row[investedCol] || "0").replace(/[^\d.-]/g, "")), value_paise: paise((row[valueCol] || "0").replace(/[^\d.-]/g, "")), as_of: today(), source_ref: `csv-row-${i + 2}` }));
}

function upload(prefillId?: string) {
  const mine = state.accounts.filter(owned);
  const holdings = state.investments.filter(owned);
  const backdrop = modal("Import a document", `<label>Document type<select name="kind"><option value="account">Indian Bank statement</option><option value="investment">Groww report or FD receipt</option><option value="other">Other document</option></select></label><label>Bank account (for statements)<select name="account_target"><option value="">Select an account</option>${mine.map(a => `<option value="${esc(a.id)}" ${a.id === prefillId ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label><label>Investment (optional, for FD receipts)<select name="investment_target"><option value="">Portfolio report / no single investment</option>${holdings.map(i => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join("")}</select></label><label>File<input type="file" name="file" accept=".pdf,.csv,.txt,.png,.jpg,.jpeg" required></label>${field("PDF password (if needed)", "pdf_password", "password", false)}<p class="muted">The PDF password is used only in your browser for this import and is not saved. Review suggested rows before importing.</p>`, async f => {
    const file = (f.querySelector<HTMLInputElement>('input[name="file"]')!.files || [])[0];
    if (!file) throw new Error("Select a file");
    const kind = value(f, "kind"), target = kind === "account" ? value(f, "account_target") : value(f, "investment_target");
    if (kind === "account" && !target) throw new Error("Add your bank account first");
    const raw = await extractText(file, value(f, "pdf_password"));
    state.preview = { file, target, kind, raw, rows: kind === "account" ? suggestRows(raw) : kind === "investment" ? suggestInvestmentRows(raw) : [] };
    state.tab = "Documents";
    setTimeout(showPreview, 50);
  });
  return backdrop;
}

function showPreview() {
  const p = state.preview; if (!p) return;
  const backdrop = document.createElement("div"); backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal wide"><div class="modal-head"><div><h2>Review ${esc(p.file.name)}</h2><p class="muted">Nothing affects your totals until you confirm.</p></div><button class="icon-button" data-close>×</button></div>${p.kind === "account" ? `<p class="notice small">Suggestions are approximate until we have an Indian Bank sample. Check debit/credit signs and balances carefully.</p><div class="review-table"><table><thead><tr><th>Date</th><th>Description</th><th>Amount ₹</th><th>Balance ₹</th><th></th></tr></thead><tbody id="preview-body"></tbody></table></div><button class="secondary" id="add-preview" type="button">＋ Add row</button>` : p.kind === "investment" && !p.target ? `<p class="notice small">Check every holding, type, invested amount and value. Unknown CSV columns can be entered manually.</p><div class="review-table"><table><thead><tr><th>Name</th><th>Type</th><th>Invested ₹</th><th>Value ₹</th><th>As of</th><th></th></tr></thead><tbody id="preview-body"></tbody></table></div><button class="secondary" id="add-preview" type="button">＋ Add holding</button>` : `<p class="notice small">This file will be stored privately and linked to the selected investment if supplied. Enter or update FD figures from Investments.</p><textarea readonly rows="12" class="raw-preview">${esc(p.raw.slice(0, 4000))}</textarea>`}<div class="modal-actions"><button class="secondary" data-close>Cancel</button><button class="primary" id="confirm-import">${p.kind === "account" || (p.kind === "investment" && !p.target && p.rows.length) ? "Confirm import" : "Save document"}</button></div></div>`;
  document.body.append(backdrop);
  const tableBody = backdrop.querySelector<HTMLTableSectionElement>("#preview-body");
  const drawRows = () => {
    if (!tableBody) return;
    tableBody.innerHTML = p.rows.map((r, i) => p.kind === "account" ? `<tr><td><input data-i="${i}" data-key="date" type="date" value="${esc(r.date)}"></td><td><input data-i="${i}" data-key="description" value="${esc(r.description)}"></td><td><input data-i="${i}" data-key="amount" type="number" step="0.01" value="${(r.amount_paise / 100).toFixed(2)}"></td><td><input data-i="${i}" data-key="balance" type="number" step="0.01" value="${r.balance_paise == null ? "" : (r.balance_paise / 100).toFixed(2)}"></td><td><button class="icon-button" data-remove="${i}">×</button></td></tr>` : `<tr><td><input data-i="${i}" data-key="name" value="${esc(r.name)}"></td><td><select data-i="${i}" data-key="type"><option value="stock" ${r.type === "stock" ? "selected" : ""}>Stock</option><option value="mutual_fund" ${r.type === "mutual_fund" ? "selected" : ""}>Mutual fund</option></select></td><td><input data-i="${i}" data-key="invested" type="number" step="0.01" value="${(r.invested_paise / 100).toFixed(2)}"></td><td><input data-i="${i}" data-key="current" type="number" step="0.01" value="${(r.value_paise / 100).toFixed(2)}"></td><td><input data-i="${i}" data-key="as_of" type="date" value="${esc(r.as_of)}"></td><td><button class="icon-button" data-remove="${i}">×</button></td></tr>`).join("");
    tableBody.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select").forEach(input => input.addEventListener("change", () => { const row = p.rows[Number(input.dataset.i)], key = input.dataset.key!; if (key === "amount") row.amount_paise = paise(input.value); else if (key === "balance") row.balance_paise = input.value ? paise(input.value) : null; else if (key === "invested") row.invested_paise = paise(input.value); else if (key === "current") row.value_paise = paise(input.value); else row[key] = input.value; }));
    tableBody.querySelectorAll<HTMLElement>("[data-remove]").forEach(el => el.addEventListener("click", () => { p.rows.splice(Number(el.dataset.remove), 1); drawRows(); }));
  };
  drawRows();
  backdrop.querySelector("#add-preview")?.addEventListener("click", () => { p.rows.push(p.kind === "account" ? { date: today(), description: "", amount_paise: 0, balance_paise: null, category: "Uncategorized", kind: "expense" } : { name: "", symbol: "", type: "mutual_fund", quantity: "", invested_paise: 0, value_paise: 0, as_of: today(), source_ref: `manual-row-${p.rows.length + 1}` }); drawRows(); });
  backdrop.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", () => { backdrop.remove(); state.preview = undefined; }));
  backdrop.querySelector("#confirm-import")!.addEventListener("click", async () => {
    const button = backdrop.querySelector<HTMLButtonElement>("#confirm-import")!; button.disabled = true;
    try {
      let uploaded: any = { id: p.documentId };
      if (!p.documentId) {
        const fileResponse = await fetch("/api/documents", { method: "POST", headers: { "content-type": p.file.type || "application/pdf", "x-document-type": p.kind, "x-file-name": p.file.name, ...(p.target ? { "x-target-id": p.target } : {}) }, body: p.file });
        uploaded = await fileResponse.json(); if (!fileResponse.ok) throw new Error(uploaded.error || "Upload failed");
      }
      if (p.kind === "account" && p.rows.length) await post(`imports/${uploaded.id}/commit`, { rows: p.rows.map((r, i) => ({ ...r, kind: r.amount_paise < 0 ? "expense" : "income", source_ref: `review-row-${i + 1}` })) });
      if (p.kind === "investment" && !p.target && p.rows.length) await post(`imports/${uploaded.id}/commit`, { rows: p.rows });
      backdrop.remove(); state.preview = undefined; await load();
    } catch (error) { alertError(error); button.disabled = false; }
  });
}

load();
