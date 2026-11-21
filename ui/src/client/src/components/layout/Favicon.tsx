import { cn } from "@/lib/utils"
import * as React from "react"

/** Reel logo mark: a film reel with a trailing strip. Uses currentColor. */
const Favicon: React.FC<React.SVGProps<SVGSVGElement>> = ({ className, ...props }) => {
    const maskId = `reel-mask-${React.useId().replace(/:/g, "")}`
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={cn("h-8 w-auto text-primary", className)} aria-label="Reel" {...props}>
            <defs>
                <mask id={maskId}>
                    <rect width="64" height="64" fill="#fff" />
                    <circle cx="30" cy="15.5" r="5.6" fill="#000" />
                    <circle cx="44.3" cy="25.9" r="5.6" fill="#000" />
                    <circle cx="38.8" cy="42.7" r="5.6" fill="#000" />
                    <circle cx="21.2" cy="42.7" r="5.6" fill="#000" />
                    <circle cx="15.7" cy="25.9" r="5.6" fill="#000" />
                    <circle cx="30" cy="30" r="2.6" fill="#000" />
                </mask>
            </defs>
            <g fill="currentColor" mask={`url(#${maskId})`}>
                <circle cx="30" cy="30" r="24" />
                <path d="M30 54h28a3 3 0 0 1 0 6H30z" />
            </g>
        </svg>
    )
}

export default Favicon
