# Turkistan International Airport (HSA)

A rebuild of the Türkistan International Airport website — moving off a WordPress
page-builder stack onto a single self-hosted Next.js application.

The centrepiece is the **flight board**: airport staff upload the weekly schedule
as an Excel workbook, and the site parses, validates and publishes it. There is
no live flight-status feed and the site never invents one — every time shown is a
scheduled time, labelled as such.

## Status

Built and green through **Stage 10**.

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

Everything above is green: 322 unit tests and 143 end-to-end tests, plus
typecheck, lint, format and a production build on plain Node. The end-to-end
suite includes an axe pass over every public page, the admin panel and the
feedback form in its error state, and asserts the flight board still renders
offline with the date its schedule was loaded.

Page weight is **measured, not capped**. There were ceilings — HTML, stylesheet
and hydration JavaScript — and the build failed when a page grew past them; the
airport has lifted them. The end-to-end run still prints what each page asks the
browser to download, currently 16.0 KB of HTML, 8.0 KB of stylesheet and 160 KB
of JavaScript gzipped on the flight board, because the ceilings are gone but the
connections this site is read on are not. What the budget was protecting is
asserted directly instead: the board still renders with JavaScript switched off.

**Frosted glass** sits over a fixed, tinted backdrop carrying the terminal's
façade lattice — and it is spent in six places, not everywhere. It went onto
every surface first, which is self-defeating: a frosted pane says "this floats
above the page", and when everything says it, nothing does. It now marks the
sticky header, the flight board, the section tiles on the home page, the admin
bar, the appearance popover and the map. Every other surface is `.panel`, a
border and a raised fill.

Built at 72–85% opacity rather than the 10% the technique is usually written
with, because the effective background under the text has to stay close enough
to `--surface` for the contrast ratios to hold; those ratios are asserted, and
axe runs over every page. It turns itself off in three cases, all of them real:
the high-contrast theme, a browser asking for reduced transparency, and any
engine without `backdrop-filter`.

When a page fails, `app/[locale]/error.tsx` shows a localised 500 inside the
normal chrome, with a retry and a way home. It shows the `digest` — the hash
Next writes beside the real error in the server log, so a caller can quote it —
and never the thrown message, which can carry a filesystem path. If the layout
itself is what threw, `app/global-error.tsx` takes over with all three languages
as literal text. Verified against a production build: the error text reaches the
log and not the browser.

One honest limit. Next requires error boundaries to be client components, so
they cannot server-render — and when a page throws, the shell is discarded. **A
visitor with JavaScript disabled gets a blank page on a 500**, not the error
screen above. That is an App Router constraint rather than a choice here, and it
does not touch normal operation: the board, the menu and the forms all work
without JavaScript, and that is tested.

Every test browser asks for reduced motion, which is not a detail: the site
animates scrolling, and an animated scroll is one the driver cannot wait for —
it is told the scroll is done and the element arrives some frames later, so a
click lands where the element no longer is. That cost the news pagination test,
whose link sits a thousand pixels down a list of ten stories, a failure about
one run in ten. Both halves of the preference are pinned in
`tests/e2e/accessibility.spec.ts` so the stylesheet cannot quietly stop
honouring it and bring the flake back somewhere else.

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
Pages are empty here where the legacy page was empty — the report prints what
each one holds, so the claim can be read rather than believed. 16 of the pages
marked "text being prepared" were re-checked against the live site directly and
hold 1–6 words each, which is their own heading.

**The converter never emitted a single table**, in any of the 148 pages, and
that cost real content: both airport tariff tables on `about/certificates` were
dropped in all three languages. They have been restored by hand from the live
page. Three other table-bearing pages lost nothing — their tables were document
listings, which belong in the document library rather than in a page. Anyone
re-running `scripts/migrate/generate.mts` should know it has this hole, and that
pages have been hand-edited since, so a re-run would overwrite that work rather
than improve on it.

The legacy **`/covid-19-information/`** page is deliberately not migrated. It
exists in all three languages, around 550 words each, and is still linked from
the old site's menu — but it describes restrictions that ended years ago, and a
passenger could act on them. Recorded here rather than left to look like an
oversight; the legacy URL is all that is needed to reverse the decision.

**13 pages are marked `translationStatus: machine`** and carry a visible notice
saying so. The legacy site had Russian text and blank English and Kazakh pages
on a dozen subjects — advertising, CIP booking, tariffs, baggage tracing,
history, prayer rooms — and the migration reproduced the blanks faithfully.
Those are now translated. The notice stays until a human clears it, which is
`translationStatus: complete` plus a `lastReviewed` date; the Kazakh in
particular has not been read by a native speaker.

`migrate:verify` will now disagree with the legacy site on those pages, and on a
handful more where the legacy body was scraped rubbish rather than content — a
navigation menu captured as the company charter, a contact form captured as the
end of the CIP page, a WordPress shortcode captured as the vacancies page. That
disagreement is the point of the change, not a regression.

The documents those pages linked to are now in the **document library** — 200
of them: 185 procurement notices, 14 cargo tariffs and the flight safety
policy. They are rows in the database rather than files in this repository,
because notices are added and superseded weekly and material that changes
weekly does not belong in a deploy. Staff add them at `/admin/documents`.

`npm run documents:import` brought them across in bulk: every file downloaded
from the legacy site into `documents-inbox/`, filed against the page it was
published on and titled with the caption it was published under, both read out
of the migrated pages. **Import first, then strip the legacy link tables from
the page** — those links are the only record of what each file is called and
where it belongs, and removing them first makes the import match nothing.

The handful the airport chose not to carry over — four tender files from 2021,
one scan, a 2020 presentation — are gone, along with every remaining link to
hsairport.kz. Four pages whose whole body was those links are marked
`needsContent`.

Built and green through **Stage 10**; nothing is outstanding.

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
| `npm run check:env`        | Is this machine configured to serve the site?       |
| `npm test`                 | Unit tests (Vitest)                                 |
| `npm run test:e2e`         | End-to-end tests (Playwright)                       |
| `npm run schedule:import`  | Import a workbook from the command line             |
| `npm run db:generate`      | Generate a Drizzle migration                        |
| `npm run migrate:verify`   | Re-check migrated pages against the legacy site     |
| `npm run documents:import` | Import `documents-inbox/` into the document library  |

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

Check the environment before starting rather than after. A server missing a
secret starts perfectly happily and then fails at the first thing that needs
one — an administrator signing in, which is both the worst moment to find out
and the hardest to attribute:

```bash
npm run check:env
```

It names every missing variable at once, so they are fixed in one pass rather
than one restart at a time.

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
$DATA_DIR/uploads/documents/  orders, protocols, tariffs
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

**Publishing documents.** Admin → Documents. Choose the page they belong to,
pick a date, and select as many files as you like at once — PDF, Word, Excel,
PowerPoint or a zip, up to 25 MB each. Each one is listed underneath afterwards,
where its title can be corrected; the title is what the link on the page says.
Unpublishing takes a document off the page *and* stops serving the file, so a
notice that has been withdrawn is genuinely withdrawn.

An edit reaches the public page in well under a second. The exception is worth
knowing about: if two edits to the *same* page overlap — two people at once, or
one person correcting titles quickly while the public is reading that page —
one of the two can be held back. It is not lost, and the admin list always
shows the truth; the public page catches up within five minutes. If a change
seems not to have taken, reload the public page after five minutes before
re-doing it.

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
