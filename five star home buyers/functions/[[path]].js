const {
  ADMIN_COOKIE,
  LOGIN_ATTEMPTS,
  SUBMISSION_ATTEMPTS,
  adminCookieValue,
  getOrigin,
  html,
  isAdminAuthenticated,
  json,
  deleteLead,
  loadLeads,
  normalizeLeadInput,
  readClientIp,
  render,
  renderLeadRows,
  saveLead,
  site,
  takeRateLimit,
  text,
  validateLead,
  wantsJson,
} = require("./_shared");

function redirect(location, status = 303, extraHeaders = {}) {
  return new Response(null, {
    status,
    headers: {
      Location: location,
      ...extraHeaders,
    },
  });
}

function normalizePathname(pathname) {
  if (pathname === "/index.html") {
    return "/";
  }

  if (pathname.endsWith("/index.html")) {
    const stripped = pathname.slice(0, -"/index.html".length);
    return stripped || "/";
  }

  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

async function handleLead(request, env) {
  const ip = readClientIp(request);
  if (!takeRateLimit(SUBMISSION_ATTEMPTS, `lead:${ip}`, 20, 10 * 60 * 1000)) {
    return json({ ok: false, error: "Too many submissions. Please try again later." }, { status: 429 });
  }

  const form = normalizeLeadInput(Object.fromEntries((await request.formData()).entries()));
  const errors = validateLead(form);

  if (errors.length > 0) {
    if (wantsJson(request)) {
      return json({ ok: false, errors }, { status: 400 });
    }

    return html(
      render.formError({
        origin: getOrigin(request),
        site,
        errors,
        previous: form,
      }),
      { status: 400 }
    );
  }

  const saved = await saveLead(env, request, form);

  if (wantsJson(request)) {
    return json({ ok: true, id: saved.id });
  }

  return redirect(`/thank-you?name=${encodeURIComponent(saved.name)}`);
}

async function handleAdminLogin(request, env) {
  const secret = env.ADMIN_SESSION_SECRET;
  const ip = readClientIp(request);
  const key = `login:${ip}`;
  const attempts = (LOGIN_ATTEMPTS.get(key) || []).filter((timestamp) => Date.now() - timestamp < 15 * 60 * 1000);

  if (attempts.length >= 8) {
    LOGIN_ATTEMPTS.set(key, attempts);
    return html(render.adminLogin({ origin: getOrigin(request), error: "Too many login attempts. Try again later." }), { status: 429 });
  }

  const form = Object.fromEntries((await request.formData()).entries());
  const password = String(form.password || "").trim();

  if (password !== env.ADMIN_PASSWORD) {
    attempts.push(Date.now());
    LOGIN_ATTEMPTS.set(key, attempts);
    return html(render.adminLogin({ origin: getOrigin(request), error: "Incorrect password." }), { status: 401 });
  }

  LOGIN_ATTEMPTS.delete(key);
  return redirect("/admin", 303, {
    "Set-Cookie": adminCookieValue(secret, request, true),
  });
}

async function handleAdminLogout(request, env) {
  return redirect("/", 303, {
    "Set-Cookie": adminCookieValue(env.ADMIN_SESSION_SECRET, request, false),
  });
}

async function handleAdminPage(request, env) {
  const origin = getOrigin(request);
  if (!isAdminAuthenticated(request, env.ADMIN_SESSION_SECRET)) {
    return html(render.adminLogin({ origin }), { status: 200 });
  }

  const leads = await loadLeads(env);
  return html(
    render.adminDashboard({
      origin,
      leads,
      total: leads.length,
    })
  );
}

async function handleRoutes(request, env) {
  const url = new URL(request.url);
  const pathname = normalizePathname(url.pathname);
  const origin = getOrigin(request);

  if (pathname === "/" || pathname === "/index") {
    return html(render.home({ origin }));
  }

  if (pathname === "/contact") {
    return html(render.contact({ origin }));
  }

  if (pathname === "/thank-you") {
    return html(render.thankYou({ origin, name: url.searchParams.get("name") || "" }));
  }

  if (pathname === "/privacy") {
    return html(render.privacy({ origin }));
  }

  if (pathname === "/terms") {
    return html(render.terms({ origin }));
  }

  if (pathname === "/admin" && request.method === "GET") {
    return handleAdminPage(request, env);
  }

  if (pathname === "/admin/login" && request.method === "POST") {
    return handleAdminLogin(request, env);
  }

  if (pathname === "/admin/logout" && request.method === "POST") {
    return handleAdminLogout(request, env);
  }

  if (pathname === "/api/health" && request.method === "GET") {
    return json({ ok: true });
  }

  if (pathname === "/api/lead" && request.method === "POST") {
    return handleLead(request, env);
  }

  if (pathname === "/api/admin/leads" && request.method === "GET") {
    if (!isAdminAuthenticated(request, env.ADMIN_SESSION_SECRET)) {
      return json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const leads = await loadLeads(env);
    return json({
      ok: true,
      total: leads.length,
      leads: leads.slice(0, 50),
    });
  }

  if (pathname.startsWith("/api/admin/leads/") && request.method === "DELETE") {
    if (!isAdminAuthenticated(request, env.ADMIN_SESSION_SECRET)) {
      return json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const leadId = decodeURIComponent(pathname.slice("/api/admin/leads/".length)).trim();
    if (!leadId) {
      return json({ ok: false, error: "Missing lead id." }, { status: 400 });
    }

    const deleted = await deleteLead(env, leadId);
    if (!deleted) {
      return json({ ok: false, error: "Lead not found." }, { status: 404 });
    }

    return json({ ok: true });
  }

  if (pathname === "/robots.txt") {
    return text(render.robots({ origin, site }));
  }

  if (pathname === "/sitemap.xml") {
    return new Response(render.sitemap({ origin, site }), {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return html(render.notFound({ origin }));
}

module.exports = {
  onRequest: handleRoutes,
};
