# Jaryan Server

Poetry browsing works as a static site without this server. The Node.js process serves the app and provides account registration/sign-in, persistent profiles, favorites, per-user reading history, Flow activity, feedback and a protected admin panel.

## Requirements And Start

Use Node.js `22.5` or later. No npm install is required; the server uses Node's built-in SQLite module.

```bash
JARYAN_ADMIN_PASSWORD="choose-a-strong-server-password" JARYAN_SHAYAN_PASSWORD="choose-a-strong-user-password" node server/server.js
```

The server listens on `0.0.0.0:8787` by default and serves the app from the project folder. On first startup it seeds the `admin` administrator and `shayan` user. Configure both environment passwords before deployment. Passwords are stored as scrypt hashes; sessions are stored in SQLite and expire after eight hours.

## Configuration

- `HOST`, `PORT`: listen address and port (`0.0.0.0`, `8787` by default).
- `JARYAN_ADMIN_PASSWORD`: unique administrator password. When supplied, the admin hash is refreshed at startup.
- `JARYAN_SHAYAN_PASSWORD`: password used when the seeded `shayan` account is first created.
- `JARYAN_DB_PATH`: SQLite file path. It must be outside the app's public root. Default: `../.jaryan-private/jaryan.sqlite` relative to the app folder. Keep the same file on a private persistent volume across app upgrades.
- `JARYAN_ALLOWED_ORIGINS`: comma-separated additional frontend origins. Same-origin requests are allowed by default.
- `JARYAN_TRUST_PROXY=true`: enable only behind a trusted reverse proxy that overwrites forwarded client IP, protocol and country headers.
- `JARYAN_COOKIE_SECURE=false`: local plain-HTTP testing only. Keep the default secure cookie setting in HTTPS deployments.

The server applies origin checks, request rate limits, login throttling and an eight-hour `HttpOnly; SameSite=Strict` session. Keep the database, backups and seed passwords private. Only allow trusted origins; do not enable proxy trust unless the proxy sanitizes its headers.

## Stored Data

After explicit consent, registration stores username, a scrypt password hash, display name, email, mobile, Jalali birth date, consent time, device details, user agent and request IP. Country is available only from trusted proxy headers. Profiles, favorites, per-user poem reading history, views and share events are stored in SQLite. Flow displays aggregate view/share/favorite rankings plus the signed-in user's saved/read trail. Member feedback can be linked to the member and include request metadata; guest feedback stores category, message and page only.

The server creates its database directory when needed. Use a private persistent volume for `JARYAN_DB_PATH` in production and back it up securely. Do not place the database under the static app folder.

## API Routes

- `GET /api/v1/health`: service health check.
- `GET /api/v1/flow`: aggregate popular, favorited and shared poets/poems/couplets.
- `GET /api/v1/auth/username-availability?username=...`: validate and check a username.
- `GET /api/v1/auth/session`, `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`: account and session operations.
- `GET /api/v1/auth/data`: signed-in user's profile, favorites and reading history.
- `POST /api/v1/auth/profile`, `POST /api/v1/auth/credentials`, `POST /api/v1/auth/favorites`, `POST /api/v1/auth/history/clear`: signed-in account updates.
- `POST /api/v1/feedback`: submit guest or linked member feedback.
- `POST /api/v1/views`: increment an aggregate poem view count.
- `POST /api/v1/shares`: increment aggregate counts for a whole poem or up to 100 selected couplets.
- `GET /api/v1/admin/session`, `POST /api/v1/admin/login`, `POST /api/v1/admin/logout`: admin session operations. Login requires username `admin` and the configured password.
- `GET /api/v1/admin/data`, `POST /api/v1/admin/member/update`: protected admin data and profile update.

For a cross-origin frontend, set `JARYAN_ALLOWED_ORIGINS` to the exact origin(s). Set `window.JARYAN_API_BASE` before `app.js` loads when the API is hosted separately.

The session cookie is `SameSite=Strict`; sign-in therefore requires the frontend and API to be same-origin or at least same-site. A cross-site frontend cannot keep the session cookie.

## Test

```bash
npm run check
npm test
```

Or run the server integration test directly with `node --test server/server.test.js`.
