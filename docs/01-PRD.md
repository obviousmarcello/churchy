# Churchy — Product Requirements Document (PRD)

| | |
|---|---|
| **Product** | Churchy — customizable website platform for Hungarian churches |
| **Document** | Product Requirements Document |
| **Version** | 1.0 (draft) |
| **Date** | 2026-11-12 |
| **Status** | For review |
| **Related** | [02-SDD.md](./02-SDD.md) (Solution Design), [03-DELIVERABLES.md](./03-DELIVERABLES.md) (Deliverables) |

> **Language note:** this document is written in English so it can be shared with any engineering team. Everything the *product* shows to visitors and administrators is in **Hungarian**; Hungarian UI terms are given in *italics* next to the English concept where it matters.

---

## 1. Summary

Most Hungarian congregations — Catholic parishes, Reformed and Lutheran congregations, Greek Catholic parishes, free churches — need the same handful of things from a website: *when is the next service, where is the church, what's happening this week, how do I arrange a baptism / wedding / funeral, how do I contact the office, how can I support the community.*

Today these sites are typically (a) outdated hand-built sites maintained by one volunteer, (b) generic WordPress installs with heavy plugins, broken mobile layouts and no security updates, or (c) a Facebook page only. Information such as the service schedule is often stale, which is the single most damaging failure for a church website.

**Churchy** is a hosted, multi-church platform. Each church gets its own Hungarian-language website, on its own domain, configured — not coded — to match its denomination, its vocabulary, its look and the features it actually uses. Content is maintained by non-technical volunteers and office staff through a simple Hungarian admin interface.

## 2. Problem statement

1. **Stale critical information.** Service times change seasonally (summer schedule, Advent, Holy Week, feast days) and are rarely updated reliably.
2. **Low technical capacity.** Editors are often elderly volunteers or busy clergy; existing CMSs are too complex.
3. **One-size-fits-none tooling.** Generic site builders use the wrong vocabulary (a Reformed congregation has no *szentmise*, a Catholic parish has no *presbitérium*) and lack church-specific content types (weekly announcements, service schedule, sacrament requests).
4. **Compliance burden.** GDPR, cookie consent, the Hungarian *Impresszum* obligation and accessibility are poorly understood and usually unmet. Sacrament/pastoral requests involve special-category (religious) personal data.
5. **Cost and maintenance.** Each church pays separately for hosting, a theme, plugins and occasional "website fixes", and security updates are neglected.

## 3. Vision & goals

**Vision:** *Every Hungarian congregation can have a trustworthy, beautiful, up-to-date website in an afternoon, and keep it current in five minutes a week.*

### 3.1 Goals

| ID | Goal |
|---|---|
| G1 | A new church can go live with a complete, correct, branded site in **≤ 2 hours** of setup effort without developer involvement. |
| G2 | The most-requested visitor task — *"When is the next service?"* — is answerable from the home page within **one screen and ≤ 10 seconds**. |
| G3 | Weekly maintenance (announcements + schedule changes) takes **≤ 10 minutes** for a non-technical editor. |
| G4 | One codebase serves all denominations through configuration (terminology, modules, theme), with **zero per-church code forks**. |
| G5 | Sites are compliant out of the box with GDPR, Hungarian legal notices (*Impresszum*, *Adatkezelési tájékoztató*) and WCAG 2.1 AA. |
| G6 | Sites are fast and usable on low-end phones and slow mobile connections. |

### 3.2 Non-goals (v1)

- Full church-management system (member registry, *anyakönyv* / parish registers, accounting, *egyházi hozzájárulás* bookkeeping). Churchy is a public website with light pastoral request handling, not an ERP.
- Multi-language public sites (the public site is Hungarian; minority-language *services* are supported as data, e.g. a German-language Mass, but the UI is Hungarian only in v1).
- Native mobile apps.
- A free-form drag-and-drop page builder (customization is structured, see §6.2 — this protects quality and accessibility).
- Online sacrament booking with automatic calendar allocation (v1 collects requests; the office confirms manually).
- Hosting of diocesan / district-level (*egyházmegye*, *egyházkerület*) multi-site portals (possible later, see §12).

## 4. Users & personas

### 4.1 Public-facing

