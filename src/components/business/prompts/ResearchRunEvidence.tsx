'use client'

import {
  Children,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ElementType,
  type JSX,
  type ReactNode,
} from 'react'
import { ExternalLink, ShieldAlert } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { Components } from 'react-markdown'

import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import { Spinner } from '@/components/ui/spinner'
import { INITIAL_COMPONENTS } from '@/components/ui/markdown'
import {
  EVIDENCE_SOURCE_TIERS,
  RESEARCH_SOURCE_IDS,
  type EvidenceSourceTier,
  type ResearchSourceId,
} from '@/constants/research'
import { getResearchRunAPI } from '@/lib/api-client/research'
import { cn } from '@/lib/utils'
import type { EvidenceItem, ResearchRunDetail } from '@/types/research'

/**
 * 一次检索的证据侧消费端（AI 导演内核 · 切片 1 · UI 批）。
 *
 * 这个模块管三件事：
 *  1. **按 runId 懒加载**：一屏历史消息可能挂着十几个 runId，挂载即拉 = 十几个
 *     并发请求，而绝大多数用户不会点开。所以只有「展开回执卡」或「点开某条
 *     引用」才发请求，且**同一个 runId 全局只发一次**。
 *  2. **`[n]` 变可点**：正文经 react-markdown，文本节点里的 `[1]` 默认只是字。
 *     这里在渲染层把它切成可点元素，点开显示那条证据的 title / url /
 *     retrievedAt / sourceTier / 注入降级徽标。
 *  3. **源层级视觉**：official / community / social 三层要看得出差别 ——
 *     「官方文档说的」≠「推上有人说」（§3.1）。
 */

// ─── 模块级缓存（懒加载 + 全局去重）────────────────────────────────

interface ResearchRunEntry {
  detail: ResearchRunDetail | null
  error: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
}

/**
 * ⚠ 必须是**模块常量**而不是每次现造一个 `{}` —— `useSyncExternalStore` 的
 * getSnapshot 每次返回新对象会导致无限重渲染。
 */
const IDLE_ENTRY: ResearchRunEntry = {
  detail: null,
  error: null,
  status: 'idle',
}

const entries = new Map<string, ResearchRunEntry>()
const listeners = new Set<() => void>()

