// Renders the Android TV home-screen banner (320x180 @ xhdpi) from desktop/build/icon.svg.
// Run from desktop/: npx electron ../tv/scripts/make-banner.cjs
const { app, BrowserWindow } = require("electron")
const fs = require("node:fs")
const path = require("node:path")

const repo = path.join(__dirname, "..", "..")
const out = path.join(repo, "tv", "app", "src", "main", "res", "drawable-xhdpi", "banner.png")

app.dock?.hide()
app.whenReady().then(async () => {
    const svg = fs.readFileSync(path.join(repo, "desktop", "build", "icon.svg"), "utf8").replace(/width="1024" height="1024"/, 'width="112" height="112"')
    const html = `<html><body style="margin:0;width:320px;height:180px;overflow:hidden;
        background:radial-gradient(120% 140% at 20% 0%,#2a221a 0%,#16130f 60%);
        display:flex;align-items:center;gap:18px;padding:0 30px;box-sizing:border-box;
        font-family:-apple-system,'Segoe UI',Roboto,sans-serif">
        ${svg}
        <div style="color:#f3ede4;font-size:56px;font-weight:700;letter-spacing:-1px">Reel</div>
      </body></html>`
    const win = new BrowserWindow({ width: 320, height: 180, show: false, frame: false, webPreferences: { offscreen: true } })
    await win.loadURL("data:text/html," + encodeURIComponent(html))
    await new Promise((r) => setTimeout(r, 300))
    let img = await win.webContents.capturePage({ x: 0, y: 0, width: 320, height: 180 })
    if (img.getSize().width !== 320) img = img.resize({ width: 320, height: 180, quality: "best" })
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, img.toPNG())
    console.log("banner written to", out)
    app.quit()
})
