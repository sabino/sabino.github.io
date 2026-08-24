---
name: Sabino Software Field Dossier
description: An evidence-led technical field dossier for systems that have to work.
colors:
  field: "#080b0a"
  field-soft: "#0d1110"
  panel: "#111614"
  panel-raised: "#151b18"
  rule: "rgba(231, 241, 235, 0.14)"
  rule-strong: "rgba(231, 241, 235, 0.28)"
  paper: "#f3f7f3"
  muted: "#abb8b1"
  muted-strong: "#d0dad4"
  signal-lime: "#d8ff4f"
  telemetry-cyan: "#5de4e7"
  warning-amber: "#ffb454"
  error-coral: "#ff7b72"
typography:
  display:
    fontFamily: '"Archivo", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "clamp(4.4rem, 7vw, 6rem)"
    fontWeight: 770
    lineHeight: 0.88
    letterSpacing: "-0.04em"
  headline:
    fontFamily: '"Archivo", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "clamp(2.65rem, 5vw, 5.1rem)"
    fontWeight: 650
    lineHeight: 0.96
    letterSpacing: "-0.06em"
  title:
    fontFamily: '"Archivo", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "clamp(1.75rem, 3.6vw, 3.15rem)"
    fontWeight: 580
    lineHeight: 1.07
    letterSpacing: "-0.05em"
  body:
    fontFamily: '"Archivo", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: '"SFMono-Regular", "Cascadia Code", "Roboto Mono", Consolas, monospace'
    fontSize: "0.72rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "0.04em"
rounded:
  square: "0"
  contact: "2px"
  control: "10px"
  surface: "18px"
  large: "30px"
  pill: "999px"
spacing:
  micro: "6px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "clamp(88px, 11vw, 152px)"
components:
  button-primary:
    backgroundColor: "{colors.signal-lime}"
    textColor: "{colors.field}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px 17px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "#e4ff78"
    textColor: "{colors.field}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px 17px"
    height: "48px"
  button-secondary:
    backgroundColor: "rgba(13, 17, 16, 0.72)"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px 17px"
    height: "48px"
  dossier-tab:
    backgroundColor: "rgba(7, 11, 9, 0.76)"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "10px 15px"
    height: "58px"
  dossier-tab-selected:
    backgroundColor: "rgba(216, 255, 79, 0.05)"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "10px 15px"
    height: "58px"
  dossier-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.paper}"
    rounded: "0 0 30px 30px"
    padding: "clamp(36px, 5vw, 68px)"
  contact-field:
    backgroundColor: "rgba(255, 255, 255, 0.025)"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "10px 12px"
    height: "47px"
---

# Design System: Sabino Software Field Dossier

## Overview

**Creative North Star: "The Field Dossier"**

Sabino Software presents itself as a calm technical due-diligence file, not an agency brochure or generic SaaS dashboard. The interface lets a visitor understand the offer, inspect selected production evidence, see the operating method, and begin a high-context conversation. It is dense enough to reward technical scrutiny but disciplined enough to keep one unmistakable reading path.

The material world is a near-black matte systems field: precise hairline rules, faint engineering grids, restrained topology art, and i3-like terminal details. Off-white carries the argument. Acid lime marks action and selection; cyan marks telemetry, navigation, and focus. Glow is scarce and functional. The result should feel like an accountable engineer's working dossier rather than speculative futurism.

Lowercase editorial presentation is part of the identity, but it never overrides factual casing. Sabino Software, Sabino Software Ltda, Felipe Sabino, company names, AI, AWS, GCP, Azure, EC2, EKS, APIs, CDC, SQL, and other proper technical terms retain their official forms in both languages.

**Key Characteristics:**

- Evidence precedes service claims, and progressive disclosure keeps one technical file in focus.
- Near-black matte surfaces, exact rules, low-contrast grids, and controlled signal glow create depth without visual noise.
- Variable Archivo carries compressed, decisive display type; a system-monospace stack carries labels, controls, state, and telemetry.
- Lime means action or selected proof; cyan means system state, navigation, or focus.
- English and Brazilian Portuguese share one information architecture, interaction model, and level of care.
- Real artifacts, explicit maturity labels, confidentiality boundaries, and recorded provenance carry every claim.

