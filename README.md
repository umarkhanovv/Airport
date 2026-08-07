# Turkistan International Airport (HSA)

A rebuild of the Türkistan International Airport website — moving off a WordPress
page-builder stack onto a single self-hosted Next.js application.

The centrepiece is the **flight board**: airport staff upload the weekly schedule
as an Excel workbook, and the site parses, validates and publishes it. There is
no live flight-status feed and the site never invents one — every time shown is a
scheduled time, labelled as such.

## Status

Built and green through **Stage 10**. One item is outstanding and is described
below: the 207 documents linked from the migrated pages are still hosted on the
legacy site.

| Stage | Scope                                              | State                                        |
| ----- | -------------------------------------------------- | -------------------------------------------- |
| 0     | Foundation — App Router, i18n, CI, env schema       | Done                                         |
| 1     | Flight data pipeline, headless                      | Done                                         |
| 2     | Design system, home, static template                | Done                                         |
| 3     | Flight board UI                                     | Done                                         |
| 4     | Board extras — pin, .ics, weather                   | Done                                         |
| 5     | News                                                | Done                                         |
| 6     | Admin — auth, upload → preview → publish, news      | Done                                         |
| 7     | Feedback form, optional SMTP, admin inbox           | Done                                         |
| 8     | Content migration from the legacy site              | Steps 1–4, 6 done; step 5 is human proofread |
| 9     | PWA, SEO, accessibility                             | Done                                         |
| 10    | Hardening and handover                              | Done                                         |

Everything above is green: 300 unit tests and 116 end-to-end tests, plus
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

That the pages came across *completely* is checkable without a human, and is
checked: `npm run migrate:verify` re-fetches all 148 of them from the live
legacy site and compares their visible text against the MDX that replaced them.
It currently passes. 53 pages are empty because the legacy page was empty — the
report prints what each one holds, so the claim can be read rather than
believed.

**The 207 documents linked from those pages are still hosted on hsairport.kz**
— 188 procurement notices on the announcements page, 14 tariff files on cargo,
and a handful elsewhere. Every one of those links breaks on the day the legacy
site is switched off. `npm run migrate:generate` downloads them into
`public/documents/legacy/` and rewrites the links, and it is resumable, but the
legacy host stopped responding partway through the first run and the copy has
not been made. Run it again before the old site goes; `npm test` will confirm,
once `tests/unit/content-assets.test.ts` is restored alongside it.

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
| `npm run migrate:verify`   | Re-check migrated pages against the legacy site     |

## Running it on the airport's server

Requires Node 22 and a C toolchain, because `better-sqlite3` compiles a native
module. On Debian or Ubuntu: `apt install build-essential python3`.

```bash
npm ci && npm run build
```

Set the environment, then start it:

```bash
ADMIN_PASSWORD=… SESSION_SECRET=… SITE_URL=https://hsairport.kz DATA_DIR=/var/lib/hsairport npm start
```

`.env.example` is the full reference; only those four matter to begin with.
Generate the session secret rather than inventing one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The server listens on `PORT`, default 3000, and expects a reverse proxy in
front of it terminating TLS. The proxy is also where **HSTS** belongs — the
application sets the other security headers itself (see `next.config.ts`), but
not that one: it is a promise about the certificate, and an application that
also runs on `http://localhost` must not make it.

Set `X-Forwarded-For` at the proxy. Both rate limiters — the admin login and
the feedback form — key on it, and without it every visitor shares one bucket.

### Where the data lives

Everything that cannot be rebuilt from this repository is under `DATA_DIR`:

```
$DATA_DIR/app.db              SQLite: flights, news, feedback
$DATA_DIR/uploads/schedules/  every weekly workbook ever published
$DATA_DIR/uploads/news/       cover images for news posts
```

Set `DATA_DIR` to an absolute path outside the checkout. The default is
`./data`, which is fine for development and wrong for production: the
standalone server changes directory into `.next/standalone` at startup, and a
build directory is deleted on the next deploy. `lib/env.ts` unwinds that and
refuses a path under `.next`, but the argument for an absolute path is that
nobody should have to know any of this.

### Backups

One directory, no dump step:

```bash
sqlite3 /var/lib/hsairport/app.db ".backup '/backup/app.db'" && tar czf /backup/hsairport-$(date +%F).tgz -C /var/lib hsairport
```

`.backup` is used rather than copying the file because it is safe while the
server is running. Restoring is putting the directory back and restarting.

Nothing else needs backing up. The pages, the translations and the redirects
are in git.

### Deploying a new version

```bash
git pull && npm ci && npm run build && systemctl restart hsairport
```

Schema changes apply themselves on startup — `lib/db/migrate.ts` runs the
Drizzle migrations before the first query. There is no separate migrate step to
forget.

## For the people running the site

Everything below happens at `/<your-domain>/admin`, signed in with
`ADMIN_PASSWORD`. There are no user accounts: one password, shared by whoever
needs it, changed by changing the environment variable and restarting.

**Publishing the weekly schedule.** Admin → Schedule → choose the `.xlsx` file.
The next screen shows what the file contains — how many flights, which days,
and anything the parser could not make sense of — and publishes nothing until
it is confirmed. If a file is rejected, the board keeps showing the previous
week; it is never left empty. Old workbooks stay downloadable.

**Writing news.** Admin → News → Write a post. Nothing is public until
*Published* is ticked, so an announcement can be prepared in advance. The text
is Markdown. The address of a post is fixed when it is created, so links keep
working — fixing a headline does not move the page. A story written in more
than one language should be linked with "Same story in another language", which
is what makes the public page offer readers the other versions.

**Reading feedback.** Admin → Feedback. Everything submitted through the
contacts form is here, whether or not e-mail is configured; SMTP only adds a
copy by mail.

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
