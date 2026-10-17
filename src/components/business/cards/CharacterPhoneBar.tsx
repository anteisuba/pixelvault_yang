'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  CHARACTER_PAGE_TABS,
  type CharacterPageTab,
} from '@/constants/cards/chub-library'
import { springTransition } from '@/constants/motion'
import { Plus, Search, Upload } from '@/components/icons'
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuTrigger,
} from '@/components/ui/responsive-menu'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/**
 * 手机角色页顶上那条浮起的磨砂胶囊（iOS 稿 v16，owner 2026-10-16）：
 * 「我的角色 / 卡库」分段 · 搜索 · ＋（新角色 / 导入酒馆卡，从底部升起）。
 *
 * ⭐ 吸在滚动区顶上（`sticky`），内容从它底下滑过去，与素材页那条同一种材质。
 * ⭐ 点放大镜整条胶囊变成搜索框，搜的是当前那一页（我的角色 = 名字 / 标签 / 作品，
 *   卡库 = chub）；取消 = 清空并收回。
 * ⚠ 右边让出助手头像那一格（头像是 Dock 的 fixed 元素，距右 12、36 宽）。
 */
export function CharacterPhoneBar({
  tab,
  onTabChange,
  query,
  onQueryChange,
  searchPlaceholder,
  importing,
  onNew,
  onImport,
  reducedMotion,
}: {
  tab: CharacterPageTab
  onTabChange(tab: CharacterPageTab): void
  query: string
  onQueryChange(query: string): void
  searchPlaceholder: string
  importing: boolean
  onNew(): void
  onImport(): void
  reducedMotion: boolean
}) {
  const t = useTranslations('CharacterRoster')
  const [searching, setSearching] = useState(query !== '')
  const tabs = [
    { id: CHARACTER_PAGE_TABS.roster, label: t('tabRoster') },
    { id: CHARACTER_PAGE_TABS.library, label: t('tabLibrary') },
  ] as const

  const closeSearch = () => {
    setSearching(false)
    onQueryChange('')
  }

  return (
    <div className="sticky top-0 z-20 -mx-1.5 mr-11.5 pt-1 pb-2">
      <h1 className="sr-only">{t('title')}</h1>
      <div className="relative flex h-11 items-center gap-0.5 rounded-full border border-border/70 bg-background/85 px-1 shadow-sm backdrop-blur-xl">
        <div
          role="tablist"
          aria-label={t('title')}
          className="mr-auto flex items-center gap-0.5"
        >
          {tabs.map((item) => {
            const active = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`roster-phone-tab-${item.id}`}
                onClick={() => {
                  if (active) return
                  // 换页时搜索收回：两页搜的不是同一样东西。
                  if (searching) closeSearch()
                  onTabChange(item.id)
                }}
                className={cn(
                  'relative h-9 rounded-full px-3.5 text-base transition-colors duration-fast ease-standard',
                  active
                    ? 'font-semibold text-foreground'
                    : 'font-medium text-muted-foreground',
                )}
              >
                {active ? (
                  <motion.span
                    aria-hidden
                    layoutId="roster-phone-tab-thumb"
                    className="absolute inset-0 rounded-full bg-muted"
                    transition={springTransition('slot', reducedMotion)}
                  />
                ) : null}
                <span className="relative">{item.label}</span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          aria-label={t('phone.search')}
          data-testid="roster-phone-search"
          onClick={() => setSearching(true)}
          className="grid size-9 shrink-0 place-items-center rounded-full text-foreground transition-colors duration-fast ease-standard active:bg-muted"
        >
          <Search className="size-5" aria-hidden />
        </button>
        <ResponsiveMenu>
          <ResponsiveMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('phone.add')}
              data-testid="roster-phone-add"
              disabled={importing}
              className="grid size-9 shrink-0 place-items-center rounded-full text-foreground transition-colors duration-fast ease-standard active:bg-muted"
            >
              {importing ? (
                <Spinner size="sm" />
              ) : (
                <Plus className="size-5" aria-hidden />
              )}
            </button>
          </ResponsiveMenuTrigger>
          <ResponsiveMenuContent label={t('phone.add')} align="end">
            <ResponsiveMenuItem onSelect={onNew}>
              <Plus aria-hidden />
              {t('newCharacter')}
            </ResponsiveMenuItem>
            <ResponsiveMenuItem onSelect={onImport}>
              <Upload aria-hidden />
              {t('importCard')}
            </ResponsiveMenuItem>
          </ResponsiveMenuContent>
        </ResponsiveMenu>

        {/* 搜索：整条胶囊换成搜索框（与素材页同一种），⛔ 另开一页。 */}
        {searching ? (
          <div className="absolute inset-0 z-10 flex items-center gap-1 rounded-full bg-background pl-3 pr-1">
            <Search
              className="size-4.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') closeSearch()
              }}
              enterKeyHint="search"
              placeholder={searchPlaceholder}
              aria-label={t('phone.search')}
              data-testid="roster-phone-search-input"
              className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/80"
            />
            <button
              type="button"
              onClick={closeSearch}
              className="h-9 shrink-0 rounded-full px-3 text-base text-foreground transition-colors duration-fast ease-standard active:bg-muted"
            >
              {t('phone.searchCancel')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
