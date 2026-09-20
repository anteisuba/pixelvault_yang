'use client'

/**
 * **一段回答底下的资料**（56b 切片 1 · 画板 D56bUI「快搜回答 · 流完」）。
 *
 * ── 它替掉了什么 ────────────────────────────────────────────────
 * 此前一轮检索的产出是一张 `StudioOperatorResearchCard`：结论一行 + 一列证据
 * （标题 / 出处 / 可信度 / 印证 / 置信度五栏小字）+ 「N 条证据」展开。那张卡答的是
 * 「它查到了什么」，而用户在读的是**助手的回答**——证据于是成了回答前面的一段
 * 过程。56b 把它翻过来：回答是正文，资料是正文底下的两样东西 ——
 *  ① **媒体条**：图片与视频封面，点开看大图 / 跳原站；
 *  ② **来源卡**：站点图标 + 标题 + 域名，横向可滚，正文里的 `[n]` 点下来高亮它。
 *
 * ── 三条边界 ────────────────────────────────────────────────────
 * ⛔ **不嵌播放器、不转存**（决策树「不做」那一支）：视频封面点下去开新窗口到
 *    原站。站内播放要解流、要带版权判断，而用户要的只是「让我看看那一段」。
 * ⛔ **不铺摘录**：可复核的底稿留在「调查过程」那一折里（面板那一侧），来源卡上
 *    只写谁说的。一条萌百的整段简介就能吃掉半屏，而它不是回答。
 * ⛔ **不画空壳**：一条资料都没有就整块不渲染（同「无数据不渲染」那条判据）。
 */

