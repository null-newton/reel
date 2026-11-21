// Copies the built core (with production deps) and the static UI build into ./stage
import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs"
import { execSync } from "node:child_process"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const repo = path.resolve(root, "..")
const stage = path.join(root, "stage")
const coreSrc = path.join(repo, "core")
const uiBuild = path.join(repo, "ui", "build", "client", "client")

for (const p of [path.join(coreSrc, "dist"), uiBuild]) {
    if (!existsSync(p)) throw new Error(`Missing build output: ${p} (run build:core / build:ui first)`)
}

rmSync(stage, { recursive: true, force: true })
mkdirSync(path.join(stage, "core"), { recursive: true })

cpSync(path.join(coreSrc, "dist"), path.join(stage, "core", "dist"), { recursive: true })
for (const f of ["package.json", "package-lock.json"]) cpSync(path.join(coreSrc, f), path.join(stage, "core", f))
execSync("npm ci --omit=dev --no-audit --no-fund", { cwd: path.join(stage, "core"), stdio: "inherit" })

cpSync(uiBuild, path.join(stage, "ui"), { recursive: true })
console.log("Staged into", stage)
