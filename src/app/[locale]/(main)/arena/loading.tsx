import { Skeleton } from '@/components/ui/skeleton'

export default function ArenaLoading() {
  return (
    <div className="mx-auto max-w-content px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 space-y-3">
        <Skeleton className="h-8 w-32 rounded-2xl" />
        <Skeleton className="h-5 w-64 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="aspect-square rounded-2xl" />
        <Skeleton className="aspect-square rounded-2xl" />
      </div>
    </div>
  )
}