import { Globe, Pin, Play } from '@/components/icons'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import {
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import { cn } from '@/lib/utils'
import type { StudioOperatorStepEntry } from '@/types/studio-assistant-operator'
import { openOperatorLightbox } from './StudioOperatorLightbox'

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
  /** 图片原图 / 视频封面；缺席 = 这条没有画面，不进媒体条。 */
  mediaUrl?: string
  durationSeconds?: number
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
} {
  const sources: StudioOperatorAnswerSource[] = []
  const seen = new Set<number>()
  const conclusions: string[] = []
  const refs: string[] = []
  let corroborated = 0
  for (const { step } of steps) {
    // ⚠ 先判 `status` 再判 `tool`：载荷与结果只挂在跑完那一支上。
    if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) continue
    if (step.tool !== ASSISTANT_OPERATOR_TOOL_IDS.research) continue
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
        ...(item.mediaUrl ? { mediaUrl: item.mediaUrl } : {}),
        ...(item.durationSeconds
          ? { durationSeconds: item.durationSeconds }
          : {}),
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

/** `12:40` / `1:02:03` —— 封面右下角那枚角标。 */
export function formatSourceDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  const pad = (value: number): string => String(value).padStart(2, '0')
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${minutes}:${pad(rest)}`
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

  /**
   * ⚠ 媒体条只收**有画面**的那几条：没有封面的视频（Serper 的网页结果给不出）
   * 照旧在来源卡上出现，⛔ 不在媒体条里留一个灰格子假装有图。
   */
  const media = sources.filter((source) => Boolean(source.mediaUrl))

  if (sources.length === 0) return null

  return (
    <div
      data-testid="operator-answer-sources"
      className="flex min-w-0 flex-col gap-2"
    >
      {media.length > 0 ? (
        <div
          data-testid="operator-answer-media"
          aria-label={t('answer.media')}
          className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5"
        >
          {media.map((source) => (
            <button
              key={`media-${source.cite}`}
              type="button"
              data-testid="operator-answer-media-item"
              data-kind={source.kind}
              data-cite={source.cite}
              title={source.title}
              onClick={() => {
                /**
                 * ⭐ **两种点击，两个去处**：图片开站内灯箱（就在这一页看大图），
                 * 视频开新窗口跳原站。⛔ 不把视频也塞进灯箱 —— 灯箱里是一张静止的
                 * 封面，而用户点它是想看那一段。
                 */
                if (source.kind === 'video') {
                  if (source.url) {
                    window.open(source.url, '_blank', 'noopener,noreferrer')
                  }
                  return
                }
                if (source.mediaUrl) {
                  openOperatorLightbox(source.mediaUrl, source.title)
                }
              }}
              className="relative size-[62px] shrink-0 overflow-hidden rounded-lg border border-border bg-muted transition-opacity duration-(--duration-fast) ease-standard hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
            >
              <Image
                src={source.mediaUrl as string}
                alt={source.title}
                width={124}
                height={124}
                unoptimized
                className="size-full object-cover"
              />
              {source.kind === 'video' ? (
                <>
                  <span
                    aria-hidden
                    className="absolute inset-0 grid place-items-center"
                  >
                    <span className="grid size-6 place-items-center rounded-full bg-foreground/55">
                      <Play className="size-3 text-background" />
                    </span>
                  </span>
                  {/* 时长取不到就整枚不画（⛔ 不写「0:00」）。 */}
                  {source.durationSeconds ? (
                    <span
                      data-testid="operator-answer-media-duration"
                      className="absolute bottom-0.5 right-0.5 rounded bg-foreground/55 px-1 font-mono text-2xs tabular-nums text-background"
                    >
                      {formatSourceDuration(source.durationSeconds)}
                    </span>
                  ) : null}
                </>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <div
        data-testid="operator-answer-source-cards"
        aria-label={t('answer.sources')}
        className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5"
      >
        {sources.map((source) => {
          const active = activeCite === source.cite
          const body = (
            <>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Globe className="size-2.5 shrink-0" aria-hidden />
                <span className="truncate text-2xs tracking-nav">
                  {source.publisher}
                </span>
              </span>
              <span className="line-clamp-2 text-xs leading-snug text-foreground">
                {source.title}
              </span>
            </>
          )
          /* 高亮走**信号位**（§12.2）：近黑描边，⛔ 不引入新色相、不填色。 */
          const className = cn(
            'flex w-[124px] shrink-0 flex-col gap-0.5 rounded-lg border bg-card px-2 py-1.5 text-left transition-colors duration-(--duration-fast) ease-standard focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
            active ? 'border-foreground' : 'border-border hover:bg-muted/40',
          )
          return source.url ? (
            <a
              key={`source-${source.cite}`}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="operator-answer-source-card"
              data-cite={source.cite}
              data-active={active ? 'true' : 'false'}
              className={className}
            >
              {body}
            </a>
          ) : (
            /* ⚠ `url` 缺席就画成一格纯文字（danbooru 的共现标签没有单一页面可点）
               ——⛔ 不渲染成一颗点不开的链接。 */
            <span
              key={`source-${source.cite}`}
              data-testid="operator-answer-source-card"
              data-cite={source.cite}
              data-active={active ? 'true' : 'false'}
              className={className}
            >
              {body}
            </span>
          )
        })}
      </div>

      {onDeepResearch || onTogglePin || receiptLabel ? (
        <div className="flex min-w-0 items-center gap-1.5">
          {onDeepResearch ? (
            <button
              type="button"
              data-testid="operator-answer-deep-research"
              onClick={onDeepResearch}
              className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
            >
              {t('answer.deepResearch')}
            </button>
          ) : null}
          {/* 「钉住」钉的是**这一排来源卡**（56b 切片 1）——底下认的仍旧是证据
              编号（`pinnedEvidence`，§7.3），⛔ 不是收藏一张卡。 */}
          {onTogglePin ? (
            <button
              type="button"
              data-testid="operator-answer-pin"
              aria-pressed={pinned}
              onClick={onTogglePin}
              className={cn(
                'flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs transition-colors duration-(--duration-fast) ease-standard focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
                pinned
                  ? 'bg-foreground font-medium text-background'
                  : 'border border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              <Pin className="size-3" aria-hidden />
              {pinned ? t('research.unpin') : t('research.pin')}
            </button>
          ) : null}
          {receiptLabel ? (
            <span
              data-testid="operator-answer-receipt"
              className="ml-auto min-w-0 truncate text-2xs tracking-nav text-muted-foreground"
            >
              {receiptLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
