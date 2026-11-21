import React, { useEffect, useRef, useState } from "react"
import Hls from "hls.js"
import { useTranslation } from "react-i18next"
import { usePlayerState } from "./hooks/usePlayerState"
import { PlayerControls } from "./PlayerControls"
import { LoadingState } from "./LoadingState"
import { useEpisodeAutoplay } from "./hooks/useEpisodeAutoplay"
import { EpisodeAutoplayOverlay } from "./EpisodeAutoplayOverlay"
import { useSubtitles } from "@/components/player/hooks/useSubtitles.ts"
import { CustomSubtitles } from "@/components/player/CustomSubtitles"
import { useAudioTracks } from "@/components/player/hooks/useAudioTracks"
import { useMediaWatchContext } from "@/components/player/providers/MediaWatchProvider"
import { useAppSettings } from "@/hooks/use-appsettings"
import { useLibrary } from "@/hooks/use-library"
import type { NormalizedSubtitle } from "@/components/player/types/source.types"
import { isForcedLabel, languageFromCode, languageFromLabel, languageName, TRANSLATABLE_SOURCES, TRANSLATABLE_TARGETS } from "@/components/player/utils/languages"
import { EXTRAS_URL } from "@/lib/reel"

// Free multi-language subtitle index (by TMDB id), also used by core's VidRock provider
const SUBTITLE_INDEX_URL = "https://sub.vdrk.site/v1"

/** Best subtitle for the preferred language: a native track, else an auto-translation */
// eslint-disable-next-line react-refresh/only-export-components
export function pickSubtitle(subtitles: NormalizedSubtitle[], lang: string): NormalizedSubtitle | undefined {
    const native = subtitles.filter((s) => s.lang === lang && s.kind !== "translated" && !s.forced)
    // Tracks embedded in the stream are always in sync with it, so prefer those
    const embedded = native.find((s) => s.kind === "embedded")
    if (embedded) return embedded
    if (native.length) return native[0]

    if (!EXTRAS_URL || !TRANSLATABLE_TARGETS.has(lang)) return undefined
    const external = subtitles.filter((s) => s.kind === "external" && !s.forced && s.lang && TRANSLATABLE_SOURCES.has(s.lang))
    const source = external.find((s) => s.lang === "en") ?? external[0]
    if (!source) return undefined
    return translatedSubtitle(source, lang)
}

// eslint-disable-next-line react-refresh/only-export-components
export function translatedSubtitle(source: NormalizedSubtitle, lang: string): NormalizedSubtitle {
    return {
        url: `translated:${lang}:${source.url}`,
        label: `${languageName(lang)} (auto-translated)`,
        format: "vtt",
        kind: "translated",
        lang,
        sourceUrl: source.url,
        sourceLang: source.lang,
    }
}

const prettyLabel = (label: string) => label.replace(/(\D)(\d+)$/, "$1 $2").replace(/\bHi\b/, "SDH")

// Subtitles embedded in the HLS stream get a pseudo URL so they can live in the same menu
// as external VTT files; hls.js renders them natively instead of <CustomSubtitles>.
const HLS_SUB_PREFIX = "hls-subtitle:"
const isEmbeddedSubtitle = (url?: string) => !!url && url.startsWith(HLS_SUB_PREFIX)

// ISO 639-1 -> common ISO 639-2 codes used in HLS manifests
const LANG_ALIASES: Record<string, string[]> = {
    en: ["en", "eng"],
    nl: ["nl", "nld", "dut"],
    de: ["de", "deu", "ger"],
    fr: ["fr", "fra", "fre"],
    es: ["es", "spa"],
    it: ["it", "ita"],
    pt: ["pt", "por"],
}
function sameLanguage(a?: string, b?: string) {
    if (!a || !b) return false
    const x = a.toLowerCase().split(/[-_]/)[0]
    const y = b.toLowerCase().split(/[-_]/)[0]
    if (x === y) return true
    return Object.values(LANG_ALIASES).some((codes) => codes.includes(x) && codes.includes(y))
}

