import { createContext, useContext } from "react"
import type { LibraryContextType } from "@/app/providers/library-provider"

export const LibraryContext = createContext<LibraryContextType | null>(null)

export function useLibrary() {
    const ctx = useContext(LibraryContext)
    if (!ctx) throw new Error("LibraryProvider missing")
    return ctx
}
