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
import { MobileDrawerTrigger } from '@/components/layout/MobileDrawerTrigger'
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuTrigger,
} from '@/components/ui/responsive-menu'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/**
 * 手机角色页顶部导航栏（Apple HIG S1 统一 48px 磨砂纯白顶栏，与素材/画廊同构）：
 * - 左：`[◧]` 全局侧栏触发键（锁死全站一致坐标 x=12, y=6）；
 * - 中：「我的角色 | 卡库」液态分段切换条（暖灰槽 + 浮白格，与全站 `LiquidSegmented` 一致）；
 * - 右：搜索圆钮 · ＋圆钮（新角色 / 导入酒馆卡，原生底部抽屉）。
 * 点放大镜整条顶栏切换为搜索输入态；取消清空并收回。
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
    <header className="sticky top-0 z-20 -mx-4 flex h-12 items-center gap-2 border-b border-border/50 bg-background/90 px-3 backdrop-blur-md">
      <h1 className="sr-only">{t('title')}</h1>
      {searching ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-3">
            <Search
              className="size-4 shrink-0 text-muted-foreground"
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
          </label>
          <button
            type="button"
            onClick={closeSearch}
            className="touch-target-y h-9 shrink-0 rounded-full px-2.5 text-2sm font-medium text-foreground transition-colors duration-fast ease-standard active:bg-muted"
          >
            {t('phone.searchCancel')}
          </button>
        </div>
      ) : (
        <>
          <MobileDrawerTrigger />
          <div className="flex min-w-0 flex-1 items-center">
            <div
              role="tablist"
              aria-label={t('title')}
              className="inline-flex h-9 items-center gap-0.5 rounded-full bg-fill-strong p-0.5"
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
                      onTabChange(item.id)
                    }}
                    className={cn(
                      'touch-target-y relative h-8 rounded-full px-3 text-2sm whitespace-nowrap transition-colors duration-fast ease-standard',
                      active ? 'font-semibold text-foreground' : 'text-ink-2',
                    )}
                  >
                    {active ? (
                      <motion.span
                        aria-hidden
                        layoutId="roster-phone-tab-thumb"
                        className="absolute inset-0 rounded-full bg-raise shadow-seg"
                        transition={springTransition('slot', reducedMotion)}
                      />
                    ) : null}
                    <span className="relative">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <button
            type="button"
            aria-label={t('phone.search')}
            data-testid="roster-phone-search"
            onClick={() => setSearching(true)}
            className="touch-target grid size-9 shrink-0 place-items-center rounded-full bg-muted text-ink-2 transition-colors duration-fast ease-standard active:bg-fill-strong"
          >
            <Search className="size-4" aria-hidden />
          </button>
          <ResponsiveMenu>
            <ResponsiveMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('phone.add')}
                data-testid="roster-phone-add"
                disabled={importing}
                className="touch-target grid size-9 shrink-0 place-items-center rounded-full bg-muted text-ink-2 transition-colors duration-fast ease-standard active:bg-fill-strong"
              >
                {importing ? (
                  <Spinner size="sm" />
                ) : (
                  <Plus className="size-4" aria-hidden />
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
        </>
      )}
    </header>
  )
}
