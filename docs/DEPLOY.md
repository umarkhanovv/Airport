# Deploying to Railway

Push to `master`, Railway rebuilds, the site updates. This is the one-time setup
that makes that true, and the one-time data copy that makes the site have
anything in it.

Nothing here is Railway-specific except the CLI commands in §4. The container is
a plain Node server on a mounted disk; any host offering those two things will
run it, which is the point of `output: 'standalone'` (plan §3.4).

---

## What the site needs from a host

Three things, and the third is the one that catches people out.

1. **Node and a C toolchain** — supplied by the image, not the host.
   `better-sqlite3` compiles from source; the `Dockerfile` installs
   `build-essential python3` in the build stage for exactly that.
2. **Four environment variables** — §3.
3. **A persistent disk.** Everything the airport has entered lives in one
   directory: the SQLite database and every uploaded schedule, news image and
   document. On an ephemeral filesystem all of it is destroyed on every deploy,
   including anything uploaded through the admin panel in between. `lib/env.ts`
   refuses to start if `DATA_DIR` points inside the build output, but it cannot
   detect a disk that merely evaporates.

Current size: **114 MB**, of which 113 MB is documents and 320 KB is the
database. 1 GB leaves room for years.

---

## 1. Create the service

**New Project → Deploy from GitHub repo → `umarkhanovv/Airport`.**

Railway detects the `Dockerfile` at the repository root and builds with it; there
is no builder to configure. Leave automatic deploys on — that is the feature we
are here for.

## 2. Add the volume

Service → **Settings → Volumes → Add volume**.

| Field      | Value                |
| ---------- | -------------------- |
| Mount path | `/var/lib/hsairport` |
| Size       | 1 GB                 |

**That exact path, and it is not arbitrary.** The Dockerfile already sets
`ENV DATA_DIR=/var/lib/hsairport`, so mounting the volume there means the two
agree with no variable to set and nothing to keep in sync. If you mount it
somewhere else you must add a matching `DATA_DIR` — and if the two ever disagree
the site starts perfectly happily and writes to a disk that disappears.

A volume ties the service to one instance. That is correct here rather than a
limitation to grow out of: SQLite is a file, and two containers writing one file
over a network mount is how databases get corrupted. A regional airport's
timetable is not going to outgrow one container, and scaling this would mean
changing databases, not settings.

## 3. Environment variables

Service → **Variables**.

| Variable         | Value                                  | Why                                                                                                                    |
| ---------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_PASSWORD` | _a long random string_                 | The only credential in the system. There are no user accounts anywhere (spec §8, §14).                                 |
| `SESSION_SECRET` | _a second one_                         | Signs the admin session cookie.                                                                                        |
| `SITE_URL`       | `https://<your-app>.up.railway.app`    | Canonical origin for `hreflang`, canonicals and the sitemap. Wrong here and the site advertises URLs nobody can reach. |
| `PREVIEW`        | `true` **while this is a review copy** | `robots.txt` becomes `Disallow: /` and no sitemap is published.                                                        |

Generate the secrets rather than inventing them:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

`DATA_DIR`, `PORT` and `NODE_ENV` are already in the image. Railway injects its
own `PORT` and the server honours it.

### About `PREVIEW`

Leave it on for as long as this is a review copy. The site carries the airport's
real name, logo, address and telephone numbers over content nobody has
proofread; indexed, it competes with the airport's own site for the airport's own
name, and a passenger can land on an unreviewed page believing it official.

Turn it off only when this becomes the airport's actual site. It is read at
request time, so flipping it needs a restart, not a rebuild — that was fixed
deliberately, because the version that read it at build time silently published
`Allow: /` from a preview deployment.

Check it after the first deploy:

```bash
curl https://<your-app>.up.railway.app/robots.txt
```

## 4. Seeding the volume

Do this **once**, after the first successful deploy. Until you do, the site is up
and completely empty — no flights, no news, no documents.

On your machine:

```bash
npm run data:pack
```

That writes `airport-data.tar.gz` (~104 MB). It snapshots the database with
`VACUUM INTO` rather than copying `app.db`, which on a running site is not the
whole database: recent commits sit in the write-ahead log until a checkpoint
folds them in, and that file is currently larger than the database itself. Copy
the wrong thing and you lose the newest schedule, which is the one anybody cares
about.

Railway's SSH is a standard SSH server, so ordinary `scp` works:

```bash
railway ssh --project <project> --service airport
```

Get the exact connection string from the dashboard — right-click the service and
**Copy SSH Command** — then `scp` the archive to `/var/lib/hsairport/` and, in
the SSH session:

```bash
cd /var/lib/hsairport && tar -xzf airport-data.tar.gz && rm airport-data.tar.gz && ls -la
```

You should see `app.db` and `uploads/`. Restart the service; the board, the news
and the documents are all there.

`railway volume` also opens a file browser for the volume if you would rather
click than type.

### Afterwards

The volume is now the live copy. Deploys replace the container and leave it
alone, so anything the airport uploads through the admin panel survives — the
property the volume exists for. Do not re-run the seed unless you mean to
overwrite what is there.

---

## Deploying changes

```bash
git push
```

Railway builds the Dockerfile and swaps the container. Migrations apply
themselves when the new container first opens the database — `lib/db/index.ts`
calls `runMigrations` once per connection and drizzle records what it has already
applied — so there is no separate migrate step to forget.

## Backups

The database is one file. Back it up by copying a _snapshot_, not the file:

```bash
# in an SSH session
sqlite3 /var/lib/hsairport/app.db "VACUUM INTO '/var/lib/hsairport/backup.db'"
```

then `scp` it somewhere safe, or pull it with `railway volume`. The documents are
static and change rarely; the database is the part worth a schedule.

## Troubleshooting

**Build fails compiling `better-sqlite3`.** The build stage installs
`build-essential python3` for this. If you change the base image, keep both
stages on the _same_ one — a binding compiled against one libc and loaded
against another fails at startup with a message that reads like a missing file.

**Build fails on a missing `vendor/xlsx-0.20.3.tgz`.** SheetJS is a local
tarball, not a registry dependency, so `COPY vendor ./vendor` has to come before
`npm ci`. It already does; do not "tidy" it away.

**Site is up but empty.** The volume has not been seeded — §4.

**Data disappears on every deploy.** The volume is not mounted, or is mounted
somewhere other than `DATA_DIR`. Both must say `/var/lib/hsairport`.

**`robots.txt` says `Allow: /` on a preview.** `PREVIEW` is not set on the
running service. It is read at request time, so a restart is enough.
