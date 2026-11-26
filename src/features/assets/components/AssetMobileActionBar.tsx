'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { Bookmark, FolderInput, Globe, Trash2 } from '@/components/icons'
import { BlurSwap } from '@/components/ui/blur-swap'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/** 拉长成确认还没再点，就自己缩回去（同 PC 选择条）。 */
const ARM_TIMEOUT_MS = 3000

const ACTION_CLASS =
  'touch-target-y flex min-w-0 flex-col items-center justify-center gap-0.5 text-2xs font-medium text-foreground transition-[opacity,background-color,color,scale] duration-fast ease-standard active:scale-96 disabled:pointer-events-none disabled:opacity-35 motion-reduce:transition-none [&>svg]:size-5.5'

/**
 * 手机素材页多选时底部浮出的四格动作胶囊：
 * 加入文件夹 · 收藏 · 发布 · 删除。删除点两下：第一下这一格变黑写「确认删除 N 张」，
 * 再点才删（删完底部黑条 5 秒撤销）；3 秒不点、选中数变了都缩回。
 */
export function AssetMobileActionBar({
  open,
  count,
  pending,
  favoriting,
  publishing,
  publishBlocked,
  publishBlockedNoteId,
  addToFolder,
  onFavorite,
  onPublish,
  onDelete,
}: {
  open: boolean
  count: number
  /** 有批量请求在飞：四格都不接。 */
  pending: boolean
  favoriting: boolean
  publishing: boolean
  /** 选中的全是「先搜再画」出的图：发布置灰，原因写在栏上方。 */
  publishBlocked: boolean
  publishBlockedNoteId?: string
  /** 「加入文件夹」弹层：拿这一格的按钮当 trigger 包起来（同 PC 那颗 `AssetAddToFolderPanel`）。 */
  addToFolder: (trigger: ReactNode) => ReactNode
  onFavorite: () => void
  onPublish: () => void
  onDelete: () => void
}) {
  const t = useTranslations('AssetsPage')
  const resetKey = `${open}:${count}`
  const [armed, setArmed] = useState<string | null>(null)
  const isArmed = armed === resetKey

  useEffect(() => {
    if (!isArmed) return
    const timer = window.setTimeout(() => setArmed(null), ARM_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [isArmed])

  if (!open) return null
  const empty = count === 0
  const deleteLabel = isArmed ? t('bulkDeleteArm', { count }) : t('bulkDelete')

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-safe-bottom z-40 flex justify-center md:hidden">
      <div
        role="toolbar"
        aria-label={t('selectedCount', { count })}
        data-testid="asset-mobile-action-bar"
        className="pointer-events-auto grid h-14 w-full max-w-md grid-cols-4 items-stretch rounded-full border border-border bg-popover/95 p-1 shadow-pop backdrop-blur-md"
      >
        {addToFolder(
          <button
            type="button"
            disabled={pending || empty}
            className={cn(
              ACTION_CLASS,
              'rounded-full data-[state=open]:bg-muted data-[state=open]:text-foreground',
            )}
          >
            <FolderInput />
            <span className="max-w-full truncate">{t('addToFolder')}</span>
          </button>,
        )}
        <button
          type="button"
          onClick={onFavorite}
          disabled={pending || empty}
          className={cn(ACTION_CLASS, 'rounded-full')}
        >
          {favoriting ? <Spinner size="sm" /> : <Bookmark />}
          <span className="max-w-full truncate">{t('bulkFavorite')}</span>
        </button>
        <button
          type="button"
          onClick={onPublish}
          disabled={pending || empty || publishBlocked}
          aria-describedby={publishBlocked ? publishBlockedNoteId : undefined}
          className={cn(ACTION_CLASS, 'rounded-full')}
        >
          {publishing ? <Spinner size="sm" /> : <Globe />}
          <span className="max-w-full truncate">{t('bulkPublishShort')}</span>
        </button>
        <button
          type="button"
          data-armed={isArmed || undefined}
          disabled={pending || empty}
          onClick={() => {
            if (!isArmed) {
              setArmed(resetKey)
              return
            }
            setArmed(null)
            onDelete()
          }}
          className={cn(
            ACTION_CLASS,
            'mx-0.5 my-0.5 rounded-full text-status-risk data-[armed]:bg-foreground data-[armed]:text-background',
          )}
        >
          <Trash2 />
          <BlurSwap swapKey={deleteLabel} className="max-w-full">
            <span className="block truncate">{deleteLabel}</span>
          </BlurSwap>
        </button>
      </div>
    </div>
  )
}
