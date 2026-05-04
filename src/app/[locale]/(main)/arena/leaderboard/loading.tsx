import { Skeleton } from '@/components/ui/skeleton'

export default function ArenaLeaderboardLoading() {
  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <section className="editorial-hero">
          <div className="editorial-hero-copy space-y-4">
            <Skeleton className="h-3 w-24 rounded-full" />
            <Skeleton className="h-10 w-80 rounded-2xl" />
            <Skeleton className="h-5 w-full max-w-2xl rounded-xl" />
          </div>
          <Skeleton className="h-10 w-36 rounded-full" />
        </section>

        <section className="editorial-panel space-y-8">
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-44 rounded-2xl" />
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/75">
            <div className="space-y-px">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[64px_1fr_96px] gap-4 bg-card/70 px-4 py-3 sm:grid-cols-[64px_1fr_100px_96px]"
                >
                  <Skeleton className="h-5 rounded-xl" />
                  <Skeleton className="h-5 rounded-xl" />
                  <Skeleton className="hidden h-5 rounded-xl sm:block" />
                  <Skeleton className="h-5 rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
