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

import { Children, Fragment, isValidElement, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import Image from 'next/image'
import type { Components } from 'react-markdown'
import { ChevronDown, FileText } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { STUDIO_OPERATOR_SHELL } from '@/constants/studio-assistant-operator'
import { useBlurSwapIn } from '@/components/ui/blur-swap'
import { INITIAL_COMPONENTS, Markdown } from '@/components/ui/markdown'
import {
  StudioOperatorAnswerSources,
  type StudioOperatorAnswerSource,
} from './StudioOperatorAnswerSources'
import {
  StudioOperatorThinkingRow,
  StudioOperatorThoughtReceipt,
} from './StudioOperatorThinkingRow'
import {
  firstOperatorSentence,
  shouldCollapseOperatorText,
} from '@/lib/studio-operator-timeline'
import { cn } from '@/lib/utils'
import type { NamedImageReference } from '@/lib/studio-reference-mentions'
import type { AssistantMention } from '@/types/assistant-mention'
import type {
  StudioOperatorAttachment,
  StudioOperatorMessageEntry,
} from '@/types/studio-assistant-operator'

interface StudioOperatorMessageBodyProps {
  references?: readonly NamedImageReference[]
  entry: StudioOperatorMessageEntry
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
  /**
   * 「用 Grok 搜这一次」（owner 2026-10-14）：这一问冲着 X、所选模型搜不到 X，而创作者
   * 配了 Grok key。按下才用他的 Grok 额度；缺席就不画。
   */
  onSearchXWithGrok?(): void
  /**
   * **这段话之前找到的图与视频**（搜索期切片 1 · 第二片 · 附录 I §四）—— 面板画好的
   * 图网格（`StudioOperatorWebCandidateGrid`）与视频那一排（`StudioOperatorWebVideoRow`）
   * 交进来，摆在正文底下、来源卡上面。
   * ⚠ 是一个槽而不是数据：选用态、播放器与它们的去处是面板的，这一格只管摆在哪。
   */
  webFinds?: ReactNode
}

/**
 * 参考图缩略图（D12 P8 / C10）—— 地址过期或被删时画一格占位，⛔ 不出破图标。
 */
function ReferenceThumb({ url, name }: { url: string; name: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return (
      <span
        aria-hidden
        data-testid="operator-reference-thumb-missing"
        className="size-7 shrink-0 rounded-md bg-muted"
      />
    )
  }
  return (
    <Image
      src={url}
      alt={name}
      width={56}
      height={56}
      unoptimized
      onError={() => setBroken(true)}
      className="size-7 shrink-0 rounded-md object-cover"
    />
  )
}

/** 正文里能画成胶囊的引用：图（缩略图）或画布文本节点（`text`，文档字形）。 */
type InlineReference = NamedImageReference & { readonly text?: true }

function withImageReferences(
  node: ReactNode,
  references: readonly InlineReference[],
): ReactNode {
  if (typeof node === 'string') {
    const byAlias = new Map(
      references.flatMap((reference) =>
        reference.aliases.map((alias) => [alias, reference] as const),
      ),
    )
    const aliases = [...byAlias.keys()]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
    if (!aliases.length) return node
    /**
     * ⚠ 名字两侧的 `@` 与「」一并吞掉（2026-09-24 真机：气泡里是「@图1」原文）——
     * 那是发给模型的记号，界面上缩略图 + 名字已经说清楚了。只有一个捕获组，
     * `split` 留下的就只是名字本身。
     */
    const pattern = new RegExp(
      `(?:@|「)?(${aliases.map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![0-9])」?`,
      'g',
    )
    return node.split(pattern).map((part, index) => {
      const reference = byAlias.get(part)
      return reference ? (
        <span
          key={index}
          title={reference.name}
          /* D12 P8：28px 圆角缩略图 + 名字，⛔ 不带边框，直接贴在字里。 */
          className="mx-0.5 inline-flex max-w-full items-center gap-1.5 align-middle text-xs font-normal text-muted-foreground"
        >
          {reference.text ? (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <FileText className="size-4" aria-hidden />
            </span>
          ) : (
            <ReferenceThumb url={reference.url} name={reference.name} />
          )}
          <span className="min-w-0 break-words">{reference.name}</span>
        </span>
      ) : (
        part
      )
    })
  }
  if (Array.isArray(node))
    return Children.map(node, (child) => withImageReferences(child, references))
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children) {
    return {
      ...node,
      props: {
        ...node.props,
        children: withImageReferences(node.props.children, references),
      },
    }
  }
  return node
}

