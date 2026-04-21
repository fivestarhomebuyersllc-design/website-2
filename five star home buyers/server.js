const http = require("http");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");
const crypto = require("crypto");

const site = require("./src/content/site");
const render = require("./src/render");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.jsonl");
const ADMIN_COOKIE = "admin_session";
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const loginAttempts = new Map();
const submissionAttempts = new Map();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".html": "text/html; charset=utf-8",
};

fs.mkdirSync(DATA_DIR, { recursive: true });

function getOrigin(req) {
  const proto = req.socket.encrypted ? "https" : "http";
  const rawHost = typeof req.headers.host === "string" ? req.headers.host.trim() : "";
  const host = /^[a-z0-9.-]+(?::\d+)?$/i.test(rawHost) ? rawHost : "localhost:3000";
  return `${proto}://${host}`;
}

function shouldUseSecureCookie(req) {
  return getOrigin(req).startsWith("https://");
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

function getClientIp(req) {
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp.trim()) {
    return cfIp.trim();
  }

  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.socket.remoteAddress || "unknown";
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

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...securityHeaders(),
    ...headers,
  });
  res.end(body);
}

function sendJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...securityHeaders(),
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(chunk);
      if (Buffer.concat(chunks).length > 200_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function parseCookies(cookieHeader) {
  return (cookieHeader || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf("=");
      if (index === -1) return acc;
      const key = part.slice(0, index).trim();
      const value = decodeURIComponent(part.slice(index + 1).trim());
      acc[key] = value;
      return acc;
    }, {});
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function createAdminSessionToken() {
  const payload = {
    iat: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000,
    nonce: crypto.randomBytes(16).toString("hex"),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyAdminSessionToken(token) {
  if (!token || typeof token !== "string") {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(encodedPayload)
    .digest();

  let providedSignature;
  try {
    providedSignature = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }

  if (providedSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(providedSignature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    return typeof payload.exp === "number" && payload.exp > Date.now() && typeof payload.iat === "number";
  } catch {
    return false;
  }
}

function isAdminAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return verifyAdminSessionToken(cookies[ADMIN_COOKIE]);
}

function setAdminCookie(req, res, value) {
  const secureFlag = shouldUseSecureCookie(req) ? "; Secure" : "";
  const cookieValue = value
    ? `${ADMIN_COOKIE}=${createAdminSessionToken()}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400${secureFlag}`
    : `${ADMIN_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secureFlag}`;
  res.setHeader("Set-Cookie", cookieValue);
}

function loadLeads() {
  if (!fs.existsSync(LEADS_FILE)) {
    return [];
  }

  const lines = fs.readFileSync(LEADS_FILE, "utf8").split(/\r?\n/).filter(Boolean);

  return lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function deleteLeadById(leadId) {
  if (!leadId || typeof leadId !== "string") {
    return false;
  }

  const leads = loadLeads();
  const nextLeads = leads.filter((lead) => lead.id !== leadId);

  if (nextLeads.length === leads.length) {
    return false;
  }

  const output = nextLeads.map((lead) => `${JSON.stringify(lead)}\n`).join("");
  fs.writeFileSync(LEADS_FILE, output, "utf8");
  return true;
}

function rejectIfRateLimited(req, res, map, key, limit, windowMs, message) {
  if (!takeRateLimit(map, key, limit, windowMs)) {
    sendJson(res, 429, { ok: false, error: message });
    return true;
  }
  return false;
}

function parseLeadForm(body) {
  const parsed = querystring.parse(body);
  return {
    name: (parsed.name || "").trim(),
    email: (parsed.email || "").trim(),
    phone: (parsed.phone || "").trim(),
    address: (parsed.address || "").trim(),
    serviceNeeded: (parsed.serviceNeeded || "").trim(),
    message: (parsed.message || "").trim(),
    formType: (parsed.formType || "").trim(),
    source: (parsed.source || "").trim(),
    pagePath: (parsed.pagePath || "").trim(),
    startedAt: (parsed.startedAt || "").trim(),
    submittedAt: (parsed.submittedAt || "").trim(),
    honeypot: (parsed.website || "").trim(),
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10;
}

function validateLead(data) {
  const errors = [];

  if (!data.name || data.name.length < 2) errors.push("Please enter your name.");
  if (!data.email || !isValidEmail(data.email)) errors.push("Please enter a valid email address.");
  if (!data.phone || !isValidPhone(data.phone)) errors.push("Please enter a valid phone number.");
  if (!data.address || data.address.length < 5) errors.push("Please enter your address.");

  if (data.formType === "direct-contact") {
    if (!data.message) {
      data.message = "Quick direct contact request.";
    }
    if (!data.serviceNeeded) {
      data.serviceNeeded = "Direct contact";
    }
  } else {
    if (!data.serviceNeeded) errors.push("Please tell us what you need help with.");
    if (!data.message || data.message.length < 10) errors.push("Please add a short message with a few details.");
  }

  if (data.honeypot) errors.push("Spam protection triggered.");

  return errors;
}

function appendLead(data, req) {
  const lead = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ip: req.socket.remoteAddress || "",
    userAgent: req.headers["user-agent"] || "",
    ...data,
    submittedAt: data.submittedAt || new Date().toISOString(),
  };

  fs.appendFileSync(LEADS_FILE, `${JSON.stringify(lead)}\n`, "utf8");
  return lead;
}

function wantsJson(req) {
  const accept = (req.headers.accept || "").toLowerCase();
  return accept.includes("application/json") || req.headers["x-requested-with"] === "fetch";
}

function serveStatic(req, res, pathname) {
  const safePath = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (!safePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && safePath !== PUBLIC_DIR) {
    send(res, 403, render.notFound({ origin: getOrigin(req), site }));
    return true;
  }

  if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
    return false;
  }

  const ext = path.extname(safePath).toLowerCase();
  const type = MIME_TYPES[ext] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": ext === ".png" ? "public, max-age=31536000, immutable" : "public, max-age=3600",
    ...securityHeaders(),
  });
  fs.createReadStream(safePath).pipe(res);
  return true;
}

function routePage(res, html) {
  send(res, 200, html);
}

function getPageData(req) {
  const origin = getOrigin(req);
  const url = new URL(req.url, origin);
  return { origin, url };
}

function buildRouteResponse(req, res) {
  const { origin, url } = getPageData(req);
  const pathname = url.pathname;

  if (pathname === "/") {
    return routePage(res, render.home({ origin, site }));
  }

  if (pathname === "/contact") {
    return routePage(res, render.contact({ origin, site }));
  }

  if (pathname === "/thank-you") {
    return routePage(res, render.thankYou({ origin, site, name: url.searchParams.get("name") || "" }));
  }

  if (pathname === "/privacy") {
    return routePage(res, render.privacy({ origin, site }));
  }

  if (pathname === "/terms") {
    return routePage(res, render.terms({ origin, site }));
  }

  if (pathname === "/admin" && req.method === "GET") {
    if (!isAdminAuthenticated(req)) {
      return routePage(res, render.adminLogin({ origin }));
    }

    const leads = loadLeads();
    return routePage(
      res,
      render.adminDashboard({
        origin,
        leads,
        total: leads.length,
      })
    );
  }

  if (pathname === "/admin/login" && req.method === "POST") {
    return handleAdminLogin(req, res, origin);
  }

  if (pathname === "/admin/logout" && req.method === "POST") {
    setAdminCookie(req, res, false);
    res.writeHead(303, { Location: "/" });
    return res.end();
  }

  if (pathname === "/robots.txt") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", ...securityHeaders() });
    res.end(render.robots({ origin, site }));
    return;
  }

  if (pathname === "/sitemap.xml") {
    res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", ...securityHeaders() });
    res.end(render.sitemap({ origin, site }));
    return;
  }

  if (pathname.startsWith("/api/")) {
    if (pathname === "/api/health" && req.method === "GET") {
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/admin/leads" && req.method === "GET") {
      if (!isAdminAuthenticated(req)) {
        return sendJson(res, 401, { ok: false, error: "Unauthorized" });
      }

      const leads = loadLeads();
      return sendJson(res, 200, {
        ok: true,
        total: leads.length,
        leads: leads.slice(0, 50),
      });
    }

    if (pathname.startsWith("/api/admin/leads/") && req.method === "DELETE") {
      if (!isAdminAuthenticated(req)) {
        return sendJson(res, 401, { ok: false, error: "Unauthorized" });
      }

      const leadId = decodeURIComponent(pathname.slice("/api/admin/leads/".length)).trim();
      if (!leadId) {
        return sendJson(res, 400, { ok: false, error: "Missing lead id." });
      }

      const deleted = deleteLeadById(leadId);
      if (!deleted) {
        return sendJson(res, 404, { ok: false, error: "Lead not found." });
      }

      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/lead" && req.method === "POST") {
      return handleLeadSubmission(req, res, origin);
    }

    return sendJson(res, 404, { ok: false, error: "Not found" });
  }

  if (serveStatic(req, res, pathname)) {
    return;
  }

  if (pathname === "/favicon.ico") {
    const iconPath = path.join(PUBLIC_DIR, "favicon.svg");
    if (fs.existsSync(iconPath)) {
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400", ...securityHeaders() });
      fs.createReadStream(iconPath).pipe(res);
      return;
    }
  }

  send(res, 404, render.notFound({ origin, site }));
}

async function handleLeadSubmission(req, res, origin) {
  try {
    const clientIp = getClientIp(req);
    if (rejectIfRateLimited(req, res, submissionAttempts, `lead:${clientIp}`, 20, 10 * 60 * 1000, "Too many submissions. Please try again later.")) {
      return;
    }

    const body = await readBody(req);
    const lead = parseLeadForm(body);
    const errors = validateLead(lead);

    if (errors.length > 0) {
      if (wantsJson(req)) {
        return sendJson(res, 400, { ok: false, errors });
      }
      return send(
        res,
        400,
        render.formError({ origin, site, errors, previous: lead })
      );
    }

    const saved = appendLead(lead, req);

    if (wantsJson(req)) {
      return sendJson(res, 200, { ok: true, id: saved.id });
    }

    res.writeHead(303, {
      Location: `/thank-you?name=${encodeURIComponent(saved.name)}`,
    });
    return res.end();
  } catch (error) {
    if (wantsJson(req)) {
      return sendJson(res, 500, { ok: false, error: "Unable to save your submission." });
    }
    return send(res, 500, render.serverError({ origin, site }));
  }
}

async function handleAdminLogin(req, res, origin) {
  try {
    const clientIp = getClientIp(req);
    const loginKey = `login:${clientIp}`;
    const recentAttempts = (loginAttempts.get(loginKey) || []).filter(
      (timestamp) => Date.now() - timestamp < 15 * 60 * 1000
    );
    if (recentAttempts.length >= 8) {
      loginAttempts.set(loginKey, recentAttempts);
      return send(res, 429, render.adminLogin({ origin, error: "Too many login attempts. Try again later." }));
    }

    const body = await readBody(req);
    const parsed = querystring.parse(body);
    const password = (parsed.password || "").trim();

    if (password !== ADMIN_PASSWORD) {
      recentAttempts.push(Date.now());
      loginAttempts.set(loginKey, recentAttempts);
      return send(res, 401, render.adminLogin({ origin, error: "Incorrect password." }));
    }

    loginAttempts.delete(loginKey);
    setAdminCookie(req, res, true);
    res.writeHead(303, { Location: "/admin" });
    return res.end();
  } catch (error) {
    return send(res, 500, render.serverError({ origin, site }));
  }
}

const server = http.createServer((req, res) => {
  try {
    buildRouteResponse(req, res);
  } catch (error) {
    send(res, 500, render.serverError({ origin: getOrigin(req), site }));
  }
});

const port = Number(process.env.PORT || 3000);
if (!ADMIN_PASSWORD) {
  throw new Error("Missing ADMIN_PASSWORD environment variable.");
}

server.listen(port, () => {
  console.log(`5 Star Home Buyers running on http://localhost:${port}`);
});
