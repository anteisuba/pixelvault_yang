'use client'

import {
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { useTranslations } from 'next-intl'

import { Check, ChevronDown, Plus, Search } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SearchField } from '@/components/ui/search-field'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * 库的几块共用拼图（ui-spec §9「库 `LibraryPage`」「库里的筛选」）：所有库同一副骨架 ——
 * 板头下面只有一行工具行（`LibraryToolbar`）：分组药丸（`LibraryScopeSelect`：全部 · 收藏 ·
 * 这个库自己的）· 切换条 · 其余筛选药丸 ……… 搜索 · 排序，整行 36 高；再下面格子。
 * 只有素材还有左栏（文件夹树，有拖放），由分组药丸菜单里的「管理文件夹…」打开；挑选框里的
 * 左栏照旧用 `LibraryRail` / `LibraryRailRow`。
 */

/** 分组药丸菜单的一项：名字 + 计数或来源（原左栏计数位写什么这里就写什么）。 */
export interface LibraryScopeItem<T extends string> {
  value: T
  label: string
  meta?: string | number
}

function hasMeta(meta: string | number | undefined): meta is string | number {
  return meta !== undefined && meta !== ''
}

/** 菜单里一行的右半边：计数 / 来源（muted）+ 当前那一项的勾（不是当前也占位，数字对齐）。 */
export function LibraryScopeMenuTrailing({
  meta,
  checked,
}: {
  meta?: string | number
  checked: boolean
}) {
  return (
    <>
      {hasMeta(meta) ? (
        <span className="ml-auto pl-4 text-2sm text-muted-foreground tabular-nums">
          {meta}
        </span>
      ) : (
        <span className="ml-auto" />
      )}
      {checked ? (
        <Check className="size-4" aria-hidden />
      ) : (
        <span aria-hidden className="size-4 shrink-0" />
      )}
    </>
  )
}

/**
 * 分组药丸（看哪一堆）：长相 = `LibraryPillSelect`；触发键写当前分组名 + muted 计数（「收藏 17」）。
 * 菜单一行一个分组，右边计数或来源，当前项带勾。`children` 接在分组后面（素材的「文件夹」那一组）；
 * 当前那一堆不在 `items` 里（素材停在某个夹上）时 `value` 给 `null`、`current` 写触发键上那几个字。
 * 只有一个分组（又没有 `children`）就不画。
 */
export function LibraryScopeSelect<T extends string>({
  label,
  value,
  items,
  onChange,
  current,
  children,
}: {
  /** 读屏用：这颗药丸管什么（「分组」）。 */
  label: string
  value: T | null
  items: readonly LibraryScopeItem<T>[]
  onChange: (value: T) => void
  current?: { label: string; meta?: string | number }
  children?: ReactNode
}) {
  if (items.length <= 1 && !children) return null
  const shown = current ?? items.find((item) => item.value === value)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            shown
              ? `${label}：${shown.label}${hasMeta(shown.meta) ? ` ${shown.meta}` : ''}`
              : label
          }
          data-testid="library-scope-select"
          className={cn(LIBRARY_PILL_CLASS, 'max-w-60')}
        >
          <span className="truncate">{shown?.label ?? label}</span>
          {shown && hasMeta(shown.meta) ? (
            <span className="text-muted-foreground tabular-nums">
              {shown.meta}
            </span>
          ) : null}
          <ChevronDown aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.value}
            onSelect={() => onChange(item.value)}
          >
            {item.label}
            <LibraryScopeMenuTrailing
              meta={item.meta}
              checked={item.value === value}
            />
          </DropdownMenuItem>
        ))}
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
/** 库的搜索框收的那几样（`LibraryToolbar.search` / `LibrarySearch`）。 */
export interface LibrarySearchProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
  maxLength?: number
}

function isLibrarySearchProps(
  search: LibrarySearchProps | ReactNode,
): search is LibrarySearchProps {
  return (
    typeof search === 'object' &&
    search !== null &&
    !isValidElement(search) &&
    'onChange' in search
  )
}

