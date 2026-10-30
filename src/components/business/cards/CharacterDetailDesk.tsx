'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'

import type { CharacterCardRecord } from '@/types'
import { MoreHorizontal } from '@/components/icons'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import {
  CharacterImagesPane,
  CharacterLorasPane,
  CharacterPersonPane,
} from '@/components/business/cards/CharacterDetail'
import { CharacterInterests } from '@/components/business/cards/CharacterInterests'
import { CharacterMemoryPane } from '@/components/business/cards/CharacterMemoryPane'
import { OutingCard } from '@/components/business/cards/CharacterOutingCard'
import { CharacterStickersPane } from '@/components/business/cards/CharacterRecent'
import { CharacterRecentDiary } from '@/components/business/cards/CharacterRecentDiary'
import {
  useCharacterGrowth,
  useCharacterMemories,
  useCharacterStickers,
} from '@/hooks/cards'
import { usePersonaSwitch } from '@/hooks/use-chat-persona'
import { characterCoverUrl } from '@/lib/card-bus'
import { characterImageCount, characterWork } from '@/lib/character-works'

type DetailTab = 'recent' | 'person' | 'images' | 'lora' | 'memory' | 'stickers'

type PaneProps = Parameters<typeof CharacterPersonPane>[0]

/**
 * **电脑 / 平板的角色详情**（角色大项目第 ①步，样件 v4，owner 2026-10-29 定稿）。
 *
 * ⭐ 左栏只放她：头像 · 名字（⋯ 里删除）· 一句介绍 · 「和她聊」（这块板唯一的黑钮）·
 *   「她在意的东西」（第 ④ 步）·「现在」（出门调查，第 ⑤ 步）。⛔ 分割线、⛔「用她 ▾」。
 * ⭐ 右边页签：最近 · 人物 · 图片 · LoRA · 记忆（第 ⑦ 步）· 表情包。各页内容先原样搬过来，
 *   后面几步一页一页改。
 * ⚠ 手机照旧走 `CharacterDetailSplit`（手机归整体重设计）。
 */
export function CharacterDetailDesk({
  onDelete,
  ...paneProps
}: PaneProps & { onDelete(): Promise<boolean> }) {
  const t = useTranslations('CharacterRoster')
  const locale = useLocale()
  const { card } = paneProps
  const growth = useCharacterGrowth(card.id)
  const stickers = useCharacterStickers(card.id)
  const memories = useCharacterMemories(card.id)
  const personaSwitch = usePersonaSwitch()
  const [tab, setTab] = useState<DetailTab>('recent')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const tabs = [
    { value: 'recent', label: t('detailTabs.recent') },
    { value: 'person', label: t('detailTabs.person') },
    { value: 'images', label: t('detailTabs.images') },
    { value: 'lora', label: t('detailTabs.lora') },
    { value: 'memory', label: t('detailTabs.memory') },
    { value: 'stickers', label: t('detailTabs.stickers') },
  ] as const

  return (
    <div className="flex h-full gap-10 pt-3">
      {/* 左右各让出 12 给「现在」卡的投影：滚动容器会把投影裁成一道竖边。 */}
      <aside className="-mx-3 flex w-64 shrink-0 flex-col gap-5 overflow-y-auto px-3 pb-12">
        <HerHead
          card={card}
          locale={locale}
          onAskDelete={() => setConfirmingDelete(true)}
        />
        <div>
          <button
            type="button"
            onClick={() =>
              void personaSwitch.switchTo(card.id, { goHome: true })
            }
            className="h-8 rounded-full bg-primary px-4 text-2sm font-semibold text-primary-foreground transition-transform duration-fast ease-standard hover:tint-hover active:scale-[.98] focus-visible:outline-none focus-visible:shadow-focus"
          >
            {t('recent.chatWith')}
          </button>
        </div>
        <CharacterInterests card={card} onUpdate={paneProps.onUpdate} />
        <section className="flex flex-col gap-2">
          <h2 className="text-xs text-muted-foreground">{t('detailNow')}</h2>
          <OutingCard growth={growth} />
        </section>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <LiquidSegmented
          items={tabs}
          value={tab}
          onChange={setTab}
          ariaLabel={t('detailTabs.label')}
          size="md"
          className="self-start"
        />
        <div className="min-h-0 flex-1">
          {tab === 'recent' ? (
            <CharacterRecentDiary growth={growth} stickers={stickers} />
          ) : tab === 'person' ? (
            <div className="h-full overflow-y-auto pb-12">
              <CharacterPersonPane {...paneProps} />
            </div>
          ) : tab === 'images' ? (
            <CharacterImagesPane {...paneProps} />
          ) : tab === 'lora' ? (
            <div className="h-full overflow-y-auto pb-12">
              <CharacterLorasPane card={card} />
            </div>
          ) : tab === 'memory' ? (
            <CharacterMemoryPane memories={memories} />
          ) : (
            <div className="h-full overflow-y-auto pb-12">
              <CharacterStickersPane stickers={stickers} />
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={t('deleteCharacter')}
        description={t('deleteConfirm', { name: card.name })}
        cancelLabel={t('cancel')}
        confirmLabel={t('delete')}
        onConfirm={() => {
          setConfirmingDelete(false)
          void onDelete()
        }}
      />
    </div>
  )
}

/** 左栏顶上：头像 72（没图写首字）· 名字 + ⋯（删除角色）· 作品与张数。 */
function HerHead({
  card,
  locale,
  onAskDelete,
}: {
  card: CharacterCardRecord
  locale: string
  onAskDelete(): void
}) {
  const t = useTranslations('CharacterRoster')
  const cover = characterCoverUrl(card)
  const work = characterWork(card, locale)
  return (
    <div className="flex flex-col gap-3">
      <span className="relative grid size-18 place-items-center overflow-hidden rounded-full bg-muted text-md font-semibold text-ink-2">
        {cover ? (
          <Image
            src={cover}
            alt=""
            fill
            sizes="72px"
            className="object-cover"
          />
        ) : (
          card.name.slice(0, 1)
        )}
      </span>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
            {card.name}
          </h2>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t('detailMore')}
              className="grid size-7 shrink-0 place-items-center rounded-full text-ink-2 transition-colors duration-fast hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus"
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={onAskDelete}>
                {t('deleteCharacter')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="text-2sm text-muted-foreground">
          {t('tileMeta', {
            work: work.label ?? t('workOriginal'),
            images: characterImageCount(card),
          })}
        </p>
      </div>
    </div>
  )
}
