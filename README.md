# Reel

A quiet desktop library for movies and TV. Reel bundles a streaming backend, a web UI and an
offline subtitle translator into one macOS app, with no separate servers and no Docker.

- **Library home**: Continue Watching (with resume and "Up next") and My List.
- **Subtitles**: many languages from a public subtitle index. A missing language is translated
  offline on your Mac with Argos Translate models. Your chosen language is remembered.
- **First start**: asks for a free [TMDB API key](https://www.themoviedb.org/settings/api).

## Download

Get the latest `.dmg` from [Releases](../../releases): `mac-arm64` for Apple Silicon, `mac-x64` for Intel.
The app isn't signed with an Apple Developer ID, so the first time, right-click **Reel.app → Open**,
or run `xattr -dr com.apple.quarantine /Applications/Reel.app`.

## Repository layout

| Folder     | What it is |
|------------|------------|
| `desktop/` | Electron shell, first-run setup, the Python translation service and the build scripts |
| `core/`    | Streaming backend, based on [cinepro-org/core](https://github.com/cinepro-org/core) @ `98ba005` |
| `ui/`      | React UI, based on [cinepro-org/ui](https://github.com/cinepro-org/ui) @ `3d94408` |

## Develop

Requires Node 22+ on macOS.

```bash
cd desktop
npm ci
npm run prepare:all   # bundled Python + translator, build core + ui, stage them
npm run app           # run Reel
npm run bundle        # unpacked Reel.app in desktop/dist
```

## Releases

Releases are built by GitHub Actions ([`.github/workflows/release.yml`](.github/workflows/release.yml)).
The version lives in `desktop/package.json`.

- **From GitHub**: Actions → **Release** → *Run workflow* → choose `patch`, `minor` or `major`.
  The workflow bumps the version, commits it, tags `vX.Y.Z`, builds Apple Silicon and Intel apps,
  and publishes a GitHub Release with the `.dmg` and `.zip` files.
- **From the terminal**: bump `version` in `desktop/package.json`, commit, then
  `git tag v0.2.0 && git push origin main v0.2.0`.

Every push and pull request also runs [`ci.yml`](.github/workflows/ci.yml), which checks that core and the UI still build.

## License

`core/` and `ui/` come from CinePro and stay under the
[PolyForm Noncommercial License 1.0.0](core/LICENSE) (see `core/LICENSE` and `ui/LICENSE.md`),
so Reel may only be used and shared noncommercially.
