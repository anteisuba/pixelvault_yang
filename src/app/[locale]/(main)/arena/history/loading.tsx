import { Skeleton } from '@/components/ui/skeleton'

export default function ArenaHistoryLoading() {
  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <section className="editorial-hero">
          <div className="editorial-hero-copy space-y-4">
            <Skeleton className="h-3 w-24 rounded-full" />
            <Skeleton className="h-10 w-72 rounded-2xl" />
            <Skeleton className="h-5 w-full max-w-2xl rounded-xl" />
          </div>
          <Skeleton className="h-10 w-36 rounded-full" />
        </section>

        <section className="editorial-panel space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-7 w-40 rounded-xl" />
            <Skeleton className="h-4 w-72 rounded-xl" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-2xl" />
            ))}
          </div>
        </section>

        <section className="editorial-panel space-y-6">
          <Skeleton className="h-7 w-48 rounded-xl" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-64 rounded-2xl" />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
