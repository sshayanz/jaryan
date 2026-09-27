# Jaryan Server

The static app can run without a server, but account and feedback sync use these endpoints when the app is served by this Node process.

## Run

```bash
npm start
```

The server serves the app and creates `server/data/jaryan.sqlite` on first start. Set `PORT`, `HOST`, `JARYAN_DB_PATH`, and `JARYAN_ALLOWED_ORIGIN` when deploying behind a proxy.

## API

- `GET /api/v1/health`
- `POST /api/v1/users/upsert`
- `POST /api/v1/feedback`

IP address and country are taken from trusted reverse-proxy headers when present. Device details are accepted only after the account consent checkbox is selected. The schema is in `schema.sql`; users, consent events, device snapshots and feedback are separate tables so the model can grow without changing the app shell.
