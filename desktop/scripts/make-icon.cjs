// Renders build/icon.svg to build/icon.png (1024x1024) with Chromium, then builds build/icon.icns.
// Run: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require("electron")
const fs = require("node:fs")
const path = require("node:path")
const { execFileSync } = require("node:child_process")

const dir = path.join(__dirname, "..", "build")
app.dock?.hide()
app.whenReady().then(async () => {
    const svg = fs.readFileSync(path.join(dir, "icon.svg"), "utf8")
    const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } })
    win.webContents.setZoomFactor(1)
    await win.loadURL("data:text/html," + encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`))
    await new Promise((r) => setTimeout(r, 300))
    let img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
    if (img.getSize().width !== 1024) img = img.resize({ width: 1024, height: 1024, quality: "best" })
    fs.writeFileSync(path.join(dir, "icon.png"), img.toPNG())

    const set = path.join(dir, "icon.iconset")
    fs.rmSync(set, { recursive: true, force: true })
    fs.mkdirSync(set)
    for (const s of [16, 32, 128, 256, 512]) {
        execFileSync("sips", ["-z", String(s), String(s), path.join(dir, "icon.png"), "--out", path.join(set, `icon_${s}x${s}.png`)], { stdio: "ignore" })
        execFileSync("sips", ["-z", String(s * 2), String(s * 2), path.join(dir, "icon.png"), "--out", path.join(set, `icon_${s}x${s}@2x.png`)], { stdio: "ignore" })
    }
    execFileSync("iconutil", ["-c", "icns", set, "-o", path.join(dir, "icon.icns")])
    fs.rmSync(set, { recursive: true, force: true })
    console.log("icon.png + icon.icns written to", dir)
    app.quit()
})
