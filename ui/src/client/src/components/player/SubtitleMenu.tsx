import { useMemo } from "react"
import { Check, Languages } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useSubtitles } from "./hooks/useSubtitles"
import { useAppSettings } from "@/hooks/use-appsettings"
import { LANGUAGES, languageName, getLanguage, TRANSLATABLE_SOURCES, TRANSLATABLE_TARGETS } from "./utils/languages"
import { EXTRAS_URL } from "@/lib/reel"
import type { NormalizedSubtitle } from "./types/source.types"

const row = (active: boolean) =>
    `flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors ${active ? "bg-white/15 text-white" : "text-zinc-300 hover:bg-white/10"}`

/**
 * Language-first subtitle picker. Choosing a language is remembered for future plays;
 * the player then picks the best track (or auto-translates when there is none).
 */
export function SubtitleMenu() {
    const { t } = useTranslation("player")
    const { subtitles, selectedSubtitle, selectSubtitle } = useSubtitles()
    const { subtitleLanguage, subtitlesEnabled, setSubtitleLanguage, setSubtitlesEnabled } = useAppSettings()

    const byLanguage = useMemo(() => {
        const map = new Map<string, NormalizedSubtitle[]>()
        for (const s of subtitles) {
            if (s.kind === "translated") continue
            const key = s.lang ?? "unknown"
            map.set(key, [...(map.get(key) ?? []), s])
        }
        return map
    }, [subtitles])

    const available = useMemo(
        () =>
            [...byLanguage.keys()].sort((a, b) => {
                if (a === subtitleLanguage) return -1
                if (b === subtitleLanguage) return 1
                if (a === "unknown") return 1
                if (b === "unknown") return -1
                return languageName(a).localeCompare(languageName(b))
            }),
        [byLanguage, subtitleLanguage]
    )

    const canTranslate = !!EXTRAS_URL && subtitles.some((s) => s.kind === "external" && !s.forced && s.lang && TRANSLATABLE_SOURCES.has(s.lang))
    const translateTargets = LANGUAGES.filter((l) => TRANSLATABLE_TARGETS.has(l.code) && !byLanguage.has(l.code))

    const chooseLanguage = (code: string) => {
        setSubtitlesEnabled(true)
        setSubtitleLanguage(code)
        // let the player pick the best track for this language
        if (selectedSubtitle?.lang !== code) selectSubtitle(undefined)
    }

    const active = subtitlesEnabled ? selectedSubtitle : undefined

    return (
        <div className="w-72 space-y-3 text-sm">
            <button onClick={() => setSubtitlesEnabled(false)} className={row(!subtitlesEnabled)}>
                <span className="font-medium">{t("selectors.subtitlesOff")}</span>
                {!subtitlesEnabled && <Check className="size-4" />}
            </button>

            {available.length > 0 && (
                <div>
                    <div className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Available</div>
                    {available.map((code) => {
                        const tracks = byLanguage.get(code)!
                        const isLang = subtitlesEnabled && subtitleLanguage === code
                        const lang = getLanguage(code)
                        return (
                            <div key={code}>
                                <button onClick={() => chooseLanguage(code)} className={row(isLang)} disabled={code === "unknown"}>
                                    <span className="font-medium">
                                        {code === "unknown" ? "Other" : lang?.name ?? code}
                                        {lang && lang.native !== lang.name && <span className="ml-2 text-xs text-zinc-500">{lang.native}</span>}
                                    </span>
                                    <span className="flex items-center gap-2 text-xs text-zinc-500">
                                        {tracks.length > 1 && tracks.length}
                                        {isLang && <Check className="size-4 text-white" />}
                                    </span>
                                </button>
                                {/* Variants of the chosen language (different releases / sync) */}
                                {(isLang || code === "unknown") && tracks.length > 1 && (
                                    <div className="my-1 ml-3 border-l border-white/10 pl-2">
                                        {tracks.map((s, i) => (
                                            <button key={`${s.url}-${i}`} onClick={() => selectSubtitle(s)} className={row(active?.url === s.url)}>
                                                <span className="truncate text-xs">
                                                    {s.label}
                                                    {s.kind === "embedded" && <span className="ml-1.5 text-zinc-500">· in stream</span>}
                                                    {s.forced && <span className="ml-1.5 text-zinc-500">· forced</span>}
                                                </span>
                                                {active?.url === s.url && <Check className="size-3.5" />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {canTranslate && translateTargets.length > 0 && (
                <div>
                    <div className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
                        <Languages className="size-3.5" /> Auto-translate (offline)
                    </div>
                    {translateTargets.map((l) => {
                        const isLang = subtitlesEnabled && subtitleLanguage === l.code
                        return (
                            <button key={l.code} onClick={() => chooseLanguage(l.code)} className={row(isLang)}>
                                <span>
                                    {l.name}
                                    {l.native !== l.name && <span className="ml-2 text-xs text-zinc-500">{l.native}</span>}
                                </span>
                                {isLang && <Check className="size-4" />}
                            </button>
                        )
                    })}
                </div>
            )}

            {available.length === 0 && !canTranslate && <div className="p-4 text-center text-zinc-500">No subtitles found for this title.</div>}
        </div>
    )
}
