// Downloads a relocatable CPython (astral-sh/python-build-standalone) into desktop/python
// and installs the translation runtime used by services/translate.py.
// Works on macOS (arm64/x64), Windows (x64) and Linux (x64/arm64).
//
//   node scripts/fetch-python.mjs [--arch x64|arm64] [--force]
//
// With --arch for another CPU than this machine's (e.g. x64 on an Apple Silicon runner), the
// packages are installed as that platform's wheels by the host's python3 (pip --platform),
// since the target interpreter can't run here.

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const RELEASE = "20261110"
const VERSION = "3.12.16"
const PACKAGES = ["ctranslate2==4.9.0", "sentencepiece==0.2.2", "sacremoses==0.1.1", "regex==2025.11.3"]
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
const args = process.argv.slice(2)
const force = args.includes("--force")
const arch = args.includes("--arch") ? args[args.indexOf("--arch") + 1] : process.arch
const cross = arch !== process.arch
const triple = TRIPLES[`${process.platform}-${arch}`]
if (!triple) {
    console.error(`fetch-python: no Python build set up for ${process.platform}/${arch}`)
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

console.log(`fetch-python: installing ${[...PACKAGES, ...NO_DEPS].join(", ")} for ${process.platform}/${arch}${cross ? " (cross)" : ""}`)
const pip = ["-m", "pip", "install", "--quiet", "--disable-pip-version-check", "--no-cache-dir", "--no-warn-script-location"]
if (!cross) {
    execFileSync(python, [...pip, ...PACKAGES], { stdio: "inherit" })
    execFileSync(python, [...pip, "--no-deps", ...NO_DEPS], { stdio: "inherit" })
} else {
    // wheel platform tags the target interpreter accepts
    const PLATFORMS = {
        "darwin-x64": ["macosx_11_0_x86_64", "macosx_10_13_x86_64", "macosx_10_9_x86_64", "macosx_10_13_universal2"],
        "darwin-arm64": ["macosx_11_0_arm64", "macosx_10_13_universal2"],
        "linux-x64": ["manylinux_2_28_x86_64", "manylinux_2_27_x86_64", "manylinux_2_17_x86_64", "manylinux2014_x86_64"],
        "linux-arm64": ["manylinux_2_28_aarch64", "manylinux_2_27_aarch64", "manylinux_2_17_aarch64", "manylinux2014_aarch64"],
    }[`${process.platform}-${arch}`]
    if (!PLATFORMS) throw new Error(`fetch-python: cross install not set up for ${process.platform}/${arch}`)
    const site = join(lib, "site-packages")
    const crossPip = [...pip, "--target", site, "--upgrade", "--only-binary=:all:", "--implementation", "cp", "--python-version", "3.12",
        ...["cp312", "abi3", "none"].flatMap((a) => ["--abi", a]), ...PLATFORMS.flatMap((p) => ["--platform", p])]
    const host = process.env.HOST_PYTHON || (isWin ? "python" : "python3")
    execFileSync(host, [...crossPip, ...PACKAGES], { stdio: "inherit" })
    execFileSync(host, [...crossPip, "--no-deps", ...NO_DEPS], { stdio: "inherit" })
}

// trim things the app never needs
for (const p of [join(target, "share"), join(target, "include"), ...["test", "idlelib", "tkinter", "ensurepip"].map((d) => join(lib, d))]) {
    rmSync(p, { recursive: true, force: true })
}
// sanity check (only possible when the interpreter runs on this machine)
if (cross) {
    if (!existsSync(join(lib, "site-packages", "ctranslate2"))) throw new Error("fetch-python: ctranslate2 missing after cross install")
    console.log(`fetch-python: ok (cross-installed for ${arch}, not executed)`)
    process.exit(0)
}
execFileSync(
    python,
    ["-c", "import ctranslate2, sentencepiece, sacremoses, argostranslate.tokenizer; print('fetch-python: ok, ctranslate2', ctranslate2.__version__)"],
    { stdio: "inherit" }
)
