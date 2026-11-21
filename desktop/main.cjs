// Reel — Electron shell that runs CinePro Core, the extras service and the UI locally.
const { app, BrowserWindow, ipcMain, utilityProcess, shell, Menu } = require("electron")
const http = require("node:http")
const fs = require("node:fs")
const { spawn } = require("node:child_process")
const path = require("node:path")

const CORE_PORT = 47321 // must match VITE_OMSS_API_URL used when building the UI
const UI_PORT = 47320 // fixed so the UI origin (and its localStorage) stays stable
const EXTRAS_PORT = 47322 // must match VITE_EXTRAS_URL used when building the UI
const HOST = "127.0.0.1"

// The app used to be called "CinePro": carry its data (TMDB key, library, settings) over once.
;(() => {
    try {
        const legacy = path.join(app.getPath("appData"), "CinePro")
        const current = app.getPath("userData")
        if (legacy !== current && fs.existsSync(legacy) && !fs.existsSync(path.join(current, "config.json"))) {
            fs.cpSync(legacy, current, {
                recursive: true,
                force: false,
                errorOnExist: false,
                filter: (src) => !/Singleton(Lock|Socket|Cookie)$|[\\/](Cache|Code Cache|GPUCache)([\\/]|$)/.test(src),
            })
            console.log(`[reel] migrated data from ${legacy}`)
        }
    } catch (err) {
        console.warn("[reel] data migration skipped:", err.message)
    }
})()

const stageDir = app.isPackaged ? path.join(process.resourcesPath, "stage") : path.join(__dirname, "stage")
const configFile = () => path.join(app.getPath("userData"), "config.json")

let coreProc = null
let uiServer = null
let mainWindow = null

function readConfig() {
    try {
        return JSON.parse(fs.readFileSync(configFile(), "utf8"))
    } catch {
        return {}
    }
}

function writeConfig(cfg) {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true })
    fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2))
}

// ---------- Core (OMSS backend) ----------
function startCore(tmdbApiKey) {
    return new Promise((resolve, reject) => {
        const coreDir = path.join(stageDir, "core")
        const entry = path.join(coreDir, "dist", "server.js")
        if (!fs.existsSync(entry)) return reject(new Error(`Core not found at ${entry}. Run "npm run prepare:all".`))

        coreProc = utilityProcess.fork(entry, [], {
            cwd: coreDir,
            serviceName: "reel-core",
            stdio: "pipe",
            env: {
                ...process.env,
                HOST,
                PORT: String(CORE_PORT),
                NODE_ENV: "production",
                TMDB_API_KEY: tmdbApiKey,
                CACHE_TYPE: "memory",
                PROVIDER_TIMEOUT_MS: "10000", // don't let one slow provider block "Resolving sources"
                CORS_ORIGIN: "*",
                STREMIO_ADDON: "false",
                MCP_ENABLED: "false",
            },
        })
        coreProc.stdout?.on("data", (d) => process.stdout.write(`[core] ${d}`))
        coreProc.stderr?.on("data", (d) => process.stderr.write(`[core] ${d}`))
        coreProc.on("exit", (code) => {
            console.log(`[core] exited with code ${code}`)
            coreProc = null
        })

        // Poll until the core answers HTTP
        const started = Date.now()
        const probe = () => {
            const req = http.get({ host: HOST, port: CORE_PORT, path: "/", timeout: 1000 }, (res) => {
                res.resume()
                resolve()
            })
            req.on("error", () => {
                if (!coreProc) return reject(new Error("Core process exited during startup"))
                if (Date.now() - started > 30000) return reject(new Error("Core did not start within 30s"))
                setTimeout(probe, 300)
            })
        }
        probe()
    })
}

// ---------- Extras (offline subtitle translation, Argos models via bundled Python) ----------
let extrasProc = null
function startExtras() {
    const base = app.isPackaged ? process.resourcesPath : __dirname
    const python = path.join(base, "python", "bin", "python3")
    const script = path.join(base, "services", "translate.py")
    if (!fs.existsSync(python)) {
        console.warn(`[extras] no bundled Python at ${python} — run "npm run python"; subtitle translation is off`)
        return
    }
    extrasProc = spawn(python, ["-u", script], {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
            ...process.env,
            PYTHONNOUSERSITE: "1",
            EXTRAS_PORT: String(EXTRAS_PORT),
            MODELS_DIR: path.join(app.getPath("userData"), "models", "argos"),
        },
    })
    extrasProc.stdout.on("data", (d) => process.stdout.write(`[extras] ${d}`))
    extrasProc.stderr.on("data", (d) => process.stderr.write(`[extras] ${d}`))
    extrasProc.on("exit", (code) => {
        console.log(`[extras] exited with code ${code}`)
        extrasProc = null
    })
}

