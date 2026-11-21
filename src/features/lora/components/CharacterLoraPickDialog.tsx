'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import type { CharacterLoraGroup, LoraAssetRecord } from '@/types'
import { Check, ChevronLeft, User } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  LIBRARY_PICKER_DIALOG_CLASS,
  LibraryPickerHeader,
} from '@/components/ui/library-picker'
import { SearchField } from '@/components/ui/search-field'
import { Skeleton } from '@/components/ui/skeleton'
import { PageLoadError } from '@/components/business/PageLoadError'
import { lookLabel } from '@/lib/character-looks'
import { proxyCivitaiImageUrl } from '@/features/lora/lib/civitai-image-url'
import { cn } from '@/lib/utils'

/**
 * 条目多到这个数才摆搜索（角色那一层数角色，她那一层数 LoRA）：几个人一眼就看完，搜索框只是占地方。
 * ⚠ 接口一次给全（`GET /api/character-loras` 没有分页 / 搜索参数），所以是前端筛 —— 即时出结果，⛔ 防抖。
 */
const SEARCH_MIN_ITEMS = 8

/** 角色格的骨架个数（与真格子同形：圆头像 + 名字 + 一行「N 个 LoRA」）。 */
const SKELETON_COUNT = 8

interface CharacterLoraPickDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: readonly CharacterLoraGroup[]
  isLoading: boolean
  /** 没读出来那一句（已经说成人话）；null = 没出错。 */
  error: string | null
  onRetry: () => void
  isMounted: (assetId: string) => boolean
  onPick: (group: CharacterLoraGroup, lora: LoraAssetRecord) => void
}

/**
 * LoRA 台「从角色选」（角色③，owner 2026-10-22）—— 手机那一版：点她 → 列出她收的 LoRA → 挑一个
 * 挂上。只列收了 LoRA 的角色。她的 LoRA 按造型分组（角色④）：全部造型通用的在前，
 * 再按造型顺序；只有通用的一组时不写组名。
 *
 * 外壳与其它挑选框同一份（`library-picker`：框顶标题 · ×）；四态同素材挑选框：在拿 = 同形灰块、
 * 没读出来 = 一句话 + 重试、搜了没有 = 回显 + 清除、没人收 LoRA = 一句话说去哪加。
 * ⚠ 关上就卸载（Radix 默认），下次打开从角色那一层开始。
 */
export function CharacterLoraPickDialog({
  open,
  onOpenChange,
  ...picker
}: CharacterLoraPickDialogProps) {
  const t = useTranslations('LoraWorkbench.characterLoras')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={LIBRARY_PICKER_DIALOG_CLASS}
      >
        <DialogTitle className="sr-only">{t('pickTitle')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('pickTitle')}
        </DialogDescription>
        {open ? (
          <CharacterLoraPickBody
            {...picker}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function CharacterLoraPickBody({
  groups,
  isLoading,
  error,
  onRetry,
  isMounted,
  onPick,
  onClose,
}: Omit<CharacterLoraPickDialogProps, 'open' | 'onOpenChange'> & {
  onClose: () => void
}) {
  const t = useTranslations('LoraWorkbench.characterLoras')
  const tLooks = useTranslations('CharacterLooks')
  const [characterId, setCharacterId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const withLoras = groups.filter((group) => group.loras.length > 0)
  const current =
    withLoras.find((group) => group.characterCardId === characterId) ?? null
  const needle = search.trim().toLowerCase()
  const matches = (text: string) => text.toLowerCase().includes(needle)

  // 角色那一层：名字或她收的任一个 LoRA 名对得上就留；她那一层：只筛 LoRA 名。
  const visibleGroups = needle
    ? withLoras.filter(
        (group) =>
          matches(group.name) || group.loras.some((lora) => matches(lora.name)),
      )
    : withLoras
  const sections = current
    ? loraSections(current)
        .map((section) => ({
          ...section,
          loras: needle
            ? section.loras.filter((lora) => matches(lora.name))
            : section.loras,
        }))
        .filter((section) => section.loras.length > 0)
    : []
  const layerCount = current ? current.loras.length : withLoras.length
  const showSearch = layerCount >= SEARCH_MIN_ITEMS
  const searchMissed =
    Boolean(needle) &&
    (current ? sections.length === 0 : visibleGroups.length === 0)

  const enter = (next: string | null) => {
    setCharacterId(next)
    setSearch('')
  }

  const body =
    isLoading && groups.length === 0 ? (
      <ul aria-hidden className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <li key={index} className="flex flex-col items-center gap-1.5 p-2">
            <Skeleton className="size-14 rounded-full" />
            <Skeleton className="h-3.5 w-3/4 rounded-sm" />
            <Skeleton className="h-2.5 w-1/2 rounded-sm" />
          </li>
        ))}
      </ul>
    ) : error && groups.length === 0 ? (
      <PageLoadError
        title={error}
        onRetry={onRetry}
        retrying={isLoading}
        className="my-2"
      />
    ) : searchMissed ? (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <p className="text-2sm text-muted-foreground">
          {t('searchEmpty', { query: search.trim() })}
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="rounded-full"
          onClick={() => setSearch('')}
        >
          {t('clearSearch')}
        </Button>
      </div>
    ) : current ? (
      <div className="flex flex-col gap-3">
        {sections.map((section) => (
          <section key={section.id ?? 'all'} className="flex flex-col">
            {section.showTitle ? (
              <p className="px-2 pb-1 text-2xs text-muted-foreground">
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
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-2sm transition-colors duration-fast hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <Cover url={lora.coverImageUrl} rounded="rounded-md" />
                      <span className="min-w-0 flex-1 truncate">
                        {lora.name}
                      </span>
                      <span className="shrink-0 text-2xs text-muted-foreground">
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
          </section>
        ))}
      </div>
    ) : withLoras.length === 0 ? (
      <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
        <p className="text-2sm font-medium text-foreground">
          {t('emptyCharacters')}
        </p>
        <p className="text-2sm text-muted-foreground">
          {t('emptyCharactersHint')}
        </p>
      </div>
    ) : (
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {visibleGroups.map((group) => (
          <li key={group.characterCardId}>
            <button
              type="button"
              onClick={() => enter(group.characterCardId)}
              className="flex w-full flex-col items-center gap-1.5 rounded-lg p-2 text-2sm transition-colors duration-fast hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus"
            >
              <Cover url={group.coverUrl} rounded="rounded-full" large />
              <span className="w-full truncate text-center">{group.name}</span>
              <span className="text-2xs text-muted-foreground">
                {t('loraCount', { count: group.loras.length })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )

  return (
    <>
      <LibraryPickerHeader
        title={current ? current.name : t('pickTitle')}
        start={
          current ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="-ml-2 rounded-full"
              aria-label={t('back')}
              onClick={() => enter(null)}
            >
              <ChevronLeft aria-hidden />
            </Button>
          ) : null
        }
        closeLabel={t('close')}
        onClose={onClose}
      />
      <div
        aria-busy={(isLoading && groups.length === 0) || undefined}
        className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-4 pb-6"
      >
        {showSearch ? (
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder={t('searchPlaceholder')}
            label={t('searchPlaceholder')}
            className="shrink-0"
          />
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      </div>
    </>
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
