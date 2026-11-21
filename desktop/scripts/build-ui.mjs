// Builds the UI as a standalone site wired to the app's local services (works on every OS).
import { execSync } from "node:child_process"
import path from "node:path"

const ui = path.resolve(import.meta.dirname, "..", "..", "ui")
const run = (cmd, env = {}) => execSync(cmd, { cwd: ui, stdio: "inherit", env: { ...process.env, ...env } })

run("npm ci --no-audit --no-fund")
run("npx vite build", {
    NODE_ENV: "production",
    VITE_STANDALONE: "true",
    VITE_OMSS_API_URL: "http://127.0.0.1:47321",
    VITE_EXTRAS_URL: "http://127.0.0.1:47322",
    VITE_TMDB_API_KEY: "",
})