export function StudioOperatorReferenceText({
  text,
  references = [],
}: {
  text: string
  references?: readonly NamedImageReference[]
}) {
  return <>{withImageReferences(text, references)}</>
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
              : 'mx-px inline-flex min-w-4 items-center justify-center rounded border border-border px-1 align-super font-mono text-2xs tabular-nums leading-4 text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground motion-reduce:transition-none'
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
  sources = [],
  activeCite = null,
  onPickCitation,
  references = [],
  pendingSince,
  pendingPhase,
}: {
  references?: readonly NamedImageReference[]
  text: string
  /** 占位行挂上的那一刻 —— 「正在想… N 秒」从这里数（§9.1）。 */
  pendingSince?: number
  /** `landing` = 画布接力那一跳（「正在画布上落地…」）。 */
  pendingPhase?: 'landing'
  /**
   * 这一条**还没有字**（发送即回显的占位行）—— 空正文时画「正在想…」那一行。
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
    if (references.length === 0 && (known.size === 0 || !onPickCitation))
      return undefined
    const wrap = (node: ReactNode): ReactNode => {
      const cited = onPickCitation
        ? withCitations(node, known, onPickCitation, activeCite, (cite) =>
            t('answer.citation', { index: cite }),
          )
        : node
      return withImageReferences(cited, references)
    }
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
  }, [known, onPickCitation, activeCite, references])

  const collapsible = !streaming && shouldCollapseOperatorText(text)
  const collapsed = collapsible && !expanded
  /**
   * 「正在思考…」→ 第一个字到达（owner 2026-10-07 动效方向）：正文**糊着进来**，
   * ⛔ 不是硬切。历史消息一挂上就是正文，不播（见 `useBlurSwapIn` 头注）。
   */
  const textSwap = useBlurSwapIn(!text && streaming ? 'pending' : 'text')

  /**
   * **等回答时那一行**（2026-10-14 设计方案 §9.1，取代 D12 R-C 的三点）：一秒内不画，
   * 之后呼吸点 + 扫光「正在想…」+ 已等秒数，>6 s 多一句慢提示。
   * ⛔ 不转圈、⛔ 不上骨架；第一个字一到就让位给正文。详见 `StudioOperatorThinkingRow`。
   */
  if (!text && streaming) {
    return (
      <StudioOperatorThinkingRow
        {...(pendingSince === undefined ? {} : { since: pendingSince })}
        landing={pendingPhase === 'landing'}
      />
    )
  }

  return (
    <>
      <motion.div
        data-testid="operator-message-text"
        {...(collapsed ? { 'data-collapsed': 'true' } : {})}
        {...textSwap}
        className="min-w-0 text-sm leading-relaxed text-foreground"
      >
        <Markdown
          className="message-md"
          {...(components ? { components } : {})}
        >
          {collapsed ? firstOperatorSentence(text) : text}
        </Markdown>
        {/* ⭐ **末尾那根光标**（56b 切片 3）—— 只在还在写的时候画。
            ⚠ 历史回放里的那一条永远没有 `streaming`，所以⛔ 不会重播流式。
            ⚠ 不闪：闪烁是一条 `motion-reduce` 关不掉就会一直动的动效，而这一档
            本来就走不到这里（上面那个分支已经把整段扣住了）。 */}
        {streaming && text ? (
          <span
            data-testid="operator-message-caret"
            aria-hidden
            /* ⚠ **一块**不是一条（D7c ④ 画板「流式中」：7×14 的实心小块）——
               1px 的细线在一段正在长的正文末尾几乎看不见，而它要回答的正是
               「它还在写」。
               ⚠ 尺寸走刻度（`w-1.75` / `h-3.5`），⛔ 不写任意值（Hard Rule 5：
               Tailwind 4 本仓没有 tailwind.config.ts）。 */
            className="ml-0.5 inline-block h-3.5 w-1.75 rounded-xs align-middle bg-foreground"
          />
        ) : null}
      </motion.div>

      {collapsible ? (
        <button
          type="button"
          data-testid="operator-message-expand"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="flex w-fit items-center gap-1 text-2sm text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? t('message.collapse') : t('message.expand')}
          <ChevronDown
            aria-hidden
            className={cn(
              'size-3 transition-transform duration-fast ease-standard motion-reduce:transition-none',
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
  sources = [],
  pinned,
  onTogglePin,
  onDeepResearch,
  receiptLabel,
  onSearchXWithGrok,
  webFinds,
  references = [],
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
      {entry.text ? (
        <StudioOperatorThoughtReceipt
          {...(entry.thoughtMs === undefined
            ? {}
            : { thoughtMs: entry.thoughtMs })}
        />
      ) : null}
      <StudioOperatorCollapsibleText
        text={entry.text}
        references={references}
        streaming={entry.streaming ?? false}
        {...(entry.pendingSince === undefined
          ? {}
          : { pendingSince: entry.pendingSince })}
        {...(entry.pendingPhase ? { pendingPhase: entry.pendingPhase } : {})}
        sources={sources}
        activeCite={activeCite}
        onPickCitation={(cite) =>
          setActiveCite((current) => (current === cite ? null : cite))
        }
      />

      {/* ⚠ 还在写的时候**不画**（56b 切片 1）：资料要等这段话说完再摆出来，
          否则来源卡会在正文长高的过程中一直往下跳。找到的图与视频同一条。 */}
      {webFinds && !entry.streaming ? webFinds : null}
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

      {/* ⚠ 不跟着来源卡走：没搜 X 的那一问可能一条网页来源都没有，按钮照样要在。 */}
      {onSearchXWithGrok && !entry.streaming ? (
        <button
          type="button"
          data-testid="operator-answer-search-x-grok"
          onClick={onSearchXWithGrok}
          className="flex h-7 w-fit shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs text-foreground transition-colors duration-fast ease-standard hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
        >
          {t('answer.searchXWithGrok')}
        </button>
      ) : null}
    </div>
  )
}

/**
 * 气泡底下那一排要画的附件：不是图的，加上正文里没写到名字的图。
 *
 * ⚠ 图只在正文写到它名字的地方贴缩略图（`withImageReferences`）；从输入框上方
 *   chip 带上的图名字不在正文里，此前发出去就一张都看不见了（2026-10-09 owner 真机）。
 */
export function attachmentsBelowUserText(
  text: string,
  attachments: readonly StudioOperatorAttachment[],
): StudioOperatorAttachment[] {
  return attachments.filter(
    (attachment) =>
      attachment.kind !== 'image' || !text.includes(attachment.label),
  )
}

/**
 * 气泡里一枚 `@` 引用（设计方案 §10b「用户消息气泡里的 chip 也可点、可定位」）。
 * 发出去的正文里它是 `「名字」`（`renderMentionText`，同一条消息里名字已去重），
 * 这里按名字换回胶囊；点一下由面板决定去哪（画布定位 / 看大图）。
 */
function MentionChip({
  mention,
  missing,
  onClick,
}: {
  mention: AssistantMention
  missing: boolean
  onClick?: (mention: AssistantMention) => void
}) {
  const t = useTranslations('StudioOperator.mention')
  const body = (
    <>
      {mention.thumb && !missing ? (
        <ReferenceThumb url={mention.thumb} name={mention.label} />
      ) : (
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        >
          <FileText className="size-4" aria-hidden />
        </span>
      )}
      <span className={cn('min-w-0 break-words', missing && 'line-through')}>
        {mention.label}
      </span>
    </>
  )
  const className =
    'mx-0.5 inline-flex max-w-full items-center gap-1.5 align-middle text-xs font-normal text-muted-foreground'
  if (!onClick || missing)
    return (
      <span
        data-testid="operator-user-mention"
        data-missing={missing ? 'true' : undefined}
        title={
          missing ? t('deletedNamed', { label: mention.label }) : mention.label
        }
        className={className}
      >
        {body}
      </span>
    )
  return (
    <button
      type="button"
      data-testid="operator-user-mention"
      title={mention.label}
      onClick={() => onClick(mention)}
      className={cn(
        className,
        'rounded-md transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {body}
    </button>
  )
}

/** 正文里的 `「名字」` → 胶囊；其余照旧交给 `withImageReferences`。 */
function withMentionChips(
  text: string,
  mentions: readonly AssistantMention[],
  render: (mention: AssistantMention, key: number) => ReactNode,
  rest: (part: string) => ReactNode,
): { node: ReactNode; inlined: ReadonlySet<AssistantMention> } {
  const byLabel = new Map(
    mentions.map((mention) => [`「${mention.label}」`, mention]),
  )
  const labels = [...byLabel.keys()].sort((a, b) => b.length - a.length)
  const inlined = new Set<AssistantMention>()
  if (!labels.length) return { node: rest(text), inlined }
  const pattern = new RegExp(
    `(${labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'g',
  )
  const node = text.split(pattern).map((part, index) => {
    const mention = byLabel.get(part)
    if (!mention) return <Fragment key={index}>{rest(part)}</Fragment>
    inlined.add(mention)
    return render(mention, index)
  })
  return { node, inlined }
}

export function StudioOperatorUserText({
  text,
  attachments,
  references = [],
  textNodeNames = [],
  mentions = [],
  onMentionClick,
  isMentionMissing,
}: {
  references?: readonly NamedImageReference[]
  text: string
  attachments: readonly StudioOperatorAttachment[]
  /** 画布上文本节点的名字 —— 正文里的 `@名字` 画成文档胶囊（owner 2026-10-08）。 */
  textNodeNames?: readonly string[]
  /** 这一条带的 `@` 引用（统一引用模型 §10b）。 */
  mentions?: readonly AssistantMention[]
  onMentionClick?: (mention: AssistantMention) => void
  /** 指的东西此刻还在不在（画布上的卡被删了 = 灰掉、不可点）。 */
  isMentionMissing?: (mention: AssistantMention) => boolean
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
  const imageReferences = references.length
    ? references
    : attachments
        .filter((item) => item.kind === 'image')
        .map((item) => ({
          url: item.thumbnailUrl || item.url,
          name: item.label,
          aliases: [item.label],
        }))
  const legacy = (part: string) =>
    withImageReferences(part, [
      ...imageReferences,
      ...textNodeNames
        .filter((name) => part.includes(`@${name}`))
        // ⚠ 只认带 `@` 的那一处：正文里顺口提到同一个词不算引用。
        .map((name) => ({
          url: '',
          name,
          aliases: [`@${name}`],
          text: true as const,
        })),
    ])
  const renderChip = (mention: AssistantMention, key: number) => (
    <MentionChip
      key={key}
      mention={mention}
      missing={isMentionMissing?.(mention) ?? false}
      {...(onMentionClick ? { onClick: onMentionClick } : {})}
    />
  )
  const { node, inlined } = withMentionChips(
    displayText,
    mentions,
    renderChip,
    legacy,
  )
  /** 正文里没写出名字的那几条（答题那条路）照样挂在这一条底下 —— 事后看得出这轮带了什么。 */
  const trailing = mentions.filter((mention) => !inlined.has(mention))
  return (
    <p
      data-testid="operator-user-text"
      /* 对话框 B-C（owner 09-25）：你的那一句是象牙气泡 —— 与输入条同一种料，
         右上角收成小圆角；助手那一轮在灰框里。两侧靠材质与左右分。 */
      className="w-fit max-w-full whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-surface-composer px-3 py-2 text-sm leading-relaxed text-surface-composer-foreground"
    >
      {node}
      {trailing.length ? (
        <span className="mt-1 flex flex-wrap gap-1">
          {trailing.map((mention, index) => renderChip(mention, index))}
        </span>
      ) : null}
    </p>
  )
}

/**
 * 「还在干活」的三颗小点（D12 R-C）：错峰起伏，⛔ 不转圈。工具步跑着时用它 ——
 * 2026-10-08 owner：看图那一步只有一行灰字，和跑完的步骤长得一样，不看停止键看不出
 * 它还在动。（等第一个字那一行 2026-10-14 起换成 `StudioOperatorThinkingRow` 的呼吸点。）
 */
export function StudioOperatorThinkingDots() {
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-0.75">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          style={{
            animationDelay: `${dot * STUDIO_OPERATOR_SHELL.thinkingDotStaggerMs}ms`,
          }}
          className="size-1.25 rounded-full bg-muted-foreground/70 animate-thinking-dot motion-reduce:animate-none"
        />
      ))}
    </span>
  )
}
