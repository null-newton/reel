import { useEffect, useMemo, useRef, useState } from "react"
import DOMPurify from "dompurify"
import { parseVTT } from "./utils/subtitle"
import { isAdCue, languageName } from "./utils/languages"
import type { NormalizedSubtitle } from "./types/source.types"
import { EXTRAS_URL } from "@/lib/reel"

interface CustomSubtitlesProps {
    subtitle: NormalizedSubtitle
    currentTime: number
}

type Cue = { start: number; end: number; text: string }

const BATCH_SIZE = 20
const LOOKAHEAD_SECONDS = 180

// Translations survive navigating between pages for this session
const translationCache = new Map<string, Map<number, string>>()
// Parsed files, so switching languages back and forth doesn't refetch
const cueCache = new Map<string, Cue[]>()

async function loadCues(url: string): Promise<Cue[]> {
    const cached = cueCache.get(url)
    if (cached) return cached
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const cues = parseVTT(await res.text()).filter((c) => c.text.trim() && !isAdCue(c.text))
    cueCache.set(url, cues)
    return cues
}

const toPlain = (html: string) =>
    html
        .replace(/<[^>]+>/g, "")
        .replace(/\{\\[^}]*\}/g, "")
        .replace(/\s*\n\s*/g, " ")
        .trim()

export function CustomSubtitles({ subtitle, currentTime }: CustomSubtitlesProps) {
    const isTranslated = subtitle.kind === "translated"
    const fileUrl = isTranslated ? subtitle.sourceUrl! : subtitle.url
    const cacheKey = `${fileUrl}|${subtitle.lang}`

    const [cues, setCues] = useState<Cue[]>([])
    const [, setVersion] = useState(0) // bumps when new translations arrive
    const [fetchError, setTranslationError] = useState<string | null>(null)
    const translationError = isTranslated && !EXTRAS_URL ? "translation is only available in the desktop app" : fetchError

    const currentTimeRef = useRef(currentTime)
    useEffect(() => {
        currentTimeRef.current = currentTime
    }, [currentTime])

    useEffect(() => {
        // (the parent re-mounts this component per subtitle, so state starts fresh)
        let cancelled = false
        loadCues(fileUrl)
            .then((parsed) => !cancelled && setCues(parsed))
            .catch((err) => {
                console.error("Failed to load subtitles:", err)
                if (!cancelled) setCues([])
            })
        return () => {
            cancelled = true
        }
    }, [fileUrl])

    // Translate in chunks, always starting from where the viewer is now
    useEffect(() => {
        if (!isTranslated || cues.length === 0 || !EXTRAS_URL) return
        let stopped = false
        const done = translationCache.get(cacheKey) ?? new Map<number, string>()
        translationCache.set(cacheKey, done)

        const pump = async () => {
            while (!stopped) {
                const t = currentTimeRef.current
                // first: untranslated cues in the lookahead window; then everything after; then before
                const ahead = cues.map((c, i) => ({ c, i })).filter(({ c, i }) => c.end >= t - 2 && !done.has(i))
                const near = ahead.filter(({ c }) => c.start <= t + LOOKAHEAD_SECONDS)
                const pool = near.length ? near : ahead.length ? ahead : cues.map((c, i) => ({ c, i })).filter(({ i }) => !done.has(i))
                const batch = pool.slice(0, BATCH_SIZE)
                if (batch.length === 0) return

                try {
                    const res = await fetch(`${EXTRAS_URL}/translate`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ from: subtitle.sourceLang ?? "en", to: subtitle.lang, texts: batch.map(({ c }) => toPlain(c.text)) }),
                    })
                    const body = await res.json()
                    if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
                    batch.forEach(({ i }, k) => done.set(i, body.texts[k] ?? ""))
                    if (!stopped) setVersion((v) => v + 1)
                } catch (err) {
                    console.error("Subtitle translation failed:", err)
                    if (!stopped) setTranslationError(err instanceof Error ? err.message : String(err))
                    return
                }
            }
        }
        pump()
        return () => {
            stopped = true
        }
    }, [isTranslated, cues, cacheKey, subtitle.lang, subtitle.sourceLang])

    const activeIndex = useMemo(() => cues.findIndex((cue) => currentTime >= cue.start && currentTime <= cue.end), [cues, currentTime])
    const activeCue = activeIndex >= 0 ? cues[activeIndex] : undefined
    const translatedText = isTranslated && activeIndex >= 0 ? translationCache.get(cacheKey)?.get(activeIndex) : undefined
    const pending = isTranslated && !!activeCue && translatedText === undefined && !translationError

    return (
        <>
            {pending && (
                <div className="pointer-events-none absolute top-5 right-5 z-20 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80 backdrop-blur">
                    Translating subtitles to {languageName(subtitle.lang)}…
                </div>
            )}
            {translationError && isTranslated && (
                <div className="pointer-events-none absolute top-5 right-5 z-20 max-w-xs rounded-lg bg-black/70 px-3 py-1.5 text-xs text-white/80 backdrop-blur">
                    Couldn't translate subtitles: {translationError}. Showing {languageName(subtitle.sourceLang)}.
                </div>
            )}
            {activeCue && <SubtitleLine html={translatedText ?? activeCue.text} dimmed={pending} />}
        </>
    )
}

function SubtitleLine({ html, dimmed }: { html: string; dimmed?: boolean }) {
    const safeHtml = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ["b", "i", "u", "c", "font", "ruby", "rt", "v", "lang"],
        ALLOWED_ATTR: ["style"],
    })

    return (
        <div className="pointer-events-none absolute right-0 bottom-[15%] left-0 flex justify-center px-4">
            <div
                className={`rounded bg-black/30 px-3 py-1 text-center text-lg whitespace-pre-wrap text-white shadow-lg backdrop-blur-sm transition-opacity md:text-2xl ${dimmed ? "opacity-60" : ""}`}
                dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
        </div>
    )
}
