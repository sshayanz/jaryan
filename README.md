# Jaryan | Persian Poetry Archive

**Version:** `0.6.5`  
**Languages:** English · [فارسی](README.fa.md)

Jaryan is a lightweight, bilingual archive for discovering, searching, reading and saving Persian poetry. The app works as a static site; an optional Node.js server adds consent-based member sync, feedback collection, aggregate poem views and share counts, and a separate server admin panel.

## Features

- Browse poets, collections and poems, or search Persian verse with normalized text and highlighted matches.
- Read with focus mode, adjustable type, copy/share actions, favorites, notes and a local reading history.
- Switch between Persian and English, RTL and LTR layouts, multiple themes and separate app/poem fonts.
- Save selected poems for offline reading on the current device.
- Explore Flow for a random archive couplet, popular poets and poems, Hafez and Molana fortunes, the most-shared poems and couplets, and newly added archive poets.
- Install the app as a PWA on supported browsers.
- Keep user accounts and reading data in this browser. Registration asks for consent before sending account/device details to the optional server; account passwords are not sent to it.
- Review consented server member records, device snapshots, feedback and aggregate poem counts in the protected server admin panel.

## Run Without Server Sync

Serve this folder over HTTP; opening `index.html` with `file://` does not support the app's data loading or service worker.

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080>. This static option keeps accounts, favorites, notes and reading history in the browser. Server-backed account/device sync and server feedback collection require the Node server below.

## Run With The Optional Server

Requires Node.js `22.5` or later. No package installation is needed; SQLite is built into Node.

```bash
JARYAN_ADMIN_PASSWORD="use-a-unique-password-of-at-least-16-characters" node server/server.js
```

The server serves the app and API on port `8787` by default. Sign in to the server admin panel with username `admin` and the configured password. If the password is missing or shorter than 16 characters, admin sign-in is disabled. Admin sessions last up to eight hours and are held in memory, so restarting the server signs admins out.

### Server Settings

- `PORT` and `HOST`: listen port and network interface; defaults are `8787` and `0.0.0.0`.
- `JARYAN_ADMIN_PASSWORD`: required for server admin sign-in; use a unique secret with at least 16 characters.
- `JARYAN_DB_PATH`: SQLite file path. It must be outside the public app folder. By default the server creates `../.jaryan-private/jaryan.sqlite` relative to the app folder.
- `JARYAN_ALLOWED_ORIGINS`: comma-separated list of additional frontend origins allowed to call the API. Same-origin requests work without this setting.
- `JARYAN_TRUST_PROXY=true`: use only behind a trusted proxy that overwrites forwarded IP/protocol/country headers; otherwise forwarded values are ignored.
- `JARYAN_COOKIE_SECURE=false`: local plain-HTTP testing only. Keep the secure-cookie default for an HTTPS deployment.

Keep the SQLite file and backups private. The server records member profile fields, consent time, device details, IP address and user agent for opted-in accounts. Country is recorded only when trusted proxy headers are enabled and supplied. Guest feedback stores only its category, message and page; member feedback may also be linked to the member/device and request metadata. Poem views and poem/couplet share actions are aggregate counts with no per-reader identity or history. Share counts start with this update; earlier shares were not tracked. Local-only profiles and passwords are not uploaded.

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
