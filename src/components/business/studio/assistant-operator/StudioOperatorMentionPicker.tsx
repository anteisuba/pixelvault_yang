'use client'

/**
 * `@` 提及选择器（`pages/assistant-shell.md` §3.3 第 1 行 / §7）。
 *
 * 「就地弹选择器（最近生成在前 + 素材库搜索）· 上下键选、回车确认，成缩略图 chip」。
 *
 * ── 三条结构约束 ──────────────────────────────────────────────────
 * ① **最近生成在前** —— 用户打 `@` 十次里有九次说的是「刚出的那张」。把素材库
 *    排前面等于让最常用的那条永远要多滚一屏。
 * ② **素材库走现有 `fetchGalleryImages`（`/api/images`）**，⛔ 不新建 route ——
 *    也⛔ 不走 `/api/generations` 列表口（那条会打断正在跑的生成，本仓踩过，
 *    `StudioOperatorAttachMenu` 的头注记着）。
 * ③ **键盘监听挂在 window 上（capture）而不是这颗弹层上** —— 焦点必须留在输入框
 *    里（用户还在打字），弹层自己拿不到按键。这也是为什么这里 `preventDefault`
 *    只对上下 / 回车 / Esc 四个键做：其余按键要原样落进输入框。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { GENERATION_REVIEW_STATE_IDS } from '@/constants/assistant-operator'
import { motionTransition } from '@/constants/motion'
import { STUDIO_OPERATOR_MENTION } from '@/constants/studio-assistant-operator'
import { AttachKindGlyph } from '@/components/business/studio/assistant-operator/StudioOperatorAttachMenu'
import { Spinner } from '@/components/ui/spinner'
import { useContextCards } from '@/hooks/use-context-cards'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { toOperatorAttachment } from '@/hooks/use-studio-operator-upload'
import { fetchGalleryImages } from '@/lib/api-client/gallery'
import { cn } from '@/lib/utils'
import { ContextCardChip } from '@/components/business/studio/assistant-operator/ContextCardChip'
import type {
  StudioOperatorAttachment,
  StudioOperatorCardMention,
} from '@/types/studio-assistant-operator'

interface StudioOperatorMentionPickerProps {
  /** `@` 后面那段（可能是空串 —— 刚打完 `@` 时就该先把最近的列出来）。 */
  query: string
  /**
   * 「最近生成」那一段。
   *
   * ⚠ 由宿主给（工作台是在飞那一批，LoRA 装配台是它自己的结果列），⛔ 这颗组件
   * 不去 context 里摸：面板会挂在两个宿主上，其中一个根本没有 `<StudioProvider>`。
   */
  recent: readonly StudioOperatorAttachment[]
  /**
   * 素材库那一跳搜哪几类（第二期最后一环）。
   *
   * ⭐ **视频档必须能搜到视频**：`critique_result` 在视频域吃的是客户端从被 `@` 的
   * 那段片子抽出来的三帧，而「被 `@` 的那段片子」只能从这里挑。写死 `['image']`
   * 的表现是那条路整条不可达 —— 用户搜自己的片子，picker 回一句「没找到」。
   * ⚠ 由宿主按域给，⛔ 这颗组件不去 context 里摸域（它挂在两个宿主上，其中一个
   * 没有 `<StudioProvider>`）。
   */
  searchTypes: readonly ('image' | 'video')[]
  onPick(attachment: StudioOperatorAttachment): void
  /**
   * 选中一张**上下文卡**（切片 Y）。
   *
   * ⚠ 与 `onPick` 分开一只手：卡不是附件（判据见 `StudioOperatorCardMention`
   * 头注），合成一只手就得在调用方里判「这条是图还是卡」，而那正是判别联合该
   * 干的事。缺席 = 这个宿主不接卡（⛔ 那时整组不渲染，不摆一组点不动的行）。
   */
  onPickCard?(card: StudioOperatorCardMention): void
  onDismiss(): void
  /**
   * 这一跳从素材库看到的那些（切片 N1）。
   *
   * ⭐ 宿主拿它当**正文里 `@图_012` 的候选名单**：名字里的序号是 id 的派生，
   * ⛔ **反查不回来** —— 服务端不可能拿一个名字去库里找那一行。所以「用户能按
   * 名字指认的」= 「他这一轮真的看见过的」，而选择器正是他看见它们的地方。
   * ⚠ 只是上报，⛔ 不是权限：挂载照旧只认这份名单里的 id。
   */
  onSeen?(assets: readonly StudioOperatorAttachment[]): void
}

