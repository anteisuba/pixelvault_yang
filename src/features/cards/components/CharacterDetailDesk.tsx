'use client'

import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'

import { studioImageWithCharacterPath } from '@/constants/routes'
import type { CharacterCardRecord } from '@/types'
import { MoreHorizontal } from '@/components/icons'
import { Button } from '@/components/ui/button'
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
  CharacterTemplatesPane,
} from '@/features/cards/components/CharacterDetail'
import { CharacterInterests } from '@/features/cards/components/CharacterInterests'
import { CharacterMemoryPane } from '@/features/cards/components/CharacterMemoryPane'
import { OutingCard } from '@/features/cards/components/CharacterOutingCard'
import { CharacterStickersPane } from '@/features/cards/components/CharacterStickersPane'
import { CharacterRecentDiary } from '@/features/cards/components/CharacterRecentDiary'
import {
  useCharacterGrowth,
  useCharacterMemories,
  useCharacterStickers,
} from '@/features/cards/hooks'
import { usePersonaSwitch } from '@/hooks/use-chat-persona'
import { Link } from '@/i18n/navigation'
import { characterCoverUrl } from '@/lib/card-bus'
import { characterImageCount, characterWork } from '@/lib/character-works'

type DetailTab =
  | 'recent'
  | 'person'
  | 'images'
  | 'templates'
  | 'lora'
  | 'memory'
  | 'stickers'

type PaneProps = Parameters<typeof CharacterPersonPane>[0]

