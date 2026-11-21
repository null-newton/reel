// Downloads a relocatable CPython (astral-sh/python-build-standalone) into desktop/python
// and installs the translation runtime (CTranslate2 + SentencePiece) used by services/translate.py.
//
//   node scripts/fetch-python.mjs [--arch arm64|x64] [--force]

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const RELEASE = "20261110"
const VERSION = "3.12.16"
const PACKAGES = ["ctranslate2==4.9.0", "sentencepiece==0.2.3", "sacremoses==0.1.1"]
// only argostranslate's tokenizers are used; skip its Stanza/spaCy/PyTorch dependencies
const NO_DEPS = ["argostranslate==1.11.0"]

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const arch = args.includes("--arch") ? args[args.indexOf("--arch") + 1] : process.arch
const force = args.includes("--force")
const triple = { arm64: "aarch64-apple-darwin", x64: "x86_64-apple-darwin" }[arch]
if (process.platform !== "darwin" || !triple) {
    console.error(`fetch-python: only macOS arm64/x64 is set up (got ${process.platform}/${arch})`)
    process.exit(1)
}

const target = join(root, "python")
const python = join(target, "bin", "python3")

if (existsSync(python) && !force) {
    console.log(`fetch-python: ${target} already exists (use --force to rebuild)`)
} else {
    rmSync(target, { recursive: true, force: true })
    mkdirSync(target, { recursive: true })
    const name = `cpython-${VERSION}+${RELEASE}-${triple}-install_only_stripped.tar.gz`
    const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE}/${encodeURIComponent(name)}`
    console.log(`fetch-python: downloading ${name}`)
    // archive contains a top-level "python/" folder
    execFileSync("sh", ["-c", `curl -fsSL "$0" | tar -xz -C "$1" --strip-components 1`, url, target], { stdio: "inherit" })
}

console.log(`fetch-python: installing ${PACKAGES.join(", ")}`)
const pip = [python, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "--no-cache-dir"]
execFileSync(pip[0], [...pip.slice(1), ...PACKAGES], { stdio: "inherit" })
execFileSync(pip[0], [...pip.slice(1), "--no-deps", ...NO_DEPS], { stdio: "inherit" })
// trim things the app never needs
for (const p of ["share", "include", "lib/python3.12/test", "lib/python3.12/idlelib", "lib/python3.12/tkinter", "lib/python3.12/ensurepip"]) {
    rmSync(join(target, p), { recursive: true, force: true })
}
execFileSync(python, ["-c", "import ctranslate2, sentencepiece, argostranslate.tokenizer, argostranslate.apply_bpe, sacremoses; print('fetch-python: ok, ctranslate2', ctranslate2.__version__)"], { stdio: "inherit" })
