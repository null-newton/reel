import * as React from "react"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils.ts"
import { useMediaDrawer } from "@/components/media/drawer/hooks/useMediaDrawer"
import { pressable } from "@/lib/tv"

export interface MediaCardProps {
    title: string
    imagePath?: string | null
    imageAlt?: string
    aspectRatio?: "portrait" | "landscape"
    className?: string
    type: "movie" | "tv"
    id: number
    rating: number
    year: number
}

// Performance reason: rails render 6-20+ of these per page; without memo, every rail
// re-render (e.g. a sibling rail loading) re-rendered every card in every other rail too.
export const MediaCard = React.memo(
    React.forwardRef<HTMLDivElement, MediaCardProps>(({ title, imagePath, imageAlt, aspectRatio = "portrait", className, rating, year, id, type }, ref) => {
        const { open } = useMediaDrawer()

        return (
            <div ref={ref} className={cn("group cursor-pointer outline-none", className)} onClick={() => open({ type: type, id: id })} {...pressable(() => open({ type: type, id: id }))} aria-label={title}>
                <div
                    className={cn(
                        "relative overflow-hidden rounded-lg bg-muted ring-1 ring-white/5 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.7)] group-hover:ring-white/20 group-focus-visible:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-primary",
                        aspectRatio === "portrait" ? "aspect-2/3" : "aspect-video"
                    )}
                >
                    {imagePath ? (
                        <img src={imagePath} alt={imageAlt || title} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                        <div className="flex h-full items-center justify-center p-3 text-center text-sm text-muted-foreground">{title}</div>
                    )}
                </div>
                <div className="mt-2.5 space-y-0.5 px-0.5">
                    <div className="truncate text-sm font-medium text-foreground/90 group-hover:text-foreground group-focus-visible:text-foreground">{title}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {!isNaN(year) && <span>{year}</span>}
                        {rating > 0 && (
                            <span className="flex items-center gap-0.5">
                                <Star className="size-3 fill-current" />
                                {rating.toFixed(1)}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        )
    })
)

MediaCard.displayName = "MediaCard"