| Persona | Description | Top needs |
|---|---|---|
| **P1 — Regular member** (*hívő, gyülekezeti tag*) | Attends weekly, often 50+, mostly on a phone. | Service times, weekly announcements, events, livestream link. |
| **P2 — Newcomer / seeker** (*érdeklődő*) | Moved to the area or exploring faith. | Where & when, what to expect, who to contact, is there something for my family. |
| **P3 — Life-event visitor** | Needs a baptism, wedding, funeral, confirmation/First Communion. | Requirements, steps, documents needed, office hours, a way to submit a request. |
| **P4 — Tourist / visitor** | Visiting a historic church. | Opening hours, history, accessibility, address, parking. |
| **P5 — Supporter / donor** | Wants to give or do the 1% tax designation. | Bank account, payment reference, technical number for the 1%, online giving. |

### 4.2 Administrative

| Persona | Description | Top needs |
|---|---|---|
| **A1 — Pastor / parish priest** (*plébános, lelkipásztor, lelkész*) | Ultimate owner; little time. | Approve content, post a short message, see incoming requests. |
| **A2 — Office administrator** (*irodai munkatárs*) | Part-time staff. | Upload weekly announcements, update schedule, handle requests. |
| **A3 — Volunteer editor** (*önkéntes szerkesztő*) | Often the "tech-savvy" member. | Post news, events, photos; customize look. |
| **A4 — Group leader** (*csoportvezető*) | Leads youth group, choir, Bible study. | Edit own group's page and events only. |
| **A5 — Platform operator** (*üzemeltető*) | Runs the Churchy service. | Provision churches, domains, support, monitoring, billing. |

## 5. Denominational adaptability

Churchy must adapt to any Hungarian Christian community. Adaptation happens through **denomination presets** that set defaults which every church can override.

### 5.1 Supported presets (v1)

1. Római katolikus (Roman Catholic)
2. Görögkatolikus (Greek Catholic)
3. Református (Reformed)
4. Evangélikus (Lutheran)
5. Baptista / szabadegyházi (Baptist / free church)
6. Unitárius (Unitarian)
7. Általános keresztény (generic — fallback for any other community)

### 5.2 Terminology examples (defaults, overridable per church)

| Concept (internal key) | Római katolikus | Görögkatolikus | Református | Evangélikus | Baptista / szabadegyházi |
|---|---|---|---|---|---|
| `community` | Plébánia | Parókia | Egyházközség | Egyházközség | Gyülekezet |
| `service` | Szentmise | Szent Liturgia | Istentisztelet | Istentisztelet | Istentisztelet |
| `serviceSchedule` | Miserend | Liturgikus rend | Istentiszteleti rend | Istentiszteleti rend | Alkalmaink |
| `leadClergy` | Plébános | Parókus | Lelkipásztor | Lelkész | Lelkipásztor |
| `office` | Plébániai iroda | Parókiai hivatal | Lelkészi hivatal | Lelkészi hivatal | Gyülekezeti iroda |
| `sermon` | Homília | Homília | Igehirdetés | Igehirdetés | Igehirdetés |
| `layCouncil` | Képviselő-testület | Képviselő-testület | Presbitérium | Presbitérium | Gyülekezetvezetés |
| `rites` (requestable) | Keresztelő, Elsőáldozás, Bérmálás, Házasság, Temetés, Betegek kenete | Keresztelő (krizmálással), Házasság, Temetés | Keresztelő, Konfirmáció, Házasságkötés, Temetés | Keresztelő, Konfirmáció, Esküvő, Temetés | Bemerítés, Házasságkötés, Temetés, Gyermekbemutatás |
| `support` | Egyházi hozzájárulás | Egyházi hozzájárulás | Egyházfenntartói járulék | Egyházfenntartói járulék | Adomány |

The preset also selects: default modules, default service types, which liturgical calendar to show, and the home-page section order.

## 6. Functional requirements

Priority: **P0** = MVP must-have, **P1** = should-have for v1.0 general availability, **P2** = later / nice-to-have.

### 6.1 Public website — core content

