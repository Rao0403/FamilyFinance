import { createRemoteJWKSet, jwtVerify } from "jose";

interface Env {
  DB: D1Database;
  DOCUMENTS: R2Bucket;
  ASSETS: Fetcher;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  BOOTSTRAP_ADMIN_EMAIL: string;
  DEV_EMAIL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  MSG91_AUTHKEY?: string;
  MSG91_TEMPLATE_ID?: string;
}

type Member = { id: string; email: string; name: string; phone: string | null; role: string; active: number };
type RecordRow = Record<string, unknown>;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const fail = (status: number, error: string) => json({ error }, status);
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const asText = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);
const asMoney = (v: unknown) => { const n = Number(v); if (!Number.isSafeInteger(n)) throw new Error("Amount must be an integer number of paise"); return n; };
const asDate = (v: unknown) => { const s = asText(v, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`)) || new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s) throw new Error("Invalid date"); return s; };
const body = async (request: Request) => { const value: unknown = await request.json(); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object"); return value as RecordRow; };
const readAll = async <T = RecordRow>(statement: D1PreparedStatement) => (await statement.all<T>()).results;
const audit = async (env: Env, member: Member, action: string, type: string, id: string, detail?: unknown) => env.DB.prepare("INSERT INTO audit_log (id,actor_id,action,resource_type,resource_id,detail_json) VALUES (?,?,?,?,?,?)").bind(uid(), member.id, action, type, id, detail ? JSON.stringify(detail) : null).run();

async function accountBalanceStatement(env: Env, accountId: string): Promise<D1PreparedStatement> {
  const account = await env.DB.prepare("SELECT opening_balance_paise,opening_date FROM accounts WHERE id=?").bind(accountId).first<{opening_balance_paise:number;opening_date:string|null}>();
  if (!account) throw new Error("Account not found");
  const latest = await env.DB.prepare("SELECT date,balance_paise FROM transactions WHERE account_id=? AND balance_paise IS NOT NULL ORDER BY date DESC,created_at DESC LIMIT 1").bind(accountId).first<{date:string;balance_paise:number}>();
  const baseline = latest?.date ?? account.opening_date ?? "0000-00-00";
  const newer = await env.DB.prepare("SELECT coalesce(sum(amount_paise),0) AS amount FROM transactions WHERE account_id=? AND date>?").bind(accountId, baseline).first<{amount:number}>();
  return env.DB.prepare("UPDATE accounts SET balance_paise=?,balance_as_of=? WHERE id=?").bind((latest?.balance_paise ?? account.opening_balance_paise) + (newer?.amount ?? 0), latest?.date ?? account.opening_date, accountId);
}

async function identity(request: Request, env: Env): Promise<Member | null> {
  let email: string | undefined;
  if (env.DEV_EMAIL && ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname)) email = env.DEV_EMAIL.toLowerCase();
  else {
    if (!env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN || env.ACCESS_AUD.startsWith("REPLACE") || env.ACCESS_TEAM_DOMAIN.startsWith("REPLACE")) return null;
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) return null;
    const domain = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const issuer = `https://${domain}`;
    let jwks = jwksCache.get(domain);
    if (!jwks) { jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)); jwksCache.set(domain, jwks); }
    const verified = await jwtVerify(token, jwks, { issuer, audience: env.ACCESS_AUD });
    email = typeof verified.payload.email === "string" ? verified.payload.email.toLowerCase() : undefined;
  }
  if (!email) return null;
  let member = await env.DB.prepare("SELECT * FROM members WHERE email=? AND active=1").bind(email).first<Member>();
  if (!member && email === env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
    const id = uid();
    await env.DB.prepare("INSERT OR IGNORE INTO members (id,email,name,role) VALUES (?,?,?,'admin')").bind(id, email, email.split("@")[0]).run();
    member = await env.DB.prepare("SELECT * FROM members WHERE email=? AND active=1").bind(email).first<Member>();
  }
  return member;
}

async function owns(env: Env, member: Member, table: string, id: string) {
  if (!["accounts", "investments", "payments", "documents"].includes(table)) return false;
  return !!(await env.DB.prepare(`SELECT id FROM ${table} WHERE id=? AND owner_id=?`).bind(id, member.id).first());
}

async function canView(env: Env, member: Member, type: string, id: string): Promise<boolean> {
  const table = { account: "accounts", investment: "investments", payment: "payments", document: "documents" }[type];
  if (!table) return false;
  if (await owns(env, member, table, id)) return true;
  if (await env.DB.prepare("SELECT id FROM shares WHERE recipient_id=? AND resource_type=? AND resource_id=?").bind(member.id, type, id).first()) return true;
  if (type === "document") {
    const rows = await readAll<{ type: string; target_id: string | null }>(env.DB.prepare("SELECT type,target_id FROM imports WHERE document_id=? AND target_id IS NOT NULL").bind(id));
    for (const row of rows) if (row.target_id && await canView(env, member, row.type === "account" ? "account" : "investment", row.target_id)) return true;
  }
  return false;
}

async function canEdit(env: Env, member: Member, type: string, id: string): Promise<boolean> {
  const table = { account: "accounts", investment: "investments", payment: "payments", document: "documents" }[type];
  if (!table) return false;
  if (await owns(env, member, table, id)) return true;
  return !!(await env.DB.prepare("SELECT id FROM shares WHERE recipient_id=? AND resource_type=? AND resource_id=? AND permission='edit'").bind(member.id, type, id).first());
}

