# Reel

A quiet desktop library for movies and TV. Reel bundles a streaming backend, a web UI and an
offline subtitle translator into one app for macOS, Windows and Linux, with no separate servers and no Docker.
There's also a standalone **Android TV** app that runs everything on the TV itself.

- **Library home**: Continue Watching (with resume and "Up next") and My List.
- **Subtitles**: many languages from a public subtitle index. A missing language is translated
  offline on your computer with Argos Translate models. Your chosen language is remembered.
- **First start**: asks for a free [TMDB API key](https://www.themoviedb.org/settings/api).

## Download

Get the latest build from [Releases](../../releases):

- **macOS**: `mac-arm64.dmg` (Apple Silicon) or `mac-x64.dmg` (Intel). It isn't signed with an Apple
  Developer ID, so macOS blocks the first start. Open it once, then go to **System Settings → Privacy & Security** and
  click **Open Anyway** next to Reel. Or, in Terminal: `xattr -dr com.apple.quarantine /Applications/Reel.app`.
- **Windows**: `win-x64-setup.exe`. SmartScreen may warn because it isn't signed: **More info → Run anyway**.
- **Linux**: `linux-x86_64.AppImage` or `linux-arm64.AppImage` (`chmod +x`, then run), or the `.tar.gz`.
- **Android TV**: `androidtv-universal.apk` (or the smaller `armeabi-v7a` / `arm64-v8a` one for your box). Sideload it
  with an app like Downloader or `adb install`. It runs fully on the TV; offline subtitle translation is desktop-only.

## Repository layout

| Folder     | What it is |
|------------|------------|
| `desktop/` | Electron shell, first-run setup, the Python translation service and the build scripts |
| `tv/`      | Android TV app: core runs on [nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile), the UI in a full-screen WebView |
| `core/`    | Streaming backend, based on [cinepro-org/core](https://github.com/cinepro-org/core) @ `98ba005` |
| `ui/`      | React UI, based on [cinepro-org/ui](https://github.com/cinepro-org/ui) @ `3d94408` |

## Develop

Requires Node 22+ (macOS, Windows or Linux).

```bash
cd desktop
npm ci
npm run prepare:all   # bundled Python + translator, build core + ui, stage them
npm run app           # run Reel
npm run bundle        # unpacked app in desktop/dist
```

Android TV (needs JDK 17, the Android SDK + NDK, and Gradle 8.11, or open `tv/` in Android Studio):

```bash
node tv/scripts/prepare.mjs        # nodejs-mobile, core, TV build of the UI -> app assets
gradle -p tv assembleDebug         # APKs in tv/app/build/outputs/apk/debug
```

The UI's TV mode (remote navigation) can also be tried in any browser by adding `?tv=1` to the URL and using the arrow keys.

## Releases

Releases are built by GitHub Actions ([`.github/workflows/release.yml`](.github/workflows/release.yml)).
The version lives in `desktop/package.json`.

- **From GitHub**: Actions → **Release** → *Run workflow* → choose `patch`, `minor` or `major`.
  The workflow bumps the version, commits it, tags `vX.Y.Z`, builds macOS (Apple Silicon + Intel),
  Windows (x64), Linux (x64 + arm64) and Android TV, and publishes a GitHub Release with all the installers.
  The Android TV build is also installed on an emulator and smoke-tested.
- **Test build**: pick `test` instead (optionally with **platforms** = mac, win, linux or tv). It builds from the current commit and keeps the
  files as workflow artifacts, without changing the version or publishing anything.
- **From the terminal**: bump `version` in `desktop/package.json`, commit, then
  `git tag v0.2.0 && git push origin main v0.2.0`.

Every push and pull request also runs [`ci.yml`](.github/workflows/ci.yml), which checks that core and the UI still build.

## License

`core/` and `ui/` come from CinePro and stay under the
[PolyForm Noncommercial License 1.0.0](core/LICENSE) (see `core/LICENSE` and `ui/LICENSE.md`),
so Reel may only be used and shared noncommercially.