/**
 * **电脑 / 平板的角色详情**（角色大项目第 ①步，样件 v4，owner 2026-10-29 定稿）。
 *
 * ⭐ 左栏只放她：头像 · 名字（⋯ 里删除）· 一句介绍 · 「和她聊」（这块板唯一的黑钮）·
 *   「她在意的东西」（第 ④ 步）·「现在」（出门调查，第 ⑤ 步）。⛔ 分割线、⛔「用她 ▾」。
 * ⭐ 「和她聊」旁边一颗「用她出图」（11-17，次级钮，去工作台并带上她）。
 * ⭐ 右边页签：小房间（活动记录，11-05 由「最近」改名）· 人物（11-17 起默认）· 图片 · 造型（11-01 叫「模板」，11-17 改名）· LoRA · 记忆（第 ⑦ 步）· 表情包。各页内容先原样搬过来，
 *   后面几步一页一页改。
 * 手机见下面的 `CharacterDetailPhone`（同一套页签内容，换成顶上四段切换）。
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
  // 默认进「人物」（11-17）：从名册点进来多半是来看 / 改她，不是看小房间。
  const [tab, setTab] = useState<DetailTab>('person')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const tabs = [
    { value: 'recent', label: t('detailTabs.recent') },
    { value: 'person', label: t('detailTabs.person') },
    { value: 'images', label: t('detailTabs.images') },
    { value: 'templates', label: t('detailTabs.templates') },
    { value: 'lora', label: t('detailTabs.lora') },
    { value: 'memory', label: t('detailTabs.memory') },
    { value: 'stickers', label: t('detailTabs.stickers') },
  ] as const

  return (
    <div className="flex h-full gap-10 pt-3">
      {/* 左右各让出 12 给「现在」卡的投影：滚动容器会把投影裁成一道竖边。 */}
      <aside className="-mx-3 flex w-68 shrink-0 flex-col gap-5 overflow-x-hidden overflow-y-auto px-3 pb-12">
        <HerHead
          card={card}
          locale={locale}
          onAskDelete={() => setConfirmingDelete(true)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              void personaSwitch.switchTo(card.id, { goHome: true })
            }
            className="h-8 rounded-full bg-primary px-4 text-2sm font-semibold text-primary-foreground transition-transform duration-fast ease-standard hover:tint-hover active:scale-[.98] focus-visible:outline-none focus-visible:shadow-focus"
          >
            {t('recent.chatWith')}
          </button>
          {/* 「用她出图」= 工作台深链（`?character=`），到了就把她带上 —— 与画廊「用她」同一条路。 */}
          <Button
            asChild
            variant="secondary"
            size="sm"
            className="rounded-full"
          >
            <Link href={studioImageWithCharacterPath(card.id)}>
              {t('recent.generateWith')}
            </Link>
          </Button>
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
            <CharacterRecentDiary
              growth={growth}
              stickers={stickers}
              memories={memories}
            />
          ) : tab === 'person' ? (
            <div className="h-full overflow-y-auto pb-12">
              <CharacterPersonPane {...paneProps} />
            </div>
          ) : tab === 'images' ? (
            <CharacterImagesPane {...paneProps} />
          ) : tab === 'templates' ? (
            <CharacterTemplatesPane {...paneProps} />
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

/** 手机详情导航条中间那一块：她的头像 28 + 名字（长名截断）。 */
export function CharacterPhoneTitle({ card }: { card: CharacterCardRecord }) {
  const cover = characterCoverUrl(card)
  return (
    <>
      <span className="relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-ink-2">
        {cover ? (
          <Image
            src={cover}
            alt=""
            fill
            sizes="28px"
            className="object-cover"
          />
        ) : (
          card.name.slice(0, 1)
        )}
      </span>
      <h2 className="min-w-0 truncate text-md font-semibold">{card.name}</h2>
    </>
  )
}

/**
 * 手机详情主操作行（Apple Contacts 风格对称双胶囊）：「用她出图」（纯白抬起胶囊，与电脑同一条
 * `?character=` 深链）+「和她聊」（实底主按钮），独立于 48px 顶栏以避免与名字及右侧助手头像拥挤。
 */
export function CharacterChatPill({ cardId }: { cardId: string }) {
  const t = useTranslations('CharacterRoster')
  const personaSwitch = usePersonaSwitch()
  return (
    <div className="grid grid-cols-2 gap-2">
      <Link
        href={studioImageWithCharacterPath(cardId)}
        className="touch-target-y inline-flex h-9 items-center justify-center rounded-full bg-card px-3.5 text-2sm font-semibold whitespace-nowrap text-foreground shadow-ring outline-none transition-colors duration-fast ease-standard active:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t('recent.generateWith')}
      </Link>
      <button
        type="button"
        onClick={() => void personaSwitch.switchTo(cardId, { goHome: true })}
        className="touch-target-y inline-flex h-9 items-center justify-center rounded-full bg-primary px-3.5 text-2sm font-semibold whitespace-nowrap text-primary-foreground outline-none transition-transform duration-fast ease-standard active:scale-98 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t('recent.chatWith')}
      </button>
    </div>
  )
}

type PhonePane = 'recent' | 'her' | 'memory' | 'stickers'

/**
 * **手机的角色详情**（Apple HIG S1 暖石地台 + 分组白卡）：
 * 顶栏保持干净导航（`CharacterDetailHeader`），下方为对称双操作胶囊（「用她出图」·「和她聊」）与
 * 紧凑 36px 四段切换（「小房间 · 她 · 记忆 · 表情包」），与电脑共用同一套页签内容。
 */
export function CharacterDetailPhone({
  cardId,
  body,
}: {
  cardId: string
  body: ReactNode
}) {
  const t = useTranslations('CharacterRoster')
  const growth = useCharacterGrowth(cardId)
  const stickers = useCharacterStickers(cardId)
  const memories = useCharacterMemories(cardId)
  // 与电脑同口径：默认进「她」（人物）。
  const [pane, setPane] = useState<PhonePane>('her')
  const panes = [
    { value: 'recent', label: t('detailTabs.recent') },
    { value: 'her', label: t('recent.paneHer') },
    { value: 'memory', label: t('detailTabs.memory') },
    { value: 'stickers', label: t('detailTabs.stickers') },
  ] as const

  return (
    <div className="flex h-full flex-col bg-bubble dark:bg-background">
      <div className="shrink-0 space-y-2 px-3 pt-2.5 pb-2">
        <CharacterChatPill cardId={cardId} />
        <LiquidSegmented
          items={panes}
          value={pane}
          onChange={setPane}
          ariaLabel={t('detailTabs.label')}
          size="sm"
          fill
          className="w-full ring-1 ring-inset ring-foreground/6"
        />
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {pane === 'her' ? (
          body
        ) : pane === 'recent' ? (
          <div className="h-full px-3 pt-1">
            <CharacterRecentDiary
              growth={growth}
              stickers={stickers}
              memories={memories}
              lead={<OutingCard growth={growth} variant="row" />}
            />
          </div>
        ) : pane === 'memory' ? (
          <div className="h-full px-3 pt-1">
            <CharacterMemoryPane memories={memories} />
          </div>
        ) : (
          <div className="h-full overflow-y-auto px-3 pt-1 pb-12">
            <div className="rounded-2xl bg-card p-3.5 shadow-ring">
              <CharacterStickersPane stickers={stickers} />
            </div>
          </div>
        )}
      </div>
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
      <span className="relative grid size-18 place-items-center overflow-hidden rounded-full bg-muted text-md font-semibold text-ink-2 ring-2 ring-border shadow-soft">
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