### Asset boundary

The topology and capability meshes are commissioned, generated illustrations whose prompts and derivation are recorded in `.impeccable/asset-provenance.json` and adjacent asset sidecars. The founder portrait is user-provided. Project and workshop previews come from Felipe Sabino's public artifacts, and organization marks come from official public sources or archived official sites. Company marks identify factual career history only; they never imply endorsement of Sabino Software. Preserve source attribution, do not fabricate or redraw third-party marks, and give every shipping raster an auditable provenance record.

## Colors

The palette is a graphite technical field punctuated by two deliberately separate signals.

### Primary

- **Signal Lime** (`colors.signal-lime`): primary conversation actions, selected dossier underlines, emphasis inside key headlines, completion states, and tiny verification pulses. Its rarity gives it authority.

### Secondary

- **Telemetry Cyan** (`colors.telemetry-cyan`): focus rings, technical labels, language and recovery links, active telemetry, and navigation-adjacent state. It communicates system awareness rather than conversion priority.

### Tertiary

- **Warning Amber** (`colors.warning-amber`): bounded or restricted evidence metadata. It is documentary, never decorative.
- **Error Coral** (`colors.error-coral`): invalid fields and contact failures only.

### Neutral

- **Field Ink** (`colors.field`): page ground and the darkest backdrop.
- **Soft Field** (`colors.field-soft`): inset identity fields and low separation.
- **Dossier Panel** (`colors.panel`): the standard matte surface.
- **Raised Panel** (`colors.panel-raised`): hover or elevated control state.
- **Paper** (`colors.paper`): primary text and decisive labels.
- **Muted Copy** (`colors.muted`): secondary copy, captions, and inactive tabs.
- **Strong Muted Copy** (`colors.muted-strong`): body copy that must remain comfortably readable.
- **Rule / Strong Rule** (`colors.rule`, `colors.rule-strong`): ordinary and emphasized structure without bright containers.

**The Two-Signal Rule.** Lime answers “what can I do or what is selected?” Cyan answers “where am I, what has focus, or what is the system reporting?” Do not swap their roles.

**The Dark-Field Rule.** Increase hierarchy with paper, muted copy, rules, and tonal layering before adding a brighter surface.

**The Functional-Color Rule.** Amber and coral appear only when the content carries warning, restriction, invalidity, or failure semantics.

## Typography

**Display Font:** Archivo Variable, locally hosted, with the system sans-serif fallback in `typography.display`.

**Body Font:** Archivo Variable with the same fallback stack in `typography.body`.

**Label/Mono Font:** SFMono-Regular, Cascadia Code, Roboto Mono, Consolas, then monospace in `typography.label`.

**Character:** Archivo is stretched toward a compressed, high-density display voice while retaining a readable body. The monospaced layer makes controls and state feel operational; it must remain comfortably legible and never collapse into decorative micro-telemetry.

### Hierarchy

- **Display** (`typography.display`): the homepage promise. Keep its tight rhythm and deliberate line breaks; do not reuse it for routine cards.
- **Headline** (`typography.headline`): major section openings and founder/contact closes.
- **Title** (`typography.title`): dossier findings and other evidence-bearing statements.
- **Body** (`typography.body`): explanations and proof. Hero and section introductions may scale slightly above this role but should remain near a 620px readable measure.
- **Label** (`typography.label`): navigation, dossier indices, technology tags, status, dates, and controls. Labels are concise and functional.

**The Compressed-Not-Tiny Rule.** Create density with font stretch, weight, line height, and concise copy; never shrink essential labels into illegibility.

**The Casing-Is-Data Rule.** Lowercase the editorial interface where established, but preserve every official name, acronym, technology, and language-specific proper noun exactly.

**The One-Display-Voice Rule.** Archivo owns both display and body continuity. Monospace supports the dossier grammar; it does not replace prose.

## Layout

