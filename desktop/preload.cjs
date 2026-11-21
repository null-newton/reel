const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("cineproDesktop", {
    saveSetup: (tmdbApiKey) => ipcRenderer.invoke("setup:save", tmdbApiKey),
    reset: () => ipcRenderer.invoke("setup:reset"),
})
