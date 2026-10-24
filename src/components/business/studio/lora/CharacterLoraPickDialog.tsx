'use client'

import { useState, type ComponentType, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import type { CharacterLoraGroup, LoraAssetRecord } from '@/types'
import { Check, ChevronLeft, User } from '@/components/icons'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { lookLabel } from '@/lib/character-looks'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { cn } from '@/lib/utils'

interface CharacterLoraPickerProps {
  groups: readonly CharacterLoraGroup[]
  isLoading: boolean
  isMounted: (assetId: string) => boolean
  onPick: (group: CharacterLoraGroup, lora: LoraAssetRecord) => void
  /** 标题用哪种元素：弹窗里是 `DialogTitle`（读屏要），库那一格里是普通标题。 */
  Title?: ComponentType<{ className?: string; children: ReactNode }>
  /** 列表那一块的高度：弹窗里限高自己滚，库那一格里随外框滚。 */
  listClassName?: string
}

/**
 * LoRA 台「从角色选」（角色③，owner 2026-10-22）：点她 → 列出她收的 LoRA → 挑一个
 * 挂上。只列收了 LoRA 的角色。她的 LoRA 按造型分组（角色④）：全部造型通用的在前，
 * 再按造型顺序；只有通用的一组时不写组名。
 *
 * 桌面开在外壳中间的库叠层里（第 9f 步 9f-2d，台把它传送进角色那一格）；手机仍是弹窗。
 */
export function CharacterLoraPicker({
  groups,
  isLoading,
  isMounted,
  onPick,
  Title = PlainTitle,
  listClassName,
}: CharacterLoraPickerProps) {
  const t = useTranslations('LoraWorkbench.characterLoras')
  const tLooks = useTranslations('CharacterLooks')
  const [characterId, setCharacterId] = useState<string | null>(null)
  const withLoras = groups.filter((group) => group.loras.length > 0)
  const current =
    withLoras.find((group) => group.characterCardId === characterId) ?? null

  return (
    <div className="flex flex-col gap-3">
      <Title className="flex items-center gap-1.5 text-base font-semibold">
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
      </Title>

      <div className={listClassName}>
        {isLoading && groups.length === 0 ? (
          <div className="grid place-items-center py-10">
            <Spinner />
          </div>
        ) : current ? (
          <div className="flex flex-col gap-3">
            {loraSections(current).map((section) => (
              <section key={section.id ?? 'all'} className="flex flex-col">
                {section.showTitle ? (
                  <p className="px-2 pb-1 text-xs text-muted-foreground">
                    {section.look
                      ? lookLabel(section.look, current.looks, tLooks)
                      : tLooks('allLooks')}
                  </p>
                ) : null}
                <ul className="flex flex-col gap-1">
                  {section.loras.map((lora) => {
                    const mounted = isMounted(lora.id)
                    return (
                      <li key={lora.id}>
                        <button
                          type="button"
                          disabled={mounted}
                          onClick={() => onPick(current, lora)}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
                        >
                          <Cover
                            url={lora.coverImageUrl}
                            rounded="rounded-md"
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {lora.name}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {mounted ? (
                              <Check
                                className="size-4"
                                aria-label={t('mounted')}
                              />
                            ) : (
                              lora.baseModelFamily
                            )}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
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
    </div>
  )
}

function PlainTitle({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return <h2 className={className}>{children}</h2>
}

/** 手机那一版：同一份挑选装进弹窗，挑了 / 关了都回到角色那一层。 */
export function CharacterLoraPickDialog({
  open,
  onOpenChange,
  ...picker
}: Omit<CharacterLoraPickerProps, 'Title' | 'listClassName'> & {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-3 sm:max-w-md">
        {/* ⚠ 关上就卸载（Radix 默认），下次打开从角色那一层开始。 */}
        <CharacterLoraPicker
          {...picker}
          Title={DialogTitle}
          listClassName="max-h-96 overflow-y-auto"
        />
      </DialogContent>
    </Dialog>
  )
}

type CharacterLora = CharacterLoraGroup['loras'][number]

/** 她的 LoRA 按造型分组：通用（没挂造型、或挂的造型已不在）在前，再按造型顺序；空组不出。 */
function loraSections(group: CharacterLoraGroup): {
  id: string | null
  look: CharacterLoraGroup['looks'][number] | null
  loras: CharacterLora[]
  showTitle: boolean
}[] {
  const lookIds = new Set(group.looks.map((look) => look.id))
  const shared = group.loras.filter(
    (lora) => !lora.lookId || !lookIds.has(lora.lookId),
  )
  const sections = [
    { id: null, look: null, loras: shared },
    ...group.looks.map((look) => ({
      id: look.id,
      look,
      loras: group.loras.filter((lora) => lora.lookId === look.id),
    })),
  ].filter((section) => section.loras.length > 0)
  const onlyShared = sections.length === 1 && sections[0]!.id === null
  return sections.map((section) => ({ ...section, showTitle: !onlyShared }))
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