async function visible<T extends { id: string }>(env: Env, member: Member, table: string, type: string): Promise<T[]> {
  const rows = await readAll<T>(env.DB.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC`));
  const results: T[] = [];
  for (const row of rows) if (await canView(env, member, type, row.id)) results.push({ ...row, can_edit: await canEdit(env, member, type, row.id) });
  return results;
}

async function handler(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
  let member: Member | null;
  try { member = await identity(request, env); } catch { return fail(401, "Authentication failed"); }
  if (!member) return fail(401, "Access is restricted to invited family members");
  const path = url.pathname.split("/").filter(Boolean).slice(1);
  const method = request.method;
  const key = path[0];

  if (key === "me" && method === "GET") return json(member);
  if (key === "me" && method === "PATCH") {
    const data = await body(request), name = asText(data.name) || member.name, phone = asText(data.phone, 20).replace(/[^\d]/g, "");
    if (phone && !/^91\d{10}$/.test(phone)) return fail(400, "Phone must be an Indian mobile number with 91 prefix");
    await env.DB.prepare("UPDATE members SET name=?,phone=? WHERE id=?").bind(name, phone || null, member.id).run();
    await audit(env, member, "profile", "member", member.id);
    return json({ ok: true });
  }
  if (key === "me" && path[1] === "data" && method === "DELETE") {
    const data = await body(request);
    if (data.confirm !== "DELETE MY DATA") return fail(400, "Type DELETE MY DATA to confirm");
    const documents = await readAll<{storage_key:string}>(env.DB.prepare("SELECT storage_key FROM documents WHERE owner_id=?").bind(member.id));
    const statements: D1PreparedStatement[] = documents.map(doc => env.DB.prepare("INSERT INTO document_deletion_queue (id,storage_key) VALUES (?,?)").bind(uid(), doc.storage_key));
    statements.push(
      env.DB.prepare("DELETE FROM audit_log WHERE resource_id IN (SELECT id FROM transactions WHERE owner_id=?)").bind(member.id),
      env.DB.prepare("DELETE FROM audit_log WHERE resource_id IN (SELECT id FROM imports WHERE owner_id=?)").bind(member.id),
      env.DB.prepare("DELETE FROM audit_log WHERE resource_id IN (SELECT id FROM accounts WHERE owner_id=?)").bind(member.id),
      env.DB.prepare("DELETE FROM audit_log WHERE resource_id IN (SELECT id FROM investments WHERE owner_id=?)").bind(member.id),
      env.DB.prepare("DELETE FROM audit_log WHERE resource_id IN (SELECT id FROM payments WHERE owner_id=?)").bind(member.id),
      env.DB.prepare("DELETE FROM audit_log WHERE resource_id IN (SELECT id FROM documents WHERE owner_id=?)").bind(member.id),
      env.DB.prepare("DELETE FROM audit_log WHERE actor_id=?").bind(member.id),
      env.DB.prepare("DELETE FROM shares WHERE owner_id=?").bind(member.id),
      env.DB.prepare("DELETE FROM reminder_deliveries WHERE payment_id IN (SELECT id FROM payments WHERE owner_id=?)").bind(member.id),
      env.DB.prepare("DELETE FROM payment_occurrences WHERE payment_id IN (SELECT id FROM payments WHERE owner_id=?)").bind(member.id),
      env.DB.prepare("DELETE FROM investment_snapshots WHERE investment_id IN (SELECT id FROM investments WHERE owner_id=?)").bind(member.id),
      env.DB.prepare("DELETE FROM transactions WHERE owner_id=?").bind(member.id),
      env.DB.prepare("DELETE FROM imports WHERE owner_id=?").bind(member.id),
      env.DB.prepare("DELETE FROM payments WHERE owner_id=?").bind(member.id),
      env.DB.prepare("DELETE FROM investments WHERE owner_id=?").bind(member.id),
      env.DB.prepare("DELETE FROM accounts WHERE owner_id=?").bind(member.id),
      env.DB.prepare("DELETE FROM documents WHERE owner_id=?").bind(member.id)
    );
    await env.DB.batch(statements);
    await audit(env, member, "delete_financial_data", "member", member.id, { documents: documents.length });
    await clearDeletedDocuments(env);
    return json({ ok: true, documents_queued: documents.length });
  }
  if (key === "members") {
    if (method === "GET") return json(await readAll(env.DB.prepare("SELECT id,name,email,role,active FROM members WHERE active=1 ORDER BY created_at")));
    if (method === "POST" && member.role === "admin") {
      const data = await body(request), email = asText(data.email, 254).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, "Valid email required");
      const count = await env.DB.prepare("SELECT count(*) AS total FROM members WHERE active=1").first<{total:number}>();
      if ((count?.total ?? 0) >= 4) return fail(400, "This family workspace is limited to four active members");
      const prior = await env.DB.prepare("SELECT id,active FROM members WHERE email=?").bind(email).first<{id:string;active:number}>();
      if (prior?.active) return fail(409, "Member is already active");
      if (prior) {
        await env.DB.prepare("UPDATE members SET active=1,name=? WHERE id=?").bind(asText(data.name) || email.split("@")[0], prior.id).run();
        await audit(env, member, "reactivate", "member", prior.id);
        return json({ id: prior.id });
      }
      const id = uid();
      await env.DB.prepare("INSERT INTO members (id,email,name) VALUES (?,?,?)").bind(id, email, asText(data.name) || email.split("@")[0]).run();
      await audit(env, member, "invite", "member", id);
      return json({ id }, 201);
    }
    if (method === "PATCH" && path[1] && member.role === "admin") {
      if (path[1] === member.id) return fail(400, "Administrator cannot deactivate their own login");
      const target = await env.DB.prepare("SELECT id,active FROM members WHERE id=?").bind(path[1]).first<{id:string;active:number}>();
      if (!target) return fail(404, "Member not found");
      const data = await body(request);
      if (data.active !== false) return fail(400, "Only deactivation is supported here");
      await env.DB.prepare("UPDATE members SET active=0 WHERE id=?").bind(path[1]).run();
      await audit(env, member, "deactivate", "member", path[1]);
      return json({ ok: true });
    }
  }
  if (key === "shares") {
    if (method === "GET") return json(await readAll(env.DB.prepare("SELECT * FROM shares WHERE owner_id=? ORDER BY created_at DESC").bind(member.id)));
    if (method === "POST") {
      const data = await body(request), type = asText(data.resource_type), id = asText(data.resource_id), recipient = asText(data.recipient_id);
      const table = { account: "accounts", investment: "investments", payment: "payments", document: "documents" }[type];
      if (!table || !await owns(env, member, table, id)) return fail(403, "Only the owner can share this record");
      if (recipient === member.id || !await env.DB.prepare("SELECT id FROM members WHERE id=? AND active=1").bind(recipient).first()) return fail(400, "Invalid recipient");
      const permission = data.permission === "edit" ? "edit" : "view";
      await env.DB.prepare("INSERT INTO shares (id,owner_id,recipient_id,resource_type,resource_id,permission) VALUES (?,?,?,?,?,?) ON CONFLICT(recipient_id,resource_type,resource_id) DO UPDATE SET permission=excluded.permission").bind(uid(), member.id, recipient, type, id, permission).run();
      await audit(env, member, "share", type, id, { recipient, permission });
      return json({ ok: true });
    }
    if (method === "DELETE" && path[1]) {
      const share = await env.DB.prepare("SELECT * FROM shares WHERE id=? AND owner_id=?").bind(path[1], member.id).first<RecordRow>();
      if (!share) return fail(404, "Share not found");
      await env.DB.prepare("DELETE FROM shares WHERE id=?").bind(path[1]).run();
      await audit(env, member, "revoke", String(share.resource_type), String(share.resource_id), { recipient: share.recipient_id });
      return json({ ok: true });
    }
  }
  if (key === "accounts") {
    if (method === "GET") return json(await visible(env, member, "accounts", "account"));
    if (method === "POST") {
      const data = await body(request), id = uid(), opening = asMoney(data.opening_balance_paise ?? 0);
      await env.DB.prepare("INSERT INTO accounts (id,owner_id,name,institution,masked_number,opening_balance_paise,opening_date,balance_paise,balance_as_of) VALUES (?,?,?,?,?,?,?,?,?)").bind(id, member.id, asText(data.name) || "Indian Bank account", asText(data.institution) || "Indian Bank", asText(data.masked_number, 20) || null, opening, data.opening_date ? asDate(data.opening_date) : null, opening, data.opening_date ? asDate(data.opening_date) : null).run();
      await audit(env, member, "create", "account", id); return json({ id }, 201);
    }
  }
  if (key === "transactions") {
    if (method === "GET") {
      const accountId = url.searchParams.get("account_id");
      if (accountId && !await canView(env, member, "account", accountId)) return fail(403, "Access denied");
      const accounts = accountId ? [accountId] : (await visible<{id:string}>(env, member, "accounts", "account")).map(a => a.id);
      if (!accounts.length) return json([]);
      const rows = await readAll(env.DB.prepare(`SELECT * FROM transactions WHERE account_id IN (${accounts.map(() => "?").join(",")}) ORDER BY date DESC, created_at DESC LIMIT 2000`).bind(...accounts));
      return json(rows);
    }
    if (method === "POST") {
      const data = await body(request), accountId = asText(data.account_id);
      if (!await owns(env, member, "accounts", accountId)) return fail(403, "Only the account owner can add transactions");
      const id = uid(), date = asDate(data.date), amount = asMoney(data.amount_paise);
      await env.DB.prepare("INSERT INTO transactions (id,owner_id,account_id,date,description,amount_paise,category,kind,balance_paise) VALUES (?,?,?,?,?,?,?,?,?)").bind(id, member.id, accountId, date, asText(data.description, 500), amount, asText(data.category) || "Uncategorized", asText(data.kind) || (amount < 0 ? "expense" : "income"), data.balance_paise == null ? null : asMoney(data.balance_paise)).run();
      await (await accountBalanceStatement(env, accountId)).run();
      await audit(env, member, "create", "transaction", id); return json({ id }, 201);
    }
    if (method === "PATCH" && path[1]) {
      const tx = await env.DB.prepare("SELECT * FROM transactions WHERE id=?").bind(path[1]).first<RecordRow>();
      if (!tx) return fail(404, "Transaction not found");
      if (!await canEdit(env, member, "account", String(tx.account_id))) return fail(403, "Edit access denied");
      const data = await body(request);
      const newAmount = data.amount_paise == null ? Number(tx.amount_paise) : asMoney(data.amount_paise);
      const newDate = data.date == null ? String(tx.date) : asDate(data.date);
      await env.DB.prepare("UPDATE transactions SET date=?,amount_paise=?,category=?,kind=?,description=? WHERE id=?").bind(newDate, newAmount, asText(data.category) || tx.category, asText(data.kind) || tx.kind, asText(data.description, 500) || tx.description, path[1]).run();
      await (await accountBalanceStatement(env, String(tx.account_id))).run();
      await audit(env, member, "edit", "transaction", path[1], { previous_amount_paise: tx.amount_paise, amount_paise: newAmount }); return json({ ok: true });
    }
  }
  if (key === "investments") {
    if (method === "GET") {
      const rows = await visible<RecordRow & {id:string}>(env, member, "investments", "investment");
      for (const row of rows) row.latest = await env.DB.prepare("SELECT * FROM investment_snapshots WHERE investment_id=? ORDER BY as_of DESC, created_at DESC LIMIT 1").bind(row.id).first();
      return json(rows);
    }
    if (method === "POST" && !path[1]) {
      const data = await body(request), id = uid(), type = asText(data.type);
      if (!["stock", "mutual_fund", "fd"].includes(type)) return fail(400, "Invalid investment type");
      await env.DB.prepare("INSERT INTO investments (id,owner_id,type,name,symbol,institution,principal_paise,rate_bps,start_date,maturity_date,maturity_amount_paise,document_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, member.id, type, asText(data.name), asText(data.symbol, 50) || null, asText(data.institution) || null, data.principal_paise == null ? null : asMoney(data.principal_paise), data.rate_bps == null ? null : Number(data.rate_bps), data.start_date ? asDate(data.start_date) : null, data.maturity_date ? asDate(data.maturity_date) : null, data.maturity_amount_paise == null ? null : asMoney(data.maturity_amount_paise), null).run();
      await audit(env, member, "create", "investment", id); return json({ id }, 201);
    }
    if (path[1] && path[2] === "snapshots" && method === "POST") {
      if (!await canEdit(env, member, "investment", path[1])) return fail(403, "Edit access denied");
      const data = await body(request), id = uid();
      if (data.document_id && !await canView(env, member, "document", asText(data.document_id))) return fail(403, "Document access denied");
      await env.DB.prepare("INSERT INTO investment_snapshots (id,investment_id,as_of,quantity,invested_paise,value_paise,document_id,source_ref) VALUES (?,?,?,?,?,?,?,?)").bind(id, path[1], asDate(data.as_of), asText(data.quantity, 60) || null, asMoney(data.invested_paise), asMoney(data.value_paise), data.document_id || null, asText(data.source_ref) || id).run();
      await audit(env, member, "snapshot", "investment", path[1]); return json({ id }, 201);
    }
  }
  if (key === "payments") {
    if (method === "GET") {
      const rows = await visible<RecordRow & {id:string}>(env, member, "payments", "payment");
      for (const row of rows) row.last_paid = await env.DB.prepare("SELECT due_date,paid_at,transaction_id FROM payment_occurrences WHERE payment_id=? AND status='paid' ORDER BY due_date DESC LIMIT 1").bind(row.id).first();
      return json(rows);
    }
    if (method === "POST" && !path[1]) {
      const data = await body(request), id = uid(), frequency = asText(data.frequency) || "once";
      if (!["once", "weekly", "monthly", "quarterly", "yearly"].includes(frequency)) return fail(400, "Invalid frequency");
      if (data.account_id && !await owns(env, member, "accounts", asText(data.account_id))) return fail(403, "Linked account must belong to the payment owner");
      await env.DB.prepare("INSERT INTO payments (id,owner_id,title,amount_paise,next_due_date,frequency,account_id,remind_days,email_enabled,sms_enabled) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id, member.id, asText(data.title), asMoney(data.amount_paise), asDate(data.next_due_date), frequency, data.account_id || null, Math.min(Math.max(Number(data.remind_days ?? 3), 0), 30), data.email_enabled === false ? 0 : 1, data.sms_enabled === true ? 1 : 0).run();
      await audit(env, member, "create", "payment", id); return json({ id }, 201);
    }
    if (path[1] && path[2] === "paid" && method === "POST") {
      const payment = await env.DB.prepare("SELECT * FROM payments WHERE id=?").bind(path[1]).first<RecordRow>();
      if (!payment) return fail(404, "Payment not found");
      if (!await canEdit(env, member, "payment", path[1])) return fail(403, "Edit access denied");
      if (!payment.active) return fail(400, "Payment is already completed");
      const data = await body(request);
      const transactionId = data.transaction_id ? asText(data.transaction_id) : null;
      if (transactionId) {
        const transaction = await env.DB.prepare("SELECT id,owner_id,account_id,amount_paise FROM transactions WHERE id=?").bind(transactionId).first<{id:string;owner_id:string;account_id:string;amount_paise:number}>();
        if (!transaction || transaction.owner_id !== payment.owner_id || !await canView(env, member, "account", transaction.account_id)) return fail(403, "Transaction cannot be linked to this payment");
        if (transaction.amount_paise !== -Number(payment.amount_paise)) return fail(400, "Transaction amount must match the payment");
        if (await env.DB.prepare("SELECT id FROM payment_occurrences WHERE transaction_id=? AND status='paid'").bind(transactionId).first()) return fail(409, "Transaction is already linked to a payment");
      }
      const due = String(payment.next_due_date), id = uid();
      await env.DB.prepare("INSERT INTO payment_occurrences (id,payment_id,due_date,status,paid_at,transaction_id) VALUES (?,?,?,'paid',?,?) ON CONFLICT(payment_id,due_date) DO UPDATE SET status='paid',paid_at=excluded.paid_at,transaction_id=excluded.transaction_id").bind(id, path[1], due, now(), transactionId).run();
      const next = nextDue(due, String(payment.frequency));
      await env.DB.prepare("UPDATE payments SET next_due_date=?,active=? WHERE id=?").bind(next ?? due, next ? 1 : 0, path[1]).run();
      await audit(env, member, "paid", "payment", path[1], { due, transaction_id: transactionId }); return json({ ok: true });
    }
  }
  if (key === "reminders" && method === "GET") {
    return json(await readAll(env.DB.prepare("SELECT d.id,d.payment_id,d.due_date,d.channel,d.status,d.error,d.attempted_at,p.title FROM reminder_deliveries d JOIN payments p ON p.id=d.payment_id WHERE d.recipient_id=? ORDER BY d.attempted_at DESC LIMIT 100").bind(member.id)));
  }
  if (key === "documents") {
    if (method === "GET" && !path[1]) {
      const rows = await visible<RecordRow & {id:string}>(env, member, "documents", "document");
      return json(rows.map(({ storage_key, ...row }) => row));
    }
    if (method === "GET" && path[1]) {
      if (!await canView(env, member, "document", path[1])) return fail(403, "Access denied");
      const doc = await env.DB.prepare("SELECT * FROM documents WHERE id=?").bind(path[1]).first<RecordRow>();
      if (!doc) return fail(404, "Document not found");
      const object = await env.DOCUMENTS.get(String(doc.storage_key));
      if (!object) return fail(404, "Stored file not found");
      await audit(env, member, "download", "document", path[1]);
      return new Response(object.body, { headers: { "content-type": String(doc.mime_type), "content-disposition": `attachment; filename="${String(doc.name).replace(/["\r\n]/g, "_")}"`, "cache-control": "private, no-store" } });
    }
    if (method === "POST") {
      const type = request.headers.get("x-document-type") || "other", name = request.headers.get("x-file-name") || "document";
      const target = request.headers.get("x-target-id");
      if (!["account", "investment", "other"].includes(type)) return fail(400, "Invalid document type");
      if (target && (type === "other" || !await owns(env, member, type === "account" ? "accounts" : "investments", target))) return fail(403, "Target must be owned by uploader");
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > 15 * 1024 * 1024) return fail(400, "File must be 1 byte to 15 MB");
      const mime = request.headers.get("content-type") || "application/octet-stream";
      if (!["application/pdf", "text/csv", "text/plain", "image/jpeg", "image/png", "application/vnd.ms-excel"].includes(mime)) return fail(400, "Unsupported file type");
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(b => b.toString(16).padStart(2, "0")).join("");
      const existing = await env.DB.prepare("SELECT id FROM documents WHERE owner_id=? AND sha256=?").bind(member.id, digest).first();
      if (existing) return fail(409, "This file was already uploaded");
      const id = uid(), storageKey = `${member.id}/${id}`;
      await env.DOCUMENTS.put(storageKey, bytes, { httpMetadata: { contentType: mime } });
      await env.DB.prepare("INSERT INTO documents (id,owner_id,type,name,mime_type,size_bytes,sha256,storage_key) VALUES (?,?,?,?,?,?,?,?)").bind(id, member.id, type, name.slice(0, 200), mime, bytes.byteLength, digest, storageKey).run();
      await env.DB.prepare("INSERT INTO imports (id,owner_id,document_id,target_id,type) VALUES (?,?,?,?,?)").bind(uid(), member.id, id, target, type).run();
      await audit(env, member, "upload", "document", id); return json({ id }, 201);
    }
  }
  if (key === "imports" && path[1] && !path[2] && method === "GET") {
    const batch = await env.DB.prepare("SELECT id,document_id,target_id,type,status,created_at,committed_at FROM imports WHERE document_id=? AND owner_id=? ORDER BY created_at DESC LIMIT 1").bind(path[1], member.id).first();
    return batch ? json(batch) : fail(404, "Import not found");
  }
  if (key === "imports" && path[1] && path[2] === "commit" && method === "POST") {
    const batch = await env.DB.prepare("SELECT * FROM imports WHERE document_id=? AND owner_id=? AND status='pending'").bind(path[1], member.id).first<RecordRow>();
    if (!batch) return fail(404, "Pending import not found");
    const data = await body(request), rows = Array.isArray(data.rows) ? data.rows as RecordRow[] : [];
    if (rows.length > 1000) return fail(400, "Import limit is 1000 rows");
    let imported = 0, duplicates = 0;
    if (batch.type === "account" && batch.target_id) {
      const statements: D1PreparedStatement[] = [];
      for (const row of rows) {
        const date = asDate(row.date), amount = asMoney(row.amount_paise), description = asText(row.description, 500);
        const fingerprint = `${date}|${amount}|${description}|${row.balance_paise ?? ""}`;
        statements.push(env.DB.prepare("INSERT OR IGNORE INTO transactions (id,owner_id,account_id,date,description,amount_paise,category,kind,balance_paise,document_id,source_ref,fingerprint) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(uid(), member.id, batch.target_id, date, description, amount, asText(row.category) || "Uncategorized", asText(row.kind) || (amount < 0 ? "expense" : "income"), row.balance_paise == null ? null : asMoney(row.balance_paise), path[1], asText(row.source_ref) || null, fingerprint));
      }
      statements.push(env.DB.prepare("UPDATE imports SET status='committed',committed_at=? WHERE id=?").bind(now(), batch.id));
      statements.push(env.DB.prepare("UPDATE documents SET status='imported' WHERE id=?").bind(path[1]));
      const results = await env.DB.batch(statements);
      imported = results.slice(0, rows.length).reduce((sum, result) => sum + result.meta.changes, 0);
      duplicates = rows.length - imported;
      await (await accountBalanceStatement(env, String(batch.target_id))).run();
    } else if (batch.type === "investment") {
      const existing = await readAll<{id:string;type:string;name:string;symbol:string|null}>(env.DB.prepare("SELECT id,type,name,symbol FROM investments WHERE owner_id=?").bind(member.id));
      const keyFor = (type: string, name: string, symbol: string) => `${type}\u0000${name.toLowerCase()}\u0000${symbol}`;
      const known = new Map(existing.map(item => [keyFor(item.type, item.name, item.symbol || ""), item.id]));
      const statements: D1PreparedStatement[] = [], snapshotIndexes: number[] = [];
      for (const row of rows) {
        const name = asText(row.name), type = asText(row.type), symbol = asText(row.symbol, 60), asOf = asDate(row.as_of);
        if (!name || !["stock", "mutual_fund"].includes(type)) return fail(400, "Investment rows need a name and stock or mutual fund type");
        const invested = asMoney(row.invested_paise), current = asMoney(row.value_paise);
        const key = keyFor(type, name, symbol);
        let investmentId = known.get(key);
        if (!investmentId) {
          investmentId = uid();
          known.set(key, investmentId);
          statements.push(env.DB.prepare("INSERT INTO investments (id,owner_id,type,name,symbol,institution,created_import_id) VALUES (?,?,?,?,?,'Groww',?)").bind(investmentId, member.id, type, name, symbol || null, batch.id));
        }
        snapshotIndexes.push(statements.length);
        statements.push(env.DB.prepare("INSERT OR IGNORE INTO investment_snapshots (id,investment_id,as_of,quantity,invested_paise,value_paise,document_id,source_ref) VALUES (?,?,?,?,?,?,?,?)").bind(uid(), investmentId, asOf, asText(row.quantity, 60) || null, invested, current, path[1], `${path[1]}:${asText(row.source_ref)}`));
      }
      statements.push(env.DB.prepare("UPDATE imports SET status='committed',committed_at=? WHERE id=?").bind(now(), batch.id));
      statements.push(env.DB.prepare("UPDATE documents SET status='imported' WHERE id=?").bind(path[1]));
      const results = await env.DB.batch(statements);
      imported = snapshotIndexes.reduce((sum, index) => sum + results[index].meta.changes, 0);
      duplicates = rows.length - imported;
    } else return fail(400, "This document type needs a supported review workflow");
    await audit(env, member, "commit", "import", String(batch.id), { imported, duplicates });
    return json({ imported, duplicates });
  }
  if (key === "imports" && path[1] && path[2] === "rollback" && method === "POST") {
    const batch = await env.DB.prepare("SELECT * FROM imports WHERE document_id=? AND owner_id=? AND status='committed'").bind(path[1], member.id).first<RecordRow>();
    if (!batch) return fail(404, "Committed import not found");
    await env.DB.prepare("DELETE FROM transactions WHERE document_id=? AND owner_id=?").bind(path[1], member.id).run();
    await env.DB.prepare("DELETE FROM investment_snapshots WHERE document_id=? AND investment_id IN (SELECT id FROM investments WHERE owner_id=?)").bind(path[1], member.id).run();
    if (batch.type === "investment") {
      const empty = await readAll<{id:string}>(env.DB.prepare("SELECT i.id FROM investments i WHERE i.owner_id=? AND i.created_import_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM investment_snapshots s WHERE s.investment_id=i.id)").bind(member.id));
      for (const item of empty) {
        await env.DB.prepare("DELETE FROM shares WHERE resource_type='investment' AND resource_id=?").bind(item.id).run();
        await env.DB.prepare("DELETE FROM investments WHERE id=?").bind(item.id).run();
      }
    }
    if (batch.type === "account" && batch.target_id) {
      await (await accountBalanceStatement(env, String(batch.target_id))).run();
    }
    await env.DB.prepare("UPDATE imports SET status='pending',committed_at=NULL WHERE id=?").bind(batch.id).run();
    await env.DB.prepare("UPDATE documents SET status='uploaded' WHERE id=?").bind(path[1]).run();
    await audit(env, member, "rollback", "import", String(batch.id));
    return json({ ok: true });
  }
  if (key === "dashboard" && method === "GET") {
    const accounts = await visible<RecordRow & {id:string}>(env, member, "accounts", "account");
    const investments = await visible<RecordRow & {id:string}>(env, member, "investments", "investment");
    const payments = await visible<RecordRow & {id:string}>(env, member, "payments", "payment");
    let investmentValue = 0;
    for (const investment of investments) {
      const latest = await env.DB.prepare("SELECT value_paise,as_of FROM investment_snapshots WHERE investment_id=? ORDER BY as_of DESC LIMIT 1").bind(investment.id).first<{value_paise:number;as_of:string}>();
      investmentValue += latest?.value_paise ?? Number(investment.principal_paise ?? 0);
      investment.value_paise = latest?.value_paise ?? investment.principal_paise ?? 0;
      investment.as_of = latest?.as_of ?? investment.start_date;
    }
    const ids = accounts.map(a => a.id);
    const month = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).slice(0, 7);
    const txs = ids.length ? await readAll<{amount_paise:number;kind:string;category:string}>(env.DB.prepare(`SELECT amount_paise,kind,category FROM transactions WHERE account_id IN (${ids.map(() => "?").join(",")}) AND date LIKE ?`).bind(...ids, `${month}%`)) : [];
    return json({ accounts, investments, payments, bank_paise: accounts.reduce((s, a) => s + Number(a.balance_paise), 0), investment_paise: investmentValue, spending_paise: -txs.filter(t => t.kind === "expense").reduce((s, t) => s + t.amount_paise, 0), income_paise: txs.filter(t => t.kind === "income").reduce((s, t) => s + t.amount_paise, 0), month });
  }
  if (key === "reports" && method === "GET") {
    const accounts = await visible<{id:string;opening_date:string|null;opening_balance_paise:number}>(env, member, "accounts", "account");
    const investments = await visible<{id:string;type:string;principal_paise:number|null;start_date:string|null}>(env, member, "investments", "investment");
    const ids = accounts.map(a => a.id);
    const rows = ids.length ? await readAll<{date:string;kind:string;category:string;amount_paise:number;account_id:string;balance_paise:number|null}>(env.DB.prepare(`SELECT date,kind,category,amount_paise,account_id,balance_paise FROM transactions WHERE account_id IN (${ids.map(() => "?").join(",")})`).bind(...ids)) : [];
    const snapshots = investments.length ? await readAll<{investment_id:string;as_of:string;value_paise:number}>(env.DB.prepare(`SELECT investment_id,as_of,value_paise FROM investment_snapshots WHERE investment_id IN (${investments.map(() => "?").join(",")})`).bind(...investments.map(i => i.id))) : [];
    const monthly = new Map<string, { month:string; income_paise:number; spending_paise:number }>();
    const categories = new Map<string, number>();
    for (const row of rows) {
      const month = row.date.slice(0, 7), item = monthly.get(month) || { month, income_paise: 0, spending_paise: 0 };
      if (row.kind === "expense") { item.spending_paise += Math.abs(row.amount_paise); categories.set(row.category, (categories.get(row.category) || 0) + Math.abs(row.amount_paise)); }
      if (row.kind === "income") item.income_paise += row.amount_paise;
      monthly.set(month, item);
    }
    const eventMonths = new Set<string>([
      ...accounts.map(a => a.opening_date?.slice(0, 7)).filter((x): x is string => !!x),
      ...rows.filter(r => r.balance_paise != null).map(r => r.date.slice(0, 7)),
      ...snapshots.map(s => s.as_of.slice(0, 7)),
      ...investments.filter(i => i.type === "fd").map(i => i.start_date?.slice(0, 7)).filter((x): x is string => !!x)
    ]);
    const history: {month:string;net_worth_paise:number;stale:boolean}[] = [];
    for (const month of [...eventMonths].sort().slice(-24)) {
      const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
      let total = 0, missing = false, stale = false;
      for (const account of accounts) {
        const eligible = rows.filter(r => r.account_id === account.id && r.date <= end);
        const statement = eligible.filter(r => r.balance_paise != null).sort((a, b) => b.date.localeCompare(a.date))[0];
        const baselineDate = statement?.date ?? account.opening_date;
        if (!baselineDate || baselineDate > end) { missing = true; break; }
        total += (statement?.balance_paise ?? account.opening_balance_paise) + eligible.filter(r => r.date > baselineDate).reduce((sum, r) => sum + r.amount_paise, 0);
        if (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${baselineDate}T00:00:00Z`) > 45 * 86400000) stale = true;
      }
      if (missing) continue;
      for (const investment of investments) {
        const snapshot = snapshots.filter(s => s.investment_id === investment.id && s.as_of <= end).sort((a, b) => b.as_of.localeCompare(a.as_of))[0];
        const asOf = snapshot?.as_of ?? (investment.type === "fd" ? investment.start_date : null);
        if (!asOf || asOf > end || (snapshot == null && investment.principal_paise == null)) { missing = true; break; }
        total += snapshot?.value_paise ?? investment.principal_paise ?? 0;
        if (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`) > 45 * 86400000) stale = true;
      }
      if (!missing) history.push({ month, net_worth_paise: total, stale });
    }
    return json({ monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)), categories: [...categories.entries()].map(([category, amount_paise]) => ({ category, amount_paise })).sort((a, b) => b.amount_paise - a.amount_paise), history });
  }
  if (key === "export" && method === "GET") {
    const accounts = await readAll(env.DB.prepare("SELECT * FROM accounts WHERE owner_id=?").bind(member.id));
    const transactions = await readAll(env.DB.prepare("SELECT * FROM transactions WHERE owner_id=?").bind(member.id));
    const investments = await readAll(env.DB.prepare("SELECT * FROM investments WHERE owner_id=?").bind(member.id));
    const investmentIds = investments.map(x => String(x.id));
    const snapshots = investmentIds.length ? await readAll(env.DB.prepare(`SELECT * FROM investment_snapshots WHERE investment_id IN (${investmentIds.map(() => "?").join(",")})`).bind(...investmentIds)) : [];
    const payments = await readAll(env.DB.prepare("SELECT * FROM payments WHERE owner_id=?").bind(member.id));
    const documents = (await readAll(env.DB.prepare("SELECT * FROM documents WHERE owner_id=?").bind(member.id))).map(({storage_key, ...record}) => record);
    const shares = await readAll(env.DB.prepare("SELECT * FROM shares WHERE owner_id=?").bind(member.id));
    await audit(env, member, "export", "member", member.id);
    return new Response(JSON.stringify({ exported_at: now(), accounts, transactions, investments, snapshots, payments, documents, shares }, null, 2), { headers: { "content-type": "application/json", "content-disposition": "attachment; filename=family-finance-export.json", "cache-control": "private, no-store" } });
  }
  return fail(404, "Not found");
}

