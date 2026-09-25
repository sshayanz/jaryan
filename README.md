# Jaryan multi-file preview

This build keeps the rollback baseline jaryan 0.0.1 untouched.

## Runtime files

- index.html: lightweight document shell
- styles.css: all visual styles
- app.js: application logic and lazy poem loading
- data/catalog.json: poet and book catalogue
- data/poem-index.json: lightweight poem index for archive views
- data/search.bin: compressed full-text search index loaded on first search
- data/poems/*.bin: gzip-compressed book shards loaded on demand
- assets/fonts/*: local fonts

Serve the folder over a static HTTPS host. The .bin files must be served without a Content-Encoding: gzip header because the app decompresses them in the browser.