/**
 * 横滚那一段的右缘渐隐（24）：只在真放不下、且没滚到头时才有 —— ⛔ 右缘露出被裁的半颗药丸。
 * Tailwind 自带的 mask 工具类：`mask-l-*` 的渐变是「从右往左」，右缘透明 → 24 处全显。
 */
export const LIBRARY_EDGE_FADE_CLASS =
  'mask-l-from-transparent mask-l-to-black mask-l-to-6'

/**
 * 横滚那一段要不要右缘渐隐（真放不下且没滚到头）。素材自己画的工具行也用。
 * 那一段可能换一个节点（手机 / 桌面换位置），每次渲染后看一眼节点换没换，换了重新盯。
 */
export function useLibraryEdgeFade(ref: RefObject<HTMLElement | null>) {
  const [fade, setFade] = useState(false)
  const watched = useRef<{ el: HTMLElement; stop: () => void } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (watched.current?.el === el) return
    watched.current?.stop()
    watched.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
    const update = () =>
      setFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    const sizes = new ResizeObserver(update)
    const watch = () => {
      sizes.disconnect()
      sizes.observe(el)
      for (const child of el.children) sizes.observe(child)
      update()
    }
    // 药丸晚到（LoRA 的筛选）/ 换一批：重新盯一遍每一颗的宽。
    const children = new MutationObserver(watch)
    children.observe(el, { childList: true })
    el.addEventListener('scroll', update, { passive: true })
    watch()
    watched.current = {
      el,
      stop: () => {
        el.removeEventListener('scroll', update)
        sizes.disconnect()
        children.disconnect()
      },
    }
  })
  useEffect(
    () => () => {
      watched.current?.stop()
      watched.current = null
    },
    [],
  )
  return fade
}

/** 搜索框展开时最窄 200（放得下就 200–280 弹性）。 */
const LIBRARY_SEARCH_MIN_WIDTH = 200
/** 滞回：收成圆键后，要多出这么多才再展开，⛔ 在临界宽度上来回跳。 */
const LIBRARY_SEARCH_FIT_SLACK = 8

/**
 * 工具行「展开态」需要多宽：每颗按自然宽算（横滚那一段按内容全宽 `scrollWidth`），
 * 搜索按 200 算、圆键不算，加上间距。和当前是圆键还是框无关 —— 收成圆键腾出来的宽度
 * ⛔ 让它立刻又判成放得下。标记：`data-libbar` = scroll / spacer / group（往里再算一层）/
 * search-key / search-box。
 */
function measureLibbarNeed(row: HTMLElement): number {
  const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0
  let total = 0
  let count = 0
  for (const child of row.children) {
    if (!(child instanceof HTMLElement)) continue
    const role = child.dataset.libbar
    if (role === 'search-key') continue
    if (role === 'search-box') {
      total += LIBRARY_SEARCH_MIN_WIDTH
      count += 1
      continue
    }
    const style = getComputedStyle(child)
    if (style.display === 'none') continue
    count += 1
    if (role === 'spacer') continue
    if (role === 'group') total += measureLibbarNeed(child)
    else if (role === 'scroll')
      total +=
        child.scrollWidth +
        Number.parseFloat(style.marginLeft) +
        Number.parseFloat(style.marginRight)
    else total += child.getBoundingClientRect().width
  }
  return total + gap * Math.max(0, count - 1)
}

/**
 * 工具行放不放得下展开的搜索框（按实际量，⛔ 固定容器阈值）。`ref` 指那一行（flex 容器）。
 * 默认放得下；量出来不够才收成圆键，带一点滞回。
 */
