'use client'

import { useState, useCallback } from 'react'
import {
  Copy,
  ExternalLink,
  Globe2,
  HeartOff,
  Lock,
  MoreHorizontal,
  Palette,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { API_ENDPOINTS } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { usePathname, useRouter } from '@/i18n/navigation'
import type { LoraAssetRecord } from '@/types'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface LoraAssetCardProps {
  asset: LoraAssetRecord
  showVisibilityToggle?: boolean
  onVisibilityChange?: (assetId: string, isPublic: boolean) => Promise<boolean>
  onUnfavorite?: (assetId: string) => Promise<boolean>
  /**
   * Permanently delete the asset. Only meaningful for `source === 'trained'`
   * + `isOwn` — the card itself gates the menu entry on those flags, the
   * parent can pass it for every trained-section card without extra checks.
   */
  onDelete?: (assetId: string) => Promise<boolean>
}

// 7 天阈值用于「刚训练好」标签。只有 source === 'trained' 的资产会显示，
// curated（系统种子）和 imported（收藏）不算「训练」。
const RECENTLY_TRAINED_MS = 7 * 24 * 60 * 60 * 1000
const CIVITAI_DOWNLOAD_MODEL_RE =
  /https:\/\/civitai\.com\/api\/download\/models\/(\d+)/i

function isRecentlyTrained(asset: LoraAssetRecord): boolean {
  if (asset.source !== 'trained') return false
  const age = Date.now() - new Date(asset.createdAt).getTime()
  return age >= 0 && age < RECENTLY_TRAINED_MS
}

function getAssetSourceUrl(asset: LoraAssetRecord): string | null {
  if (asset.source === 'trained') return null

  const civitaiDownload = asset.loraUrl.match(CIVITAI_DOWNLOAD_MODEL_RE)
  if (civitaiDownload?.[1]) {
    return `${API_ENDPOINTS.LORA_ASSETS_CIVITAI_SOURCE}?modelVersionId=${civitaiDownload[1]}`
  }

  if (asset.loraUrl.startsWith('https://civitai.com/models/')) {
    return asset.loraUrl
  }

  if (asset.provider.toLowerCase() !== 'civitai') {
    return asset.loraUrl
  }

  return null
}

export function LoraAssetCard({
  asset,
  showVisibilityToggle = false,
  onVisibilityChange,
  onUnfavorite,
  onDelete,
}: LoraAssetCardProps) {
  const t = useTranslations('LoraWorkbench')
  const tStack = useTranslations('LoraStack')
  const router = useRouter()
  const pathname = usePathname()
  const stack = useActiveLoraStack()
  const [isToggling, setIsToggling] = useState(false)
  // Delete is a two-step (menu → confirm) flow with the dialog mounted
  // outside the dropdown — Radix doesn't like AlertDialog as a direct
  // child of DropdownMenuItem (focus traps fight each other), so we
  // control open state ourselves and trigger from the menu's onSelect.
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const canDelete =
    Boolean(onDelete) && asset.source === 'trained' && asset.isOwn

  const alreadyInStack = stack.items.some(
    (entry) => entry.asset.id === asset.id,
  )
  const recentlyTrained = isRecentlyTrained(asset)
  const sourceUrl = getAssetSourceUrl(asset)

  const handleUse = useCallback(() => {
    if (!alreadyInStack) {
      stack.push(asset)
    }
    // Already on the image canvas? Don't yank focus — just confirm.
    // The stack is now hot and the next generate will pick it up.
    if (pathname === ROUTES.STUDIO_IMAGE) {
      toast.success(tStack('alreadyHere', { name: asset.name }))
      return
    }
    toast.success(t('addedToStack', { name: asset.name }))
    router.push(ROUTES.STUDIO_IMAGE)
  }, [alreadyInStack, asset, pathname, stack, router, t, tStack])

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(asset.styleCode)
      toast.success(t('codeCopied'))
    } catch {
      toast.error(t('codeCopyFailed'))
    }
  }, [asset.styleCode, t])

  const handleVisibilityToggle = useCallback(
    async (next: boolean) => {
      if (!onVisibilityChange || isToggling) return
      setIsToggling(true)
      try {
        await onVisibilityChange(asset.id, next)
      } finally {
        setIsToggling(false)
      }
    },
    [asset.id, isToggling, onVisibilityChange],
  )

  const handleDeleteConfirm = useCallback(async () => {
    if (!onDelete || isDeleting) return
    setIsDeleting(true)
    try {
      await onDelete(asset.id)
    } finally {
      setIsDeleting(false)
      setDeleteConfirmOpen(false)
    }
  }, [asset.id, isDeleting, onDelete])

  const hasMenu =
    Boolean(sourceUrl) ||
    showVisibilityToggle ||
    Boolean(onUnfavorite) ||
    canDelete

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition-all',
        'border-border/60 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/90 hover:shadow-lg',
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {asset.coverImageUrl ? (
          // Plain <img> is fine here — assets are user/curated content
          // and don't benefit from next/image's optimization pass.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.coverImageUrl}
            alt={asset.name}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          // 无封面时按 type 切换 fallback 图标 — Palette 太通用，
          // style 用 Sparkles、subject 用 User 让占位图也带语义。
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-muted to-muted/60 text-muted-foreground">
            {asset.type === 'style' ? (
              <Sparkles className="size-12 opacity-30" strokeWidth={1.25} />
            ) : asset.type === 'subject' ? (
              <User className="size-12 opacity-30" strokeWidth={1.25} />
            ) : (
              <Palette className="size-12 opacity-30" strokeWidth={1.25} />
            )}
          </div>
        )}

        {/* 「刚训练好」徽章 — 7 天内训练完成的 trained 资产。
            放左上是因为右上要让位给 type badge / 操作菜单。 */}
        {recentlyTrained ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary/90 px-2 py-0.5 text-2xs font-medium text-primary-foreground backdrop-blur-sm shadow-sm">
            <Sparkles className="size-2.5 fill-current" aria-hidden />
            {t('recentlyTrainedBadge')}
          </span>
        ) : null}

        {/* type 徽章去 purple/emerald — 改用品牌中性 token，
            和 design-system.md 对齐 (#d97757 brand accent)。 */}
        <span
          className={cn(
            'absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium uppercase tracking-wide backdrop-blur-sm',
            asset.type === 'style'
              ? 'bg-primary/20 text-primary-foreground ring-1 ring-primary/30'
              : 'bg-foreground/15 text-foreground ring-1 ring-foreground/20',
          )}
        >
          {asset.type === 'style' ? t('typeStyle') : t('typeSubject')}
        </span>

        {/* hover 行：复制风格码 + 取消收藏 — 默认隐藏，hover 卡片时
            从顶部滑出。视觉噪音从 default 状态拿走，主操作（使用）
            还在卡片底部，没有抢戏。键盘可达：focus-within 也会触发。 */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-end gap-1.5 bg-gradient-to-t from-black/60 via-black/30 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={() => void handleCopyCode()}
            className="pointer-events-auto inline-flex size-7 items-center justify-center rounded-full bg-background/95 text-foreground shadow-sm transition-transform hover:scale-105"
            aria-label={t('copyCode')}
            title={asset.styleCode}
          >
            <Copy className="size-3.5" aria-hidden />
          </button>
          {onUnfavorite ? (
            <button
              type="button"
              onClick={() => void onUnfavorite(asset.id)}
              className="pointer-events-auto inline-flex size-7 items-center justify-center rounded-full bg-background/95 text-foreground shadow-sm transition-transform hover:scale-105 hover:text-destructive"
              aria-label={t('unfavorite')}
              title={t('unfavorite')}
            >
              <HeartOff className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-1 font-medium text-foreground">
              {asset.name}
            </h3>
            <p className="line-clamp-1 text-xs text-muted-foreground">
              <span className="font-mono">{asset.triggerWord}</span>
            </p>
          </div>

          {/* visibility 切换从常驻 row 收进 dropdown — 大部分时间
              用户不切换可见性，常驻显示是把「偶尔决策」放在「持续可见」
              的位置，违反 subtraction default。状态本身用 icon 在 menu
              trigger 里保留指示。 */}
          {hasMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={t('assetActionsLabel')}
                  title={t('assetActionsLabel')}
                >
                  <MoreHorizontal className="size-3.5" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {sourceUrl ? (
                  <DropdownMenuItem asChild>
                    <a href={sourceUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-3.5" aria-hidden />
                      {t('assetActionOpenSource')}
                    </a>
                  </DropdownMenuItem>
                ) : null}
                {showVisibilityToggle ? (
                  <DropdownMenuItem
                    disabled={isToggling}
                    onSelect={(e) => {
                      e.preventDefault()
                      void handleVisibilityToggle(!asset.isPublic)
                    }}
                  >
                    {asset.isPublic ? (
                      <>
                        <Lock className="size-3.5" aria-hidden />
                        {t('assetActionMakePrivate')}
                      </>
                    ) : (
                      <>
                        <Globe2 className="size-3.5" aria-hidden />
                        {t('assetActionMakePublic')}
                      </>
                    )}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    void handleCopyCode()
                  }}
                >
                  <Copy className="size-3.5" aria-hidden />
                  {t('copyCode')}
                </DropdownMenuItem>
                {onUnfavorite ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={(e) => {
                        e.preventDefault()
                        void onUnfavorite(asset.id)
                      }}
                    >
                      <HeartOff className="size-3.5" aria-hidden />
                      {t('unfavorite')}
                    </DropdownMenuItem>
                  </>
                ) : null}
                {canDelete ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={(e) => {
                        e.preventDefault()
                        setDeleteConfirmOpen(true)
                      }}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      {t('assetActionDelete')}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        <div
          className={cn(
            'mt-auto grid gap-2',
            sourceUrl ? 'grid-cols-[auto_1fr]' : 'grid-cols-1',
          )}
        >
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1 rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('assetActionOpenSource')}
              title={t('assetActionOpenSource')}
            >
              <ExternalLink className="size-3" aria-hidden />
              <span className="hidden sm:inline">{t('assetSourceShort')}</span>
            </a>
          ) : null}
          <button
            type="button"
            onClick={handleUse}
            className={cn(
              'inline-flex w-full items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              alreadyInStack
                ? 'bg-muted text-muted-foreground'
                : 'bg-foreground text-background hover:bg-foreground/85',
            )}
            aria-label={alreadyInStack ? t('alreadyInUse') : t('use')}
          >
            <Sparkles className="size-3" aria-hidden />
            {alreadyInStack ? t('alreadyInUse') : t('use')}
          </button>
        </div>

        {/* visibility 状态指示器 — 只在 showVisibilityToggle (own asset)
            时显示一个简洁的图标 + 文字行，让用户随时知道这个 LoRA
            是公开还是私有，但不再占用一个完整的 row（节省纵向空间）。
            实际切换通过上面的 dropdown menu 完成。 */}
        {showVisibilityToggle ? (
          <div className="flex items-center gap-1 text-2xs text-muted-foreground">
            {asset.isPublic ? (
              <>
                <Globe2 className="size-2.5" aria-hidden />
                {t('public')}
              </>
            ) : (
              <>
                <Lock className="size-2.5" aria-hidden />
                {t('private')}
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* 删除确认对话框 — Radix AlertDialog 必须挂在 DropdownMenu 之外，
          否则两个 focus trap 会互相打架。controlled open 让 menu 关闭后
          dialog 才出现，过渡更稳定。 */}
      {canDelete ? (
        <AlertDialog
          open={deleteConfirmOpen}
          onOpenChange={(open) => {
            if (isDeleting) return
            setDeleteConfirmOpen(open)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('assetDeleteConfirmTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('assetDeleteConfirmDescription', { name: asset.name })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>
                {t('assetDeleteConfirmCancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isDeleting}
                onClick={(e) => {
                  // Prevent the Action's default close-on-click so we can
                  // await the network call and surface any error before
                  // tearing down the dialog. handleDeleteConfirm closes it
                  // on success/failure via setDeleteConfirmOpen(false).
                  e.preventDefault()
                  void handleDeleteConfirm()
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                {t('assetDeleteConfirmAction')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </article>
  )
}

export { isRecentlyTrained }