The desktop shell is capped at 1220px with 24px side gutters, narrowing to 16px at the mobile-navigation breakpoint. The fixed header is 78px tall on wide screens and 70px once navigation collapses. Sections use a generous fluid vertical rhythm (`spacing.section`) and hairline boundaries, allowing dense evidence to breathe without resorting to card-grid sprawl.

The first view is asymmetric: decisive offer and actions on the left, topology field through the middle, and a 390px operating brief on the right. The hero uses a 0.98 / 0.55 column relationship and a deliberately broad 110–205px inter-column gap. At 1080px and below, the hero becomes one column and the operating brief widens to a maximum of 650px beneath the offer.

### Evidence order

Keep the homepage sequence stable:

1. Fixed compact navigation.
2. Offer, topology field, and operating brief.
3. Career-history logo rail with the no-endorsement boundary.
4. Seven production dossier tabs with exactly one panel visible.
5. Contextual conversation action immediately after the dossiers.
6. Condensed capability ledger followed by Frame, Design, Build, Transfer.
7. Three representative systems-lab artifacts, with four more behind an explicit disclosure control.
8. Three journal/workshop entries.
9. Founder portrait, accountability statement, principles, and engagement modes.
10. Protected contact form and compact footer.

The seven tabs are fixed evidence slots:

1. **Transfeera** — named public production case.
2. **Nubank** — named public production case.
3. **Conta Azul** — named public production case.
4. **Consumer platform / Plataforma de dados** — identity-redacted consumer data-platform work.
5. **Automotive / Automotivo** — identity-redacted automotive head-unit work.
6. **Flan Design** — public client with a controlled deployment.
7. **Y Combinator** — identity-redacted, Y Combinator-backed procurement platform.

### Responsive behavior

- **1080px:** stack the hero; simplify capability rows from four columns to three; keep the operating brief readable rather than shrinking it.
- **1050px:** switch to the 70px mobile header and menu. Closed navigation is removed from pointer and assistive access; open navigation is a single-column sheet with 44px targets.
- **850px:** turn public and restricted dossier panels into one vertical flow, stack project-feature media and copy, and move restricted watermarks away from text.
- **620px:** make primary action rows full width, keep the dossier tab rail horizontally scrollable, use a single-column capability/project/journal layout, stack contact fields and actions, and remove large container radii where edge-to-edge evidence reads better.

Do not collapse every surface into identical cards. The dossier, ledger, delivery rail, project proof, journal proof, founder close, and contact form have distinct spatial jobs.

### English and Brazilian Portuguese

`index.html` and `pt/index.html` are parallel products, not source and afterthought. Preserve equivalent section order, seven-tab mapping, controls, recovery behavior, metadata, `lang`, `hreflang`, and route-aware language switching. Translate meaning and control labels; preserve brands and technical vocabulary where official casing requires it. Maintain deliberate line-wrap protections such as the Portuguese “sistemas que” unit when copy changes.

**The Evidence-First Rule.** Production proof remains ahead of the capability menu. Do not turn the homepage back into a services-first brochure.

**The One-Open-File Rule.** A dossier rail may contain seven choices, but only one detailed dossier panel is visible at a time on every viewport.

## Elevation & Depth

The system is flat and tonal by default. Depth comes from field-to-panel contrast, inset identity zones, grid overlays, fine borders, limited blur, masked topology art, and rare shadows on genuinely floating surfaces. Bright bloom never substitutes for hierarchy.

### Shadow Vocabulary

- **Ambient raised surface** (`0 24px 80px rgba(0, 0, 0, 0.34)`): mobile navigation and isolated error panels.
- **Operating brief** (`12px 18px 52px rgba(0, 0, 0, 0.38)`): separates the live dossier from the hero topology without making it a floating dashboard.
- **Contact glass** (`0 24px 72px rgba(0, 0, 0, 0.28)`): anchors the protected form inside the contact field.
- **Signal glow** (`0 0 12px rgba(216, 255, 79, 0.65)`): tiny live dots and the scroll trace only. Cyan glow follows the same restrained scale for focus or topology packets.

