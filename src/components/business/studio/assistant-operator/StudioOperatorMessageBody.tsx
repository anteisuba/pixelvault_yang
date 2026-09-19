'use client'

/**
 * 助手正文那一格（2026-09-06 面板轮，第 4 / 5 件）。
 *
 * ── 三件事，一颗组件 ────────────────────────────────────────────
 *  · **无气泡、无边框、无底色**：正文就是沟里的一段字。两方靠头像与节点形状分
 *    （时间线沟本来就分得出来），⛔ 不靠色块分 —— 色块一加，一屏里每一条都在
 *    抢重量，而其中真正要读的只有最后两行。
 *  · **长回话自动折起来**（`collapseAfterLines`）：折起态只留**首句**，后面跟
 *    一颗「展开全文」。⚠ 判据数的是**换行数**不是渲染行数，理由见常量头注。
 *  · **`detail` 折成「为什么」**：正文只写结论 + 下一步，理由点开才看。
 *
 * ⚠ 正文走 **markdown**（v2 §13.2）：复用仓里的 `ui/markdown.tsx` + 共享排版配方
 * `.message-md`（globals.css），⛔ 不为助手另写渲染器、⛔ 不另起一份 CSS 配方。
 * ⚠ 折叠**先按纯文本切，切完再各自渲染**：首句是在原文上取的（`firstOperatorSentence`
 * 认句号，见其头注），⛔ 不在渲染后的 DOM 上截 —— 那样切到一半的加粗会漏出星号。
 *
 * ⚠ `streaming` 且还没有字 = 占位行。`streaming` 且已有字 = 收尾轮还在写，
 * 先不折叠，免得半截 markdown 被切成首句。
 * ⭐ **句尾角标 + 底下一排来源卡**（56b 切片 1）：模型在正文里写 `[3]`，这一格
 *    把它渲染成一枚小上标，点下去高亮底下第 3 张来源卡。⛔ 不为角标另写一个
 *    markdown 渲染器 —— `[3]` 在 markdown 里本来就是一段普通文字，所以做法是在
 *    **渲染出来的 React 子树上**把那段字换成一颗按钮（`withCitations`）。
 *
 * ⚠ 折叠开合是**局部 state**：它是一次性的阅读动作，不该占 store 的一格 ——
 * 而收放法则（拍板 7）把面板卸载一次之后重新收起，恰恰是对的（那时用户是在
 * 重新读这条会话）。
 */

