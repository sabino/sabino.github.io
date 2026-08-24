# Sabino Software website

Static bilingual website for [sabino.pro](https://sabino.pro), designed to run directly on GitHub Pages without a build step.

Readable CSS and JavaScript live in `assets/css/site.css` and `assets/js/site.js`; the HTML loads their checked-in minified counterparts so GitHub Pages remains build-free.

## Local preview

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173/` for English or `http://localhost:4173/pt/` for Portuguese. The journal routes are available at `/blog/` and `/pt/blog/`.

The contact form uses the separate Cloudflare Worker in `contact-worker/`. Its recipient, sender, and Turnstile secret are Cloudflare secrets and are never included in the static site or repository.

```bash
cd contact-worker
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

The example uses Cloudflare's official always-pass development keys. Production accepts only the live domains configured in `wrangler.jsonc`; its real Turnstile secret and optional notification addresses remain Worker secrets.

## Analytics

Umami provides privacy-focused pageview and interaction analytics through `umami.sabino.pro`. The tracker is restricted to the production `sabino.pro` hostname so local previews do not contaminate reports.

`assets/js/analytics.js` classifies link and button interactions into navigation, contact, project, journal, social, language, and outbound events. Contact-form stages are tracked separately. Event data intentionally excludes form values, user identifiers, and URL query strings.

## Deployment model

- GitHub Pages serves the repository root.
- `.nojekyll` keeps the build deterministic and preserves static subpaths.
- `CNAME`, `.well-known/`, and `one-click-apps/` are intentionally retained.
- Other project sites under `sabino.pro/<project>/` are published from their own repositories and are not duplicated here.
- `contact.sabino.pro` receives contact-form submissions, validates Turnstile server-side, rate-limits requests, and stores accepted messages in D1 before any optional notification is attempted.

## Visual asset provenance

- `hero-systems-topology.webp` was generated specifically for this site with OpenAI image generation, then optimized locally for web delivery.
- `capability-systems-mesh.webp` was generated specifically for the capability grid with OpenAI image generation, using the hero artwork only as a visual-style reference, then optimized locally for web delivery.
- Project screenshots come from the corresponding public repositories, published project pages, and the Chrome Web Store listing for BigQuery Cost Estimator.
- Workshop previews are derived from Felipe Sabino's public 2024 and 2025 workshop materials.
- The founder portrait was provided directly by Felipe Sabino for this site.
- Current company marks come from the organizations' own public assets; discontinued identities were recovered from archived versions of their official sites.
- Company marks are shown only as a factual representation of Felipe Sabino's career history; the site explicitly states that no endorsement is implied.