export function useLibrarySearchFit(ref: RefObject<HTMLElement | null>) {
  const [fits, setFits] = useState(true)
  const watched = useRef<{ el: HTMLElement; stop: () => void } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (watched.current?.el === el) return
    watched.current?.stop()
    watched.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
    const update = () => {
      const style = getComputedStyle(el)
      const room =
        el.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight)
      if (room <= 0) return
      const need = measureLibbarNeed(el)
      setFits((prev) =>
        prev ? need <= room : need + LIBRARY_SEARCH_FIT_SLACK <= room,
      )
    }
    const sizes = new ResizeObserver(update)
    const watch = () => {
      sizes.disconnect()
      sizes.observe(el)
      // 行里每一块、块里每一颗（药丸晚到 / 换字都会变宽）。
      for (const child of el.children) {
        sizes.observe(child)
        for (const grand of child.children) sizes.observe(grand)
      }
      update()
    }
    const children = new MutationObserver(watch)
    children.observe(el, { childList: true, subtree: true })
    watch()
    watched.current = {
      el,
      stop: () => {
        sizes.disconnect()
        children.disconnect()
      },
    }
  })
  useEffect(
    () => () => {
      watched.current?.stop()
      watched.current = null
    },
    [],
  )
  return fits
}

/**
 * 工具行（板头下面唯一一行）：分组药丸（`scope`）· 切换条（`segments`）· 其余筛选药丸（`pills`）
 * ……… 搜索（宽 280）· 排序等（`end`）。整行控件 36 高、间距 8。
 * 按实际量（`useLibrarySearchFit`，⛔ 固定阈值）：整行连 200 宽的搜索框都放得下就显示框（200–280 弹性）；
 * 放不下才收成 36 圆键，腾出来的宽度给药丸；点开就地展开（桌面 200 宽，手机占满一行），Esc / 失焦
 * 且空时收回，有字时一直展开。仍放不下才让切换条那一段横滚，右缘 24 渐隐（⛔ 换行、⛔ 整页横滚、⛔ 露半颗）。
 * 手机（<768）两行：分组药丸 ……… 搜索圆键 · 排序；下面一行切换条 + 药丸横滚。
 * `search` 给那几样就画标准搜索框；自己画的（LoRA 带搜索记录那颗）直接给元素，有字时传 `searchFilled`。
 */