export function StudioOperatorMentionPicker({
  query,
  recent,
  searchTypes,
  onPick,
  onPickCard,
  onDismiss,
  onSeen,
}: StudioOperatorMentionPickerProps) {
  const t = useTranslations('StudioOperator')
  const reduceMotion = useReducedMotion()
  /**
   * ⭐ **被判「已否」的那几张要在名单里看得出来**（切片 Y）：⛔ 不从名单里摘掉 ——
   * 用户指着一张被否的图问「这张哪里不行」是完全正当的一句话，摘掉它等于把这句话
   * 变成不可说。这里只做记号（降灰 + ✕），拒绝发生在首尾帧槽那一侧。
   */
  const { reviewStates } = useStudioOperatorState()
  const [results, setResults] = useState<readonly StudioOperatorAttachment[]>(
    [],
  )
  const [active, setActive] = useState(0)
  /** 素材库那一跳在飞 —— 「没找到」与「还在搜」是两句话（§4.1 的加载态一族）。 */
  const [searching, setSearching] = useState(false)

  const filteredRecent = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = recent.slice(0, STUDIO_OPERATOR_MENTION.recentCount)
    if (!needle) return list
    return list.filter((item) => item.label.toLowerCase().includes(needle))
  }, [query, recent])

  /**
   * 素材库那一段。
   *
   * ⚠ 去重按 id：刚生成的那张同时也在库里，两段各列一遍时上下键会走过两个
   * 长得一模一样的行 —— 用户会以为自己按键没生效。
   */
  const library = useMemo(
    () =>
      results.filter(
        (item) => !filteredRecent.some((tile) => tile.id === item.id),
      ),
    [filteredRecent, results],
  )

  /**
   * 「角色卡 / 风格卡」那一组（切片 Y）。
   *
   * ⚠ 全量拉一次、**在本地按名字过滤**：一个用户的卡总共几十张（判据与
   * `list_context_cards` 那条工具逐字同源 —— 那里也没有查询词），为它再开一条
   * 打字节流的搜索是白花的往返。
   * ⚠ 宿主不接卡时 `enabled: false` —— ⛔ 别为一个不显示的分组拉一次表。
   */
  const contextCards = useContextCards({ enabled: Boolean(onPickCard) })
  const cardOptions = useMemo(() => {
    if (!onPickCard) return []
    const needle = query.trim().toLowerCase()
    const list = contextCards.cards
    if (!needle) return list
    return list.filter((card) => card.name.toLowerCase().includes(needle))
  }, [contextCards.cards, onPickCard, query])

  /**
   * ⚠ 卡**排在图后面**且一起进 `options`：上下键要能走到它们，否则「打 @ 再按
   * 回车」这条最常用的路对卡不可达。图在前的判据没变（十次里九次说的是刚出那张）。
   */
  const options = useMemo(
    () => [...filteredRecent, ...library],
    [filteredRecent, library],
  )

  /**
   * 高亮的**有效**下标 —— 按当前列表长度现夹一次。
   *
   * ⚠ ⛔ 不在 effect 里 `setActive(0)`：那会触发一次级联渲染（本仓 eslint 的
   * `react-hooks/set-state-in-effect` 直接拦下来）。现夹的写法还顺带修掉了它的
   * 一个真问题 —— 搜索结果变短的那一帧里，回车会选中一个已经不在列表里的东西。
   */
  const activeIndex =
    options.length === 0 ? 0 : Math.min(active, options.length - 1)

  /**
   * ⚠ `onSeen` 走 ref：把它写进搜索 effect 的依赖里，宿主每次重建这个回调都会
   * 重搜一次库（而宿主重建它的时机是「又看见了几条」——自激）。
   */
  const seenRef = useRef(onSeen)
  useEffect(() => {
    seenRef.current = onSeen
  }, [onSeen])

  /**
   * 搜库 —— 打字节流。
   *
   * ⚠ 每个字符发一次请求等于把自己的库搜成一次 DDoS；`searchDebounceMs` 是那道闸。
   * ⚠ `cancelled` 是竞态闸：「海」的结果比「海报」晚回来时，列表会退回上一次的
   *   搜索结果 —— 而用户看到的是「越打越不准」。
   */
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      /**
       * ⚠ `setSearching(true)` 在**定时器回调里**，⛔ 不在 effect 体里：effect
       * 体里同步置态会被 `react-hooks/set-state-in-effect` 拦下来，而且那样连
       * 「还在防抖、请求根本没发」的那 200ms 也会显示在搜。
       */
      setSearching(true)
      void fetchGalleryImages(1, STUDIO_OPERATOR_MENTION.searchLimit, {
        mine: true,
        type: [...searchTypes],
        ...(query.trim() ? { search: query.trim() } : {}),
      })
        .then((result) => {
          if (cancelled) return
          const next = (result.data?.generations ?? [])
            .filter((item) => Boolean(item.url))
            .map((item) => toOperatorAttachment(item))
          setResults(next)
          // ⚠ 在 `.then` 里报给宿主，⛔ 不在 effect 体里 setState 上游（本仓
          //   eslint 的 `react-hooks/set-state-in-effect` 拦的是那一种）。
          seenRef.current?.(next)
        })
        .finally(() => {
          // ⚠ `finally`：请求失败时不熄灯的表现是那一行「正在搜」永远转下去。
          if (!cancelled) setSearching(false)
        })
    }, STUDIO_OPERATOR_MENTION.searchDebounceMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, searchTypes])

  /**
   * 键盘（见头注 ③）。
   *
   * ⚠ 依赖里带上 `options` 与 `active`：漏了它们，回车永远选中挂载那一刻的第一条
   * —— 一个「按了回车挂上的不是我高亮的那张」的静默错误。
   */
  const latestPick = useRef({ options, active: activeIndex, onPick, onDismiss })
  useEffect(() => {
    latestPick.current = { options, active: activeIndex, onPick, onDismiss }
  }, [activeIndex, onDismiss, onPick, options])

  const handleKey = useCallback((event: KeyboardEvent) => {
    const {
      options: list,
      active: index,
      onPick: pick,
      onDismiss: dismiss,
    } = latestPick.current
    if (event.key === 'Escape') {
      event.preventDefault()
      // ⚠ Studio 在 window 上还有一层 Escape 快捷键（同
      //   `StudioOperatorAttachMenu.tsx` 那条）：这一下已经被这颗弹层消费掉，
      //   不截断冒泡的表现是「按 Esc 关掉 @ 选择器，顺手把整个助手面板也收了」。
      //   ⛔ 别改成 `stopImmediatePropagation`：同一颗 window 上还挂着别的
      //   捕获监听（附件面板 / 灯箱），把它们一起掐掉是另一个 bug。
      event.stopPropagation()
      dismiss()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (list.length === 0) return
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => (current + delta + list.length) % list.length)
      return
    }
    if (event.key === 'Enter') {
      const chosen = list[index]
      // ⚠ 没有候选时**不吞回车**：那一刻用户想发的是消息，把它吞掉就是
      //    「打了 @ 之后再也发不出去」。
      if (!chosen) return
      event.preventDefault()
      // ⛔ 也要挡住 textarea 自己那条 `Enter → submit`（同一个事件冒泡上去）。
      event.stopPropagation()
      pick(chosen)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [handleKey])

  return (
    <motion.div
      data-testid="operator-mention-picker"
      role="listbox"
      aria-label={t('mention.pickerLabel')}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTransition('base', reduceMotion)}
      className="absolute bottom-full left-0 right-0 z-10 mb-1.5 max-h-64 overflow-y-auto rounded-xl border border-border bg-card shadow-lg"
    >
      {/* ⭐ 搜着的时候说一句（§4.1 的加载态一族）：⛔ 别在「还在搜」的那一秒里
          显示「没找到」—— 那是一句会让人停下来的假结论。 */}
      {options.length === 0 && cardOptions.length === 0 && searching ? (
        <p
          data-testid="operator-mention-searching"
          className="flex items-center justify-center gap-1.5 px-3 py-4 text-2sm text-muted-foreground"
        >
          <Spinner size="sm" />
          {t('mention.searching')}
        </p>
      ) : null}

      {options.length === 0 && cardOptions.length === 0 && !searching ? (
        <p
          data-testid="operator-mention-empty"
          className="px-3 py-4 text-center text-2sm text-muted-foreground"
        >
          {t('mention.empty')}
        </p>
      ) : null}

      {filteredRecent.length > 0 ? (
        <p className="px-3 pb-1 pt-2 font-mono text-xs tracking-nav text-muted-foreground">
          {t('mention.recent')}
        </p>
      ) : null}
      {filteredRecent.map((item, index) => (
        <MentionRow
          key={item.id}
          item={item}
          active={index === activeIndex}
          blocked={
            reviewStates[item.id] === GENERATION_REVIEW_STATE_IDS.blocked
          }
          onPick={onPick}
        />
      ))}

      {library.length > 0 ? (
        <p className="border-t border-border px-3 pb-1 pt-2 font-mono text-xs tracking-nav text-muted-foreground">
          {t('mention.library')}
        </p>
      ) : null}
      {library.map((item, index) => (
        <MentionRow
          key={item.id}
          item={item}
          active={filteredRecent.length + index === activeIndex}
          blocked={
            reviewStates[item.id] === GENERATION_REVIEW_STATE_IDS.blocked
          }
          onPick={onPick}
        />
      ))}

      {/* ── 角色卡 / 风格卡（切片 Y）─────────────────────────────
          ⚠ 一张卡都没有时**整组不渲染**：⛔ 不摆一句「你还没有卡」——
            那是设置里那一页该说的话，选择器只列挑得中的东西。 */}
      {cardOptions.length > 0 ? (
        <>
          <p className="border-t border-border px-3 pb-1 pt-2 font-mono text-xs tracking-nav text-muted-foreground">
            {t('mention.cards')}
          </p>
          <div
            data-testid="operator-mention-cards"
            className="flex flex-wrap gap-1.5 px-3 pb-2"
          >
            {cardOptions.map((card) => (
              <ContextCardChip
                key={card.id}
                cardId={card.id}
                name={card.name}
                kind={card.kind}
                images={card.images}
                onSelect={() =>
                  onPickCard?.({
                    cardId: card.id,
                    name: card.name,
                    kind: card.kind,
                    images: card.images,
                  })
                }
              />
            ))}
          </div>
        </>
      ) : null}
    </motion.div>
  )
}

