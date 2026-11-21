/**
 * TV mode (Reel for Android TV): arrow-key "spatial" navigation for a D-pad remote,
 * focus styling and Back-button handling. Enabled in the TV build (VITE_TV=true),
 * by the Android app's user agent ("ReelTV"), or with ?tv=1 for testing in a browser.
 */
import type { KeyboardEvent as ReactKeyboardEvent } from "react"

const TV_FLAG = "reel.tv"

function detectTv() {
    if (typeof window === "undefined") return false
    if (import.meta.env.VITE_TV === "true" || /\bReelTV\b/.test(navigator.userAgent)) return true
    try {
        const q = new URLSearchParams(location.search).get("tv")
        if (q === "1") sessionStorage.setItem(TV_FLAG, "1")
        if (q === "0") sessionStorage.removeItem(TV_FLAG)
        return sessionStorage.getItem(TV_FLAG) === "1"
    } catch {
        return false
    }
}

export const IS_TV = detectTv()

/** Props that make a non-button element focusable and "clickable" with OK/Enter. */
export function pressable(onPress: () => void) {
    return {
        role: "button" as const,
        tabIndex: 0,
        onKeyDown: (e: ReactKeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onPress()
            }
        },
    }
}

const FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type=hidden])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
    '[role="menuitem"]',
    '[role="menuitemradio"]',
    '[role="option"]',
].join(",")

type Dir = "up" | "down" | "left" | "right"
const KEY_DIR: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" }

function isVisible(el: HTMLElement) {
    if (!el.getClientRects().length) return false
    const s = getComputedStyle(el)
    if (s.visibility === "hidden" || s.display === "none") return false
    if (el.closest("[inert], [aria-hidden='true']")) return false
    return true
}

/** The open dialog/menu (topmost), or the whole document. */
function scope(): ParentNode {
    const layers = document.querySelectorAll<HTMLElement>(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"]'
    )
    return layers.length ? layers[layers.length - 1] : document
}

function candidates(root: ParentNode) {
    return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => isVisible(el) && !el.closest("[data-tv-skip]"))
}

function center(r: DOMRect) {
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/** Nearest focusable element in a direction: forward distance plus a penalty for drifting sideways. */
function nearest(from: HTMLElement, dir: Dir, list: HTMLElement[]) {
    const a = from.getBoundingClientRect()
    const ca = center(a)
    let best: HTMLElement | null = null
    let bestScore = Infinity
    for (const el of list) {
        if (el === from || from.contains(el) || el.contains(from)) continue
        const b = el.getBoundingClientRect()
        const cb = center(b)
        let forward: number, side: number, overlap: boolean
        if (dir === "left" || dir === "right") {
            forward = dir === "right" ? b.left - a.right : a.left - b.right
            if ((dir === "right" ? cb.x <= ca.x : cb.x >= ca.x) || forward < -a.width / 2) continue
            side = Math.abs(cb.y - ca.y)
            overlap = b.top < a.bottom && b.bottom > a.top
        } else {
            forward = dir === "down" ? b.top - a.bottom : a.top - b.bottom
            if ((dir === "down" ? cb.y <= ca.y : cb.y >= ca.y) || forward < -a.height / 2) continue
            side = Math.abs(cb.x - ca.x)
            overlap = b.left < a.right && b.right > a.left
        }
        const score = Math.max(0, forward) + side * (overlap ? 0.3 : 2)
        if (score < bestScore) {
            bestScore = score
            best = el
        }
    }
    return best
}

export function focusEl(el: HTMLElement | null | undefined) {
    if (!el) return false
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" })
    return true
}

/** True while the video player owns the arrow keys (seek / show controls). */
function playerOwnsKeys(active: Element | null) {
    const player = document.querySelector("[data-tv-player]")
    if (!player) return false
    if (scope() !== document) return false // a menu or settings panel is open
    return !(active && active.closest("[data-tv-controls]"))
}

function onKeyDown(e: KeyboardEvent) {
    const dir = KEY_DIR[e.key]
    if (!dir || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    const active = document.activeElement as HTMLElement | null
    // let text fields move their caret left/right
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && (dir === "left" || dir === "right")) return
    // sliders handle their own arrows
    if (active?.getAttribute("role") === "slider" && (dir === "left" || dir === "right")) return
    if (playerOwnsKeys(active)) return

    const root = scope()
    const list = candidates(root)
    if (!list.length) return
    e.preventDefault()
    const inScope = active && active !== document.body && (root === document || (root as HTMLElement).contains(active))
    if (!inScope) {
        focusEl((root as ParentNode).querySelector<HTMLElement>("[data-tv-autofocus]") ?? list[0])
        return
    }
    focusEl(nearest(active!, dir, list))
}

/**
 * Called by the Android app on the remote's Back button. Returns true when the page handled it
 * (closed a dialog, left the player controls, went back); false lets the app exit.
 */
function onBack(): boolean {
    const layer = scope()
    if (layer !== document) {
        ;(layer as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }))
        return true
    }
    const active = document.activeElement as HTMLElement | null
    if (active?.closest("[data-tv-controls]")) {
        active.blur()
        return true
    }
    if (location.pathname !== "/" && history.length > 1) {
        history.back()
        return true
    }
    return false
}

declare global {
    interface Window {
        __reelBack?: () => boolean
    }
}

export function initTv() {
    if (!IS_TV) return
    document.documentElement.classList.add("tv")
    window.addEventListener("keydown", onKeyDown)
    window.__reelBack = onBack
}