| ID | Requirement | Priority |
|---|---|---|
| FR-001 | **Home page** (*Kezdőlap*) shows: church name & photo, the **next upcoming services** (today / tomorrow, per location), latest news, upcoming events, latest weekly announcements, and quick links (address/map, contact, livestream if live). Section order and visibility are configurable. | P0 |
| FR-002 | **Service schedule** (*Miserend / Istentiszteleti rend*): regular weekly schedule per location, seasonal variants (e.g. *nyári miserend*), date-specific exceptions (cancelled, added, changed time), service type (e.g. *gyermekmise*, *családi istentisztelet*, *úrvacsorás istentisztelet*), language (e.g. *német nyelvű*), and notes. Visitors can view "this week" and any future date. | P0 |
| FR-003 | **Multiple locations** (*templom, kápolna, filia, leányegyház*): each with name, address, map, photo, opening hours, accessibility info; schedules are per location. | P0 |
| FR-004 | **News** (*Hírek*): title, lead, rich body, cover image, publish date, categories, optional expiry; list with pagination and detail page. | P0 |
| FR-005 | **Weekly announcements** (*Hirdetések*): a dedicated content type tied to a week (Sunday date), entered as rich text and/or an attached PDF; archive by date; "latest announcements" always reachable in one click; printable. | P0 |
| FR-006 | **Events calendar** (*Események / Naptár*): single and recurring events, location, category, image, description; list and month views; per-event page; add-to-calendar (.ics) and an iCal feed subscription. | P0 |
| FR-007 | **Static pages** (*Oldalak*): e.g. *Rólunk*, *Történetünk*, *Templomunk*, structured with a block editor (heading, text, image, gallery, quote, embed, call-to-action, file download). | P0 |
| FR-008 | **Contact page** (*Kapcsolat*): office address, phone, email, office hours (*irodai nyitvatartás*) with exceptions (e.g. summer break), map, contact form. | P0 |
| FR-009 | **Clergy & staff** (*Munkatársaink*): people with photo, role, short bio, optional contact; ordering; grouping (clergy, staff, lay council). | P0 |
| FR-010 | **Life events / rites** (*Keresztelő, Esküvő, Temetés…*): information page per rite with requirements, needed documents, steps, preparation schedule, and a link to the request form. Rites list is preset-driven. | P0 |
| FR-011 | **Groups & ministries** (*Közösségeink / Csoportok*): e.g. youth, choir, Bible study, Caritas/diakónia; each with description, meeting time, leader, contact, and its own events. | P1 |
| FR-012 | **Sermons / media** (*Igehirdetések / Homíliák*): audio file upload or external URL (YouTube, SoundCloud, podcast), Bible passage, preacher, date, series; podcast RSS feed. | P1 |
| FR-013 | **Livestream** (*Élő közvetítés*): configured YouTube/Facebook live URL or embed; "ÉLŐ" badge on the home page when a scheduled livestream is in progress. | P1 |
| FR-014 | **Gallery** (*Galéria*): albums with images, captions, cover image; responsive lightbox. | P1 |
| FR-015 | **Support / donation page** (*Támogatás*): bank account (formatted), beneficiary name, suggested payment reference (*közlemény*), 1% SZJA designation info (church's technical number and/or foundation tax number), optional HCT/instant-payment QR code. | P0 |
| FR-016 | **Online giving** via a Hungarian payment provider (e.g. Barion or SimplePay): one-off and recurring donations with purpose selection. | P2 |
| FR-017 | **Mass intentions** (*Miseszándékok*): published list attached to services; request form for a new intention. (Catholic/Greek Catholic presets.) | P2 |
| FR-018 | **Liturgical calendar widget**: today's liturgical day/feast (computed), with an outbound link to daily readings / the daily Bible reading guide (no third-party copyrighted text copied without a license). | P1 |
| FR-019 | **Site search** (*Keresés*) across news, events, pages, announcements, sermons with Hungarian-aware matching (accents, stemming). | P1 |
| FR-020 | **Newsletter sign-up** (*Hírlevél*): double opt-in; editors can send a digest of news/announcements; unsubscribe link. | P2 |
| FR-021 | **Funeral notices** (*Gyászhírek*) with time-limited display and family-consent flag. | P2 |
| FR-022 | **Documents** (*Dokumentumok*): downloadable files (forms, parish bulletin PDFs, *Plébániai Értesítő*) organized in folders. | P1 |
| FR-023 | **Social links** and Open Graph previews for sharing to Facebook/Messenger/Viber. | P0 |

### 6.2 Customization

| ID | Requirement | Priority |
|---|---|---|
| FR-101 | **Denomination preset** chosen at setup; sets terminology, modules, rites, service types, home-page layout. Changeable later with a preview of what changes. | P0 |
| FR-102 | **Terminology overrides**: any preset term can be overridden per church (e.g. a Catholic parish calling itself *Közösség* instead of *Plébánia*). Overrides propagate to navigation, headings, URLs (with redirects) and admin labels. | P0 |
| FR-103 | **Branding**: church name, short name, logo, favicon, hero image(s), primary/secondary colors, font pairing from a curated list. Color choices are validated for WCAG AA contrast before saving. | P0 |
| FR-104 | **Theme selection** from at least **3 professionally designed themes** (e.g. *Klasszikus*, *Letisztult*, *Közösségi*), each fully responsive and accessible. | P0 |
| FR-105 | **Module toggles**: each feature module (news, events, sermons, gallery, groups, giving, livestream, newsletter, mass intentions, funeral notices, documents) can be switched on/off; navigation and home sections adapt automatically. | P0 |
| FR-106 | **Navigation editor**: reorder, rename, nest (max 2 levels), add external links. | P0 |
| FR-107 | **Home page composer**: ordered list of predefined sections (hero, next services, announcements, news, events, livestream, quote/verse, map, CTA, custom text) with per-section settings. | P0 |
| FR-108 | **Custom domain** (e.g. `szentistvan-plebania.hu`) with automatic HTTPS; default subdomain (e.g. `szentistvan.churchy.hu`) always available. | P0 |
| FR-109 | **Footer** content: address, contact, *Impresszum* link, privacy link, social icons, diocese/district link. | P0 |

### 6.3 Pastoral request handling

| ID | Requirement | Priority |
|---|---|---|
| FR-201 | **Request forms** per rite (*keresztelési / esküvői / temetési bejelentés*) and a general "contact the pastor" form; preset-defined fields, editable by admins (add/remove/require fields). | P0 |
| FR-202 | Requests are stored in the admin **inbox** (*Beérkezett kérések*) with status (*Új, Folyamatban, Lezárt*), internal notes, assignee; the office receives an email notification **without** sensitive content in the email body (link only). | P0 |
| FR-203 | Requester receives an automatic confirmation email (configurable Hungarian text). | P0 |
| FR-204 | Explicit consent checkbox referencing the privacy notice; data retention period configurable (default 12 months after closure), with automatic deletion. | P0 |
| FR-205 | Spam protection (honeypot + rate limiting + privacy-friendly challenge) without third-party tracking. | P0 |
| FR-206 | Export a single request as PDF for the paper-based office workflow. | P1 |

### 6.4 Administration (CMS)

| ID | Requirement | Priority |
|---|---|---|
| FR-301 | Hungarian-only admin UI designed for non-technical users: large targets, plain language, contextual help, no jargon. | P0 |
| FR-302 | **Dashboard** (*Vezérlőpult*) with one-click common tasks: *Heti hirdetés feltöltése, Miserend módosítása, Új esemény, Új hír, Kérések*. Shows warnings such as "No announcements this week" or "Schedule exception coming up". | P0 |
| FR-303 | Rich text editor with headings, lists, links, images, embeds; paste-from-Word cleanup. | P0 |
| FR-304 | **Draft / publish / schedule** publishing; preview exactly as visitors will see it. | P0 |
| FR-305 | **Autosave** and version history (restore previous version) for pages, news, announcements. | P1 |
| FR-306 | **Media library** with automatic image resizing/compression, alt-text prompting, and storage quota display. | P0 |
| FR-307 | **Roles & permissions**: *Tulajdonos* (owner), *Adminisztrátor*, *Szerkesztő* (editor), *Iroda* (office — requests + schedule + announcements), *Csoportvezető* (group-scoped). | P0 |
| FR-308 | **User management**: invite by email, deactivate, reset access; at least one owner always exists. | P0 |
| FR-309 | **Two-factor authentication** (TOTP) available to all users; mandatory for owners/admins (configurable by platform). | P1 |
| FR-310 | **Audit log** of publish/delete/settings/permission changes. | P1 |
| FR-311 | **Schedule editor** that shows a calendar preview of the resulting services for the next 8 weeks before saving. | P0 |
| FR-312 | Bulk **schedule exception** creation for holiday periods (e.g. "Nagyhét", "Karácsony") from presets with editable defaults. | P1 |
| FR-313 | Mobile-usable admin (core tasks — announcements, news, schedule exceptions — fully doable on a phone). | P1 |

### 6.5 Platform operations

| ID | Requirement | Priority |
|---|---|---|
| FR-401 | **Church provisioning** wizard (*Új egyház létrehozása*): name, denomination, address, first owner, subdomain → live site with sensible sample content in < 5 minutes. | P0 |
| FR-402 | **Onboarding checklist** for the church owner (logo, schedule, contact, office hours, Impresszum data, privacy data, first announcement). | P0 |
| FR-403 | Platform admin console: list/search tenants, suspend, impersonate (with audit + consent), view usage/quotas. | P1 |
| FR-404 | Data **export** per church (all content + media as a ZIP with JSON/Markdown) and full **deletion** on request. | P1 |
| FR-405 | Plans/quotas (storage, users, custom domain) to support a sustainable pricing model. | P2 |
| FR-406 | **Import** helper from an existing site (paste URLs / upload WordPress export) for news and pages. | P2 |

## 7. Hungarian localization requirements

| ID | Requirement |
|---|---|
| L-01 | All public and admin UI text in Hungarian; texts externalized in message catalogs (no hard-coded strings) so wording can be refined without code changes. |
| L-02 | Dates in Hungarian format: `2026. november 12., csütörtök`; short: `2026. 11. 12.`; times 24-hour `18:00` (optionally `18 óra`); weeks start on **Monday**. |
| L-03 | Hungarian alphabetical collation (*cs, dz, dzs, gy, ly, ny, sz, ty, zs*, long/short vowels) for all sorted lists. |
| L-04 | Personal names displayed family-name-first (*Kovács János*), with optional prefix titles (*dr.*, *P.*, *Fr.*) and suffixes. |
| L-05 | Addresses in Hungarian order: `1011 Budapest, Fő utca 1.`; phone numbers normalized to `+36 1 234 5678` / `+36 30 123 4567`. |
| L-06 | Bank account numbers formatted as `12345678-12345678-12345678` (with IBAN optional). |
| L-07 | URL slugs in Hungarian without diacritics (`/hirek`, `/esemenyek`, `/miserend`, `/kapcsolat`). |
| L-08 | Correct Hungarian grammar in generated text: article *a/az* before words and numbers (*az 5. vasárnap*, *a 10 órai mise*), suffix harmony where templates insert names (avoid suffixing user-provided names; use constructions that don't require it). |
| L-09 | Search tolerates missing accents (`miserend` matches `Miserend`, `ujev` matches `újév`) and uses Hungarian stemming. |
| L-10 | Hungarian public holidays and moveable feasts (Easter, Pentecost, Ascension, etc.) are known to the schedule engine. |

## 8. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Performance | Public pages: LCP ≤ 2.5 s and INP ≤ 200 ms at p75 on a mid-range Android over 4G; Lighthouse Performance ≥ 90 on home, schedule, news detail. Home page transfer ≤ 1 MB on first load. |
| NFR-02 | Availability | 99.9 % monthly uptime for public sites; admin 99.5 %. |
| NFR-03 | Scalability | One deployment supports ≥ 1,000 churches and Sunday-morning peaks of ≥ 200 req/s aggregate without degradation. |
| NFR-04 | Accessibility | WCAG 2.1 AA for public sites and admin; Lighthouse Accessibility ≥ 95; keyboard and screen-reader usable; minimum base font size 16 px; supports 200 % zoom. |
| NFR-05 | Security | OWASP ASVS Level 2 controls; HTTPS everywhere (HSTS); tenant isolation enforced at the database level; dependency and container scanning in CI. |
| NFR-06 | Privacy | GDPR compliant; all data stored and processed in the **EU**; no third-party tracking by default; analytics (if enabled) cookieless and anonymized. |
| NFR-07 | Reliability | Daily backups with 30-day retention, point-in-time recovery ≤ 24 h RPO, ≤ 4 h RTO; restore tested quarterly. |
| NFR-08 | SEO | Server-rendered HTML; sitemap.xml; robots.txt; schema.org `Church`/`PlaceOfWorship`, `Event`, `NewsArticle` structured data; canonical URLs; Open Graph tags. |
| NFR-09 | Browser support | Last 2 versions of Chrome, Firefox, Safari, Edge; iOS Safari 15+; Android Chrome; graceful degradation without JavaScript for reading content. |
| NFR-10 | Usability | A first-time editor completes "upload weekly announcements" unassisted in ≤ 3 minutes (usability test, ≥ 4 of 5 participants aged 55+). |
| NFR-11 | Maintainability | Single codebase; ≥ 80 % unit test coverage of domain logic (schedule engine, permissions, terminology); typed end-to-end. |
| NFR-12 | Observability | Error tracking, uptime checks per tenant domain, structured logs without personal data. |

## 9. Legal & compliance requirements

| ID | Requirement |
|---|---|
| C-01 | **Impresszum** page generated from structured fields (operator name, seat, contact, registration number of the church legal entity, hosting provider) as required by Hungarian e-commerce law (Ekertv., 2001. évi CVIII. törvény). |
| C-02 | **Adatkezelési tájékoztató** (privacy notice) generated from a template per church, aligned with GDPR and the Hungarian Info Act (Infotv., 2011. évi CXII. törvény), with editable church-specific sections. |
| C-03 | Pastoral requests contain **special-category data** (religious belief, GDPR Art. 9); processing is limited to what's necessary, protected by role-based access, encrypted at rest, retention-limited and deletable. |
| C-04 | **Cookie consent**: only strictly necessary cookies by default; consent banner shown only if a church enables a non-essential embed/analytics; embeds (YouTube, Maps) load behind a click-to-load placeholder until consent. |
| C-05 | Data processing agreement (*adatfeldolgozási szerződés*) between platform operator and each church. |
| C-06 | Photo publication guidance in admin (consent for identifiable people, especially minors) and a per-image "consent obtained" flag for gallery uploads. |
| C-07 | Accessibility statement (*Akadálymentességi nyilatkozat*) page template. |

## 10. Success metrics

| Metric | Target (6 months after GA) |
|---|---|
| Churches live on the platform | ≥ 50 |
| Median time from sign-up to live site | ≤ 2 hours of active work, ≤ 3 calendar days |
| Churches updating announcements or schedule at least weekly | ≥ 70 % |
| Visitor task success "find next service time" (moderated test) | ≥ 90 % in ≤ 10 s |
| Editor satisfaction (CSAT, in-app survey) | ≥ 4.3 / 5 |
| Public site Core Web Vitals "Good" (CrUX/RUM) | ≥ 90 % of page loads |
| Uptime | ≥ 99.9 % |
| Security incidents with data exposure | 0 |
| Support tickets per church per month | ≤ 0.5 after first month |

## 11. Assumptions & constraints

- **Hosted multi-tenant platform** (SaaS) is the delivery model; self-hosting is not supported in v1.
- Churches have at least one person with an email address and a smartphone or computer.
- No integration with official church registries is required; outbound links to diocesan/district sites and to national schedule directories are sufficient in v1.
- Daily readings and Bible texts are copyrighted by their Hungarian publishers; v1 links out rather than republishing.
- Budget favours open-source, EU-hosted components.

## 12. Future scope (post-v1)

- Diocesan / district **multi-site networks** (shared news, central administration of several parishes, *lelkipásztori körzet*).
- Synchronization of service schedules to national Mass/service directories where an API is available.
- Online booking of appointments with the office.
- Volunteer scheduling (lectors, ministrants, *perselyezés*, flower rota).
- Member-only area (prayer requests, internal documents).
- Additional public languages (German, Slovak, Romani, English) for minority and tourist audiences.

## 13. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Editors abandon updating → stale schedule | High | Dashboard warnings, weekly reminder email, schedule-by-rules (fewer manual edits), "last updated" visible to admins. |
| Denominational nuance wrong / offensive | Medium | Presets reviewed by a clergy advisor from each denomination before GA; all terms overridable. |
| Special-category data breach | High | Minimal fields, encryption, access controls, no sensitive data in emails, retention auto-delete, security review before GA. |
| Over-customization requests | Medium | Structured customization only; feature requests feed the roadmap rather than per-church code. |
| Copyright on liturgical texts | Medium | Link-out by default; license-dependent integrations later. |

## 14. Open questions

1. Pricing model: free tier for small congregations funded by larger ones / a sponsor, or per-church subscription?
2. Should diocese/district-level customers be a v1 sales channel (influences multi-site priority)?
3. Which payment provider (Barion vs SimplePay) is preferred by target churches for P2 giving?
4. Do we provide a shared `churchy.hu` subdomain brand, or white-label the default subdomain?
5. Which clergy advisors validate each denomination preset?