function MentionRow({
  item,
  active,
  blocked,
  onPick,
}: {
  item: StudioOperatorAttachment
  active: boolean
  /** 用户把这一张判过「已否」（切片 Y）—— ⚠ 记号而已，⛔ 它照旧可选。 */
  blocked: boolean
  onPick(attachment: StudioOperatorAttachment): void
}) {
  const t = useTranslations('StudioOperator')
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      data-testid="operator-mention-option"
      data-active={active}
      data-blocked={blocked}
      // ⚠ `onMouseDown` + `preventDefault`：`onClick` 会先让输入框失焦，
      //    而失焦会关掉这颗弹层 —— 表现是「点了没反应」。
      onMouseDown={(event) => {
        event.preventDefault()
        onPick(item)
      }}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-2sm transition-colors duration-(--duration-fast) ease-standard hover:bg-accent',
        active ? 'bg-accent text-foreground' : 'text-muted-foreground',
      )}
    >
      <span className="grid size-6 shrink-0 place-items-center overflow-hidden rounded bg-muted">
        {/* ⚠ 预览走 `thumbnailUrl`，⛔ 不回落到 `url`（视频的 url 是媒体本身）。 */}
        {item.thumbnailUrl ? (
          <Image
            src={item.thumbnailUrl}
            alt=""
            width={48}
            height={48}
            className={cn('size-full object-cover', blocked && 'grayscale')}
          />
        ) : (
          <AttachKindGlyph kind={item.kind} />
        )}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          // ⚠ 已否的名字划一道 —— 缩略图那一点灰在 24px 上读不出来。
          blocked && 'line-through opacity-70',
        )}
      >
        {item.label}
      </span>
      {/* 🔬 contrast-check（2026-09-07）：`status-risk` 对卡背 **6.54 / 5.55**
          （浅 / 深）—— 信息性图形 3:1 门槛，两档都过。 */}
      {blocked ? (
        <X
          data-testid="operator-mention-blocked"
          aria-label={t('result.block')}
          className="size-3.5 shrink-0 text-status-risk"
        />
      ) : null}
    </button>
  )
}
