// Prepares everything the Android TV app bundles:
//   - app/libnode/        nodejs-mobile (libnode.so per ABI + headers), downloaded once
//   - build/nodejs-project core (dist + production deps), the TV build of the UI, main.mjs
//   - app/src/main/assets/nodejs-project.zip  (unzipped on the device on first start)
//
//   node scripts/prepare.mjs [--skip-core] [--skip-ui]

import { execFileSync, execSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const NODEJS_MOBILE = "v18.20.4"

const tv = path.resolve(import.meta.dirname, "..")
const repo = path.resolve(tv, "..")
const args = process.argv.slice(2)
const run = (cmd, cwd, env = {}) => execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, ...env } })

// 1. nodejs-mobile
const libnode = path.join(tv, "app", "libnode")
if (!existsSync(path.join(libnode, "bin", "arm64-v8a", "libnode.so"))) {
    const url = `https://github.com/nodejs-mobile/nodejs-mobile/releases/download/${NODEJS_MOBILE}/nodejs-mobile-${NODEJS_MOBILE}-android.zip`
    console.log(`prepare: downloading nodejs-mobile ${NODEJS_MOBILE}`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`)
    const zip = path.join(tv, "build", "nodejs-mobile.zip")
    mkdirSync(path.dirname(zip), { recursive: true })
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
    rmSync(libnode, { recursive: true, force: true })
    mkdirSync(libnode, { recursive: true })
    execFileSync("unzip", ["-q", zip, "-d", libnode])
    rmSync(zip)
}

// 2. core
if (!args.includes("--skip-core")) {
    run("npm ci --no-audit --no-fund", path.join(repo, "core"))
    run("npm run build", path.join(repo, "core"))
}

// 3. UI, TV build: remote navigation on, no desktop-only translation service
if (!args.includes("--skip-ui")) {
    run("npm ci --no-audit --no-fund", path.join(repo, "ui"))
    run("npx vite build", path.join(repo, "ui"), {
        NODE_ENV: "production",
        VITE_STANDALONE: "true",
        VITE_TV: "true",
        VITE_OMSS_API_URL: "http://127.0.0.1:47321",
        VITE_EXTRAS_URL: "",
        VITE_TMDB_API_KEY: "",
    })
}

// 4. assemble the Node project
const project = path.join(tv, "build", "nodejs-project")
rmSync(project, { recursive: true, force: true })
mkdirSync(path.join(project, "core"), { recursive: true })
for (const f of ["main.mjs", "polyfills.mjs", "setup.html"]) cpSync(path.join(tv, "node", f), path.join(project, f))
writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "reel-tv-node", private: true, type: "module" }, null, 2))
const core = path.join(repo, "core")
cpSync(path.join(core, "dist"), path.join(project, "core", "dist"), { recursive: true })
for (const f of ["package.json", "package-lock.json"]) cpSync(path.join(core, f), path.join(project, "core", f))
run("npm ci --omit=dev --no-audit --no-fund --ignore-scripts", path.join(project, "core"))
cpSync(path.join(repo, "ui", "build", "client", "client"), path.join(project, "ui"), { recursive: true })

// 5. zip into the app's assets
const assets = path.join(tv, "app", "src", "main", "assets")
mkdirSync(assets, { recursive: true })
const zip = path.join(assets, "nodejs-project.zip")
rmSync(zip, { force: true })
execFileSync("zip", ["-qr", "-X", zip, "."], { cwd: project })
console.log("prepare: wrote", zip)