import { Children, isValidElement, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Image from 'next/image'
import type { Components } from 'react-markdown'
import { ChevronDown } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { INITIAL_COMPONENTS, Markdown } from '@/components/ui/markdown'
import {
  StudioOperatorAnswerSources,
  type StudioOperatorAnswerSource,
} from './StudioOperatorAnswerSources'
import {
  firstOperatorSentence,
  shouldCollapseOperatorText,
} from '@/lib/studio-operator-timeline'
import { cn } from '@/lib/utils'
import type {
  StudioOperatorAttachment,
  StudioOperatorMessageEntry,
} from '@/types/studio-assistant-operator'

interface StudioOperatorMessageBodyProps {
  entry: StudioOperatorMessageEntry
  /**
   * **加载态那一句状态词**（v2 §3.6）—— 「正在查 3 个来源…」。
   *
   * ⚠ 只在**还没有字**的那一格上画（占位行）：正文一到它就该让位。
   * ⚠ 缺席时退回三点脉冲 —— 状态词只有在跑着的时候才算得出来（历史里那一条
   *   永远没有），⛔ 别为它留一行空白。
   */
  statusText?: string
  /**
   * **这段回答用到的资料**（56b 切片 1）—— 正文里的 `[n]` 按它认号，正文底下那
   * 一排来源卡也是它。⚠ 缺席 = 这一轮没查东西（大多数轮都是），整块不渲染。
   */
  sources?: readonly StudioOperatorAnswerSource[]
  /** 「钉住」那一颗的两样；缺席就不画那颗（⛔ 不摆一颗按不了的按钮）。 */
  pinned?: boolean
  onTogglePin?(): void
  /** 「深入调查」——第二档的两个入口之一（切片 2）。 */
  onDeepResearch?(): void
  /** 「搜了 6 条 · 读了 3 页」那一行灰字。 */
  receiptLabel?: string
}

/** `[12]` —— 正文里那个角标。⚠ 只认 1–2 位：`[2026]` 是年份不是引用。 */
const CITATION_PATTERN = /\[(\d{1,2})\]/g

/**
 * 把渲染好的子树里每一段 `[n]` 换成一颗角标按钮。
 *
 * ⭐ **递归而不是只处理段落**：`[3]` 常常紧跟在一句加粗后面（画板上那一句就是
 * 这样），而加粗在 React 树里是 `<strong>` 的子节点 —— 只映射 `p` 的直接子节点
 * 会把它漏掉，表现是「有的角标是上标、有的还是方括号」。
 * ⚠ 认不出来的号（服务端没给这一条证据）**原样留着那段字**：⛔ 不渲染成一颗点
 * 下去什么都不发生的按钮，也⛔ 不把它吞掉 —— 吞掉之后没人知道模型编过一个号。
 */
function withCitations(
  node: ReactNode,
  known: ReadonlySet<number>,
  onPick: (cite: number) => void,
  active: number | null,
  label: (cite: number) => string,
): ReactNode {
  if (typeof node === 'string') {
    if (!CITATION_PATTERN.test(node)) return node
    CITATION_PATTERN.lastIndex = 0
    const parts: ReactNode[] = []
    let last = 0
    for (const match of node.matchAll(CITATION_PATTERN)) {
      const cite = Number(match[1])
      const at = match.index
      if (!known.has(cite)) continue
      if (at > last) parts.push(node.slice(last, at))
      parts.push(
        <button
          key={`cite-${at}-${cite}`}
          type="button"
          data-testid="operator-message-citation"
          data-cite={cite}
          data-active={active === cite ? 'true' : 'false'}
          aria-label={label(cite)}
          onClick={() => onPick(cite)}
          className={
            active === cite
              ? 'mx-px inline-flex min-w-4 items-center justify-center rounded border border-foreground bg-foreground px-1 align-super font-mono text-2xs tabular-nums leading-4 text-background'
              : 'mx-px inline-flex min-w-4 items-center justify-center rounded border border-border px-1 align-super font-mono text-2xs tabular-nums leading-4 text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground motion-reduce:transition-none'
          }
        >
          {cite}
        </button>,
      )
      last = at + match[0].length
    }
    if (parts.length === 0) return node
    if (last < node.length) parts.push(node.slice(last))
    return parts
  }
  if (Array.isArray(node)) {
    return Children.map(node, (child) =>
      withCitations(child, known, onPick, active, label),
    )
  }
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children) {
    return {
      ...node,
      props: {
        ...node.props,
        children: withCitations(
          node.props.children,
          known,
          onPick,
          active,
          label,
        ),
      },
    }
  }
  return node
}

/**
 * 正文那一段字 + 「展开全文」—— **实时线程与只读历史共用这一颗**
 * （2026-09-07 真机）。
 *
 * ⭐ 由来：历史里一条 8 行的正文整条铺开，既没有折叠开关也没有 `data-testid`。
 * 根因不是 `streaming` 没清零，而是历史那一支**压根走的是另一段 JSX**（一个裸
 * `<p>{entry.text}</p>`）—— 折叠逻辑只写在实时那一支里。⛔ 不在历史那边再抄一份：
 * 抄的那份哪天与这份分叉，表现是「刷新之后同一句话的折法变了」。
 */
