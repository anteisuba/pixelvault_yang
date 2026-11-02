'use client'

/**
 * **一段回答底下的资料**（56b 切片 1 · 画板 D56bUI「快搜回答 · 流完」）。
 *
 * ── 它替掉了什么 ────────────────────────────────────────────────
 * 此前一轮检索的产出是一张 `StudioOperatorResearchCard`：结论一行 + 一列证据
 * （标题 / 出处 / 可信度 / 印证 / 置信度五栏小字）+ 「N 条证据」展开。那张卡答的是
 * 「它查到了什么」，而用户在读的是**助手的回答**——证据于是成了回答前面的一段
 * 过程。56b 把它翻过来：回答是正文，资料是正文底下**一行胶囊**（P4 第 14 项，
 * owner 2026-10-16）：站点图标 + 站名，标题在悬停里，正文里的 `[n]` 点下来高亮它；
 * 行尾一颗 ⋯ 收「深入调查 / 钉住」。⛔ 原来那条媒体小条已并掉 —— 图归找到的图那一块，
 * 视频胶囊照旧在面板里播。
 *
 * ── 三条边界 ────────────────────────────────────────────────────
 * ⭐ **视频能嵌就在面板里播，嵌不了才开新窗口**（owner，搜索期第二片起；早先这里是
 *    「⛔ 不嵌播放器」）：标成视频的来源胶囊，与找到的视频那一排走
 *    **同一个判据**（`resolveWebVideo`）、**同一个播放器**（`StudioOperatorWebVideoPlayer`，
 *    官方嵌入，这一块只放一个，摆在胶囊上面）。认不出稿件号的、别的站照旧新窗口。
 *    ⛔ 不转存、不解流 —— 播放全在对方的播放器里。普通来源（文字 / 图 / 标签）仍是链接。
 * ⛔ **不铺摘录**：可复核的底稿留在「调查过程」那一折里（面板那一侧），胶囊上
 *    只写谁说的。一条萌百的整段简介就能吃掉半屏，而它不是回答。
 * ⛔ **不画空壳**：一条资料都没有就整块不渲染（同「无数据不渲染」那条判据）。
 */

import { useRef, useState } from 'react'
import { Globe, MoreHorizontal, Pin, Play, Search } from '@/components/icons'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import {
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import { cn } from '@/lib/utils'
import type { StudioOperatorStepEntry } from '@/types/studio-assistant-operator'
import { flyCloneToTarget } from '@/lib/fly-to-composer'
import { siteFaviconUrl } from '@/lib/third-party-image-url'
import { resolveWebVideo } from '@/lib/web-video'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  StudioOperatorWebVideoPlayer,
  type StudioOperatorPlayableVideo,
} from './StudioOperatorWebVideoPlayer'

/**
 * 摆在回答底下的**一条资料**。
 *
 * ⚠ 它是 `AssistantOperatorEvidence` 的**投影**：只留画得出来的那几栏。整条
 * 透传的代价是这颗组件要认识 `credibility` / `scope` / `corroboration` 这些
 * 它一个都不画的字段，而那正是上一版那张卡臃肿的来路。
 */
export interface StudioOperatorAnswerSource {
  /** 正文里 `[n]` 的 n —— 高亮按它认卡。 */
  cite: number
  title: string
  url?: string
  /** 域名（服务端已经回落过了，⛔ 客户端不再猜）。 */
  publisher: string
  kind: string
}

/**
 * 这条资料**能不能在面板里播**：标成视频、有原页、`resolveWebVideo` 认得出稿件号。
 * 与找到的视频那一排同一个判据 —— 认不出的（`b23.tv` 短链、频道页、别的站）返回 `null`，
 * 调用方照旧新窗口开。
 */
function playableVideoOf(
  source: StudioOperatorAnswerSource,
): StudioOperatorPlayableVideo | null {
  if (source.kind !== 'video' || !source.url) return null
  const target = resolveWebVideo(source.url)
  if (!target.embedUrl) return null
  return {
    url: source.url,
    title: source.title,
    platform: target.platform,
    domain: source.publisher,
  }
}

/** 钉住时交给面板顶部常驻条的那几样（§7.3 按证据编号认卡）。 */
export interface StudioOperatorResearchSummary {
  conclusion: string
  sourceCount: number
  corroborated: number
  /**
   * 这一轮证据的编号 —— 钉住落库时认的就是它（`pinnedEvidence`）。
   * ⚠ 可能是**空数组**（这一轮没拿到号段）：调用方据此走「先留本地态」那一支。
   */
  evidenceRefs: string[]
}