function nextDue(date: string, frequency: string): string | null {
  if (frequency === "once") return null;
  const d = new Date(`${date}T12:00:00Z`);
  if (frequency === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else {
    const months = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
    const originalDay = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    const maxDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(originalDay, maxDay));
  }
  return d.toISOString().slice(0, 10);
}

async function sendReminder(env: Env, channel: "email" | "sms", recipient: Member) {
  if (channel === "email") {
    if (!env.RESEND_API_KEY || !env.RESEND_FROM) throw new Error("Email provider is not configured");
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from: env.RESEND_FROM, to: [recipient.email], subject: "Family Finance payment reminder", text: "A payment is coming due. Sign in to Family Finance to review it." }) });
    if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
    return String(((await response.json()) as {id?:string}).id || "accepted");
  }
  if (!env.MSG91_AUTHKEY || !env.MSG91_TEMPLATE_ID) throw new Error("SMS provider is not configured");
  if (!recipient.phone) throw new Error("Member has no phone number");
  const response = await fetch("https://control.msg91.com/api/v5/flow", { method: "POST", headers: { authkey: env.MSG91_AUTHKEY, accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ template_id: env.MSG91_TEMPLATE_ID, recipients: [{ mobiles: recipient.phone }] }) });
  if (!response.ok) throw new Error(`SMS provider returned ${response.status}`);
  const result = await response.json() as {type?:string;message?:string};
  if (result.type === "error") throw new Error("SMS provider rejected the reminder");
  return result.message || "accepted";
}

