# 5 Star Home Buyers

A conversion-focused, fully responsive lead-generation website built for a service business. The default copy is tuned for a home-buying brand, but the structure is easy to adapt for real estate, moving, home services, consulting, or local lead generation.

## What is included

- Landing page / homepage
- Contact page
- Thank-you page
- Privacy policy and terms pages
- Mobile sticky CTA
- Working lead form with validation
- Local backend storage for submissions
- SEO metadata, OG tags, schema markup, and sitemap
- Reusable content config for easy branding edits

## Run locally

No install step is required because the app uses only built-in Node.js modules.

If `node` is on your PATH:

```powershell
$env:ADMIN_PASSWORD = "your-strong-password"
$env:ADMIN_SESSION_SECRET = "your-long-random-secret"
node server.js
```

If you need to use the bundled runtime in this workspace:

```powershell
$env:ADMIN_PASSWORD = "your-strong-password"
$env:ADMIN_SESSION_SECRET = "your-long-random-secret"
& 'C:\Users\barke\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' server.js
```

Then open:

- `http://localhost:3000`
- `http://localhost:3000/contact`
- `http://localhost:3000/thank-you`

## Cloudflare upload

This repo is now set up for **Cloudflare Pages + Pages Functions**.

Use this setup if you want the form and admin dashboard to work on Cloudflare:

- Static assets live in `public/`
- Dynamic pages and APIs live in `functions/[[path]].js`
- Lead submissions are stored in Cloudflare D1

Cloudflare Pages supports Functions for server-side code, environment variables for secrets, and direct upload for prebuilt assets.

For a real launch, set these secrets in Cloudflare:

- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

You also need a D1 database binding named `DB`.

Create the `leads` table with the SQL in [`migrations/0001_create_leads.sql`](./migrations/0001_create_leads.sql).

If you are using Wrangler, the D1 flow is:

```powershell
npx wrangler d1 create leads
npx wrangler d1 migrations apply leads
```

Upload command:

```powershell
npm run cf:deploy
```

That uses `wrangler pages deploy public` under the hood.

If you have not created a Pages project yet, run:

```powershell
npx wrangler pages project create
```

Important:

- A plain drag-and-drop upload will not compile the `functions/` folder.
- Use Wrangler deploy or Git integration for the full version.
- The old `server.js` file is only for local Node development now.

## Where to edit

- Brand copy, phone, email, service options, testimonials, and trust messaging: [`src/content/site.js`](./src/content/site.js)
- Page rendering and reusable sections: [`src/render.js`](./src/render.js)
- Styling and responsive layout: [`public/styles.css`](./public/styles.css)
- Form behavior, reveal animations, and analytics hook placeholders: [`public/app.js`](./public/app.js)
- Logo asset: [`public/assets/logo.png`](./public/assets/logo.png)

## Lead form flow

Submissions POST to `/api/lead` and are saved in D1.

The backend is intentionally simple so it can later be connected to:

- Email notifications
- CRM webhooks
- Zapier / Make / n8n
- Calendar booking workflows

## Before launch

Replace these placeholder items with real business details:

- Phone number
- Email address
- Service area
- Reviews and testimonials
- Booking link
- Privacy policy and terms copy
- Any claims about response time, years in business, or guarantees

For the local Node server or any Cloudflare-compatible backend, set these environment variables before starting the app:

- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

For Cloudflare Pages, add the `DB` binding for your D1 database and set the same secrets in Pages project settings.

## Notes on conversion strategy

The site follows patterns that showed up repeatedly in successful competitor pages:

- Clear benefit-led hero copy
- Immediate CTA placement
- Repeated trust signals
- Short form with minimal friction
- FAQ near the final CTA
- Mobile-first contact options

## Competitor research summary

The strongest patterns observed in HomeGo, HomeVestors, Offerpad, Opendoor, and Thumbtack were:

- Lead with speed, certainty, or convenience instead of generic branding
- Put the CTA above the fold and repeat it throughout the page
- Keep the first form short and focused
- Show proof early, then again near the contact section
- Answer common objections in a concise FAQ
- Make the mobile experience fast, simple, and call-friendly
