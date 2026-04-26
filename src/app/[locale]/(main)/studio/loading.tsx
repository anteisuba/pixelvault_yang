import { Skeleton } from '@/components/ui/skeleton'

export default function StudioLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      <div className="w-64 shrink-0 space-y-3">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
      <div className="flex flex-1 flex-col gap-3">
        <Skeleton className="flex-1 rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </div>
  )
}
