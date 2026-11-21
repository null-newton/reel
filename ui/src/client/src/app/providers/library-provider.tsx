import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LibraryContext } from "@/hooks/use-library"

/**
 * Local library: watch progress (for "Continue Watching" + resume) and "My List".
 * Everything lives in localStorage so it survives restarts of the desktop app.
 */

export type LibraryMediaType = "movie" | "tv"

export interface ProgressEntry {
    type: LibraryMediaType
    id: string
    title: string
    posterUrl?: string
    backdropUrl?: string
    // TV only: the episode the user is on
    season?: number
    episode?: number
    episodeTitle?: string
    position: number // seconds
    duration: number // seconds
    updatedAt: number
    finished: boolean
}

export interface ListEntry {
    type: LibraryMediaType
    id: string
    title: string
    posterUrl?: string
    backdropUrl?: string
    year?: number
    addedAt: number
}

export type LibraryContextType = {
    progress: ProgressEntry[] // newest first
    myList: ListEntry[] // newest first
    getProgress: (type: LibraryMediaType, id: string, season?: number, episode?: number) => ProgressEntry | undefined
    saveProgress: (entry: Omit<ProgressEntry, "updatedAt" | "finished">) => void
    removeProgress: (type: LibraryMediaType, id: string) => void
    isInList: (type: LibraryMediaType, id: string) => boolean
    toggleList: (entry: Omit<ListEntry, "addedAt">) => void
}

const PROGRESS_KEY = "app.library.progress"
const LIST_KEY = "app.library.mylist"
const FINISHED_RATIO = 0.92

const keyOf = (type: LibraryMediaType, id: string | number) => `${type}:${id}`

function load<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key)
        return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
        return fallback
    }
}

function store(key: string, value: unknown) {
    try {
        localStorage.setItem(key, JSON.stringify(value))
    } catch {
        // ignore quota / private mode errors
    }
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
    // One progress entry per movie / per show (the most recently watched episode)
    const [progressMap, setProgressMap] = useState<Record<string, ProgressEntry>>(() => load(PROGRESS_KEY, {}))
    const [listMap, setListMap] = useState<Record<string, ListEntry>>(() => load(LIST_KEY, {}))

    // Progress updates arrive every few seconds while playing; write them out lazily.
    const writeTimer = useRef<number | null>(null)
    useEffect(() => {
        if (writeTimer.current) window.clearTimeout(writeTimer.current)
        writeTimer.current = window.setTimeout(() => store(PROGRESS_KEY, progressMap), 500)
        return () => {
            if (writeTimer.current) window.clearTimeout(writeTimer.current)
        }
    }, [progressMap])

    useEffect(() => {
        const flush = () => store(PROGRESS_KEY, progressMap)
        window.addEventListener("beforeunload", flush)
        return () => window.removeEventListener("beforeunload", flush)
    }, [progressMap])

    useEffect(() => store(LIST_KEY, listMap), [listMap])

    const getProgress = useCallback(
        (type: LibraryMediaType, id: string, season?: number, episode?: number) => {
            const entry = progressMap[keyOf(type, id)]
            if (!entry) return undefined
            if (type === "tv" && season !== undefined && episode !== undefined && (entry.season !== season || entry.episode !== episode)) return undefined
            return entry
        },
        [progressMap]
    )

    const saveProgress = useCallback((entry: Omit<ProgressEntry, "updatedAt" | "finished">) => {
        if (!entry.duration || !isFinite(entry.duration)) return
        setProgressMap((prev) => ({
            ...prev,
            [keyOf(entry.type, entry.id)]: {
                ...entry,
                updatedAt: Date.now(),
                finished: entry.position / entry.duration >= FINISHED_RATIO,
            },
        }))
    }, [])

    const removeProgress = useCallback((type: LibraryMediaType, id: string) => {
        setProgressMap((prev) => {
            const next = { ...prev }
            delete next[keyOf(type, id)]
            return next
        })
    }, [])

    const isInList = useCallback((type: LibraryMediaType, id: string) => !!listMap[keyOf(type, id)], [listMap])

    const toggleList = useCallback((entry: Omit<ListEntry, "addedAt">) => {
        setListMap((prev) => {
            const k = keyOf(entry.type, entry.id)
            const next = { ...prev }
            if (next[k]) delete next[k]
            else next[k] = { ...entry, addedAt: Date.now() }
            return next
        })
    }, [])

    const value = useMemo<LibraryContextType>(
        () => ({
            progress: Object.values(progressMap).sort((a, b) => b.updatedAt - a.updatedAt),
            myList: Object.values(listMap).sort((a, b) => b.addedAt - a.addedAt),
            getProgress,
            saveProgress,
            removeProgress,
            isInList,
            toggleList,
        }),
        [progressMap, listMap, getProgress, saveProgress, removeProgress, isInList, toggleList]
    )

    return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}