// ---------- UI (static SPA) ----------
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
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
}

function startUiServer() {
    const uiDir = path.join(stageDir, "ui")
    const indexHtml = path.join(uiDir, "index.html")
    if (!fs.existsSync(indexHtml)) return Promise.reject(new Error(`UI not found at ${uiDir}. Run "npm run prepare:all".`))

    uiServer = http.createServer((req, res) => {
        const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname)
        let file = path.normalize(path.join(uiDir, urlPath))
        if (!file.startsWith(uiDir)) {
            res.writeHead(403).end()
            return
        }
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = indexHtml // SPA fallback
        res.writeHead(200, {
            "Content-Type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
            "Cache-Control": file === indexHtml ? "no-cache" : "public, max-age=31536000",
        })
        fs.createReadStream(file).pipe(res)
    })
    return new Promise((resolve, reject) => {
        uiServer.once("error", reject)
        uiServer.listen(UI_PORT, HOST, resolve)
    })
}

// ---------- Windows ----------
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1320,
        height: 860,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: "#16130f",
        title: "Reel",
        show: false,
        webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, autoplayPolicy: "no-user-gesture-required" },
    })
    mainWindow.once("ready-to-show", () => mainWindow.show())

    // External links open in the user's browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (!url.startsWith(`http://${HOST}:${UI_PORT}`)) shell.openExternal(url)
        return { action: "deny" }
    })
    mainWindow.on("closed", () => (mainWindow = null))
}

async function launchMain(cfg) {
    mainWindow.loadFile(path.join(__dirname, "setup.html"), { query: { mode: "loading" } })
    try {
        if (!uiServer) await startUiServer()
        if (!extrasProc) startExtras()
        if (!coreProc) await startCore(cfg.tmdbApiKey)
    } catch (err) {
        mainWindow.loadFile(path.join(__dirname, "setup.html"), { query: { mode: "error", msg: String(err.message ?? err) } })
        return
    }

    const uiUrl = `http://${HOST}:${UI_PORT}/`
    const wc = mainWindow.webContents
    // Seed the UI's localStorage with the TMDB key + local core URL (only if the user hasn't set them)
    wc.once("did-finish-load", async () => {
        const seeded = await wc.executeJavaScript(`(() => {
            let changed = false
            const set = (k, v) => { if (!localStorage.getItem(k) || localStorage.getItem(k) === '""') { localStorage.setItem(k, JSON.stringify(v)); changed = true } }
            set("app.tmdbApiKey", ${JSON.stringify(cfg.tmdbApiKey)})
            set("app.omssUrl", "http://${HOST}:${CORE_PORT}")
            return changed
        })()`)
        if (seeded) wc.reload()
    })
    mainWindow.loadURL(uiUrl)
}

// ---------- IPC (setup screen) ----------
ipcMain.handle("setup:save", async (_e, tmdbApiKey) => {
    const key = String(tmdbApiKey ?? "").trim()
    if (!key) return { ok: false, error: "Please enter a TMDB API key." }
    const cfg = { ...readConfig(), tmdbApiKey: key }
    writeConfig(cfg)
    launchMain(cfg)
    return { ok: true }
})

ipcMain.handle("setup:reset", async () => {
    writeConfig({})
    app.relaunch()
    app.quit()
})

// ---------- Lifecycle ----------
function buildMenu() {
    const template = [
        ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
        { role: "editMenu" },
        {
            label: "View",
            submenu: [{ role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "togglefullscreen" }],
        },
        {
            label: "Reel",
            submenu: [{ label: "Change TMDB API key…", click: () => { writeConfig({}); app.relaunch(); app.quit() } }],
        },
        { role: "windowMenu" },
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

if (!app.requestSingleInstanceLock()) {
    app.quit()
} else {
    app.on("second-instance", () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.focus()
        }
    })

    app.whenReady().then(() => {
        if (process.platform === "darwin" && !app.isPackaged) {
            const icon = path.join(__dirname, "build", "icon.png")
            if (fs.existsSync(icon)) app.dock?.setIcon(icon)
        }
        buildMenu()
        createWindow()
        const cfg = { tmdbApiKey: process.env.TMDB_API_KEY, ...readConfig() }
        if (cfg.tmdbApiKey) launchMain(cfg)
        else mainWindow.loadFile(path.join(__dirname, "setup.html"), { query: { mode: "setup" } })
    })

    app.on("activate", () => {
        if (!mainWindow) {
            createWindow()
            const cfg = readConfig()
            if (cfg.tmdbApiKey) launchMain(cfg)
            else mainWindow.loadFile(path.join(__dirname, "setup.html"), { query: { mode: "setup" } })
        }
    })

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") app.quit()
    })

    app.on("before-quit", () => {
        coreProc?.kill()
        extrasProc?.kill()
        uiServer?.close()
    })
}
