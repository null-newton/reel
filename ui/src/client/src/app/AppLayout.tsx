import { Suspense } from "react"
import { Link, Outlet } from "react-router-dom"
import Header from "@/components/layout/Header"
import { MediaDrawerRoot } from "@/components/media/drawer/MediaDrawerRoot"
import { useMediaDrawer } from "@/components/media/drawer/hooks/useMediaDrawer.ts"

const PAGE_FALLBACK = (
    <div className="flex min-h-screen w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
)

export default function AppLayout() {
    const { isVisible } = useMediaDrawer()

    return (
        <div className="relative min-h-screen w-full bg-background text-foreground">
            <MediaDrawerRoot />

            <Header />

            <div id="app-root" className={`relative flex min-h-screen flex-col transition-all duration-500 ease-out ${isVisible ? "scale-[0.97] opacity-90" : "opacity-100"}`}>
                <main className="relative z-10 mx-auto w-full flex-1">
                    <Suspense fallback={PAGE_FALLBACK}>
                        <Outlet />
                    </Suspense>
                </main>

                <footer className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-6 py-10 text-xs text-muted-foreground md:px-10">
                    <span>Reel</span>
                    <Link to="/disclaimer" className="hover:text-foreground">
                        Disclaimer
                    </Link>
                </footer>
            </div>
        </div>
    )
}
