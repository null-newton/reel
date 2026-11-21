import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Play, X } from "lucide-react"
import { useLibrary } from "@/hooks/use-library"
import { useTmdb } from "@/hooks/use-tmdb"
import { autoplayService } from "@/components/player/services/autoplay.service"
import type { ProgressEntry } from "@/app/providers/library-provider"
import { cn } from "@/lib/utils"
import { watchPath } from "@/lib/reel"

const sized = (url?: string) => url?.replace(/\/(w\d+|original)\//, "/w780/")

function minutesLeft(entry: ProgressEntry) {
    const left = Math.max(0, Math.round((entry.duration - entry.position) / 60))
    if (left >= 60) return `${Math.floor(left / 60)}h ${left % 60}m left`
    return `${left || 1} min left`
}

/** For a finished episode, find the next one (or null when the series is done). */
function useUpNext(entry: ProgressEntry) {
    const tmdb = useTmdb()
    const [next, setNext] = useState<{ season: number; episode: number } | null | undefined>(entry.finished && entry.type === "tv" ? undefined : null)

    useEffect(() => {
        if (!(entry.finished && entry.type === "tv" && entry.season && entry.episode)) return
        let alive = true
        autoplayService
            .getNextEpisode(tmdb, entry.id, entry.season, entry.episode)
            .then((n) => alive && setNext(n))
            .catch(() => alive && setNext(null))
        return () => {
            alive = false
        }
    }, [entry.finished, entry.type, entry.id, entry.season, entry.episode, tmdb])

    return next
}

function ContinueCard({ entry }: { entry: ProgressEntry }) {
    const navigate = useNavigate()
    const { removeProgress } = useLibrary()
    const upNext = useUpNext(entry)

    // finished movies and finished series drop off the shelf
    if (entry.finished && (entry.type === "movie" || upNext === null)) return null
    if (upNext === undefined && entry.finished) return null // still looking up the next episode

    const target = upNext ?? { season: entry.season, episode: entry.episode }
    const pct = upNext ? 0 : Math.min(100, (entry.position / entry.duration) * 100)

    const subtitle =
        entry.type === "tv"
            ? upNext
                ? `Up next · S${upNext.season} E${upNext.episode}`
                : `S${entry.season} E${entry.episode}${entry.episodeTitle ? ` · ${entry.episodeTitle}` : ""}`
            : minutesLeft(entry)

    return (
        <div className="group relative w-[300px] shrink-0 md:w-[340px]">
            <button onClick={() => navigate(watchPath(entry.type, entry.id, target.season, target.episode))} className="block w-full text-left outline-none">
                <div className="relative aspect-video overflow-hidden rounded-lg bg-muted ring-1 ring-white/5 transition-all duration-300 group-hover:ring-white/20 group-focus-within:ring-2 group-focus-within:ring-primary">
                    {entry.backdropUrl ? (
                        <img src={sized(entry.backdropUrl)} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" />
                    ) : (
                        <div className="h-full w-full bg-linear-to-br from-muted to-card" />
                    )}
                    <div className="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
                        <div className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl">
                            <Play className="ml-0.5 size-5 fill-current" />
                        </div>
                    </div>
                    {/* progress */}
                    <div className="absolute right-0 bottom-0 left-0 h-1 bg-white/15">
                        <div className={cn("h-full bg-primary", pct === 0 && "hidden")} style={{ width: `${pct}%` }} />
                    </div>
                </div>
                <div className="mt-2.5 px-0.5">
                    <div className="truncate text-sm font-medium">{entry.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                        {subtitle}
                        {entry.type === "tv" && !upNext && <span> · {minutesLeft(entry)}</span>}
                    </div>
                </div>
            </button>
            <button
                onClick={() => removeProgress(entry.type, entry.id)}
                className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white/80 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:text-white focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Remove ${entry.title} from Continue Watching`}
                title="Remove from Continue Watching"
            >
                <X className="size-4" />
            </button>
        </div>
    )
}

export function ContinueWatching({ entries }: { entries: ProgressEntry[] }) {
    if (entries.length === 0) return null
    return (
        <section className="space-y-4">
            <h2 className="font-heading text-lg font-semibold tracking-tight">Continue Watching</h2>
            <div className="shelf -mx-6 flex gap-4 overflow-x-auto px-6 pb-2 md:-mx-10 md:px-10">
                {entries.map((e) => (
                    <ContinueCard key={`${e.type}:${e.id}`} entry={e} />
                ))}
            </div>
        </section>
    )
}