export function StudioOperatorCollapsibleText({
  text,
  streaming = false,
  statusText,
  sources = [],
  activeCite = null,
  onPickCitation,
}: {
  text: string
  /** 见 `StudioOperatorMessageBodyProps.statusText`。 */
  statusText?: string
  /**
   * 这一条**还没有字**（发送即回显的占位行）—— 空正文时画三点脉冲。
   * 有字且仍 streaming = 收尾轮还在写，不折叠。
   */
  streaming?: boolean
  /** 这段回答用到的资料（56b 切片 1）—— 角标按它认号。缺席 = 没有角标。 */
  sources?: readonly StudioOperatorAnswerSource[]
  activeCite?: number | null
  onPickCitation?(cite: number): void
}) {
  const t = useTranslations('StudioOperator')
  const [expanded, setExpanded] = useState(false)
  const known = useMemo(
    () => new Set(sources.map((source) => source.cite)),
    [sources],
  )
  /**
   * ⚠ 覆盖表在 `INITIAL_COMPONENTS` **之上叠加**而不是替换（那份的头注写死了
   * 这条）：只传自己那几个的结果是 code/pre 悄悄退回裸 HTML。
   * ⚠ 一条资料都没有时**整张表不传**：没有号可认的正文里，`[1]` 就是用户自己
   * 打的那两个方括号，⛔ 不该被吃掉。
   */
  const components = useMemo<Partial<Components> | undefined>(() => {
    if (known.size === 0 || !onPickCitation) return undefined
    const wrap = (node: ReactNode): ReactNode =>
      withCitations(node, known, onPickCitation, activeCite, (cite) =>
        t('answer.citation', { index: cite }),
      )
    return {
      ...INITIAL_COMPONENTS,
      p: function CitedParagraph({ children }) {
        return <p>{wrap(children)}</p>
      },
      li: function CitedListItem({ children }) {
        return <li>{wrap(children)}</li>
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` 每次 render 换引用，钉在真正会变的三样上
  }, [known, onPickCitation, activeCite])

  const collapsible = !streaming && shouldCollapseOperatorText(text)
  const collapsed = collapsible && !expanded

  /**
   * **发送即回显的占位行**（§4.1）—— 头像已经在了，正文位画三点脉冲。
   *
   * ⚠ 高度写死成一行正文高（`text-md`(15px) + `leading-relaxed` ≈ 24px = `h-6`）：
   * §4.1「骨架尺寸 = 内容尺寸」，第一个字到达时这一行不许跳。
   */
  if (!text && streaming) {
    /**
     * ⭐ **头像旁一行状态词**（§3.6）—— 不转圈、不用骨架屏。
     * ⚠ 它替掉的是顶部那条进度带（决策 14）：「正在查 3 个来源…」本身就是进度，
     * 而带子要花 40px 的常驻高度才说得出同一句话。
     */
    if (statusText) {
      return (
        <p
          data-testid="operator-status-word"
          className="flex h-6 items-center text-md leading-relaxed text-muted-foreground animate-pulse motion-reduce:animate-none"
        >
          {statusText}
        </p>
      )
    }
    return (
      <p
        data-testid="operator-message-pending"
        className="flex h-6 items-center gap-1 text-md leading-relaxed"
        aria-label={t('streaming.pending')}
      >
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            aria-hidden
            style={{ animationDelay: `${dot * 140}ms` }}
            className="size-1 rounded-full bg-muted-foreground/70 animate-pulse motion-reduce:animate-none"
          />
        ))}
      </p>
    )
  }

  return (
    <>
      <div
        data-testid="operator-message-text"
        {...(collapsed ? { 'data-collapsed': 'true' } : {})}
        className="min-w-0 text-md leading-relaxed text-foreground"
      >
        <Markdown
          className="message-md"
          {...(components ? { components } : {})}
        >
          {collapsed ? firstOperatorSentence(text) : text}
        </Markdown>
      </div>

      {collapsible ? (
        <button
          type="button"
          data-testid="operator-message-expand"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="flex w-fit items-center gap-1 text-2sm text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? t('message.collapse') : t('message.expand')}
          <ChevronDown
            aria-hidden
            className={cn(
              'size-3 transition-transform duration-(--duration-fast) ease-standard motion-reduce:transition-none',
              expanded && 'rotate-180',
            )}
          />
        </button>
      ) : null}
    </>
  )
}

export function StudioOperatorMessageBody({
  entry,
  statusText,
  sources = [],
  pinned,
  onTogglePin,
  onDeepResearch,
  receiptLabel,
}: StudioOperatorMessageBodyProps) {
  const t = useTranslations('StudioOperator')
  /**
   * ⚠ 高亮住在**这一格**而不是来源卡那颗组件里：角标在正文里、卡在正文下面，
   * 两边读的必须是同一个值。⛔ 别做成两份 state。
   * ⚠ 再点一次同一个号就熄灭 —— 高亮是一次阅读动作，不是一个要人去关的模式。
   */
  const [activeCite, setActiveCite] = useState<number | null>(null)

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <StudioOperatorCollapsibleText
        text={entry.text}
        streaming={entry.streaming ?? false}
        sources={sources}
        activeCite={activeCite}
        onPickCitation={(cite) =>
          setActiveCite((current) => (current === cite ? null : cite))
        }
        {...(statusText ? { statusText } : {})}
      />

      {/* ⚠ 还在写的时候**不画**（56b 切片 1）：资料要等这段话说完再摆出来，
          否则来源卡会在正文长高的过程中一直往下跳。 */}
      {sources.length > 0 && !entry.streaming ? (
        <StudioOperatorAnswerSources
          sources={sources}
          activeCite={activeCite}
          {...(pinned === undefined ? {} : { pinned })}
          {...(onTogglePin ? { onTogglePin } : {})}
          {...(onDeepResearch ? { onDeepResearch } : {})}
          {...(receiptLabel ? { receiptLabel } : {})}
        />
      ) : null}

      {/* ⚠ 没有 `detail` 就**什么都不画**（⛔ 不画一颗点开是空的「为什么」）。 */}
      {entry.detail ? (
        <details data-testid="operator-message-why" className="min-w-0">
          <summary className="w-fit cursor-pointer list-none text-2sm text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
            {t('message.why')}
          </summary>
          <p className="mt-1 whitespace-pre-wrap border-l border-border pl-2.5 text-2sm leading-relaxed text-muted-foreground">
            {entry.detail}
          </p>
        </details>
      ) : null}
    </div>
  )
}

export function StudioOperatorUserText({
  text,
  attachments,
}: {
  text: string
  attachments: readonly StudioOperatorAttachment[]
}) {
  const displayText = attachments.reduce(
    (value, attachment) =>
      attachment.kind === 'video' || attachment.kind === 'audio'
        ? value.replaceAll(
            `${attachment.label} (${attachment.kind}) ${attachment.url}`,
            `@${attachment.label}`,
          )
        : value,
    text,
  )
  const images = new Map(
    attachments
      .filter((item) => item.kind === 'image')
      .map((item) => [item.label.toLowerCase(), item]),
  )
  return (
    <p
      data-testid="operator-user-text"
      /* 画板 BCards「消息 · 用户」：用户那一侧**带气泡**（浅填充 + 细边 +
         右下角收成小圆角），助手那一侧不带 —— 两侧靠「有没有壳」分，
         ⛔ 不靠字色分（§12.1 卡片层：白面 + 极细描边）。 */
      className="w-fit max-w-full whitespace-pre-wrap rounded-xl rounded-br-sm border border-border bg-muted px-3 py-2 text-md font-medium leading-relaxed text-foreground"
    >
      {displayText
        .split(/(\breference image [1-9]\d*\b)/gi)
        .map((part, index) => {
          const attachment = /^reference image [1-9]\d*$/i.test(part)
            ? images.get(part.toLowerCase())
            : undefined
          return attachment ? (
            <span
              key={index}
              className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted/50 px-1 py-0.5 align-middle text-2sm font-normal"
            >
              <Image
                src={attachment.thumbnailUrl || attachment.url}
                alt={attachment.label}
                width={24}
                height={24}
                unoptimized
                className="size-6 shrink-0 rounded object-cover"
              />
              <span>{part}</span>
            </span>
          ) : (
            part
          )
        })}
    </p>
  )
}
