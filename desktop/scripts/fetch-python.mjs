// Downloads a relocatable CPython (astral-sh/python-build-standalone) into desktop/python
// and installs the translation runtime used by services/translate.py.
// Works on macOS (arm64/x64), Windows (x64) and Linux (x64/arm64).
//
//   node scripts/fetch-python.mjs [--force]

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const RELEASE = "20261110"
const VERSION = "3.12.16"
const PACKAGES = ["ctranslate2==4.9.0", "sentencepiece==0.2.3", "sacremoses==0.1.1"]
// only argostranslate's tokenizers are used; skip its Stanza/spaCy/PyTorch dependencies
const NO_DEPS = ["argostranslate==1.11.0"]

const TRIPLES = {
    "darwin-arm64": "aarch64-apple-darwin",
    "darwin-x64": "x86_64-apple-darwin",
    "win32-x64": "x86_64-pc-windows-msvc",
    "linux-x64": "x86_64-unknown-linux-gnu",
    "linux-arm64": "aarch64-unknown-linux-gnu",
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const force = process.argv.includes("--force")
const triple = TRIPLES[`${process.platform}-${process.arch}`]
if (!triple) {
    console.error(`fetch-python: no Python build set up for ${process.platform}/${process.arch}`)
    process.exit(1)
}

const target = join(root, "python")
const isWin = process.platform === "win32"
const python = isWin ? join(target, "python.exe") : join(target, "bin", "python3")
const lib = isWin ? join(target, "Lib") : join(target, "lib", "python3.12")

if (existsSync(python) && !force) {
    console.log(`fetch-python: ${target} already exists (use --force to rebuild)`)
} else {
    rmSync(target, { recursive: true, force: true })
    mkdirSync(target, { recursive: true })
    const name = `cpython-${VERSION}+${RELEASE}-${triple}-install_only_stripped.tar.gz`
    const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE}/${encodeURIComponent(name)}`
    console.log(`fetch-python: downloading ${name}`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`)
    const archive = join(root, ".python.tar.gz")
    writeFileSync(archive, Buffer.from(await res.arrayBuffer()))
    // the archive has a top-level "python/" folder; tar ships with macOS, Linux and Windows 10+
    execFileSync("tar", ["-xzf", archive, "-C", target, "--strip-components", "1"], { stdio: "inherit" })
    rmSync(archive, { force: true })
}

console.log(`fetch-python: installing ${[...PACKAGES, ...NO_DEPS].join(", ")}`)
const pip = ["-m", "pip", "install", "--quiet", "--disable-pip-version-check", "--no-cache-dir", "--no-warn-script-location"]
execFileSync(python, [...pip, ...PACKAGES], { stdio: "inherit" })
execFileSync(python, [...pip, "--no-deps", ...NO_DEPS], { stdio: "inherit" })

// trim things the app never needs
for (const p of [join(target, "share"), join(target, "include"), ...["test", "idlelib", "tkinter", "ensurepip"].map((d) => join(lib, d))]) {
    rmSync(p, { recursive: true, force: true })
}
execFileSync(
    python,
    ["-c", "import ctranslate2, sentencepiece, sacremoses, argostranslate.tokenizer; print('fetch-python: ok, ctranslate2', ctranslate2.__version__)"],
    { stdio: "inherit" }
)
