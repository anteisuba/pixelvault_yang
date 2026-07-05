'use client'

import { useState, useCallback } from 'react'
import {
  Copy,
  ExternalLink,
  Globe2,
  HeartOff,
  Lock,
  MoreHorizontal,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { API_ENDPOINTS } from '@/constants/config'
import {
  LORA_TOAST_DURATION_MS,
  LORA_WORKBENCH_SEARCH_PARAM,
  LORA_WORKBENCH_SECTIONS,
} from '@/constants/lora'
import { ROUTES } from '@/constants/routes'
import { useRouter } from '@/i18n/navigation'
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
import { LoraCoverTile } from '@/components/business/studio/lora/LoraCoverTile'
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
  const router = useRouter()
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
    // 去生成：把 LoRA 喂进脊柱条并切到 LoRA 域的生成 tab
    // （Image Studio 已解耦、不再消费 LoRA）。
    toast.success(t('addedToStack', { name: asset.name }), {
      duration: LORA_TOAST_DURATION_MS,
    })
    router.push(
      `${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.GENERATE}`,
    )
  }, [alreadyInStack, asset, stack, router, t])

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(asset.styleCode)
      toast.success(t('codeCopied'), { duration: LORA_TOAST_DURATION_MS })
    } catch {
      toast.error(t('codeCopyFailed'), { duration: LORA_TOAST_DURATION_MS })
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

  // 无封面时按 type 切换 fallback / 徽标图标 —— style 用 Sparkles、
  // subject（及其它）用 User，带语义的占位比通用 Palette 更可读。
  const TypeIcon = asset.type === 'style' ? Sparkles : User
  const typeLabel = asset.type === 'style' ? t('typeStyle') : t('typeSubject')

  return (
    // B8 / P2-3: 我的页卡片复用公开库卡片基底（封面优先 3:4 tile + 左上黑纱
    // 类型徽标），主按钮「去生成」在名字下，来源/可见性/删除全收进右上溢出
    // 菜单，两页网格读作同一套视觉语言。
    <article className="group flex min-w-0 flex-col">
      <LoraCoverTile
        coverUrl={asset.coverImageUrl}
        alt={asset.name}
        fallbackIcon={
          <TypeIcon className="size-8 opacity-30" strokeWidth={1.25} />
        }
        badgeLabel={typeLabel}
        badgeIcon={<TypeIcon className="size-3" aria-hidden />}
        topRight={
          hasMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-7 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
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
          ) : undefined
        }
        overlay={
          recentlyTrained ? (
            // 7 天内训练完成的 trained 资产 —— 放底部左角，让位给顶部的
            // 类型徽标 + 操作菜单。
            <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-primary/90 px-1.5 py-0.5 text-2xs font-medium text-primary-foreground shadow-sm backdrop-blur-sm">
              <Sparkles className="size-2.5 fill-current" aria-hidden />
              {t('recentlyTrainedBadge')}
            </span>
          ) : undefined
        }
      />

      <div className="mt-1.5 min-w-0 space-y-1.5">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">
            {asset.name}
          </p>
          <p className="truncate text-2xs text-muted-foreground">
            <span className="font-mono">{asset.triggerWord}</span>
          </p>
        </div>

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

        {/* 私有锁标（§5「自训卡保留私有锁标」）—— own asset 才显示公开/私有
            指示；实际切换走上面的溢出菜单。 */}
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