async function runReminders(env: Env, at = new Date()) {
  const todayIst = at.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const rows = await readAll<RecordRow>(env.DB.prepare("SELECT p.*,m.email,m.phone,m.name,m.active AS member_active FROM payments p JOIN members m ON m.id=p.owner_id WHERE p.active=1 AND m.active=1 AND p.next_due_date>=?").bind(todayIst));
  for (const row of rows) {
    const days = Math.round((Date.parse(`${row.next_due_date}T00:00:00Z`) - Date.parse(`${todayIst}T00:00:00Z`)) / 86400000);
    if (days !== Number(row.remind_days)) continue;
    const recipient: Member = { id: String(row.owner_id), email: String(row.email), phone: row.phone ? String(row.phone) : null, name: String(row.name), role: "member", active: 1 };
    for (const channel of ["email", "sms"] as const) {
      if (!row[`${channel}_enabled`]) continue;
      const existing = await env.DB.prepare("SELECT id FROM reminder_deliveries WHERE payment_id=? AND due_date=? AND channel=? AND recipient_id=?").bind(row.id, row.next_due_date, channel, recipient.id).first();
      if (existing) continue;
      const id = uid();
      await env.DB.prepare("INSERT INTO reminder_deliveries (id,payment_id,due_date,channel,recipient_id,status) VALUES (?,?,?,?,?,'pending')").bind(id, row.id, row.next_due_date, channel, recipient.id).run();
      try {
        const providerId = await sendReminder(env, channel, recipient);
        await env.DB.prepare("UPDATE reminder_deliveries SET status='accepted',provider_id=? WHERE id=?").bind(providerId, id).run();
      } catch (error) {
        await env.DB.prepare("UPDATE reminder_deliveries SET status='failed',error=? WHERE id=?").bind(error instanceof Error ? error.message.slice(0, 200) : "Unknown error", id).run();
      }
    }
  }
}

async function clearDeletedDocuments(env: Env) {
  const pending = await readAll<{id:string;storage_key:string}>(env.DB.prepare("SELECT id,storage_key FROM document_deletion_queue WHERE completed_at IS NULL LIMIT 100"));
  for (const item of pending) {
    try {
      await env.DOCUMENTS.delete(item.storage_key);
      await env.DB.prepare("DELETE FROM document_deletion_queue WHERE id=?").bind(item.id).run();
    } catch (error) { console.error("Document deletion will be retried", error); }
  }
}

export default {
  fetch(request: Request, env: Env) { return handler(request, env).catch(error => {
    const message = error instanceof Error ? error.message : "";
    if (["Amount must be an integer number of paise", "Invalid date", "Expected a JSON object", "Account not found"].includes(message)) return fail(400, message);
    console.error("Request failed", error);
    return fail(500, "Request failed. Refresh to check the latest state");
  }); },
  scheduled(controller: ScheduledController, env: Env) { return Promise.all([runReminders(env, new Date(controller.scheduledTime)), clearDeletedDocuments(env)]).then(() => {}); }
} satisfies ExportedHandler<Env>;