function subscribeToRuns(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function setEntry(runId: string, entry: ResearchRunEntry): void {
  entries.set(runId, entry)
  for (const listener of listeners) listener()
}

function readEntry(runId: string | undefined): ResearchRunEntry {
  if (!runId) return IDLE_ENTRY
  return entries.get(runId) ?? IDLE_ENTRY
}

/**
 * 发起加载。**同一个 runId 只会真的发一次请求** —— `status !== 'idle'` 一律
 * 短路（loading 是在飞、ready 是已有、error 是已经失败过一次）。
 *
 * ⚠ 失败也记进 entry 而不是留在 idle：否则回执卡每次重渲染都会重试一次，
 * 一个挂掉的接口会被打成循环请求。要重试就重开面板（v1 不做重试按钮）。
 */
function loadResearchRun(runId: string): void {
  if (readEntry(runId).status !== 'idle') return
  setEntry(runId, { detail: null, error: null, status: 'loading' })
  void getResearchRunAPI(runId).then((result) => {
    setEntry(
      runId,
      result.success
        ? { detail: result.data, error: null, status: 'ready' }
        : { detail: null, error: result.error, status: 'error' },
    )
  })
}

/**
 * 读一次检索的证据。
 *
 * @param enabled 只有为 true 才会发请求 —— 这是「懒」的那一半。回执卡收起时
 *   传 false，展开时传 true；引用弹层同理。
 */
export function useResearchRun(
  runId: string | undefined,
  enabled: boolean,
): ResearchRunEntry {
  const getSnapshot = useCallback(() => readEntry(runId), [runId])
  const entry = useSyncExternalStore(
    subscribeToRuns,
    getSnapshot,
    () => IDLE_ENTRY,
  )

  useEffect(() => {
    if (!enabled || !runId) return
    loadResearchRun(runId)
  }, [enabled, runId])

  return entry
}

// ─── 源 / 层级的显示名 ──────────────────────────────────────────────

/**
 * sourceId → i18n key。**穷举 Record，没有兜底** —— 加了新源却忘了给它一个
 * 名字，应该是 tsc 报错，而不是 UI 上出现一个 `wiki_gg` 这样的内部标识符。
 */
export const RESEARCH_SOURCE_LABEL_KEYS: Record<ResearchSourceId, string> = {
  [RESEARCH_SOURCE_IDS.moegirl]: 'research.sourceMoegirl',
  [RESEARCH_SOURCE_IDS.wikipediaZh]: 'research.sourceWikipediaZh',
  [RESEARCH_SOURCE_IDS.fandom]: 'research.sourceFandom',
  [RESEARCH_SOURCE_IDS.danbooru]: 'research.sourceDanbooru',
  [RESEARCH_SOURCE_IDS.bilibili]: 'research.sourceBilibili',
  [RESEARCH_SOURCE_IDS.webSearch]: 'research.sourceWebSearch',
  [RESEARCH_SOURCE_IDS.urlReader]: 'research.sourceUrlReader',
  [RESEARCH_SOURCE_IDS.visionInput]: 'research.sourceVisionInput',
}

const TIER_LABEL_KEYS: Record<EvidenceSourceTier, string> = {
  [EVIDENCE_SOURCE_TIERS.official]: 'research.tierOfficial',
  [EVIDENCE_SOURCE_TIERS.community]: 'research.tierCommunity',
  [EVIDENCE_SOURCE_TIERS.social]: 'research.tierSocial',
}

/**
 * 三层的视觉区分。
 *
 * ⚠ **不靠「越来越淡的灰」表达降级** —— 那条路在切片 S6 上算过，最浅一档只有
 * 2.81:1。这里三档的文字色一律 `text-foreground` / `text-primary`（都够），
 * 差别落在填色与描边形态上（实心 / 常规 / 虚线）。
 */
const TIER_CHIP_CLASS: Record<EvidenceSourceTier, string> = {
  [EVIDENCE_SOURCE_TIERS.official]:
    'border-primary/40 bg-primary/10 text-primary',
  [EVIDENCE_SOURCE_TIERS.community]:
    'border-border bg-secondary text-foreground',
  [EVIDENCE_SOURCE_TIERS.social]:
    'border-dashed border-border bg-background text-foreground',
}

// ─── 单条证据 ──────────────────────────────────────────────────────

function EvidenceBody({ item }: { item: EvidenceItem }) {
  const t = useTranslations('PromptAssistant')

  if (item.kind === 'tags') {
    return (
      <div className="space-y-1">
        <p className="text-2xs text-muted-foreground">{item.provenance}</p>
        <div className="flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border bg-secondary px-1.5 py-0.5 text-2xs text-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (item.kind === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote evidence thumbnail, not app-owned media
      <img
        src={item.imageUrl}
        alt={t('research.imageEvidence')}
        className="max-h-40 w-full rounded-lg border border-border object-contain"
      />
    )
  }

  return (
    <p className="whitespace-pre-wrap text-xs leading-5 text-foreground">
      {item.excerpt}
    </p>
  )
}

export function EvidenceDetail({
  item,
  index,
}: {
  item: EvidenceItem
  index: number
}) {
  const t = useTranslations('PromptAssistant')
  const locale = useLocale()

  const retrievedAt = useMemo(() => {
    const parsed = new Date(item.retrievedAt)
    return Number.isNaN(parsed.getTime())
      ? item.retrievedAt
      : parsed.toLocaleString(locale)
  }, [item.retrievedAt, locale])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-sm bg-secondary px-1 text-2xs font-medium text-foreground">
          [{index}]
        </span>
        <span
          className={cn(
            'rounded-full border px-1.5 py-0.5 text-2xs font-medium',
            TIER_CHIP_CLASS[item.sourceTier],
          )}
        >
          {t(TIER_LABEL_KEYS[item.sourceTier])}
        </span>
        <span className="text-2xs text-muted-foreground">
          {t(RESEARCH_SOURCE_LABEL_KEYS[item.sourceId])}
        </span>
        {/* 注入降级徽标：这条证据里混进了指令样文本，摘录已被换成警示占位。
            ⚠ 标记而不是丢弃 —— 一页混进一句「ignore previous instructions」
            不代表这页没有事实价值，但也不能装作它干净。 */}
        {item.untrusted ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-2xs font-medium text-status-risk"
            title={t('research.untrustedHint')}
          >
            <ShieldAlert className="size-3" />
            {t('research.untrusted')}
          </span>
        ) : null}
      </div>

      <p className="text-xs font-medium leading-5 text-foreground">
        {item.title}
      </p>

      <EvidenceBody item={item} />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-1.5">
        <span className="text-2xs text-muted-foreground">
          {t('research.retrievedAt')} {retrievedAt}
        </span>
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-2xs font-medium text-foreground underline underline-offset-2"
          >
            <ExternalLink className="size-3" />
            {t('research.openSource')}
          </a>
        ) : null}
      </div>
    </div>
  )
}

