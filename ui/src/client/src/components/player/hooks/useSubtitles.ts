import { useMemo } from "react"
import { useMediaWatchContext } from "../providers/MediaWatchProvider"

export function useSubtitles() {
    const { state, selectSubtitle } = useMediaWatchContext()
    const list = state.media?.playback.subtitles

    // Sorted copy (sorting the state array in place would mutate React state)
    const subtitles = useMemo(() => [...(list ?? [])].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })), [list])

    return {
        subtitles,
        selectedSubtitle: state.media?.playback.selectedSubtitle,
        selectSubtitle,
    }
}
