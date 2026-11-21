/** Shared helpers for Reel's desktop features. */

/** Local extras service (offline subtitle translation); only set in the desktop build. */
export const EXTRAS_URL = (import.meta.env.VITE_EXTRAS_URL as string | undefined)?.replace(/\/$/, "")

export function watchPath(type: "movie" | "tv", id: string | number, season?: number, episode?: number) {
    return type === "movie" ? `/watch/movie/${id}` : `/watch/tv/${id}?s=${season ?? 1}&e=${episode ?? 1}`
}
