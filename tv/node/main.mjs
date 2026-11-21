// Reel for Android TV — runs inside the app on nodejs-mobile (Node 18).
//
//   node main.mjs <dataDir>
//
// - Serves the UI on 127.0.0.1:47320 (SPA), seeding its localStorage with the TMDB key + core URL.
// - First start: shows /setup to enter a TMDB API key (saved in <dataDir>/config.json).
// - Starts CinePro core in this same process on 127.0.0.1:47321.

import "./polyfills.mjs"
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const HOST = "127.0.0.1"
const UI_PORT = 47320
const CORE_PORT = 47321
const here = path.dirname(fileURLToPath(import.meta.url))
const uiDir = path.join(here, "ui")
const coreDir = path.join(here, "core")
const dataDir = process.argv[2] || here
const configFile = path.join(dataDir, "config.json")

const log = (...a) => console.log("[reel]", ...a)

function readConfig() {
    try {
        return JSON.parse(fs.readFileSync(configFile, "utf8"))
    } catch {
        return {}
    }
}
function writeConfig(cfg) {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2))
}

// ---------- core ----------
let coreState = "stopped" // stopped | starting | ready | error
let coreError = ""
async function startCore(tmdbApiKey) {
    if (coreState === "starting" || coreState === "ready") return
    coreState = "starting"
    Object.assign(process.env, {
        HOST,
        PORT: String(CORE_PORT),
        NODE_ENV: "production",
        TMDB_API_KEY: tmdbApiKey,
        CACHE_TYPE: "memory",
        PROVIDER_TIMEOUT_MS: "10000",
        PUBLIC_URL: `http://${HOST}:${CORE_PORT}`,
    })
    try {
        process.chdir(coreDir)
        await import(pathToFileURL(path.join(coreDir, "dist", "server.js")).href)
        coreState = "ready"
        log("core started")
    } catch (err) {
        coreState = "error"
        coreError = String(err?.stack ?? err)
        console.error("[reel] core failed:", coreError)
    }
}

// ---------- UI server ----------
const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".txt": "text/plain; charset=utf-8",
}

function seedScript(tmdbApiKey) {
    // same rule as the desktop app: only fill in values the user hasn't set themselves
    return `<script>(function(){try{var s=function(k,v){var c=localStorage.getItem(k);if(!c||c==='""')localStorage.setItem(k,JSON.stringify(v))};s("app.tmdbApiKey",${JSON.stringify(tmdbApiKey)});s("app.omssUrl","http://${HOST}:${CORE_PORT}")}catch(e){}})()</script>`
}

let indexHtml = null
function sendIndex(res) {
    indexHtml ??= fs.readFileSync(path.join(uiDir, "index.html"), "utf8")
    const html = indexHtml.replace("<head>", "<head>" + seedScript(readConfig().tmdbApiKey || ""))
    res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-store" })
    res.end(html)
}

function sendJson(res, status, body) {
    res.writeHead(status, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" })
    res.end(JSON.stringify(body))
}

async function readBody(req) {
    let raw = ""
    for await (const chunk of req) {
        raw += chunk
        if (raw.length > 10_000) throw new Error("too large")
    }
    return raw ? JSON.parse(raw) : {}
}

async function checkTmdbKey(key) {
    const isBearer = key.split(".").length === 3
    const url = isBearer ? "https://api.themoviedb.org/3/configuration" : `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(key)}`
    try {
        const r = await fetch(url, { headers: isBearer ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(10_000) })
        if (r.status === 401) return "TMDB rejected this key. Check it and try again."
        return null
    } catch {
        return null // offline or TMDB unreachable: accept and let the app retry later
    }
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${HOST}`)
    const cfg = readConfig()

    if (url.pathname === "/__reel/health") {
        return sendJson(res, 200, { ok: true, configured: !!cfg.tmdbApiKey, core: coreState, error: coreError || undefined })
    }
    if (url.pathname === "/__reel/setup" && req.method === "POST") {
        try {
            const { tmdbApiKey } = await readBody(req)
            const key = String(tmdbApiKey || "").trim()
            if (!key) return sendJson(res, 400, { error: "Enter a TMDB API key." })
            const problem = await checkTmdbKey(key)
            if (problem) return sendJson(res, 400, { error: problem })
            writeConfig({ ...cfg, tmdbApiKey: key })
            startCore(key)
            return sendJson(res, 200, { ok: true })
        } catch (err) {
            return sendJson(res, 400, { error: String(err.message ?? err) })
        }
    }
    if (url.pathname === "/setup" || (!cfg.tmdbApiKey && (url.pathname === "/" || url.pathname === "/index.html"))) {
        res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-store" })
        return res.end(fs.readFileSync(path.join(here, "setup.html")))
    }

    // static files, falling back to index.html for client-side routes
    const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "")
    const file = path.join(uiDir, rel)
    if (!file.startsWith(uiDir)) {
        res.writeHead(403)
        return res.end()
    }
    if (rel && rel !== "index.html") {
        try {
            const stat = fs.statSync(file)
            if (stat.isFile()) {
                const ext = path.extname(file).toLowerCase()
                res.writeHead(200, {
                    "Content-Type": MIME[ext] || "application/octet-stream",
                    "Content-Length": stat.size,
                    "Cache-Control": rel.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache",
                })
                return fs.createReadStream(file).pipe(res)
            }
        } catch {
            /* fall through to the SPA */
        }
        if (path.extname(rel)) {
            res.writeHead(404)
            return res.end()
        }
    }
    sendIndex(res)
})

server.listen(UI_PORT, HOST, () => {
    log(`UI on http://${HOST}:${UI_PORT} (data: ${dataDir})`)
    const key = readConfig().tmdbApiKey
    if (key) startCore(key)
})
