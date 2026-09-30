# Jaryan Server

The app works as a static site without this server. The optional Node.js process serves the app and provides consent-based member sync, feedback collection, aggregate poem view/share counts and a protected server admin panel. Local account passwords and reading data remain in the browser.

## Requirements And Start

Use Node.js `22.5` or later. No npm install is required; the server uses Node's built-in SQLite module.

```bash
JARYAN_ADMIN_PASSWORD="use-a-unique-password-of-at-least-16-characters" node server/server.js
```

The server listens on `0.0.0.0:8787` by default and serves the app from the project folder. Sign in to server admin with username `admin` and the configured password. Missing or shorter-than-16-character passwords disable admin sign-in. Admin sessions last up to eight hours and are stored in memory.

## Configuration

- `HOST`, `PORT`: listen address and port (`0.0.0.0`, `8787` by default).
- `JARYAN_ADMIN_PASSWORD`: unique server admin secret; at least 16 characters.
- `JARYAN_DB_PATH`: SQLite file path. It must be outside the app's public root. Default: `../.jaryan-private/jaryan.sqlite` relative to the app folder.
- `JARYAN_ALLOWED_ORIGINS`: comma-separated additional frontend origins. Same-origin requests are allowed by default.
- `JARYAN_TRUST_PROXY=true`: enable only behind a trusted reverse proxy that overwrites forwarded client IP, protocol and country headers.
- `JARYAN_COOKIE_SECURE=false`: local plain-HTTP testing only. Keep the default secure cookie setting in HTTPS deployments.

The server applies origin checks, request rate limits, login throttling and an eight-hour `HttpOnly; SameSite=Strict` admin session. Keep the database, backups and admin password private. Only allow trusted origins; do not enable proxy trust unless the proxy sanitizes its headers.

## Stored Data

After explicit consent, member sync stores the member's local account ID, username, display name, email, mobile, Jalali birth date, consent time, device details, user agent and request IP. Country is available only from trusted proxy headers. Account passwords are never sent to this server. Member feedback can be linked to the member and include device/request metadata; guest feedback stores category, message and page only. Poem views and share actions are aggregate counts per poem or selected couplet, not a per-person reading history. Share counts start after this update; earlier shares were not tracked.

The server creates its database directory when needed. Use a private persistent volume for `JARYAN_DB_PATH` in production and back it up securely. Do not place the database under the static app folder.

## API Routes

- `GET /api/v1/health`: service health check.
- `GET /api/v1/flow`: aggregate popular poets/poems and shared poets/poems/couplets.
- `POST /api/v1/members/sync`: upsert a consented member and device snapshot.
- `POST /api/v1/feedback`: submit guest or linked member feedback.
- `POST /api/v1/views`: increment an aggregate poem view count.
- `POST /api/v1/shares`: increment aggregate counts for a whole poem or up to 100 selected couplets.
- `GET /api/v1/admin/session`, `POST /api/v1/admin/login`, `POST /api/v1/admin/logout`: admin session operations.
- `GET /api/v1/admin/data`, `POST /api/v1/admin/member/update`: protected admin data and profile update.

For a cross-origin frontend, set `JARYAN_ALLOWED_ORIGINS` to the exact origin(s). Set `window.JARYAN_API_BASE` before `app.js` loads when the API is hosted separately.

The admin session cookie is `SameSite=Strict`; server admin sign-in therefore requires the frontend and API to be same-origin or at least same-site. A cross-site frontend may call public sync/feedback routes when allowlisted, but cannot keep the admin session cookie.

## Test

```bash
npm run check
npm test
```

Or run the server integration test directly with `node --test server/server.test.js`.
