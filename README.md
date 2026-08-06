# Turkistan International Airport (HSA)

A rebuild of the Türkistan International Airport website — moving off a WordPress
page-builder stack onto a single self-hosted Next.js application.

The centrepiece is the **flight board**: airport staff upload the weekly schedule
as an Excel workbook, and the site parses, validates and publishes it. There is
no live flight-status feed and the site never invents one — every time shown is a
scheduled time, labelled as such.

## Status

Built and green through **Stage 9 (PWA, SEO, accessibility)**. Stage 10,
hardening and handover, is not started.

| Stage | Scope                                              | State                                        |
| ----- | -------------------------------------------------- | -------------------------------------------- |
| 0     | Foundation — App Router, i18n, CI, env schema       | Done                                         |
| 1     | Flight data pipeline, headless                      | Done                                         |
| 2     | Design system, home, static template                | Done                                         |
| 3     | Flight board UI                                     | Done                                         |
| 4     | Board extras — pin, .ics, weather                   | Done                                         |
| 5     | News                                                | Done                                         |
| 6     | Admin — auth, upload → preview → publish            | Done                                         |
| 7     | Feedback form, optional SMTP, admin inbox           | Done                                         |
| 8     | Content migration from the legacy site              | Steps 1–4, 6 done; step 5 is human proofread |
| 9     | PWA, SEO, accessibility                             | Done                                         |
| 10    | Hardening and handover                              | Not started                                  |

Everything above is green: 282 unit tests and 89 end-to-end tests, plus
typecheck, lint, format and a production build on plain Node. The end-to-end
suite includes an axe pass over every public page, the admin panel and the
feedback form in its error state, and asserts the flight board still renders
offline with the date its schedule was loaded.

The keyboard and screen-reader passes plan §9.3 also asks for are manual and
have **not** been done; no automated check substitutes for them.

The migrated content in `content/` is **unproofed**. Every page carries
`translationStatus: pending`, an empty `lastReviewed`, and a `migrationNotes`
list recording anything the converter could not decide — pages whose legacy
body was empty, images that could not be fetched, embeds that were dropped, and
where the legacy slug disagreed with the page it named. Stage 8 step 5 is a
human reading pass, budgeted separately from development.

Two items remain outstanding from Stage 6: news CRUD from the admin panel, and
the eOtinish link on the contacts page — the latter deliberately left out until
Stage 8 copies the real URL from the legacy site, rather than guessing the
address of a government appeals service.

## Stack

- **Next.js** (App Router) on plain Node — no Vercel-specific APIs anywhere; the
  airport self-hosts, and CI runs `next build && next start` on every push to
  keep that honest
- **next-intl** — Russian, English and Kazakh, with `kk` served under `/kz`
- **Tailwind CSS v4** with a token layer that drives light, dark and
  high-contrast themes
- **SQLite** via `better-sqlite3` + **Drizzle** — one file on local disk, backed
  up by copying it
- **SheetJS** (vendored) for parsing the weekly workbook, server-side only

There are no user accounts anywhere in the system. Admin access is a single
password from the environment.

Production dependencies are kept to what the application actually needs. The
feedback form's optional SMTP notification is written directly against
`node:net` and `node:tls` rather than adding a mail library — email there is a
copy of something already stored in the database, so every failure path
degrades to the documented default of reading it in the admin panel.

## Getting started

Requires Node 22 (see `.nvmrc`).

```bash
npm install
```

```bash
npm run dev
```

Import the sample workbook so the board has data:

```bash
npm run schedule:import -- data/sample_weekly_schedule.xlsx
```

To use the admin panel at `/admin`, set `ADMIN_PASSWORD` and `SESSION_SECRET`
first — see `.env.example` for the full environment reference.

## Scripts

| Command                    | Purpose                                            |
| -------------------------- | -------------------------------------------------- |
| `npm run dev`              | Development server                                  |
| `npm run build`            | Production build plus the standalone bundle         |
| `npm start`                | Run the standalone bundle on plain Node             |
| `npm run verify`           | Typecheck, lint, format check and unit tests        |
| `npm test`                 | Unit tests (Vitest)                                 |
| `npm run test:e2e`         | End-to-end tests (Playwright)                       |
| `npm run schedule:import`  | Import a workbook from the command line             |
| `npm run db:generate`      | Generate a Drizzle migration                        |

## Layout

```
app/            routes — [locale]/* for the public site, admin/* outside it
components/     UI components
lib/flights/    workbook reader, parser, normalizers, import transaction
lib/admin/      session, rate limiting, upload staging
lib/feedback/   validation, anti-spam, storage, optional SMTP
lib/db/         schema and migrations
content/        MDX static pages, per locale
tests/unit/     Vitest — parser, normalizers, contrast, i18n, admin
tests/e2e/      Playwright — against the real standalone bundle
```

## Notes on the data pipeline

The weekly workbook is a human-authored file, and the parser is built to survive
it rather than to assume it is clean. A few of the rules that shape the code:

- Flight times are `HH:MM` **strings**, never timestamps — the moment one becomes
  a `Date`, a UTC server shifts the whole board by five hours
- "Today" is the airport's today, not the server's
- `sheet_to_json` is banned in the parser: it returns timezone-dependent `Date`
  objects, and `raw: true` does not suppress that. CI runs the unit tests under
  three timezones to keep this from regressing
- Excel time serials are rounded, not truncated
- A day block's date is authoritative, so a 00:20 arrival belongs to the block it
  was printed under

## Licence

No licence is granted. This is client work, published for reference.
