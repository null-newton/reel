# Reel desktop shell

Electron app that bundles **CinePro Core** (`../core`) and **CinePro UI** (`../ui`) into one app — no separate servers, no Docker.

How it works:
- Core runs inside the app as a background process on `127.0.0.1:47321`.
- Offline subtitle translation runs as a bundled Python service on `127.0.0.1:47322`.
- The UI is built as a static standalone site and served on `127.0.0.1:47320`, pre-configured to talk to the local core.
- On first start you enter your TMDB API key; it is saved in the app's user-data folder and given to both core and UI. Change it via the **Reel → Change TMDB API key…** menu.

```bash
npm install
npm run prepare:all   # fetch Python + translation runtime, build core + ui, stage into ./stage
npm run app           # run the app in dev
npm run dist          # build the macOS dmg + zip into ./dist
```

## Subtitle translation

Missing subtitle languages are translated offline with [Argos Translate](https://github.com/argosopentech/argos-translate)
models, run by `services/translate.py` on a bundled standalone Python (`npm run python` puts it in `./python`).
Each language pair (~80–100 MB) downloads once into the app's data folder (`models/argos`) on first use.
