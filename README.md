# Jaryan | Persian Poetry Archive

**Version:** `0.1.0b7`  
**Languages:** English (default) · [فارسی](README.fa.md)

Jaryan is a lightweight web app for discovering, searching, reading and saving Persian poetry. It is designed for calm reading on desktop and mobile, with a static-first shell, an optional Node/SQLite backend and no framework runtime.

## What It Includes

- Search across real couplets with Persian normalization, delayed loading and highlighted matches.
- Browse poets, collections and poem sections through hash-based routes.
- Read poems with copy, share, save, per-couplet likes and local notes.
- Focus mode for bit-by-bit reading with keyboard and on-screen navigation.
- Glass Fab Morph controls for sharing, copying, focus mode and text size, with a three-level app scale.
- The mobile dock is mounted outside the scaled app shell so archive/search navigation cannot pull it into the page or lock the layout.
- Refined route spacing, larger home actions, glass Fab controls and focus-mode toolbar.
- Focus reading controls now use a compact close button, larger active verses and four-button poem toolbars.
- Poet cards offer a poet fortune action; collection titles and long couplets remain readable at larger sizes.
- Settings support LTR English with three English font stacks, Persian-only font choices, and system theme by default.
- App and poem typography are separate; poem choices include Ravi, Iran Nastaliq, Shekasteh Nastaliq and Mir Emad styles. The three Nastaliq-style fonts are bundled under `assets/fonts`.
- The theme list is Dark mode, Light mode, Dark, Light, Paper and System; System resolves only to the high-contrast Dark mode or Light mode palettes.
- Random poem actions use the shine icon and a restrained animated shine effect.
- Search, account and feedback text fields include a clear button.
- The matching Shayan admin account can access a local account-management panel and export its data.
- Local accounts store a display name and mobile username on-device; account statistics use compact cards.
- Light, paper, dark and system themes, including theme-aware interactive surfaces.
- Local account profile, favorites and reading history stored in IndexedDB with localStorage fallback.
- Optional Node/SQLite server sync stores users, consent events, device snapshots and feedback through versioned API routes.
- Feedback uses an in-app form and falls back to a local outbox when no server is configured.
- Responsive layout with a shorter fixed mobile dock and installable PWA metadata.
- Lazy poem loading, compressed data files and chunked large collections.

## Project Structure

```text
index.html                 Application shell
app.js                     Routing, rendering, state and interactions
styles.css                 Responsive design, themes and motion
fab-morph.tsx              Standalone React/Tailwind Fab Morph reference
manifest.webmanifest       PWA metadata
service-worker.js          Offline shell and data cache
data/catalog.json          Poet and collection catalog
data/poem-index.json       Lightweight poem index
data/search.bin            Compressed full-text search index
data/poems/*.bin           Compressed poem collections
data/poems/chunks/*.bin    Chunks for large collections
assets/                    Fonts and application icon
package.json              Optional Node server command
server/server.js          Static host and SQLite API
server/schema.sql         Extensible user, device, consent and feedback schema
server/README.md          Server setup and API notes
README.fa.md               Persian documentation
```

## Run Locally

The app must be served over HTTP or HTTPS. Opening `index.html` directly with `file://` prevents data fetching and service-worker registration.

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080> in a browser. For account and feedback sync, run `npm start` instead; it serves the same app with the SQLite API on port `8787`.

## Deploy

Jaryan can be deployed as a static site to GitHub Pages, Netlify, Vercel or any HTTPS host.

1. Upload the contents of this directory.
2. Set the site root to the directory containing `index.html`.
3. Keep the `data`, `assets` and `service-worker.js` paths unchanged.
4. Serve `.bin` files without a `Content-Encoding: gzip` header; the app handles decompression in the browser.

## Architecture Notes

Jaryan uses a small vanilla JavaScript renderer with event delegation and hash routing. Catalog and poem-index data load first. Full poem text is fetched only when a collection is opened, while the search index is loaded on demand. Large collections are split into 256-entry chunks. Motion is limited to transform, opacity and filter where possible, and reduced-motion preferences are respected.

Without the optional Node server, the profile and feedback outbox remain device-local. With the server enabled, the consented account/device data and feedback are stored in SQLite through `/api/v1/users/upsert` and `/api/v1/feedback`.

## Verification

The release was checked with:

- JavaScript syntax validation for `app.js` and `service-worker.js`.
- ZIP integrity validation.
- Browser checks for desktop and mobile poem routes.
- Fab open/close behavior, theme-aware colors and outside-click dismissal.
- Persistent saved state, green copy confirmation and focus-mode navigation.
- Header/footer flex sizing, route scroll position and responsive controls.

## Data and Licensing

Before public distribution, document the licenses and sources for the poem corpus and bundled fonts in this section. The project should only be deployed with content that is cleared for redistribution.

## License

No license is declared yet. Add an explicit license before accepting external contributions or publishing the source for reuse.
