const crypto = require("crypto");

const site = require("../src/content/site");
const render = require("../src/render");

const ADMIN_COOKIE = "admin_session";
const LOGIN_ATTEMPTS = new Map();
const SUBMISSION_ATTEMPTS = new Map();
const DB_READY_KEY = "__leads_db_ready__";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getOrigin(request) {
  return new URL(request.url).origin;
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-DNS-Prefetch-Control": "off",
  };
}

function html(body, init = {}) {
  return new Response(body, {
    status: init.status || 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...securityHeaders(),
      ...(init.headers || {}),
    },
  });
}

function json(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...securityHeaders(),
      ...(init.headers || {}),
    },
  });
}

function text(body, init = {}) {
  return new Response(body, {
    status: init.status || 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...securityHeaders(),
      ...(init.headers || {}),
    },
  });
}

function parseCookies(headerValue) {
  return String(headerValue || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf("=");
      if (index === -1) return acc;
      acc[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
      return acc;
    }, {});
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function createAdminSessionToken(secret) {
  const payload = {
    iat: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000,
    nonce: crypto.randomBytes(16).toString("hex"),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyAdminSessionToken(token, secret) {
  if (!token || typeof token !== "string") {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = crypto.createHmac("sha256", secret).update(encodedPayload).digest();
  let providedSignature;

  try {
    providedSignature = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }

  if (
    providedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    return typeof payload.iat === "number" && typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

function readClientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function takeRateLimit(map, key, limit, windowMs) {
  const now = Date.now();
  const current = map.get(key) || [];
  const fresh = current.filter((timestamp) => now - timestamp < windowMs);
  if (fresh.length >= limit) {
    map.set(key, fresh);
    return false;
  }
  fresh.push(now);
  map.set(key, fresh);
  return true;
}

async function ensureLeadsTable(env) {
  if (!env.DB) {
    throw new Error("Missing D1 database binding named DB.");
  }

  if (!globalThis[DB_READY_KEY]) {
    globalThis[DB_READY_KEY] = env.DB.exec(`
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        submitted_at TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        address TEXT NOT NULL,
        service_needed TEXT NOT NULL,
        message TEXT NOT NULL,
        form_type TEXT NOT NULL,
        source TEXT NOT NULL,
        page_path TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ip TEXT NOT NULL,
        user_agent TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_leads_submitted_at ON leads(submitted_at DESC);
    `);
  }

  await globalThis[DB_READY_KEY];
}

async function loadLeads(env, limit = 50) {
  await ensureLeadsTable(env);
  const result = await env.DB.prepare(
    `SELECT
      id,
      created_at,
      submitted_at,
      name,
      email,
      phone,
      address,
      service_needed,
      message,
      form_type,
      source,
      page_path,
      started_at,
      ip,
      user_agent
    FROM leads
    ORDER BY datetime(submitted_at) DESC, datetime(created_at) DESC
    LIMIT ?1`
  )
    .bind(limit)
    .all();

  return (result.results || []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    serviceNeeded: row.service_needed,
    message: row.message,
    formType: row.form_type,
    source: row.source,
    pagePath: row.page_path,
    startedAt: row.started_at,
    ip: row.ip,
    userAgent: row.user_agent,
  }));
}

async function saveLead(env, request, data) {
  await ensureLeadsTable(env);
  const lead = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    submittedAt: data.submittedAt || new Date().toISOString(),
    ip: readClientIp(request),
    userAgent: request.headers.get("user-agent") || "",
    ...data,
  };

  await env.DB.prepare(
    `INSERT INTO leads (
      id,
      created_at,
      submitted_at,
      name,
      email,
      phone,
      address,
      service_needed,
      message,
      form_type,
      source,
      page_path,
      started_at,
      ip,
      user_agent
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`
  )
    .bind(
      lead.id,
      lead.createdAt,
      lead.submittedAt,
      lead.name,
      lead.email,
      lead.phone,
      lead.address,
      lead.serviceNeeded,
      lead.message,
      lead.formType,
      lead.source,
      lead.pagePath,
      lead.startedAt,
      lead.ip,
      lead.userAgent
    )
    .run();

  return lead;
}

async function deleteLead(env, leadId) {
  await ensureLeadsTable(env);
  const result = await env.DB.prepare("DELETE FROM leads WHERE id = ?1").bind(leadId).run();
  return Number(result?.meta?.changes || 0) > 0;
}

function normalizeLeadInput(input = {}) {
  return {
    name: String(input.name || "").trim(),
    email: String(input.email || "").trim(),
    phone: String(input.phone || "").trim(),
    address: String(input.address || "").trim(),
    serviceNeeded: String(input.serviceNeeded || "").trim(),
    message: String(input.message || "").trim(),
    formType: String(input.formType || "").trim(),
    source: String(input.source || "").trim(),
    pagePath: String(input.pagePath || "").trim(),
    startedAt: String(input.startedAt || "").trim(),
    submittedAt: String(input.submittedAt || "").trim(),
    honeypot: String(input.website || input.honeypot || "").trim(),
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value) {
  return String(value).replace(/\D/g, "").length >= 10;
}

function validateLead(data) {
  const errors = [];

  if (!data.name || data.name.length < 2) errors.push("Please enter your name.");
  if (!data.email || !isValidEmail(data.email)) errors.push("Please enter a valid email address.");
  if (!data.phone || !isValidPhone(data.phone)) errors.push("Please enter a valid phone number.");
  if (!data.address || data.address.length < 5) errors.push("Please enter your address.");

  if (data.formType === "direct-contact") {
    if (!data.message) data.message = "Quick direct contact request.";
    if (!data.serviceNeeded) data.serviceNeeded = "Direct contact";
  } else {
    if (!data.serviceNeeded) errors.push("Please tell us what you need help with.");
    if (!data.message || data.message.length < 10) {
      errors.push("Please add a short message with a few details.");
    }
  }

  if (data.honeypot) errors.push("Spam protection triggered.");

  return errors;
}

function wantsJson(request) {
  const accept = (request.headers.get("accept") || "").toLowerCase();
  return accept.includes("application/json") || request.headers.get("x-requested-with") === "fetch";
}

function adminCookieValue(secret, request, value) {
  const secureFlag = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return value
    ? `${ADMIN_COOKIE}=${createAdminSessionToken(secret)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400${secureFlag}`
    : `${ADMIN_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secureFlag}`;
}

function isAdminAuthenticated(request, secret) {
  const cookies = parseCookies(request.headers.get("cookie") || "");
  return verifyAdminSessionToken(cookies[ADMIN_COOKIE], secret);
}

function basePageResponse(htmlString) {
  return html(htmlString);
}

function renderLeadRows(leads) {
  if (!leads.length) {
    return `<tr><td colspan="7" class="admin-empty">No leads have been submitted yet.</td></tr>`;
  }

  return leads
    .slice(0, 25)
    .map(
      (lead) => `
        <tr>
          <td>${escapeHtml(
            lead.submittedAt ? new Date(lead.submittedAt).toLocaleString() : lead.createdAt ? new Date(lead.createdAt).toLocaleString() : ""
          )}</td>
          <td>${escapeHtml(lead.name || "")}</td>
          <td><a href="mailto:${escapeHtml(lead.email || "")}">${escapeHtml(lead.email || "")}</a></td>
          <td><a href="tel:${escapeHtml(lead.phone || "")}">${escapeHtml(lead.phone || "")}</a></td>
          <td>${escapeHtml(lead.address || "")}</td>
          <td>${escapeHtml(lead.serviceNeeded || "")}</td>
          <td class="admin-actions-cell">
            <button
              type="button"
              class="button button--danger button--tiny admin-delete-button"
              data-delete-lead
              data-lead-id="${escapeHtml(lead.id || "")}"
              data-lead-name="${escapeHtml(lead.name || "this lead")}"
              aria-label="Delete lead"
            >
              <span class="admin-delete-mark" aria-hidden="true">X</span>
              <span>Delete</span>
            </button>
          </td>
        </tr>
        <tr class="admin-message-row">
          <td colspan="7"><strong>Message:</strong> ${escapeHtml(lead.message || "")}</td>
        </tr>
      `
    )
    .join("");
}

module.exports = {
  ADMIN_COOKIE,
  LOGIN_ATTEMPTS,
  SUBMISSION_ATTEMPTS,
  basePageResponse,
  adminCookieValue,
  base64UrlDecode,
  base64UrlEncode,
  getOrigin,
  html,
  isAdminAuthenticated,
  json,
  loadLeads,
  deleteLead,
  escapeHtml,
  normalizeLeadInput,
  readClientIp,
  renderLeadRows,
  saveLead,
  securityHeaders,
  site,
  takeRateLimit,
  text,
  validateLead,
  wantsJson,
  render,
};
