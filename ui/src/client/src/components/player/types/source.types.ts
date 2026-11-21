import type { SourceType, SubtitleFormat } from "@omss/sdk"

export interface NormalizedSource {
    url: string
    type: SourceType
    quality: string
    provider: {
        id: string
        name: string
    }
    audioTracks: NormalizedAudioTrack[]
}

export interface NormalizedSubtitle {
    url: string
    label: string
    format: SubtitleFormat
    /** ISO 639-1 language code, when it could be detected */
    lang?: string
    /** external file, track embedded in the HLS stream, or a machine translation of another track */
    kind?: "external" | "embedded" | "translated"
    forced?: boolean
    /** For kind === "translated": the subtitle file being translated and its language */
    sourceUrl?: string
    sourceLang?: string
}

export interface NormalizedAudioTrack {
    language: string
    label: string
}
