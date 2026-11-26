import { Skeleton } from '@/components/ui/skeleton'

/** 设置页路由加载骨架（手机 S1 暖石地台 + 分组白卡，桌面双栏骨架）。 */
export default function SettingsLoading() {
  return (
    <div
      aria-busy="true"
      className="flex min-h-page flex-col gap-3 bg-bubble px-3 pt-3 pb-10 dark:bg-background md:bg-background md:px-8 md:pt-8"
    >
      <div className="flex h-10 items-center justify-between md:hidden">
        <Skeleton className="size-8 rounded-full bg-muted" />
        <Skeleton className="h-4 w-16 rounded-md bg-muted" />
        <span className="size-8" aria-hidden />
      </div>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-ring">
          <Skeleton className="size-12 rounded-full bg-muted" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-28 rounded-md bg-muted" />
            <Skeleton className="h-3 w-40 rounded-md bg-muted" />
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-ring">
          <Skeleton className="h-4 w-32 rounded-md bg-muted" />
          <Skeleton className="h-4 w-44 rounded-md bg-muted" />
          <Skeleton className="h-4 w-24 rounded-md bg-muted" />
        </div>
        <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-ring">
          <Skeleton className="h-4 w-28 rounded-md bg-muted" />
          <Skeleton className="h-4 w-36 rounded-md bg-muted" />
        </div>
      </div>
    </div>
  )
}