export function LibraryToolbar({
  scope,
  segments,
  pills,
  search,
  searchFilled,
  searchLabel,
  end,
  className,
}: {
  scope?: ReactNode
  segments?: ReactNode
  pills?: ReactNode
  search?: LibrarySearchProps | ReactNode
  /** 自己画的搜索框里有字（收成圆键时也一直展开）。标准搜索框按 `value` 自己判。 */
  searchFilled?: boolean
  /** 自己画的搜索框：收成圆键时那颗的读屏名。 */
  searchLabel?: string
  end?: ReactNode
  className?: string
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const filtersRef = useRef<HTMLDivElement>(null)
  const filtersFade = useLibraryEdgeFade(filtersRef)
  const rowRef = useRef<HTMLDivElement>(null)
  const searchFits = useLibrarySearchFit(rowRef)
  const standard = isLibrarySearchProps(search) ? search : null
  const custom: ReactNode = isLibrarySearchProps(search) ? null : search
  const hasSearch = search !== undefined && search !== null && search !== false
  const filled = standard ? standard.value !== '' : Boolean(searchFilled)
  const expanded = hasSearch && (searchOpen || filled)
  const hasFilters = Boolean(segments || pills)

  useEffect(() => {
    if (searchOpen) searchRef.current?.querySelector('input')?.focus()
  }, [searchOpen])

  /** 失焦（焦点出了搜索这一块）且框里没字：收回成圆键。 */
  const collapseIfEmpty = (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    const input = event.currentTarget.querySelector('input')
    if (!input || input.value.trim() === '') setSearchOpen(false)
  }

  return (
    <div className={cn('min-w-0', className)}>
      <div
        ref={rowRef}
        className="flex flex-wrap items-center gap-2 md:flex-nowrap"
      >
        {scope ? (
          <div
            className={cn(
              'flex min-w-0 shrink-0 items-center empty:hidden',
              expanded && 'max-md:hidden',
            )}
          >
            {scope}
          </div>
        ) : null}
        {hasFilters ? (
          // 横滚行会裁掉焦点环（4）和触屏 44 的命中区：四周让出 4（触屏上下 6）再抵回。
          // 手机上这一段排到第二行。放得下时按自然宽，⛔ 被挤进横滚。
          <div
            ref={filtersRef}
            data-libbar="scroll"
            className={cn(
              'scrollbar-none -my-1 flex min-w-0 items-center gap-2 overflow-x-auto py-1 *:shrink-0 coarse:-my-1.5 coarse:py-1.5 max-md:order-last max-md:w-full md:-mx-1 md:px-1',
              searchFits && 'md:shrink-0',
              filtersFade && LIBRARY_EDGE_FADE_CLASS,
            )}
          >
            {segments}
            {pills}
          </div>
        ) : null}
        <div
          aria-hidden
          data-libbar="spacer"
          className={cn('min-w-0 flex-1', expanded && 'max-md:hidden')}
        />
        {hasSearch ? (
          <>
            <button
              type="button"
              aria-label={standard?.label ?? searchLabel}
              data-testid="library-search-open"
              data-libbar="search-key"
              onClick={() => setSearchOpen(true)}
              className={cn(
                'grid size-9 shrink-0 place-items-center rounded-full bg-muted text-ink-2 transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus coarse:size-11 [&>svg]:size-4',
                searchFits && 'md:hidden',
                expanded && 'hidden',
              )}
            >
              <Search aria-hidden />
            </button>
            <div
              ref={searchRef}
              onBlur={collapseIfEmpty}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return
                const input = event.currentTarget.querySelector('input')
                if (!input || input.value === '') setSearchOpen(false)
              }}
              data-libbar="search-box"
              className={cn(
                'flex shrink-0',
                expanded
                  ? 'max-md:min-w-0 max-md:flex-1'
                  : searchFits
                    ? 'max-md:hidden'
                    : 'hidden',
                // 放得下：280，挤了先缩到 200；放不下（点圆键展开的）：200。
                searchFits ? 'md:w-70 md:min-w-50 md:shrink' : 'md:w-50',
              )}
            >
              {standard ? (
                <SearchField
                  value={standard.value}
                  onChange={standard.onChange}
                  placeholder={standard.placeholder}
                  label={standard.label}
                  maxLength={standard.maxLength}
                  onKeyDown={standard.onKeyDown}
                  className="flex-1"
                />
              ) : (
                custom
              )}
            </div>
          </>
        ) : null}
        {end ? (
          <div
            data-libbar="end"
            className={cn(
              'flex shrink-0 items-center gap-2',
              expanded && 'max-md:hidden',
            )}
          >
            {end}
          </div>
        ) : null}
      </div>
    </div>
  )
}
/** 库的搜索框（不在工具行里的地方用，如角色书架）：长相在 `ui/search-field.tsx`（ui-spec §9「搜索框」）。 */
export function LibrarySearch(props: LibrarySearchProps) {
  return <SearchField {...props} />
}

/** 药丸（筛选 / 排序的触发键）：浅灰无边，点开深一档；设了写选中的值，⛔ 换强调色。36 高（与搜索、切换条同高），触屏 44。 */
export const LIBRARY_PILL_CLASS =
  'inline-flex h-9 coarse:h-11 shrink-0 items-center gap-1 rounded-full bg-muted px-3 text-2sm text-foreground transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus data-[state=open]:bg-fill-strong [&>svg]:size-3.5 [&>svg]:text-ink-2'