// ─── `[n]` 引用 ────────────────────────────────────────────────────

function ResearchCitation({
  runId,
  index,
}: {
  runId: string | undefined
  index: number
}) {
  const t = useTranslations('PromptAssistant')
  // 只有真的点开才加载 —— 一条回答里可能有八九个 `[n]`，挂载即拉等于把
  // 「懒加载」写成「并发加载」。同一个 runId 的多个引用共享同一次请求。
  const [open, setOpen] = useState(false)
  const { detail, status } = useResearchRun(runId, open)
  const item = detail?.evidence[index - 1]

  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('research.citationAria', { index })}
          className="mx-0.5 inline-flex min-w-4 items-center justify-center rounded-sm bg-secondary px-1 align-baseline text-2xs font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        >
          {index}
        </button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        label={t('research.citationAria', { index })}
        align="start"
        className="w-80 p-3"
      >
        {!runId ? (
          <p className="text-xs text-muted-foreground">
            {t('research.citationUnavailable')}
          </p>
        ) : status === 'loading' || status === 'idle' ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner size="sm" />
            {t('research.loading')}
          </p>
        ) : status === 'error' ? (
          <p className="text-xs text-status-risk">{t('research.loadFailed')}</p>
        ) : item ? (
          <EvidenceDetail item={item} index={index} />
        ) : (
          // 引用了证据包里不存在的编号。幻引用闸在服务端就该打回，能看到这条
          // 说明那道闸漏了 —— 所以如实说「这条引用查无实据」，不静默隐藏。
          <p className="text-xs text-status-risk">
            {t('research.citationMissing')}
          </p>
        )}
      </ResponsivePopoverContent>
    </ResponsivePopover>
  )
}

// ─── markdown 组件覆盖 ─────────────────────────────────────────────

/**
 * ⚠ 只匹配**纯数字**的方括号。`[链接](url)` 在 mdast 阶段已经变成 link 节点，
 * 文本里不会再有方括号；`[^1]` 脚注同理不匹配。
 */
const CITATION_PATTERN = /\[(\d{1,2})\]/g

function splitCitations(text: string, runId: string | undefined): ReactNode[] {
  const parts: ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  CITATION_PATTERN.lastIndex = 0

  while ((match = CITATION_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index))
    parts.push(
      <ResearchCitation
        key={`citation-${match.index}`}
        runId={runId}
        index={Number(match[1])}
      />,
    )
    cursor = match.index + match[0].length
  }

  if (parts.length === 0) return [text]
  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts
}

function decorate(children: ReactNode, runId: string | undefined): ReactNode {
  return Children.map(children, (child) =>
    typeof child === 'string' ? splitCitations(child, runId) : child,
  )
}

/**
 * 在默认覆盖表之上叠加 `[n]` 渲染。
 *
 * ⚠ **必须叠加而不是替换** `INITIAL_COMPONENTS`：`components` prop 一旦传入就
 * 整体接管，只传自己那几个会让 code/pre 退回裸 HTML（长提示词靠 `CodeBlock`
 * 的 overflow-x-auto 兜着，退回去就是整条浮卡被撑宽）。
 *
 * ⚠ 覆盖的是**容器**而不是文本节点：react-markdown 把文本作为字符串放进容器的
 * children，所以只有在容器这一层才切得开。代码块故意不在名单里 —— 代码里的
 * `[1]` 是代码。
 */
export function buildResearchCitationComponents(
  runId: string | undefined,
): Partial<Components> {
  const wrap = (Tag: keyof JSX.IntrinsicElements) => {
    const CitationAware = ({
      children,
      ...props
    }: {
      children?: ReactNode
    }) => {
      const Element = Tag as ElementType
      return <Element {...props}>{decorate(children, runId)}</Element>
    }
    // react/display-name：工厂产出的匿名组件在 devtools 里全叫 Anonymous，
    // 排查「[n] 为什么没变成可点」时分不清是哪个标签的覆盖出了问题。
    CitationAware.displayName = `CitationAware(${Tag})`
    return CitationAware
  }

  return {
    ...INITIAL_COMPONENTS,
    p: wrap('p'),
    li: wrap('li'),
    strong: wrap('strong'),
    em: wrap('em'),
    blockquote: wrap('blockquote'),
    td: wrap('td'),
    th: wrap('th'),
    h1: wrap('h1'),
    h2: wrap('h2'),
    h3: wrap('h3'),
    h4: wrap('h4'),
    h5: wrap('h5'),
    h6: wrap('h6'),
  }
}