/**
 * 几条调查步 → 回答底下那两样 + 钉住要用的摘要。
 *
 * ⚠ 放在这个文件而不是面板里：投影的形状与这颗组件的 props 是同一件事，分开
 * 两处的表现是加一栏时只改了一处。
 * ⚠ **按 `cite` 去重**：一轮里查两次时服务端已经连号了，但重发/重放仍可能让
 * 同一条到两次 —— 来源卡上出现两张同号的卡，而正文里的角标只点得亮其中一张。
 */
export function toOperatorAnswerSources(
  steps: readonly StudioOperatorStepEntry[],
): {
  sources: StudioOperatorAnswerSource[]
  summary: StudioOperatorResearchSummary
  /** 这一问冲着 X、没搜到 X，而创作者配了 Grok key —— 给「用 Grok 搜这一次」。 */
  offerGrokForX: boolean
} {
  const sources: StudioOperatorAnswerSource[] = []
  const seen = new Set<number>()
  const conclusions: string[] = []
  const refs: string[] = []
  let corroborated = 0
  let offerGrokForX = false
  for (const { step } of steps) {
    // ⚠ 先判 `status` 再判 `tool`：载荷与结果只挂在跑完那一支上。
    if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) continue
    if (step.tool !== ASSISTANT_OPERATOR_TOOL_IDS.research) continue
    if (step.result?.xNotSearched?.grokKey) offerGrokForX = true
    if (step.result?.conclusion) conclusions.push(step.result.conclusion)
    for (const item of step.result?.evidence ?? []) {
      if (seen.has(item.cite)) continue
      seen.add(item.cite)
      if (item.corroboration > 1) corroborated += 1
      if (item.evidenceRef && !refs.includes(item.evidenceRef)) {
        refs.push(item.evidenceRef)
      }
      sources.push({
        cite: item.cite,
        title: item.title,
        ...(item.url ? { url: item.url } : {}),
        publisher: item.publisher,
        kind: item.kind,
      })
    }
  }
  sources.sort((a, b) => a.cite - b.cite)
  return {
    sources,
    summary: {
      /** ⛔ 客户端不自己拼一句结论 —— 服务端压出来的那一句（§9.1 ④）。 */
      conclusion: conclusions[0] ?? '',
      sourceCount: sources.length,
      corroborated,
      evidenceRefs: refs,
    },
    offerGrokForX,
  }
}

interface StudioOperatorAnswerSourcesProps {
  sources: readonly StudioOperatorAnswerSource[]
  /**
   * 当前被正文角标点亮的那一条（`null` = 没有）。
   * ⚠ 状态住在**消息那一格**（`StudioOperatorMessageBody`）：角标在正文里、卡在
   * 正文下面，两边要读同一个值。
   */
  activeCite: number | null
  /** 给了才画「钉住」—— 没有去处的界面上⛔ 不摆一颗按不了的按钮。 */
  pinned?: boolean
  onTogglePin?(): void
  /** 「深入调查」（切片 2 接上去）——缺席就不画那颗。 */
  onDeepResearch?(): void
  /** 那一行灰字回执（「搜了 6 条 · 读了 3 页」）。缺席就不画。 */
  receiptLabel?: string
}