/** 单选药丸（排序、底模、分级…）：点开是菜单，当前那一项带勾。 */
export function LibraryPillSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  align = 'end',
}: {
  /** 读屏用：这颗药丸管什么（「排序」）。 */
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  align?: 'start' | 'end'
}) {
  const current = options.find((option) => option.value === value)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={label} className={LIBRARY_PILL_CLASS}>
          {current?.label ?? label}
          <ChevronDown aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-40">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
          >
            {option.label}
            {option.value === value ? (
              <Check className="ml-auto size-4" aria-hidden />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 左栏当前那一行左边那道黑线（`fill` 底之外再标一下，ui-spec §9「库」）。 */
export const LIBRARY_RAIL_ACTIVE_LINE_CLASS =
  'before:absolute before:inset-y-2 before:-left-1.5 before:w-0.5 before:rounded-full before:bg-foreground'

/**
 * 左栏：200 宽，一组一组的行。库整页已改成分组药丸（`LibraryScopeSelect`），这一栏只剩挑选框
 *（LoRA / 音色）里在用，一直开着。
 */
export function LibraryRail({
  label,
  children,
  className,
}: {
  /** 读屏用：这一栏管什么（「角色」）。 */
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        'flex w-52 shrink-0 flex-col gap-0.5 overflow-x-hidden overflow-y-auto border-r border-border/70 bg-surface-companion/75 px-2.5 py-3',
        className,
      )}
    >
      {children}
    </nav>
  )
}

/** 左栏的一行：图标 · 名字 ……… 计数（或来源，写在计数的位置：chub.ai、Civitai）。 */
export function LibraryRailRow({
  icon,
  label,
  trailing,
  active,
  onSelect,
}: {
  icon: ReactNode
  label: string
  trailing?: string | number
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      onClick={onSelect}
      className={cn(
        'relative flex h-8 w-full shrink-0 items-center gap-2 rounded-lg px-2 text-left text-2sm transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:shadow-focus',
        active
          ? cn(
              'bg-background font-semibold text-foreground shadow-ring dark:bg-raise',
              LIBRARY_RAIL_ACTIVE_LINE_CLASS,
            )
          : 'text-ink-2 hover:bg-fill-strong/55 hover:text-foreground',
      )}
    >
      <span className="grid size-5 shrink-0 place-items-center text-muted-foreground [&>svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing !== undefined ? (
        <span className="shrink-0 font-mono text-2xs font-normal text-muted-foreground tabular-nums">
          {trailing}
        </span>
      ) : null}
    </button>
  )
}

/**
 * 等宽格子（不需要虚拟化的库：角色、提示词、声音……）：按这一栏自己的宽排，最宽一行 8 张
 * （`@container` 量自己，⛔ 量整屏 —— 库叫出助手时这一栏会变窄）。
 */
/** 等宽格的列（放在 `@container` 里，按这一栏自己宽排，最多 8 列）。 */
export const LIBRARY_GRID_CLASS =
  'grid grid-cols-2 gap-2.5 @md:grid-cols-3 @xl:grid-cols-4 @3xl:grid-cols-6 @5xl:grid-cols-8'

export function LibraryGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className="@container">
      <div className={cn(LIBRARY_GRID_CLASS, className)}>{children}</div>
    </div>
  )
}

/**
 * 第一格的虚线「+ 新建」（角色、提示词、声音；素材是「上传」）。和格子里的图一样高（3:4）；
 * 素材的格子尺寸由排版算好（justified 虚拟网格），套一层定宽高的盒子再给 `className="h-full aspect-auto"`。
 */
export function LibraryNewTile({
  label,
  icon,
  onClick,
  disabled = false,
  className,
}: {
  label: string
  /** 默认一颗「+」；声音库用麦克风，素材用上传（传着时换成转圈）。 */
  icon?: ReactNode
  onClick: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group flex aspect-3/4 w-full flex-col items-center justify-center gap-2 rounded-12 border border-dashed border-input bg-surface-companion/45 text-2sm text-ink-2 transition-[background-color,border-color,color] duration-fast ease-standard hover:border-foreground/30 hover:bg-surface-companion hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      <span
        aria-hidden
        className="grid size-9 place-items-center rounded-full bg-background text-foreground shadow-ring transition-transform duration-fast ease-standard group-hover:scale-105 dark:bg-raise [&_svg]:size-4"
      >
        {icon ?? <Plus />}
      </span>
      {label}
    </button>
  )
}

