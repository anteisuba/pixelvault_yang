import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface ChatPageSkeletonProps {
  /** 是否包含 48px 手机顶栏骨架（路由切换或首帧水合时开启；会话列表内部切换关闭）。 */
  withHeader?: boolean
  /** 是否包含底部输入框白卡骨架。 */
  withComposer?: boolean
  className?: string
}

/**
 * Apple HIG S1 对话页加载骨架（暖石地台 + 磨砂顶栏 + 交替消息气泡白卡 + 吸底输入卡）：
 * 用于切到 `/studio`、`/studio/c/[id]` 或在抽屉里切换历史对话时，消除白屏闪动。
 */
export function ChatPageSkeleton({
  withHeader = false,
  withComposer = false,
  className,
}: ChatPageSkeletonProps) {
  return (
    <div
      aria-busy="true"
      data-testid="chat-page-skeleton"
      className={cn(
        'flex h-full min-h-0 w-full flex-col overflow-hidden bg-bubble dark:bg-background lg:bg-transparent',
        className,
      )}
    >
      {withHeader ? (
        <div
          aria-hidden
          className="flex h-12 shrink-0 items-center justify-between border-b border-border/50 bg-background/90 px-3 backdrop-blur-md lg:hidden"
        >
          <Skeleton className="size-8 rounded-full bg-muted" />
          <Skeleton className="h-8 w-28 rounded-full bg-card shadow-ring" />
          <Skeleton className="size-8 rounded-full bg-muted" />
        </div>
      ) : null}

      <div
        aria-hidden
        className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-5 overflow-hidden px-4 pt-6 pb-4 md:px-6"
      >
        <div className="ml-auto flex max-w-xs flex-col items-end gap-2">
          <Skeleton className="h-11 w-48 rounded-2xl bg-card shadow-ring" />
        </div>

        <div className="flex items-start gap-2.5">
          <Skeleton className="size-7 shrink-0 rounded-full bg-card shadow-ring" />
          <div className="flex w-full max-w-md flex-col gap-2 rounded-2xl bg-card p-3.5 shadow-ring">
            <Skeleton className="h-3.5 w-11/12 rounded-md bg-muted" />
            <Skeleton className="h-3.5 w-4/5 rounded-md bg-muted" />
            <Skeleton className="h-3.5 w-3/5 rounded-md bg-muted" />
          </div>
        </div>

        <div className="ml-auto flex max-w-xs flex-col items-end gap-2">
          <Skeleton className="h-10 w-36 rounded-2xl bg-card shadow-ring" />
        </div>

        <div className="flex items-start gap-2.5">
          <Skeleton className="size-7 shrink-0 rounded-full bg-card shadow-ring" />
          <div className="flex w-full max-w-sm flex-col gap-2 rounded-2xl bg-card p-3.5 shadow-ring">
            <Skeleton className="h-3.5 w-10/12 rounded-md bg-muted" />
            <Skeleton className="h-3.5 w-2/3 rounded-md bg-muted" />
          </div>
        </div>
      </div>

      {withComposer ? (
        <div
          aria-hidden
          className="mx-auto w-full max-w-3xl shrink-0 px-3 pb-3 pb-safe-bottom md:px-6 md:pb-5"
        >
          <div className="flex flex-col gap-3 rounded-3xl bg-card p-3.5 shadow-ring">
            <Skeleton className="h-4 w-40 rounded-md bg-muted" />
            <div className="flex items-center justify-between gap-2 pt-1">
              <Skeleton className="size-8 rounded-full bg-muted" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-16 rounded-full bg-muted" />
                <Skeleton className="size-8 rounded-full bg-muted" />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
