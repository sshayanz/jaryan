# Jaryan | Persian Poetry Archive

**Version:** `0.7.0`  
**Languages:** English · [فارسی](README.fa.md)

> Review sample for the proposed 0.7.0 account changes. This is not a final release.

Jaryan is a lightweight, bilingual archive for discovering, searching, reading and saving Persian poetry. Poetry browsing works as a static site; accounts, cross-device favorites, reading history, Flow activity and administration use the Node.js server and its persistent SQLite database.

## Features

- Browse poets, collections and poems, or search Persian verse with normalized text and highlighted matches.
- Read with focus mode, adjustable type, copy/share actions, favorites, notes and a local reading history.
- Switch between Persian and English, RTL and LTR layouts, multiple themes and separate app/poem fonts.
- Save selected poems for offline reading on the current device.
- Explore Flow for a random archive couplet, popular and most-favorited poems, a signed-in reader's trail, Hafez and Molana fortunes, the most-shared poems and couplets, and newly added archive poets.
- Install the app as a PWA on supported browsers.
- Register and sign in through the server. Profile details, scrypt-hashed passwords, favorites, reading history and share activity are stored in SQLite; the username-only remember option never stores a password.
- Review member records, device snapshots, feedback and aggregate poem/favorite/share counts in the protected server admin panel.

## Run Without Server Sync

Serve this folder over HTTP; opening `index.html` with `file://` does not support the app's data loading or service worker.

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080>. Static mode supports browsing and local guest preferences, but account registration/sign-in, server activity and server feedback require the Node server below.

## Run With The Optional Server

Requires Node.js `22.5` or later. No package installation is needed; SQLite is built into Node.

```bash
JARYAN_ADMIN_PASSWORD="choose-a-strong-server-password" JARYAN_SHAYAN_PASSWORD="choose-a-strong-user-password" node server/server.js
```

The server serves the app and API on port `8787` by default. It seeds the `admin` administrator and `shayan` user on first startup. Set `JARYAN_ADMIN_PASSWORD` and `JARYAN_SHAYAN_PASSWORD` before deployment; passwords are stored as scrypt hashes. Admin signs in with username `admin`; sessions are stored in SQLite and expire after eight hours.

### Server Settings

- `PORT` and `HOST`: listen port and network interface; defaults are `8787` and `0.0.0.0`.
- `JARYAN_ADMIN_PASSWORD`: set a unique server administrator password before deployment; when supplied, the admin password hash is refreshed at startup.
- `JARYAN_SHAYAN_PASSWORD`: password used when the seeded `shayan` account is first created.
- `JARYAN_DB_PATH`: SQLite file path. It must be outside the public app folder. By default the server creates `../.jaryan-private/jaryan.sqlite` relative to the app folder. Keep this same file on a private persistent volume across upgrades.
- `JARYAN_ALLOWED_ORIGINS`: comma-separated list of additional frontend origins allowed to call the API. Same-origin requests work without this setting.
- `JARYAN_TRUST_PROXY=true`: use only behind a trusted proxy that overwrites forwarded IP/protocol/country headers; otherwise forwarded values are ignored.
- `JARYAN_COOKIE_SECURE=false`: local plain-HTTP testing only. Keep the secure-cookie default for an HTTPS deployment.

Keep the SQLite file and backups private. At registration, users consent to storing profile fields, favorites, poem reading history and activity, plus device details, IP address and user agent; country is recorded only when trusted proxy headers are enabled and supplied. Passwords are stored as scrypt hashes. Flow uses aggregate views, shares and favorites, while signed-in users also see their own saved/read trail. Guest feedback stores only its category, message and page; signed-in feedback may be linked to the member and request metadata.

## Deploy

Static hosting supports the local-only app. To use server features, run the Node server over HTTPS or host the API separately and set `window.JARYAN_API_BASE` before `app.js` loads. If the frontend is on a different origin, list that exact origin in `JARYAN_ALLOWED_ORIGINS`. For server admin sign-in, serve the frontend and API on the same origin or same site; the strict session cookie is not sent cross-site. Keep `data`, `assets`, `service-worker.js` and their paths intact; serve `.bin` files without a `Content-Encoding: gzip` header.

## Project Structure

```text
index.html                 Application shell
app.js                     Routing, rendering, state and interactions
styles.css                 Responsive design, themes and motion
data/                      Poet catalogue, poem indexes and compressed poems
assets/                    App icon and bundled fonts
service-worker.js          App shell and offline data cache
search-worker.js           On-demand full-text search
package.json               Start, check and test scripts
server/server.js           Static host and optional SQLite API
server/schema.sql          Database schema
server/server.test.js      Server integration test
server/README.md           Server configuration and API notes
README.fa.md               Persian documentation
```

## Checks

```bash
npm run check
npm test
```

Or run the checks directly with Node:

```bash
node --check app.js
node --check server/server.js
node --check service-worker.js
node --check search-worker.js
node --test server/server.test.js
```

## Content And License

No project license is declared yet. Confirm redistribution rights and record sources for the poem collections and bundled fonts before publishing or accepting external contributions.
