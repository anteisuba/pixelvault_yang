import { Skeleton } from '@/components/ui/skeleton'

export default function CreatorProfileLoading() {
  return (
    <div className="mx-auto max-w-content px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center gap-4">
        <Skeleton className="size-20 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-40 rounded-xl" />
          <Skeleton className="h-4 w-24 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
