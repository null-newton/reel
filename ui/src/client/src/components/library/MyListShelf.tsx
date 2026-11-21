import { useLibrary } from "@/hooks/use-library"
import { MediaCard } from "@/components/media/MediaRail/MediaCard"

export function MyListShelf() {
    const { myList } = useLibrary()
    if (myList.length === 0) return null

    return (
        <section className="space-y-4">
            <h2 className="font-heading text-lg font-semibold tracking-tight">My List</h2>
            <div className="shelf -mx-6 flex gap-4 overflow-x-auto px-6 pb-2 md:-mx-10 md:px-10">
                {myList.map((item) => (
                    <MediaCard
                        key={`${item.type}:${item.id}`}
                        className="w-[150px] shrink-0 md:w-[170px]"
                        title={item.title}
                        imagePath={item.posterUrl}
                        type={item.type}
                        id={Number(item.id)}
                        year={item.year ?? NaN}
                        rating={0}
                    />
                ))}
            </div>
        </section>
    )
}
