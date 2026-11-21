// nodejs-mobile ships Node 18; CinePro core's dependencies expect a few Node 20 globals.
import { webcrypto } from "node:crypto"
import { File } from "node:buffer"

if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true, writable: true })
if (!globalThis.File) globalThis.File = File
