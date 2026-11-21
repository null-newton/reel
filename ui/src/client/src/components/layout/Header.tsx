import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { SearchDialog } from "@/components/layout/SearchDialog.tsx"
import { LucideSearch, Settings2 } from "lucide-react"
import { Link, useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useAppSettings } from "@/hooks/use-appsettings.ts"
import { cn } from "@/lib/utils"
import Favicon from "./Favicon"

const NAV_LINKS = [
    { to: "/", labelKey: "common:home", label: "Library" },
    { to: "/movies", labelKey: "common:movie.plural" },
    { to: "/shows", labelKey: "common:tvShow.plural" },
    { to: "/discover", labelKey: "common:discover" },
] as const

export default function Header() {
    const { t } = useTranslation(["header", "common", "settings"])
    const { setShowSearch, showSearch } = useAppSettings()
    const location = useLocation()
    const [scrolled, setScrolled] = useState(false)

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24)
        onScroll()
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => window.removeEventListener("scroll", onScroll)
    }, [])

    // ⌘K / Ctrl+K opens search
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault()
                setShowSearch(true)
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [setShowSearch])

    return (
        <>
            <header
                className={cn(
                    "fixed top-0 left-0 z-19 w-full transition-colors duration-300",
                    scrolled ? "border-b border-border bg-background/85 backdrop-blur-xl" : "border-b border-transparent bg-linear-to-b from-black/60 to-transparent"
                )}
            >
                <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-8 px-6 md:px-10">
                    <Link to="/" className="flex items-center gap-2.5" aria-label="Reel — Library">
                        <Favicon className="h-7" />
                        <span className="font-heading text-lg font-bold tracking-tight text-white">Reel</span>
                    </Link>

                    <nav className="hidden items-center gap-6 sm:flex">
                        {NAV_LINKS.map((link) => {
                            const active = location.pathname === link.to
                            return (
                                <Link
                                    key={link.to}
                                    to={link.to}
                                    className={cn("text-sm transition-colors", active ? "font-semibold text-white" : "font-medium text-white/60 hover:text-white")}
                                >
                                    {"label" in link ? link.label : t(link.labelKey)}
                                </Link>
                            )
                        })}
                    </nav>

                    <div className="ml-auto flex items-center gap-1">
                        <button
                            onClick={() => setShowSearch(!showSearch)}
                            className="hidden h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white md:flex"
                        >
                            <LucideSearch className="size-4" />
                            <span>Search</span>
                            <kbd className="ml-4 rounded bg-white/10 px-1.5 text-[10px] font-medium text-white/50">⌘K</kbd>
                        </button>
                        <Button variant="ghost" size="icon" className="text-white/70 hover:bg-white/10 hover:text-white md:hidden" onClick={() => setShowSearch(!showSearch)} aria-label={t("header:searchPlaceholder")}>
                            <LucideSearch className="size-5" />
                        </Button>
                        <Button asChild variant="ghost" size="icon" className="text-white/70 hover:bg-white/10 hover:text-white">
                            <Link to="/settings" aria-label={t("settings:title")}>
                                <Settings2 className="size-5" />
                            </Link>
                        </Button>
                    </div>
                </div>
            </header>

            <SearchDialog />
        </>
    )
}