/**
 * 「搜不到 / 筛完没有」（ui-defaults §7：⛔ 套空态配方——它回答「你的筛选太窄」，不是「这里还没有东西」）：
 * 一句「没找到「x」」（没有搜索词 = 「没有符合筛选的」），下面只给出口：清除搜索 / 清除筛选。
 * 库整页与挑选框同一个。`hint` = 在什么口径下没找到（LoRA：Civitai · SDXL · 安全）；
 * `actions` = 这个库自己多给的出口（LoRA 的「放宽一项」，带放宽以后的真实数量），排在后面。
 */
export function LibraryNoResults({
  query,
  onClearSearch,
  onClearFilters,
  hint,
  actions,
  className,
}: {
  /** 在搜的词（已去掉首尾空白）；空 = 是筛选筛空的。 */
  query?: string
  onClearSearch?: () => void
  onClearFilters?: () => void
  hint?: string
  actions?: readonly { key: string; label: ReactNode; onClick: () => void }[]
  className?: string
}) {
  const t = useTranslations('Feedback')
  const term = query?.trim() ?? ''
  const exits = [
    ...(term && onClearSearch
      ? [
          {
            key: 'clear-search',
            label: t('clearSearch'),
            onClick: onClearSearch,
          },
        ]
      : []),
    ...(onClearFilters
      ? [
          {
            key: 'clear-filters',
            label: t('clearFilters'),
            onClick: onClearFilters,
          },
        ]
      : []),
    ...(actions ?? []),
  ]
  return (
    <div
      role="status"
      data-testid="library-no-results"
      className={cn(
        'flex flex-col items-center gap-2 py-10 text-center',
        className,
      )}
    >
      <p className="text-2sm text-muted-foreground">
        {term ? t('noResultsQuery', { query: term }) : t('noResultsFiltered')}
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {exits.length > 0 ? (
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {exits.map((exit) => (
            <Button
              key={exit.key}
              type="button"
              size="sm"
              variant="secondary"
              className="rounded-full"
              onClick={exit.onClick}
            >
              {exit.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * 等宽格的灰块（静止，⛔ 呼吸）：与库里的格子同形 —— 3:4 + 名字 + 一行灰字（`MediaTileCaption`）；
 * 素材没有名字（`caption={false}`）。首屏在拿、往下滚接一排（`FeedTail.placeholder`）、路由还没到都用它。
 */
export function LibraryTileSkeletonGrid({
  count = 12,
  caption = true,
}: {
  count?: number
  caption?: boolean
}) {
  return (
    <LibraryGrid>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} aria-hidden className="min-w-0">
          <Skeleton className="aspect-3/4 w-full rounded-12 bg-muted" />
          {caption ? (
            <>
              <Skeleton className="mt-2 h-3.5 w-3/4 rounded-sm bg-muted" />
              <Skeleton className="mt-1 h-2.5 w-1/2 rounded-sm bg-muted" />
            </>
          ) : null}
        </div>
      ))}
    </LibraryGrid>
  )
}

/**
 * 整页还没到的那一拍（路由 `loading.tsx` / `useSearchParams` 的 Suspense）：同一道页边距（手机 16 / 桌面 22）、
 * 一行工具行的位置 + 这一页自己的格子灰块（不给 = 等宽格 `LibraryTileSkeletonGrid`）。⛔ 白屏、⛔ 转圈文字。
 */
export function LibraryPageSkeleton({ children }: { children?: ReactNode }) {
  return (
    <div
      aria-busy="true"
      className="flex h-page flex-col overflow-hidden bg-background px-4 pt-4 md:px-5.5"
    >
      <div aria-hidden className="flex h-9 shrink-0 items-center gap-2">
        <Skeleton className="h-9 w-32 rounded-full bg-muted" />
        <Skeleton className="h-9 w-64 rounded-full bg-muted max-md:hidden" />
        <span className="flex-1" />
        <Skeleton className="h-9 w-50 rounded-full bg-muted max-md:hidden" />
        <Skeleton className="h-9 w-20 rounded-full bg-muted" />
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-hidden">
        {children ?? <LibraryTileSkeletonGrid />}
      </div>
    </div>
  )
}