export function MediaPlayer() {
    const videoRef = useRef<HTMLVideoElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const hlsRef = useRef<Hls | null>(null)

    const { media, isPlaying, isLoading, currentTime, duration, volume, isMuted, setIsPlaying, setIsLoading, setCurrentTime, setDuration, setVolume, setIsMuted, setError } = usePlayerState()
    const { t } = useTranslation("player")

    const { handleEpisodeEnded } = useEpisodeAutoplay()
    const { selectedSubtitle, selectSubtitle, subtitles } = useSubtitles()
    const { selectedAudioTrack, selectAudioTrack, audioTracks } = useAudioTracks()
    const { addSubtitles } = useMediaWatchContext()
    const { locale, subtitleLanguage, subtitlesEnabled } = useAppSettings()
    const { saveProgress, getProgress } = useLibrary()

    // Latest values for use inside hls.js event handlers
    const prefsRef = useRef({ locale, audioTracks, selectAudioTrack, addSubtitles })
    useEffect(() => {
        prefsRef.current = { locale, audioTracks, selectAudioTrack, addSubtitles }
    })

    const [showControls, setShowControls] = useState(true)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [showAutoplay, setShowAutoplay] = useState(false)
    const [isPiP, setIsPiP] = useState(false)
    const [playbackRate, setPlaybackRate] = useState(1)
    const [qualities, setQualities] = useState<
        {
            index: number
            height: number
            label: string
        }[]
    >([])

    const [currentQuality, setCurrentQuality] = useState(-1)

    const controlsTimeoutRef = useRef<number | null>(null)

    const selectedSource = media?.playback.selectedSource

    // Initialize HLS or Native Video
    useEffect(() => {
        const video = videoRef.current
        if (!video || !selectedSource) return

        setIsLoading(true)

        // Start playing as soon as the stream is ready (no extra click after "Resolving sources")
        const autoplay = () => {
            video
                .play()
                .then(() => setIsPlaying(true))
                .catch(() => setIsPlaying(false))
        }
        let nativeReady: (() => void) | null = null

        if (selectedSource.type === "hls") {
            if (Hls.isSupported()) {
                const hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: false,
                })
                hls.loadSource(selectedSource.url)
                hls.attachMedia(video)
                hlsRef.current = hls

                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    autoplay()
                    const levels = hls.levels.map((level, index) => ({
                        index,
                        height: level.height,
                        label: `${level.height}p`,
                    }))

                    setQualities(levels)
                    setIsLoading(false)
                })

                // Pick the audio track in the user's language instead of the manifest's DEFAULT
                hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
                    const prefs = prefsRef.current
                    const preferred = [prefs.locale, navigator.language, "en"]
                    for (const lang of preferred) {
                        const idx = data.audioTracks.findIndex((t) => sameLanguage(t.lang, lang))
                        if (idx >= 0) {
                            if (hls.audioTrack !== idx) hls.audioTrack = idx
                            const match = prefs.audioTracks.find((t) => sameLanguage(t.language, data.audioTracks[idx].lang))
                            if (match) prefs.selectAudioTrack(match)
                            break
                        }
                    }
                })

                // Expose subtitles embedded in the stream; keep them off until the user picks one
                hls.subtitleDisplay = false
                hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => {
                    hls.subtitleTrack = -1
                    const embedded: NormalizedSubtitle[] = data.subtitleTracks.map((t) => ({
                        url: `${HLS_SUB_PREFIX}${t.id}`,
                        label: t.name || t.lang || `Track ${t.id + 1}`,
                        format: "vtt",
                        kind: "embedded",
                        lang: languageFromCode(t.lang) ?? languageFromLabel(t.name),
                        forced: t.forced || isForcedLabel(t.name) || t.lang === "forced",
                    }))
                    if (embedded.length > 0) prefsRef.current.addSubtitles(embedded)
                })

                hls.on(Hls.Events.ERROR, (_, data) => {
                    if (data.fatal) {
                        setError(`HLS Fatal Error: ${data.type}`)
                    }
                })
            } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                nativeReady = autoplay
                video.src = selectedSource.url
            }
        } else {
            nativeReady = autoplay
            video.src = selectedSource.url
        }
        if (nativeReady) video.addEventListener("loadedmetadata", nativeReady, { once: true })

        return () => {
            if (nativeReady) video.removeEventListener("loadedmetadata", nativeReady)
            if (hlsRef.current) {
                hlsRef.current.destroy()
                hlsRef.current = null
            }
        }
    }, [selectedSource, setError, setIsLoading, setIsPlaying])

    // Apply the audio track chosen in the settings menu
    useEffect(() => {
        const hls = hlsRef.current
        if (!hls || !selectedAudioTrack) return
        const idx = hls.audioTracks.findIndex((t) => sameLanguage(t.lang, selectedAudioTrack.language))
        if (idx >= 0 && hls.audioTrack !== idx) hls.audioTrack = idx
    }, [selectedAudioTrack])

    // Apply the subtitle chosen in the settings menu (embedded HLS track vs. external file)
    useEffect(() => {
        const hls = hlsRef.current
        if (!hls) return
        if (isEmbeddedSubtitle(selectedSubtitle?.url)) {
            const id = Number(selectedSubtitle!.url.slice(HLS_SUB_PREFIX.length))
            const idx = hls.subtitleTracks.findIndex((t) => t.id === id)
            hls.subtitleTrack = idx
            hls.subtitleDisplay = idx >= 0
        } else {
            hls.subtitleTrack = -1
            hls.subtitleDisplay = false
        }
    }, [selectedSubtitle])

    // Load extra subtitle languages for this movie / episode
    const mediaKey = media ? `${media.type}:${media.id}:${media.seasonNumber ?? ""}:${media.episodeNumber ?? ""}` : ""
    useEffect(() => {
        if (!media) return
        const controller = new AbortController()
        const url = media.type === "movie" ? `${SUBTITLE_INDEX_URL}/movie/${media.id}` : `${SUBTITLE_INDEX_URL}/tv/${media.id}/${media.seasonNumber}/${media.episodeNumber}`
        fetch(url, { signal: controller.signal })
            .then((res) => (res.ok ? res.json() : []))
            .then((list: { label: string; file: string }[]) => {
                if (!Array.isArray(list)) return
                const extra: NormalizedSubtitle[] = list
                    .filter((s) => s?.file && s?.label)
                    .map((s) => ({
                        url: s.file,
                        label: prettyLabel(s.label),
                        format: "vtt",
                        kind: "external",
                        lang: languageFromLabel(s.label),
                        forced: isForcedLabel(s.label),
                    }))
                prefsRef.current.addSubtitles(extra)
            })
            .catch(() => {
                /* offline or index unavailable: keep the sources' own subtitles */
            })
        return () => controller.abort()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mediaKey])

    // Pick subtitles in the remembered language (native track, else auto-translation)
    useEffect(() => {
        if (!media) return
        if (!subtitlesEnabled) {
            if (selectedSubtitle) selectSubtitle(undefined)
            return
        }
        const current = selectedSubtitle
        const hasNative = subtitles.some((s) => s.lang === subtitleLanguage && s.kind !== "translated" && !s.forced)
        // Keep the user's chosen variant as long as it matches the preferred language
        if (current && current.lang === subtitleLanguage && (current.kind !== "translated" || !hasNative)) return
        const best = pickSubtitle(subtitles, subtitleLanguage)
        if (best && best.url !== current?.url) selectSubtitle(best)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subtitles, subtitleLanguage, subtitlesEnabled, mediaKey])

    // When a new source loads, drop a stale embedded-subtitle selection
    useEffect(() => {
        if (isEmbeddedSubtitle(selectedSubtitle?.url)) selectSubtitle(undefined)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedSource])

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.playbackRate = playbackRate
        }
    }, [playbackRate])

    // Sync isPlaying state
    useEffect(() => {
        const video = videoRef.current
        if (!video) return

        if (isPlaying) {
            video.play().catch(() => setIsPlaying(false))
        } else {
            video.pause()
        }
    }, [isPlaying, setIsPlaying])

    // Sync volume/mute to video element
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.volume = isMuted ? 0 : volume
            videoRef.current.muted = isMuted
        }
    }, [volume, isMuted])

    useEffect(() => {
        const video = videoRef.current

        if (!video) return

        const handleEnterPiP = () => setIsPiP(true)
        const handleLeavePiP = () => setIsPiP(false)

        video.addEventListener("enterpictureinpicture", handleEnterPiP)
        video.addEventListener("leavepictureinpicture", handleLeavePiP)

        return () => {
            video.removeEventListener("enterpictureinpicture", handleEnterPiP)
            video.removeEventListener("leavepictureinpicture", handleLeavePiP)
        }
    }, [])

    // ── Watch progress (Continue Watching + resume) ──
    const lastSavedRef = useRef(0)
    const persistProgress = (force = false) => {
        const video = videoRef.current
        if (!video || !media || !isFinite(video.duration) || video.duration <= 0) return
        const now = Date.now()
        if (!force && now - lastSavedRef.current < 5000) return
        if (video.currentTime < 5) return // don't record accidental opens
        lastSavedRef.current = now
        saveProgress({
            type: media.type,
            id: media.id,
            title: media.title,
            posterUrl: media.posterUrl,
            backdropUrl: media.type === "tv" ? media.showBackdropUrl || media.backdropUrl : media.backdropUrl,
            season: media.seasonNumber,
            episode: media.episodeNumber,
            episodeTitle: media.episodeTitle,
            position: video.currentTime,
            duration: video.duration,
        })
    }

    // Save when leaving the page / switching episodes
    const persistRef = useRef(persistProgress)
    useEffect(() => {
        persistRef.current = persistProgress
    })
    useEffect(() => () => persistRef.current(true), [selectedSource])

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime)
            persistProgress()
        }
    }

    const resumedRef = useRef<string | null>(null)
    const handleLoadedMetadata = () => {
        const video = videoRef.current
        if (video) {
            setDuration(video.duration)
            setIsLoading(false)

            // Resume where the user left off (once per source)
            if (media && resumedRef.current !== selectedSource?.url) {
                resumedRef.current = selectedSource?.url ?? null
                const saved = getProgress(media.type, media.id, media.seasonNumber, media.episodeNumber)
                if (saved && !saved.finished && saved.position > 15 && saved.position < video.duration - 30) {
                    video.currentTime = saved.position
                    setCurrentTime(saved.position)
                }
            }
        }
    }

    const handleEnded = () => {
        persistProgress(true)
        setIsPlaying(false)
        if (media?.type === "tv" && media.episodeNumber !== undefined) {
            setShowAutoplay(true)
        }
    }

    const handleMouseMove = () => {
        setShowControls(true)
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
        controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000)
    }

    const togglePlay = () => setIsPlaying(!isPlaying)

    const handleSeek = (val: number[]) => {
        if (videoRef.current) {
            videoRef.current.currentTime = val[0]
            setCurrentTime(val[0])
        }
    }

    const togglePictureInPicture = async () => {
        const video = videoRef.current

        if (!video) return

        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture()
                setIsPiP(false)
            } else {
                await video.requestPictureInPicture()
                setIsPiP(true)
            }
        } catch (err) {
            console.error("PiP failed:", err)
        }
    }

    const handleQualityChange = (level: number) => {
        if (!hlsRef.current) return

        hlsRef.current.currentLevel = level
        setCurrentQuality(level)
    }

    const toggleMute = () => setIsMuted(!isMuted)

    const handleVolumeChange = (val: number[]) => {
        setVolume(val[0])
        if (val[0] === 0) {
            setIsMuted(true)
        } else if (isMuted) {
            setIsMuted(false)
        }
    }

    const toggleFullscreen = () => {
        if (!containerRef.current) return
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen()
            setIsFullscreen(true)
        } else {
            document.exitFullscreen()
            setIsFullscreen(false)
        }
    }

    if (!selectedSource)
        return (
            <LoadingState
                message={
                    <div className={"flex flex-col items-center justify-center"}>
                        <span className={"text-lg"}>{t("states.resolving")}</span>
                        <span>{t("states.resolvingSub")}</span>
                    </div>
                }
            />
        )

    return (
        <div ref={containerRef} className="group relative h-screen w-full overflow-hidden" onMouseMove={handleMouseMove} onMouseLeave={() => setShowControls(false)}>
            <video
                ref={videoRef}
                className="h-full w-full"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleEnded}
                onPause={() => persistProgress(true)}
                onWaiting={() => setIsLoading(true)}
                onPlaying={() => setIsLoading(false)}
                onClick={togglePlay}
                preload="auto"
                crossOrigin="anonymous"
                poster={media?.backdropUrl.replace("w300", "original")}
                playsInline
            />

            {selectedSubtitle && !isEmbeddedSubtitle(selectedSubtitle.url) && <CustomSubtitles key={selectedSubtitle.url} subtitle={selectedSubtitle} currentTime={currentTime} />}

            {isLoading && !isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
                    <LoadingState message={t("states.buffering")} />
                </div>
            )}

            <PlayerControls
                isPlaying={isPlaying}
                onDoubleClick={toggleFullscreen}
                onWheel={(e: React.WheelEvent<HTMLDivElement>) => {
                    // scroll up = increase volume
                    const delta = -e.deltaY * 0.001

                    const newVolume = Math.max(0, Math.min(1, volume + delta))

                    setVolume(newVolume)

                    if (newVolume === 0) {
                        setIsMuted(true)
                    } else if (isMuted) {
                        setIsMuted(false)
                    }
                }}
                currentTime={currentTime}
                onDivClick={togglePlay}
                duration={duration}
                volume={volume}
                isMuted={isMuted}
                isFullscreen={isFullscreen}
                onTogglePlay={togglePlay}
                onSeek={handleSeek}
                onToggleMute={toggleMute}
                onVolumeChange={handleVolumeChange}
                onToggleFullscreen={toggleFullscreen}
                show={showControls || !isPlaying}
                ref={containerRef}
                isPiP={isPiP}
                onTogglePiP={togglePictureInPicture}
                playbackRate={playbackRate}
                onPlaybackRateChange={setPlaybackRate}
                qualities={qualities}
                currentQuality={currentQuality}
                onQualityChange={handleQualityChange}
            />

            <EpisodeAutoplayOverlay
                show={showAutoplay}
                onNext={() => {
                    setShowAutoplay(false)
                    handleEpisodeEnded()
                }}
                onCancel={() => setShowAutoplay(false)}
            />
        </div>
    )
}