**The Flat-by-Default Rule.** Static content surfaces use borders and tone. Shadows belong to overlays, the operating brief, or the protected contact layer.

**The Glow-Is-State Rule.** Glow must indicate activity, focus, or verified signal. Never wash whole sections in neon.

## Shapes

The form language combines gently curved enclosures with rectilinear dossier controls. Standard surfaces use the 18px radius, major media or evidence containers use 30px, and ordinary controls use 10px. The operating brief uses a slightly tighter 14px enclosure. Pills are reserved for true tags or compact eyebrow labels.

Dossier tabs and form fields are square. Open dossier panels retain large rounding only on their lower corners so the tab rail and visible file read as one object. The contact field is intentionally almost square at 2px. One-pixel hairlines, short top-edge signals, circles, angled watermarks, and terminal divisions provide the recurring geometry.

**The Enclosure-Has-a-Job Rule.** Curves identify a bounded object; square edges identify a rail, field, trace, or working surface.

**The No-Soft-Card-Grid Rule.** Do not apply large rounded rectangles indiscriminately. Repeated evidence becomes a ledger, rail, or one-open file before it becomes a grid of cards.

## Components

### Navigation

The header is fixed, compact, and transparent until scroll or menu-open state adds a dark blurred field and bottom rule. Navigation uses monospaced labels, quiet default color, a tonal hover/current state, a cyan language control, and one lime conversation action. At 1050px the 44px menu button appears; closed navigation is `inert` and `aria-hidden`, keyboard opening moves focus to the first link, and Escape closes the menu and restores focus.

### Buttons

- **Shape:** gently curved controls (`rounded.control`) with a 48px minimum height; menu and recovery controls preserve at least a 44px effective target.
- **Primary:** signal-lime field, field-ink text, monospaced label, and compact horizontal padding (`components.button-primary`).
- **Secondary:** translucent soft-field background, paper text, and a strong hairline (`components.button-secondary`).
- **Hover / Active:** the control lifts 2px on hover and settles 1px on active; its arrow moves diagonally. Fine pointers may add a bounded magnetic offset of at most 7px horizontally and 6px vertically. Focus remains the global cyan outline, not a hover imitation.

### Operating Brief

The brief is a real semantic `aside` over the topology field, not a screenshot. It contains engagement modes, current scope, and a compact terminal trace in a 390px matte/blurred panel. Live dots, the clock, rotating delivery steps, and the log are atmosphere only; the actual offer remains in readable HTML outside them. Do not reintroduce the comp's invented latency, health, throughput, recency, or other status metrics.

### Dossier Tabs and Panels

The horizontally scrollable tab rail is the signature component. Desktop tabs are at least 156px by 58px; compact tabs are 146px by 52px. Inactive tabs use muted copy, cyan indices, and dark transparent fields. Hover and selected states raise contrast; selection adds one lime bottom trace. Focus is an inset cyan outline.

Click, Left/Right arrows, Home, and End activate a tab. Activation updates `aria-selected`, roving `tabindex`, panel `hidden` state, horizontal scroll position, and a polite live-region announcement. Public cases use a 36/64 identity-to-detail split on wide screens. Restricted cases use a 36/64 clearance-and-evidence layout with subdued watermarks; redaction is content policy, not a decorative effect. All variants become one vertical evidence flow at 850px.

Panels enter with a short 320ms rise and fade using the standard expressive easing. Selection must never trigger a full page transition.

### Capability Ledger and Delivery Trace

Capabilities are full-width ledger rows separated by rules: index, title, explanation, then technology tags. The separate four-step rail states Frame, Design, Build, Transfer in that order. These surfaces summarize what follows from the evidence; they do not outrank the dossiers or imitate an analytics dashboard.

### Evidence Tags

Tags are small monospaced labels with 5–6px internal spacing, a 1px rule, and no decorative fill. They identify technologies, maturity, or clearance state. Preserve maturity words such as Prototype, Pre-alpha, Playable, Active, and Published exactly until the underlying project changes.

### Project and Journal Proof

