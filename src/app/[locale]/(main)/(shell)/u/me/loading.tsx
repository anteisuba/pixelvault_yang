import { Skeleton } from '@/components/ui/skeleton'
import { LibraryTileSkeletonGrid } from '@/components/ui/library-kit'

/** 个人主页 `/u/me` 加载骨架。 */
export default function ProfileMeLoading() {
  return (
    <div
      aria-busy="true"
      className="flex min-h-page flex-col gap-5 bg-background px-4 pt-6 pb-12 md:px-8"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 text-center">
        <Skeleton className="size-20 rounded-full bg-muted" />
        <Skeleton className="h-5 w-28 rounded-md bg-muted" />
        <Skeleton className="h-3.5 w-44 rounded-md bg-muted" />
      </div>
      <div className="mx-auto w-full max-w-5xl">
        <LibraryTileSkeletonGrid count={6} caption={false} />
      </div>
    </div>
  )
}
