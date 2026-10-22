'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import type { CharacterLoraGroup, LoraAssetRecord } from '@/types'
import { Check, ChevronLeft, User } from '@/components/icons'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { cn } from '@/lib/utils'

interface CharacterLoraPickDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: readonly CharacterLoraGroup[]
  isLoading: boolean
  isMounted: (assetId: string) => boolean
  onPick: (group: CharacterLoraGroup, lora: LoraAssetRecord) => void
}

/**
 * LoRA 台「从角色选」（角色③，owner 2026-10-22）：点她 → 列出她收的 LoRA → 挑一个
 * 挂上。只列收了 LoRA 的角色。
 *
 * ⚠ 现阶段用现有弹层拼最简版本，统一样式留到 UI 地基「统一库组件 + 选择器」。
 */
export function CharacterLoraPickDialog({
  open,
  onOpenChange,
  groups,
  isLoading,
  isMounted,
  onPick,
}: CharacterLoraPickDialogProps) {
  const t = useTranslations('LoraWorkbench.characterLoras')
  const [characterId, setCharacterId] = useState<string | null>(null)
  const withLoras = groups.filter((group) => group.loras.length > 0)
  const current =
    withLoras.find((group) => group.characterCardId === characterId) ?? null

  const close = (next: boolean) => {
    if (!next) setCharacterId(null)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex flex-col gap-3 sm:max-w-md">
        <DialogTitle className="flex items-center gap-1.5 text-base">
          {current ? (
            <button
              type="button"
              onClick={() => setCharacterId(null)}
              aria-label={t('back')}
              className="-ml-1 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
          ) : null}
          {current ? current.name : t('pickTitle')}
        </DialogTitle>

        <div className="max-h-96 overflow-y-auto">
          {isLoading && groups.length === 0 ? (
            <div className="grid place-items-center py-10">
              <Spinner />
            </div>
          ) : current ? (
            <ul className="flex flex-col gap-1">
              {current.loras.map((lora) => {
                const mounted = isMounted(lora.id)
                return (
                  <li key={lora.id}>
                    <button
                      type="button"
                      disabled={mounted}
                      onClick={() => onPick(current, lora)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <Cover url={lora.coverImageUrl} rounded="rounded-md" />
                      <span className="min-w-0 flex-1 truncate">
                        {lora.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {mounted ? (
                          <Check className="size-4" aria-label={t('mounted')} />
                        ) : (
                          lora.baseModelFamily
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : withLoras.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t('emptyCharacters')}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {withLoras.map((group) => (
                <li key={group.characterCardId}>
                  <button
                    type="button"
                    onClick={() => setCharacterId(group.characterCardId)}
                    className="flex w-full flex-col items-center gap-1.5 rounded-lg p-2 text-sm transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Cover url={group.coverUrl} rounded="rounded-full" large />
                    <span className="w-full truncate text-center">
                      {group.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t('loraCount', { count: group.loras.length })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Cover({
  url,
  rounded,
  large = false,
}: {
  url: string | null
  rounded: string
  large?: boolean
}) {
  const size = large ? 'size-14' : 'size-9'
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={proxyCivitaiImageUrl(url)}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn(size, rounded, 'shrink-0 bg-muted object-cover')}
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        size,
        rounded,
        'grid shrink-0 place-items-center bg-muted text-muted-foreground',
      )}
    >
      <User className="size-4" />
    </span>
  )
}
