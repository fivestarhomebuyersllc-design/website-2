const site = require("./content/site");

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildCanonical(origin, pathname = "/") {
  return `${origin.replace(/\/$/, "")}${pathname}`;
}

function renderOpenGraph({ origin, title, description, pathname = "/" }) {
  const canonical = buildCanonical(origin, pathname);
  const image = `${origin.replace(/\/$/, "")}/og-image.svg`;
  return `
    <link rel="canonical" href="${esc(canonical)}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${esc(canonical)}">
    <meta property="og:image" content="${esc(image)}">
    <meta name="twitter:card" content="summary_large_image">
  `;
}

function renderBusinessSchema(origin) {
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "RealEstateAgent",
      name: site.businessName,
      url: buildCanonical(origin, "/"),
      telephone: site.phoneHref.replace(/^tel:/, ""),
      email: site.emailDisplay,
      areaServed: site.serviceArea,
    },
    null,
    0
  );
}

function renderFaqSchema(origin, faqs) {
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
      url: buildCanonical(origin, "/"),
    },
    null,
    0
  );
}

function pageShell({
  origin,
  title,
  description,
  pathname = "/",
  bodyClass = "",
  content = "",
  extraHead = "",
  robots = "index,follow,max-image-preview:large",
  includeFaqSchema = false,
}) {
  const schemaScripts = [
    `<script type="application/ld+json">${renderBusinessSchema(origin)}</script>`,
    includeFaqSchema ? `<script type="application/ld+json">${renderFaqSchema(origin, site.faqs)}</script>` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#161311">
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="${esc(robots)}">
  <title>${esc(title)}</title>
  ${renderOpenGraph({ origin, title, description, pathname })}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/styles.css">
  ${extraHead}
  ${schemaScripts}
</head>
<body class="${esc(bodyClass)}">
  ${content}
  ${renderAdminCorner()}
  <script defer src="/app.js"></script>
</body>
</html>`;
}

function renderHeader(active = "") {
  const navItems = [
    { label: "Home", href: "/" },
    { label: "Services", href: "/#services" },
    { label: "Process", href: "/#process" },
    { label: "FAQ", href: "/#faq" },
    { label: "Contact", href: "/contact" },
  ];

  return `
    <header class="site-header">
      <div class="container header-inner">
        <a class="brand" href="/" aria-label="${esc(site.businessName)} home">
          <img src="/assets/logo.png" alt="${esc(site.businessName)} logo" class="brand-mark">
          <div class="brand-copy">
            <span class="brand-name">${esc(site.businessName)}</span>
            <span class="brand-tagline">${esc(site.tagline)}</span>
          </div>
        </a>
        <nav class="site-nav" aria-label="Primary">
          ${navItems
            .map((item) => {
              const isActive = active && item.href === active;
              const aria = isActive ? ' aria-current="page"' : "";
              return `<a href="${item.href}"${aria}>${esc(item.label)}</a>`;
            })
            .join("")}
        </nav>
        <div class="header-actions">
          <a class="button button--ghost" href="${site.phoneHref}" data-track="call_header">Call us</a>
          <a class="button button--primary" href="/contact" data-track="quote_header">${esc(site.primaryCta)}</a>
        </div>
      </div>
    </header>
  `;
}

function renderMobileCta() {
  return `
    <div class="mobile-cta" aria-label="Quick contact actions">
      <a class="button button--ghost button--full" href="${site.phoneHref}" data-track="call_mobile">Call</a>
      <a class="button button--primary button--full" href="${site.bookingHref}" data-track="quote_mobile">${esc(site.primaryCta)}</a>
    </div>
  `;
}

function renderSectionHeading(eyebrow, title, text = "") {
  return `
    <div class="section-heading reveal">
      <p class="eyebrow">${esc(eyebrow)}</p>
      <h2>${esc(title)}</h2>
      ${text ? `<p class="section-copy">${esc(text)}</p>` : ""}
    </div>
  `;
}

function renderStats() {
  return `
    <section class="section section--stats" id="trust">
      <div class="container">
        <div class="stat-grid">
          ${site.trustStats
            .map(
              (stat) => `
              <div class="stat-block reveal">
                <span class="stat-value">${esc(stat.value)}</span>
                <strong class="stat-label">${esc(stat.label)}</strong>
                <p>${esc(stat.note)}</p>
              </div>
            `
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderTestimonials() {
  const reviewCount = site.testimonials.length;
  return `
    <section class="section" id="reviews">
      <div class="container">
        <div class="testimonial-header">
          ${renderSectionHeading(
            "Social proof",
            "Words from homeowners who wanted a simpler way forward",
            "A few quick notes from sellers who just wanted a fair, easy next step."
          )}
          <div class="testimonial-meta">
            <span class="testimonial-badge">${reviewCount} homeowner stories</span>
            <div class="testimonial-controls" aria-label="Review carousel controls">
              <button type="button" class="carousel-button" data-carousel-prev aria-label="Previous review">&#8592;</button>
              <button type="button" class="carousel-button" data-carousel-next aria-label="Next review">&#8594;</button>
            </div>
          </div>
        </div>
        <div class="testimonial-grid" data-testimonials-carousel tabindex="0" aria-label="Homeowner reviews carousel">
          ${site.testimonials
            .map(
              (review) => `
              <blockquote class="testimonial reveal">
                <p>"${esc(review.quote)}"</p>
                <footer>
                  <strong>${esc(review.name)}</strong>
                  <span>${esc(review.detail)}</span>
                </footer>
              </blockquote>
            `
            )
            .join("")}
        </div>
        <p class="testimonial-hint">Use the arrows to move through the stories, or swipe on mobile.</p>
      </div>
    </section>
  `;
}

function renderServices() {
  return `
    <section class="section section--alt" id="services">
      <div class="container">
        ${renderSectionHeading(
          "Services",
          "What sellers usually care about first",
          "Keep the focus on the basics people want to know before they reach out."
        )}
        <div class="service-list" role="list">
          ${site.services
            .map(
              (service, index) => `
              <article class="service-item reveal" role="listitem">
                <div class="service-index">0${index + 1}</div>
                <div>
                  <h3>${esc(service.title)}</h3>
                  <p>${esc(service.description)}</p>
                </div>
              </article>
            `
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderProcess() {
  return `
    <section class="section" id="process">
      <div class="container">
        ${renderSectionHeading(
          "How it works",
          "Three simple steps",
          "A clear process helps people know what happens next."
        )}
        <div class="process-grid">
          ${site.howItWorks
            .map(
              (step, index) => `
              <article class="process-step reveal">
                <div class="process-step__number">0${index + 1}</div>
                <h3>${esc(step.title)}</h3>
                <p>${esc(step.description)}</p>
              </article>
            `
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderReasons() {
  return `
    <section class="section section--alt">
      <div class="container reason-layout">
        <div class="reason-copy reveal">
        ${renderSectionHeading(
          "Why choose us",
          "Why people choose this route",
          "Less hassle, fewer surprises, and a clearer next move."
        )}
        </div>
        <ul class="reason-list">
          ${site.reasons
            .map(
              (reason) => `
              <li class="reason-item reveal">
                <span class="reason-dot" aria-hidden="true"></span>
                <span>${esc(reason)}</span>
              </li>
            `
            )
            .join("")}
        </ul>
      </div>
    </section>
  `;
}

function renderFaq() {
  return `
    <section class="section" id="faq">
      <div class="container">
        ${renderSectionHeading(
          "FAQ",
          "Questions people ask before they reach out",
          "Short answers help people feel comfortable taking the next step."
        )}
        <div class="faq-list">
          ${site.faqs
            .map(
              (faq) => `
              <details class="faq-item reveal">
                <summary>${esc(faq.question)}</summary>
                <div class="faq-answer">
                  <p>${esc(faq.answer)}</p>
                </div>
              </details>
            `
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderForm({ id = "contact-form", context = "home", heading = "Get your offer", eyebrow = "Get started", buttonLabel = site.primaryCta }) {
  const options = site.serviceOptions
    .map((option) => `<option value="${esc(option)}">${esc(option)}</option>`)
    .join("");

  return `
    <form class="lead-form reveal" id="${id}" data-lead-form action="/api/lead" method="post" novalidate>
      <input type="hidden" name="formType" value="full-lead">
      <input type="hidden" name="source" value="${esc(context)}">
      <input type="hidden" name="pagePath" value="${esc(context)}">
      <input type="hidden" name="startedAt" value="${Date.now()}">
      <label class="sr-only" for="${id}-website">Website</label>
      <input class="honeypot" id="${id}-website" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">

      <div class="form-head">
        <p class="eyebrow">${esc(eyebrow)}</p>
        <h3>${esc(heading)}</h3>
        <p>${esc(site.contactIntro)}</p>
      </div>

      <div class="field-grid">
        <div class="field">
          <label for="${id}-name">Name</label>
          <input id="${id}-name" name="name" type="text" placeholder="Your name" required autocomplete="name">
        </div>
        <div class="field">
          <label for="${id}-email">Email</label>
          <input id="${id}-email" name="email" type="email" placeholder="you@example.com" required autocomplete="email">
        </div>
        <div class="field">
          <label for="${id}-phone">Phone</label>
          <input id="${id}-phone" name="phone" type="tel" placeholder="(555) 123-4567" required autocomplete="tel">
        </div>
        <div class="field">
          <label for="${id}-address">Address</label>
          <input id="${id}-address" name="address" type="text" placeholder="Street address" required autocomplete="street-address">
        </div>
        <div class="field">
          <label for="${id}-service">Service needed</label>
          <select id="${id}-service" name="serviceNeeded" required>
            <option value="" selected disabled>Select a service</option>
            ${options}
          </select>
        </div>
        <div class="field field--full">
          <label for="${id}-message">Message</label>
          <textarea id="${id}-message" name="message" placeholder="Tell us a little about your situation or timeline." required></textarea>
        </div>
      </div>

      <div class="form-footer">
        <button class="button button--primary button--full" type="submit" data-track="submit_form">${esc(buttonLabel)}</button>
        <p class="form-note">A few protections stay in place so the form stays clean and useful.</p>
      </div>

      <p class="form-status" data-form-status aria-live="polite"></p>
    </form>
  `;
}

function renderQuickContactForm() {
  return `
    <form class="lead-form lead-form--compact reveal" id="quick-contact-form" data-lead-form action="/api/lead" method="post" novalidate>
      <input type="hidden" name="formType" value="direct-contact">
      <input type="hidden" name="source" value="direct-contact">
      <input type="hidden" name="pagePath" value="direct-contact">
      <input type="hidden" name="startedAt" value="${Date.now()}">
      <label class="sr-only" for="quick-contact-form-website">Website</label>
      <input class="honeypot" id="quick-contact-form-website" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">

      <div class="form-head">
        <p class="eyebrow">Direct contact</p>
        <h3>Answers when you reach out</h3>
        <p>${esc(site.responsePromise)}. Share your email, phone number, and address so we can follow up quickly.</p>
      </div>

      <div class="field-grid">
        <div class="field">
          <label for="quick-contact-form-name">Name</label>
          <input id="quick-contact-form-name" name="name" type="text" placeholder="Your name" required autocomplete="name">
        </div>
        <div class="field">
          <label for="quick-contact-form-email">Email</label>
          <input id="quick-contact-form-email" name="email" type="email" placeholder="you@example.com" required autocomplete="email">
        </div>
        <div class="field">
          <label for="quick-contact-form-phone">Phone</label>
          <input id="quick-contact-form-phone" name="phone" type="tel" placeholder="(555) 123-4567" required autocomplete="tel">
        </div>
        <div class="field field--full">
          <label for="quick-contact-form-address">Address</label>
          <input id="quick-contact-form-address" name="address" type="text" placeholder="Street address" required autocomplete="street-address">
        </div>
      </div>

      <div class="form-footer">
        <button class="button button--primary button--full" type="submit" data-track="submit_direct_contact">Send Request</button>
        <p class="form-note">If you'd rather talk now, the call button is right below.</p>
      </div>

      <p class="form-status" data-form-status aria-live="polite"></p>
    </form>
  `;
}

function renderContactAside() {
  return `
    <aside class="contact-aside reveal">
      <div class="contact-panel">
        ${renderQuickContactForm()}
        <a class="button button--ghost button--full" href="${site.phoneHref}" data-track="call_aside">Call us</a>
      </div>
    </aside>
  `;
}

function renderFinalCta() {
  return `
    <section class="section final-cta">
      <div class="container final-cta__inner reveal">
        <div>
          <p class="eyebrow">Ready when you are</p>
          <h2>Stop Waiting. Start Moving On.</h2>
          <p>Sell your house fast without agents, fees, or stress.</p>
        </div>
        <div class="cta-row">
          <a class="button button--primary" href="/contact" data-track="final_quote">${esc(site.primaryCta)}</a>
          <a class="button button--ghost" href="${site.bookingHref}" data-track="final_book">${esc(site.secondaryCta)}</a>
        </div>
      </div>
    </section>
  `;
}

function renderFooter(origin) {
  const year = new Date().getFullYear();
  return `
    <footer class="site-footer">
      <div class="container footer-grid">
        <div>
          <a class="brand brand--footer" href="/">
            <img src="/assets/logo.png" alt="${esc(site.businessName)} logo" class="brand-mark">
            <div class="brand-copy">
              <span class="brand-name">${esc(site.businessName)}</span>
              <span class="brand-tagline">${esc(site.tagline)}</span>
            </div>
          </a>
          <p class="footer-copy">${esc(site.footerNote)}</p>
        </div>
        <div>
          <h3>Contact</h3>
          <ul class="footer-links">
            <li><a href="${site.phoneHref}">${esc(site.phoneDisplay)}</a></li>
            <li><a href="${site.emailHref}">${esc(site.emailDisplay)}</a></li>
            <li><a href="/contact">Contact page</a></li>
            <li><a href="/#faq">FAQ</a></li>
          </ul>
        </div>
        <div>
          <h3>Legal</h3>
          <ul class="footer-links">
            <li><a href="/privacy">Privacy Policy</a></li>
            <li><a href="/terms">Terms of Service</a></li>
          </ul>
        </div>
      </div>
      <div class="container footer-meta">
        <span>&copy; ${year} ${esc(site.businessName)}. All rights reserved.</span>
        <span>Made to feel easy from the first click to the last step.</span>
      </div>
    </footer>
  `;
}

function renderAdminCorner() {
  return `<a class="admin-fab" href="/admin" aria-label="Open admin dashboard">Admin</a>`;
}

function heroSection(origin) {
  return `
    <section class="hero">
      <div class="container hero-grid">
        <div class="hero-copy reveal">
          <p class="eyebrow">${esc(site.businessName)}</p>
          <h1>${esc(site.headline)}</h1>
          <p class="hero-text">${esc(site.subheadline)}</p>
          <div class="cta-row">
            <a class="button button--primary" href="/contact" data-track="hero_quote">${esc(site.primaryCta)}</a>
            <a class="button button--ghost" href="${site.phoneHref}" data-track="hero_call">Call us</a>
          </div>
          <div class="hero-proof">
            <div>
              <strong>${esc(site.responsePromise)}</strong>
              <span>${esc(site.trustLine)}</span>
            </div>
            <div>
              <strong>Easy on phones</strong>
              <span>Everything stays simple to read and tap while you scroll.</span>
            </div>
          </div>
          <ul class="hero-bullets">
            ${site.heroBullets.map((bullet) => `<li>${esc(bullet)}</li>`).join("")}
          </ul>
        </div>
        <div class="hero-visual reveal">
          <div class="hero-visual__panel">
            <div class="hero-logo-card">
              <img src="/assets/logo-hero-clean.png" alt="${esc(site.businessName)} logo">
            </div>
            <div class="hero-visual__content">
              <p class="eyebrow">${esc(site.trustLine)}</p>
              <h2>You choose the closing date.</h2>
              <p>We handle the rest.</p>
            </div>
            <div class="hero-visual__list">
              <div><strong>No fees</strong><span>No repairs</span></div>
              <div><strong>Fast offers</strong><span>Fair cash</span></div>
              <div><strong>60 seconds</strong><span>To get started</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function home({ origin }) {
  const title = `${site.businessName} | ${site.headline}`;
  const description = site.subheadline;

  return pageShell({
    origin,
    title,
    description,
    bodyClass: "page page-home",
    robots: "index,follow,max-image-preview:large",
    content: `
      ${renderHeader("/")}
      <main>
        ${heroSection(origin)}
        ${renderStats()}
        ${renderTestimonials()}
        ${renderServices()}
        ${renderProcess()}
        ${renderReasons()}
        ${renderFaq()}
        <section class="section section--contact" id="contact-form">
          <div class="container contact-shell">
            <div class="contact-copy reveal">
              <p class="eyebrow">Get in touch</p>
              <h2>A short path to a real conversation</h2>
              <p>${esc(site.contactIntro)}</p>
              <ul class="contact-highlights">
                <li>It only takes a minute to send.</li>
                <li>We'll have the details ready when we reach out.</li>
                <li>We keep the form simple so it's easy to finish.</li>
              </ul>
            </div>
            <div class="contact-grid">
              ${renderForm({ context: "home", heading: "Get your offer", buttonLabel: site.primaryCta })}
              ${renderContactAside()}
            </div>
          </div>
        </section>
        ${renderFinalCta()}
      </main>
      ${renderMobileCta()}
      ${renderFooter(origin)}
    `,
    includeFaqSchema: true,
  });
}

function contact({ origin }) {
  const title = `${site.businessName} | Contact`;
  const description = "Contact the team, request a quote, or book a call.";
  return pageShell({
    origin,
    title,
    description,
    pathname: "/contact",
    bodyClass: "page page-contact",
    robots: "index,follow,max-image-preview:large",
    content: `
      ${renderHeader("/contact")}
      <main>
        <section class="hero hero--contact">
          <div class="container hero-grid hero-grid--contact">
            <div class="hero-copy reveal">
              <p class="eyebrow">Contact</p>
              <h1>Start the conversation with one short form.</h1>
              <p class="hero-text">${esc(site.contactIntro)}</p>
              <div class="cta-row">
                <a class="button button--primary" href="#contact-form" data-track="contact_quote">${esc(site.primaryCta)}</a>
                <a class="button button--ghost" href="${site.phoneHref}" data-track="contact_call">Call us</a>
              </div>
            </div>
            ${renderContactAside()}
          </div>
        </section>
        <section class="section" id="contact-form">
          <div class="container contact-grid contact-grid--single">
            ${renderForm({ context: "contact", heading: "Tell us what you need", buttonLabel: site.primaryCta })}
          </div>
        </section>
        ${renderFinalCta()}
      </main>
      ${renderMobileCta()}
      ${renderFooter(origin)}
    `,
  });
}

function thankYou({ origin, name }) {
  const title = `${site.businessName} | Thank You`;
  const description = "Your submission has been received.";
  const safeName = name ? `, ${esc(name)}` : "";

  return pageShell({
    origin,
    title,
    description,
    pathname: "/thank-you",
    bodyClass: "page page-thank-you",
    robots: "noindex,nofollow",
    content: `
      ${renderHeader("/")}
      <main>
        <section class="thank-you">
          <div class="container thank-you__inner reveal">
            <p class="eyebrow">Confirmation</p>
            <h1>Thanks${safeName}. Your request is in.</h1>
            <p>We've received your request. The next step is for us to contact you, confirm the details, and talk through what happens next.</p>
            <div class="cta-row">
              <a class="button button--primary" href="${site.phoneHref}" data-track="thankyou_call">Call us</a>
              <a class="button button--ghost" href="${site.bookingHref}" data-track="thankyou_book">${esc(site.secondaryCta)}</a>
            </div>
            <div class="thank-you__steps">
              <div>
                <strong>1. We review your request</strong>
                <span>We look over the details and get ready to reach out.</span>
              </div>
              <div>
                <strong>2. We reach out</strong>
                <span>We use your preferred contact details to follow up quickly.</span>
              </div>
              <div>
                <strong>3. We take the next step</strong>
                <span>That might be a call, an offer, or a time that works for you.</span>
              </div>
            </div>
          </div>
        </section>
        ${renderFinalCta()}
      </main>
      ${renderMobileCta()}
      ${renderFooter(origin)}
    `,
  });
}

function privacy({ origin }) {
  return pageShell({
    origin,
    title: `${site.businessName} | Privacy Policy`,
    description: "Privacy policy for 5 Star Home Buyers.",
    pathname: "/privacy",
    bodyClass: "page page-legal",
    robots: "index,follow,max-image-preview:large",
    content: `
      ${renderHeader("")}
      <main class="legal-page">
        <section class="section">
          <div class="container legal-content reveal">
            <p class="eyebrow">Privacy Policy</p>
            <h1>Privacy policy</h1>
            <p>This policy explains how we collect and use information when someone visits the site or submits a lead form.</p>
            <h2>Information we collect</h2>
            <p>We may collect the details you submit through forms, including your name, email address, phone number, property address, and message. We also receive basic technical information such as browser type and IP address for security and troubleshooting.</p>
            <h2>How we use it</h2>
            <p>We use this information to respond to inquiries, qualify leads, improve the website, and communicate about your request. If you ask us to, we may also use it to send a follow-up message or confirm a booking.</p>
            <h2>How we share it</h2>
            <p>We do not sell your personal information. We may share it with service providers that help us run the website, store data, or deliver messages on our behalf.</p>
            <h2>Your choices</h2>
            <p>You can contact us at any time to request updates or removal of your information, subject to any legal or business records we need to keep.</p>
            <h2>Contact</h2>
            <p>Questions about privacy can be sent to <a href="${site.emailHref}">${esc(site.emailDisplay)}</a>.</p>
          </div>
        </section>
      </main>
      ${renderFooter(origin)}
    `,
  });
}

function terms({ origin }) {
  return pageShell({
    origin,
    title: `${site.businessName} | Terms of Service`,
    description: "Terms of service for 5 Star Home Buyers.",
    pathname: "/terms",
    bodyClass: "page page-legal",
    robots: "index,follow,max-image-preview:large",
    content: `
      ${renderHeader("")}
      <main class="legal-page">
        <section class="section">
          <div class="container legal-content reveal">
            <p class="eyebrow">Terms</p>
            <h1>Terms of service</h1>
            <p>These terms explain the basic rules for using the website and submitting a request for service.</p>
            <h2>Use of the site</h2>
            <p>You may browse the site and submit information only for lawful, legitimate business inquiries.</p>
            <h2>Lead submissions</h2>
            <p>Submitting a form does not create a contract, obligation, or guarantee of service. Any transaction or agreement is only confirmed directly by the business.</p>
            <h2>Information accuracy</h2>
            <p>Please provide accurate contact and property information so we can respond appropriately.</p>
            <h2>Changes</h2>
            <p>We may update these terms from time to time. The version shown on the website is the current one.</p>
            <h2>Questions</h2>
            <p>Contact <a href="${site.emailHref}">${esc(site.emailDisplay)}</a> with questions about these terms.</p>
          </div>
        </section>
      </main>
      ${renderFooter(origin)}
    `,
  });
}

function notFound({ origin }) {
  return pageShell({
    origin,
    title: `${site.businessName} | Page Not Found`,
    description: "The requested page could not be found.",
    pathname: "/404",
    bodyClass: "page page-not-found",
    robots: "noindex,nofollow",
    content: `
      ${renderHeader("")}
      <main class="legal-page">
        <section class="section">
          <div class="container legal-content reveal">
            <p class="eyebrow">404</p>
            <h1>Page not found</h1>
            <p>The page you requested does not exist. Use the links below to continue.</p>
            <div class="cta-row">
              <a class="button button--primary" href="/">Home</a>
              <a class="button button--ghost" href="/contact">Contact</a>
            </div>
          </div>
        </section>
      </main>
      ${renderFooter(origin)}
    `,
  });
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
          <td>${esc(lead.submittedAt ? new Date(lead.submittedAt).toLocaleString() : lead.createdAt ? new Date(lead.createdAt).toLocaleString() : "")}</td>
          <td>${esc(lead.name || "")}</td>
          <td><a href="mailto:${esc(lead.email || "")}">${esc(lead.email || "")}</a></td>
          <td><a href="tel:${esc(lead.phone || "")}">${esc(lead.phone || "")}</a></td>
          <td>${esc(lead.address || "")}</td>
          <td>${esc(lead.serviceNeeded || "")}</td>
          <td class="admin-actions-cell">
            <button
              type="button"
              class="button button--danger button--tiny admin-delete-button"
              data-delete-lead
              data-lead-id="${esc(lead.id || "")}"
              data-lead-name="${esc(lead.name || "this lead")}"
              aria-label="Delete lead"
            >
              <span class="admin-delete-mark" aria-hidden="true">X</span>
              <span>Delete</span>
            </button>
          </td>
        </tr>
        <tr class="admin-message-row">
          <td colspan="7">
            <strong>Message:</strong> ${esc(lead.message || "")}
          </td>
        </tr>
      `
    )
    .join("");
}

function adminLogin({ origin, error = "" }) {
  return pageShell({
    origin,
    title: `${site.businessName} | Admin`,
    description: "Password-protected admin login.",
    pathname: "/admin",
    bodyClass: "page page-admin",
    robots: "noindex,nofollow",
    content: `
      ${renderHeader("")}
      <main class="admin-page">
        <section class="section">
          <div class="container admin-shell reveal">
            <div class="admin-card">
              <p class="eyebrow">Admin</p>
              <h1>Enter the password</h1>
              <p>Use this page to view submissions directly on the site.</p>
              ${error ? `<p class="admin-error">${esc(error)}</p>` : ""}
              <form class="admin-login" method="post" action="/admin/login">
                <label for="admin-password">Password</label>
                <input id="admin-password" name="password" type="password" autocomplete="current-password" required>
                <button class="button button--primary" type="submit">Open dashboard</button>
              </form>
            </div>
          </div>
        </section>
      </main>
      ${renderFooter(origin)}
    `,
  });
}

function adminDashboard({ origin, leads, total }) {
  const rows = renderLeadRows(leads);
  return pageShell({
    origin,
    title: `${site.businessName} | Admin Dashboard`,
    description: "Lead dashboard",
    pathname: "/admin",
    bodyClass: "page page-admin",
    robots: "noindex,nofollow",
    content: `
      ${renderHeader("")}
      <main class="admin-page">
        <section class="section">
          <div class="container admin-shell reveal" data-admin-dashboard data-admin-endpoint="/api/admin/leads">
            <div class="admin-topbar">
              <div>
            <p class="eyebrow">Admin dashboard</p>
                <h1>New requests</h1>
                <p><span data-admin-total>${esc(String(total))}</span> requests stored locally.</p>
              </div>
              <form method="post" action="/admin/logout">
                <button class="button button--ghost" type="submit">Log out</button>
              </form>
            </div>

            <div class="admin-stats">
              <div>
                <strong data-admin-total-count>${esc(String(total))}</strong>
                <span>Total requests</span>
              </div>
              <div>
                <strong data-admin-most-recent>${esc(String(leads[0] ? leads[0].name : "None"))}</strong>
                <span>Most recent request</span>
              </div>
            </div>

            <div class="admin-table-wrap">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>Submitted at</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Address</th>
                    <th>Service</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody data-admin-table-body>${rows}</tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
      ${renderFooter(origin)}
    `,
  });
}

function serverError({ origin }) {
  return pageShell({
    origin,
    title: `${site.businessName} | Server Error`,
    description: "An unexpected error occurred.",
    pathname: "/500",
    bodyClass: "page page-error",
    robots: "noindex,nofollow",
    content: `
      ${renderHeader("")}
      <main class="legal-page">
        <section class="section">
          <div class="container legal-content reveal">
            <p class="eyebrow">Error</p>
            <h1>Something went wrong</h1>
            <p>Please try again. If the problem persists, check the server logs or submission backend.</p>
            <div class="cta-row">
              <a class="button button--primary" href="/">Home</a>
              <a class="button button--ghost" href="/contact">Contact</a>
            </div>
          </div>
        </section>
      </main>
      ${renderFooter(origin)}
    `,
  });
}

function formError({ origin, errors, previous }) {
  const safeErrors = errors.map((error) => `<li>${esc(error)}</li>`).join("");
  return pageShell({
    origin,
    title: `${site.businessName} | Form Error`,
    description: "The form needs a few corrections.",
    pathname: "/contact",
    bodyClass: "page page-error",
    robots: "noindex,nofollow",
    content: `
      ${renderHeader("/contact")}
      <main class="legal-page">
        <section class="section">
          <div class="container legal-content reveal">
            <p class="eyebrow">Form error</p>
            <h1>Please fix the highlighted fields</h1>
            <ul class="error-list">${safeErrors}</ul>
            <p>Use the button below to go back and submit again.</p>
            <div class="cta-row">
              <a class="button button--primary" href="/contact">Back to contact</a>
            </div>
            <pre class="hidden-debug">${esc(JSON.stringify(previous, null, 2))}</pre>
          </div>
        </section>
      </main>
      ${renderFooter(origin)}
    `,
  });
}

function robots({ origin }) {
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/admin/
Sitemap: ${buildCanonical(origin, "/sitemap.xml")}
`;
}

function sitemap({ origin }) {
  const urls = ["/", "/contact", "/thank-you", "/privacy", "/terms"]
    .map((pathname) => `  <url><loc>${buildCanonical(origin, pathname)}</loc></url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

module.exports = {
  home,
  contact,
  thankYou,
  privacy,
  terms,
  notFound,
  serverError,
  formError,
  adminLogin,
  adminDashboard,
  robots,
  sitemap,
};
