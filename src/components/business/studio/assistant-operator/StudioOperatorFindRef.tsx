'use client'

/**
 * **回复里的 `#3` 与它指的那张卡**（搜索期第三片，附录 I §3.3「模型回复里写「#3 最接近你要的」，
 * 面板把第 3 张高亮」· §四「模型点名」）。
 *
 * ── 三件事 ──────────────────────────────────────────────────────
 *  · 正文里一个认得出的 `#n`（这一轮或上一轮找到的那张，表由
 *    `collectOperatorFindRefs` 算）换成一颗小胶囊（`withFindRefs`）；认不出的号原样留字。
 *  · 悬停 / 焦点在胶囊上 = 那张卡粗圈一下；点一下 = 滚到那张卡（最近的那一边，⛔ 不整页跳）
 *    并圈 `STUDIO_OPERATOR_FIND_REF.flashMs`。手机上没有悬停，点就是全部。
 *  · 一轮最后一段回复点到的那几张卡，常驻一圈细黑框（`operatorFindRingClass`，面板算 `named`）。
 *
 * ⚠ 高亮状态放**模块级**（同 `StudioOperatorLightbox`）：胶囊在正文里、卡在正文下面或上一轮
 *   那一段底下，两边隔着好几层组件；逐层传回调会让中间每一颗都多一个与自己无关的 prop。
 * ⚠ 圈用**内收**的 outline（负 offset）：视频那一排在手机上是横向滚动容器，往外画会被裁掉。
 */

import { Children, isValidElement, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { STUDIO_OPERATOR_FIND_REF } from '@/constants/studio-assistant-operator'
import { WEB_FIND_REF_PATTERN } from '@/lib/assistant-web-finds'
import {
  operatorFindDomId,
  type OperatorFindRef,
} from '@/lib/studio-operator-timeline'
import { cn } from '@/lib/utils'

interface FindHighlightState {
  /** 悬停 / 焦点在胶囊上的那一张。 */
  hovered: string | null
  /** 刚点过的那一张（圈 `flashMs` 就退）。 */
  flashed: string | null
}

let state: FindHighlightState = { hovered: null, flashed: null }
let flashTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function emit(next: FindHighlightState): void {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 悬停 / 焦点进出胶囊（`null` = 离开；只清自己那一张，⛔ 抹掉别人刚设的）。 */
export function hoverOperatorFind(key: string | null, leaving?: string): void {
  if (key === null && leaving !== undefined && state.hovered !== leaving) return
  if (state.hovered === key) return
  emit({ ...state, hovered: key })
}

/** 点胶囊：滚到那张卡（最近的那一边），圈一会儿。 */
export function flashOperatorFind(key: string): void {
  if (flashTimer !== null) clearTimeout(flashTimer)
  emit({ ...state, flashed: key })
  flashTimer = setTimeout(() => {
    flashTimer = null
    if (state.flashed === key) emit({ ...state, flashed: null })
  }, STUDIO_OPERATOR_FIND_REF.flashMs)
  if (typeof document === 'undefined') return
  const card = document.getElementById(operatorFindDomId(key))
  // ⚠ jsdom 没有 scrollIntoView；那里只验高亮。
  if (!card || typeof card.scrollIntoView !== 'function') return
  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  card.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
    behavior: reduce ? 'auto' : 'smooth',
  })
}

/** 这张卡此刻是不是被胶囊指着（悬停 / 焦点 / 刚点过）。 */
export function useOperatorFindHighlighted(key: string | null): boolean {
  return useSyncExternalStore(
    subscribe,
    () => key !== null && (state.hovered === key || state.flashed === key),
    () => false,
  )
}

/**
 * 卡片上那一圈：点名 = 2px 黑框常驻；被胶囊指着 = 4px（两样都在取粗的）。
 * ⚠ 内收（负 offset），理由见头注。焦点环那条规矩（不做动画）同样适用：⛔ 不给 outline 过渡。
 */
export function operatorFindRingClass(
  named: boolean,
  highlighted: boolean,
): string | undefined {
  if (highlighted)
    return 'outline outline-4 -outline-offset-4 outline-foreground'
  if (named) return 'outline outline-2 -outline-offset-2 outline-foreground'
  return undefined
}

/** 一张卡挂在 DOM 上的那几样（`id` 给胶囊滚过去，`data-*` 给测试与样式）。 */
export function operatorFindCardProps(
  key: string | null,
  n: number | undefined,
  named: boolean,
  highlighted: boolean,
): Record<string, string> {
  if (key === null || n === undefined) return {}
  return {
    id: operatorFindDomId(key),
    'data-find': String(n),
    'data-find-named': named ? 'true' : 'false',
    'data-find-highlighted': highlighted ? 'true' : 'false',
  }
}

/** 正文里那颗 `#3`。 */
export function StudioOperatorFindRefChip({
  findRef,
}: {
  findRef: OperatorFindRef
}) {
  const t = useTranslations('StudioOperator.web')
  const active = useOperatorFindHighlighted(findRef.key)
  return (
    <button
      type="button"
      data-testid="operator-find-ref"
      data-find={findRef.n}
      data-active={active ? 'true' : 'false'}
      aria-label={
        findRef.label
          ? t('findRef', { n: findRef.n, label: findRef.label })
          : t('findRefPlain', { n: findRef.n })
      }
      onMouseEnter={() => hoverOperatorFind(findRef.key)}
      onMouseLeave={() => hoverOperatorFind(null, findRef.key)}
      onFocus={() => hoverOperatorFind(findRef.key)}
      onBlur={() => hoverOperatorFind(null, findRef.key)}
      onClick={() => flashOperatorFind(findRef.key)}
      className={cn(
        'mx-px inline-flex min-w-5 items-center justify-center rounded border px-1 align-baseline font-mono text-xs tabular-nums leading-4 transition-colors duration-fast ease-standard focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring motion-reduce:transition-none coarse:px-1.5 coarse:py-1',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border text-foreground hover:bg-muted',
      )}
    >
      #{findRef.n}
    </button>
  )
}

/**
 * 把渲染好的子树里每一个认得出的 `#n` 换成一颗胶囊（同 `withCitations` 的做法：在 React 子树上
 * 换，⛔ 不另写 markdown 渲染器）。
 * ⚠ 认不出的号原样留字；链接里面的字不换（⛔ 按钮套在链接里）。
 */
export function withFindRefs(
  node: ReactNode,
  refs: ReadonlyMap<number, OperatorFindRef>,
): ReactNode {
  if (refs.size === 0) return node
  if (typeof node === 'string') {
    const parts: ReactNode[] = []
    let last = 0
    for (const match of node.matchAll(WEB_FIND_REF_PATTERN)) {
      const findRef = refs.get(Number(match[1]))
      if (!findRef) continue
      const at = match.index
      if (at > last) parts.push(node.slice(last, at))
      parts.push(
        <StudioOperatorFindRefChip key={`find-${at}`} findRef={findRef} />,
      )
      last = at + match[0].length
    }
    if (parts.length === 0) return node
    if (last < node.length) parts.push(node.slice(last))
    return parts
  }
  if (Array.isArray(node))
    return Children.map(node, (child) => withFindRefs(child, refs))
  if (
    isValidElement<{ children?: ReactNode; href?: unknown }>(node) &&
    node.props.children &&
    node.props.href === undefined
  )
    return {
      ...node,
      props: {
        ...node.props,
        children: withFindRefs(node.props.children, refs),
      },
    }
  return node
}