Three lab artifacts are visible initially: SMBNeo, openapi_fdw, and BigQuery Cost Estimator. Four additional experiments are collapsed behind a 44px disclosure control whose text and `aria-expanded` state change together. Journal proof uses three horizontal media-and-copy rows on larger screens and stacks below 620px. Image motion is a subtle hover response, never required to reveal meaning.

### Contact Form

The contact close uses a near-square gridded field and a darker glass form. Inputs are square, at least 47px tall, paper-on-dark, with cyan focus and a faint cyan ring; user-invalid fields switch only their border to error coral. The message field keeps a visible minimum-length instruction. The honeypot stays inaccessible to normal navigation.

The submit action begins disabled. Turnstile initializes lazily as the form approaches the viewport, fetches its public site key from the contact Worker, and enables submission only after verification. Initialization and submission failures preserve all entered values and reveal colocated Retry and LinkedIn actions. A successful submission resets the form. Never expose a public inbox or replace this recovery path with an uncontextualized error.

### Motion and Language Switching

Most state transitions finish in 150–220ms. Dossier entry is 320ms. Scroll reveals use a 680ms fade/filter and 760ms transform with the expressive `cubic-bezier(0.16, 1, 0.3, 1)` easing. The hero topology uses pointer parallax only for fine pointers; its pipeline pauses offscreen or when the document is hidden. Logo movement pauses on hover/focus. The language switch swaps matching header/main/footer structures, preserves the current section and offset, updates page metadata, and restores keyboard focus when appropriate.

`prefers-reduced-motion: reduce` removes smooth scrolling, collapses transition and animation durations, reveals content immediately, stops the logo marquee, freezes terminal cycles, disables parallax and magnetic movement, and hides the decorative duplicate logo group. Motion never carries unique evidence or blocks contact.

### Analytics Behavior

Umami classifies navigation, language, contact, project, journal, social, and outbound interactions. Dossier selection, lab disclosure, verification state, contact attempts/outcomes, and recovery choices are explicit events. Event payloads may include locale, bounded labels, section, safe destination path, and evidence context. They must never contain form values, user identifiers, cookies, Turnstile tokens, or URL query strings; local previews must not contaminate production reporting.

## Do's and Don'ts

### Do:

- **Do** preserve the proof-first homepage sequence and the seven exact dossier slots.
- **Do** keep exactly one dossier tab selected and one matching panel visible, with aligned tab IDs, `aria-controls`, panel IDs, and `aria-labelledby` values.
- **Do** use lime for action/selection and cyan for telemetry/navigation/focus.
- **Do** preserve skip links, semantic landmarks, heading order, visible focus, polite live status, 44px effective controls, and reduced-motion behavior.
- **Do** keep English and Brazilian Portuguese structurally equivalent, with accurate `lang`, `hreflang`, metadata, control labels, and official casing.
- **Do** update readable `assets/css/site.css` / `assets/js/site.js` and their checked-in minified counterparts together; the HTML loads the minified files.
- **Do** preserve every asset's provenance record and the career-history no-endorsement statement.
- **Do** keep public evidence, confidentiality labels, project maturity, and recovery copy factual and current.
- **Do** verify responsive changes at the established 1080px, 1050px, 850px, and 620px transitions, with extra attention around the 1051/1050 navigation boundary.

### Don't:

- **Don't** literalize fabricated status metrics, unsupported recency, tiny telemetry labels, or invented case copy from the direction comp.
- **Don't** add testimonials, endorsements, benchmarks, client identities, certifications, pricing, revenue, or outcomes without approved evidence.
- **Don't** turn the dossier into a generic dashboard, a bento archive, a full portfolio dump, or a services-first agency page.
- **Don't** lowercase company names, personal names, acronyms, or technologies for aesthetic consistency.
- **Don't** use glow as decoration, add purple cyberpunk saturation, introduce stock imagery, or place pseudo-text inside generated art.
- **Don't** animate information that cannot be reached in reduced-motion mode or understood from semantic HTML.
- **Don't** log or transmit contact-field contents through analytics, expose authentication state, or remove the Retry and LinkedIn recovery route.
- **Don't** imply that career-history logos are Sabino Software clients or endorsers.