export function StudioOperatorAnswerSources({
  sources,
  activeCite,
  pinned = false,
  onTogglePin,
  onDeepResearch,
  receiptLabel,
}: StudioOperatorAnswerSourcesProps) {
  const t = useTranslations('StudioOperator')
  const pillsRef = useRef<HTMLDivElement>(null)
  /**
   * 正在播的那一条（按 `cite` 认）。再点同一条 = 收起。
   * ⚠ 播放器跟着这一块走：回答底下这一块重挂（换会话）就收起。
   */
  const [playingCite, setPlayingCite] = useState<number | null>(null)
  const togglePlaying = (cite: number) =>
    setPlayingCite((current) => (current === cite ? null : cite))

  /**
   * 钉住时这一排胶囊的影子飞到面板顶上的钉住条（owner 2026-10-07 动效第 3 批）。
   * ⚠ 钉住条第一次出现要等这一拍渲染完：排两帧再找落点；找不到就不飞（纯装饰）。
   */
  const togglePin = () => {
    onTogglePin?.()
    const from = pillsRef.current
    if (pinned || !from || typeof window === 'undefined') return
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const to = document.querySelector<HTMLElement>(
          '[data-testid="operator-pinned-evidence"]',
        )
        if (to) flyCloneToTarget(from, to)
      }),
    )
  }

  const playingSource = sources.find((source) => source.cite === playingCite)
  const playing = playingSource ? playableVideoOf(playingSource) : null
  const hasMore = Boolean(onDeepResearch || onTogglePin)

  if (sources.length === 0) return null

  return (
    <div
      data-testid="operator-answer-sources"
      className="flex min-w-0 flex-col gap-2"
    >
      {playing ? (
        <StudioOperatorWebVideoPlayer
          video={playing}
          onClose={() => setPlayingCite(null)}
        />
      ) : null}

      <div className="flex min-w-0 items-center gap-1.5">
        <div
          ref={pillsRef}
          data-testid="operator-answer-source-cards"
          aria-label={t('answer.sources')}
          className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto"
        >
          {sources.map((source) => {
            const active = activeCite === source.cite
            const video = playableVideoOf(source)
            const isPlaying = video !== null && source.cite === playingCite
            const body = (
              <>
                <SourceSiteIcon
                  key={siteFaviconUrl(source.url) ?? 'none'}
                  url={source.url}
                />
                <span className="max-w-32 truncate">{source.publisher}</span>
                {video ? (
                  <Play
                    className="size-3 shrink-0"
                    aria-hidden
                    data-testid="operator-answer-source-play"
                  />
                ) : null}
              </>
            )
            /* 高亮走**信号位**（§12.2）：近黑描边，⛔ 不引入新色相、不填色。
               标题写在 `title` 上：悬停就看得到，⛔ 不占一行。 */
            const shared = {
              'data-testid': 'operator-answer-source-card',
              'data-cite': source.cite,
              'data-kind': source.kind,
              'data-active': active ? 'true' : 'false',
              title: source.title,
              className: cn(
                'flex h-7 shrink-0 items-center gap-1 rounded-full border bg-card px-2.5 text-xs text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
                active || isPlaying
                  ? 'border-foreground text-foreground'
                  : 'border-border hover:bg-muted/40',
              ),
            }
            /* 标成视频、能嵌的那颗：点了在上面那个播放器里播，⛔ 不跳走。 */
            if (video)
              return (
                <button
                  key={`source-${source.cite}`}
                  type="button"
                  {...shared}
                  aria-pressed={isPlaying}
                  aria-label={t('web.videoPlay', { title: source.title })}
                  onClick={() => togglePlaying(source.cite)}
                >
                  {body}
                </button>
              )
            return source.url ? (
              <a
                key={`source-${source.cite}`}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                {...shared}
              >
                {body}
              </a>
            ) : (
              /* ⚠ `url` 缺席就画成一颗纯文字（danbooru 的共现标签没有单一页面可点）
                 ——⛔ 不渲染成一颗点不开的链接。 */
              <span key={`source-${source.cite}`} {...shared}>
                {body}
              </span>
            )
          })}
        </div>

        {/* 「深入调查 / 钉住」收进行尾一颗 ⋯（P4 第 14 项）。「钉住」钉的仍旧是证据
            编号（`pinnedEvidence`，§7.3），⛔ 不是收藏一颗胶囊。 */}
        {hasMore ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid="operator-answer-more"
                aria-label={t('answer.more')}
                title={t('answer.more')}
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-surface-fill motion-reduce:transition-none coarse:size-11',
                  pinned && 'text-foreground',
                )}
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="end"
              className="w-44 rounded-xl border-assistant-line-strong p-1.5 assistant-glass-overlay shadow-assistant-overlay"
            >
              {onDeepResearch ? (
                <DropdownMenuItem
                  data-testid="operator-answer-deep-research"
                  onSelect={onDeepResearch}
                  className="text-2sm"
                >
                  <Search aria-hidden />
                  {t('answer.deepResearch')}
                </DropdownMenuItem>
              ) : null}
              {onTogglePin ? (
                <DropdownMenuItem
                  data-testid="operator-answer-pin"
                  data-pinned={pinned ? 'true' : 'false'}
                  onSelect={togglePin}
                  className="text-2sm"
                >
                  <Pin aria-hidden />
                  {pinned ? t('research.unpin') : t('research.pin')}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {receiptLabel ? (
        <span
          data-testid="operator-answer-receipt"
          className="min-w-0 truncate text-2xs tracking-nav text-muted-foreground"
        >
          {receiptLabel}
        </span>
      ) : null}
    </div>
  )
}

/**
 * 来源卡上的站点图标（附录 I §4.3）：那个站自己的 `/favicon.ico`，⛔ 不带 Referer；
 * 没有地址或取不到就回到地球图标。⛔ 不走第三方 favicon 服务（见 `siteFaviconUrl`）。
 * 调用方按图标地址给 `key`：换了一条来源就从头试，失败态不串到下一张卡。
 */
function SourceSiteIcon({ url }: { url?: string }) {
  const favicon = siteFaviconUrl(url)
  const [failed, setFailed] = useState(false)
  if (!favicon || failed) {
    return (
      <Globe
        className="size-3 shrink-0"
        aria-hidden
        data-testid="operator-answer-source-globe"
      />
    )
  }
  return (
    <Image
      src={favicon}
      alt=""
      aria-hidden
      width={12}
      height={12}
      unoptimized
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      data-testid="operator-answer-source-favicon"
      className="size-3 shrink-0 rounded-sm"
    />
  )
}
