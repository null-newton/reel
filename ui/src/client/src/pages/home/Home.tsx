import { useCallback, useMemo } from "react"
import { Bookmark, Clapperboard } from "lucide-react"
import { useTmdb } from "@/hooks/use-tmdb"
import { useLibrary } from "@/hooks/use-library"
import { MovieRail, TvRail } from "@/components/media/MediaRail/TypedRails.tsx"
import { ContinueWatching } from "@/components/library/ContinueWatching"
import { MyListShelf } from "@/components/library/MyListShelf"

function greeting() {
    const h = new Date().getHours()
    if (h < 6) return "Good night"
    if (h < 12) return "Good morning"
    if (h < 18) return "Good afternoon"
    return "Good evening"
}

export function HomePage() {
    const tmdb = useTmdb()
    const { progress, myList } = useLibrary()

    // Performance reason: stable fetcher identities stop MediaRail from re-fetching from TMDB
    // whenever HomePage re-renders for unrelated reasons.
    const fetchPopularMovies = useCallback(() => tmdb.movie_lists.popular({}), [tmdb])
    const fetchTrendingTv = useCallback(() => tmdb.tv_lists.popular({}), [tmdb])
    const fetchTopRatedMovies = useCallback(() => tmdb.movie_lists.top_rated(), [tmdb])

    const inProgress = useMemo(() => progress.filter((p) => !p.finished || p.type === "tv").slice(0, 20), [progress])
    const libraryEmpty = inProgress.length === 0 && myList.length === 0

    const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })

    return (
        <div className="mx-auto w-full max-w-[1600px] px-6 pt-28 pb-6 md:px-10">
            <header className="mb-10">
                <p className="text-sm text-muted-foreground">{today}</p>
                <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight md:text-4xl">{greeting()}</h1>
            </header>

            <div className="space-y-12">
                <ContinueWatching entries={inProgress} />
                <MyListShelf />

                {libraryEmpty && (
                    <section className="flex flex-col items-start gap-4 rounded-xl border border-border bg-card/50 p-6 md:flex-row md:items-center md:p-8">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                            <Clapperboard className="size-5" />
                        </div>
                        <div>
                            <h2 className="font-heading font-semibold">Your library is empty</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Anything you start watching shows up here, so you can pick up where you left off. Use <Bookmark className="inline size-3.5" /> My List on a title to save it for later.
                            </p>
                        </div>
                    </section>
                )}

                <div className="space-y-10 pt-2">
                    <div className="flex items-baseline justify-between border-t border-border pt-8">
                        <h2 className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">Discover</h2>
                    </div>
                    <MovieRail title="Popular Movies" fetcher={fetchPopularMovies} />
                    <TvRail title="Popular TV Shows" fetcher={fetchTrendingTv} />
                    <MovieRail title="Top Rated Movies" fetcher={fetchTopRatedMovies} />
                </div>
            </div>
        </div>
    )
}

export default HomePage
