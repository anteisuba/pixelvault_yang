'use client'

/**
 * **调查卡**（2026-09-06 面板轮，第 6 件）——一轮检索的结论、证据与候选收在一张卡上。
 *
 * ── 它替掉了什么 ─────────────────────────────────────────────────
 * 此前一轮检索是**一串日志条**：`research` 一条、`read_url` 三条、`search_web_images`
 * 一条，各自带着自己的证据列表与候选网格散在流里。用户要回答的问题是「它到底
 * 查到了什么」，而那个答案被摊成了五行过程。
 *
 * ── 卡上三层，顺序是硬的 ─────────────────────────────────────────
 *  ① **结论**：这一轮去查的是什么、拿回来几条 —— 一行，第一眼就读得到；
 *  ② **证据**：默认**每条一行**（标题 · 出处 · 可信度 chip），⛔ 不铺正文摘录；
 *     点「N 条证据」才展开看那句话。🔬 owner 2026-09-07 打回：19 条证据连着整段
 *     简介全文铺开，一张卡吃掉整屏 —— 结论被过程埋了。默认还只铺前
 *     `STUDIO_OPERATOR_RESEARCH_EVIDENCE_PREVIEW` 条，其余进「还有 M 条」；
 *     `image` / `tags` 那两档（图片占位、分类标签堆）**默认不进列表** ——
 *     ⛔ 不是删掉，展开之后照样在（判据在常量里，见那两枚常量的头注）；
 *  ③ **候选**：找回来的图（复用 `StudioOperatorWebCandidateGrid`，含「挂上 N 张」）。
 * ⛔ 过程（翻了哪几页、读了哪一段）**默认折起来**：它是可复核的底稿，不是结论。
 *
 * ⚠ 候选网格是**复用**而不是重画（Engineering Principle 5/6）：「已选 n/m」、
 * 失败重试、名额上限那一整套已经在那颗组件里，重画一份等于把那些边界再错一遍。
 * ⚠ 一张卡 = **一轮**（`groupOperatorResearchRuns` 的分组约定）：跨轮合并会把两次
 * 不同的委托说成一件事。
 */

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import {
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import {
  STUDIO_OPERATOR_RESEARCH_EVIDENCE_PREVIEW,
  STUDIO_OPERATOR_RESEARCH_LOW_SIGNAL_KINDS,
} from '@/constants/studio-assistant-operator'
import { cn } from '@/lib/utils'
import type { StudioOperatorStepEntry } from '@/types/studio-assistant-operator'
import type { StudioOperatorWebImportState } from '@/hooks/use-studio-operator-web-import'
import type { AssistantOperatorWebImage } from '@/types/assistant-operator'

import { StudioOperatorWebCandidateGrid } from './StudioOperatorWebCandidateGrid'

/** 展开键与列表的 `aria-controls` 对表 —— 两颗按钮指的是同一份列表。 */
const EVIDENCE_LIST_ID = 'operator-research-evidence-list'

interface StudioOperatorResearchCardProps {
  /** 这一轮里属于调查的那几步（结论 / 证据 / 候选都从它们身上取）。 */
  steps: readonly StudioOperatorStepEntry[]
  /** 候选网格要的三样 —— 原样透传给复用的那颗组件。 */
  webImportStates: Readonly<Record<string, StudioOperatorWebImportState>>
  webImportLimit: number
  onToggleWebImage(entryId: string, image: AssistantOperatorWebImage): void
  /** 折起来那一段「过程」——面板把原来的日志条塞进来。 */
  children?: ReactNode
}

export function StudioOperatorResearchCard({
  steps,
  webImportStates,
  webImportLimit,
  onToggleWebImage,
  children,
}: StudioOperatorResearchCardProps) {
  const t = useTranslations('StudioOperator')
  /**
   * 证据是**收着的**（2026-09-07，owner「图一这个过程直接跳过不显示吧」）。
   * 展开 = 铺开摘录 + 把默认不进列表的那几条也放出来（可复核是这张卡的另一半）。
   */
  const [expanded, setExpanded] = useState(false)

  /** 结论那一行的两样：去查什么（`goal`）、拿回来几条。 */
  const goals: string[] = []
  const evidence: {
    key: string
    title: string
    url?: string
    publisher: string
    snippet: string
    kind: string
    confidence: string
  }[] = []
  const imageSteps: {
    entryId: string
    images: readonly AssistantOperatorWebImage[]
  }[] = []

  for (const entry of steps) {
    const { step } = entry
    // ⚠ 先判 `status` 再判 `tool`：载荷与结果只挂在**跑完**那一支上（协议里
    //   步是按状态分的联合体），⛔ 先判 tool narrow 不出 `payload` / `result`。
    if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) continue
    if (step.tool === ASSISTANT_OPERATOR_TOOL_IDS.research) {
      if (step.payload.goal) goals.push(step.payload.goal)
      for (const [index, item] of (step.result?.evidence ?? []).entries()) {
        evidence.push({
          key: `${entry.id}:${item.url ?? item.title}:${index}`,
          title: item.title,
          ...(item.url ? { url: item.url } : {}),
          publisher: item.publisher,
          snippet: item.snippet,
          kind: item.kind,
          confidence: item.confidence,
        })
      }
      continue
    }
    if (
      step.tool === ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages &&
      step.result?.images?.length
    ) {
      imageSteps.push({ entryId: entry.id, images: step.result.images })
    }
  }

  /**
   * ⚠ `useMemo` 的依赖是 `steps`：上面那两个数组每次 render 现算，直接进
   * `useMemo` 会每次都重算 —— 这里要的只是「同一轮的证据分档不用每帧再分一遍」。
   */
  const { preview, hidden } = useMemo(() => {
    // ⛔ 低信号的不是被删掉，是**排到后面**：展开之后按「先结论后底稿」读下去。
    const signal = evidence.filter(
      (item) => !STUDIO_OPERATOR_RESEARCH_LOW_SIGNAL_KINDS.includes(item.kind),
    )
    const lowSignal = evidence.filter((item) =>
      STUDIO_OPERATOR_RESEARCH_LOW_SIGNAL_KINDS.includes(item.kind),
    )
    const head = signal.slice(0, STUDIO_OPERATOR_RESEARCH_EVIDENCE_PREVIEW)
    return {
      preview: head,
      hidden: [...signal.slice(head.length), ...lowSignal],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- evidence 每次 render 现算（同一轮的 steps 决定它），依赖钉在 steps 上
  }, [steps])

  const visible = expanded ? [...preview, ...hidden] : preview

  return (
    <div
      data-testid="operator-research-card"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span
          data-testid="operator-research-goal"
          className="min-w-0 flex-1 truncate text-2sm text-foreground"
        >
          {goals.length > 0
            ? t('research.goal', { goal: goals.join(' · ') })
            : t('research.goalUnknown')}
        </span>
        {/* 「N 条证据」就是那颗展开键（⛔ 不另画一颗：数字本身就是入口，
            而卡上多一颗按钮就多一件要读的东西）。 */}
        <button
          type="button"
          data-testid="operator-research-evidence-toggle"
          aria-expanded={expanded}
          aria-controls={EVIDENCE_LIST_ID}
          disabled={evidence.length === 0}
          onClick={() => setExpanded((current) => !current)}
          className="shrink-0 rounded-sm font-mono text-xs tracking-nav tabular-nums text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:hover:text-muted-foreground"
        >
          {t('research.count', { count: evidence.length })}
        </button>
      </div>

      {visible.length > 0 ? (
        <ul
          id={EVIDENCE_LIST_ID}
          data-testid="operator-research-evidence"
          data-expanded={expanded ? 'true' : 'false'}
          className={cn(
            'flex flex-col p-3',
            // 收着时每条一行 —— 行距按「一份清单」给，⛔ 不按「一段一段的正文」给。
            expanded ? 'gap-2' : 'gap-1',
          )}
        >
          {visible.map((item) => (
            <li
              key={item.key}
              data-testid="operator-research-evidence-item"
              data-kind={item.kind}
              data-confidence={item.confidence}
              className="min-w-0"
            >
              {/* ⚠ `url` 缺席就画成纯文字（danbooru 的共现标签没有单一页面可点）
                  ——⛔ 不渲染成一颗点不开的链接。 */}
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="operator-research-evidence-link"
                  className="block truncate text-2sm text-foreground underline-offset-2 transition-colors duration-(--duration-fast) ease-standard hover:text-primary hover:underline"
                >
                  {item.title}
                </a>
              ) : (
                <span className="block truncate text-2sm text-foreground">
                  {item.title}
                </span>
              )}
              <span className="flex min-w-0 items-center gap-1">
                <span
                  data-testid="operator-research-evidence-publisher"
                  className="truncate font-mono text-xs tracking-nav text-muted-foreground"
                >
                  {item.publisher}
                </span>
                {/* 档位（正文 / 标签 / 图片）只在展开后说：收着时那一行要答的是
                    「谁说的、信得过几分」，⛔ 不是「这条是什么形态」。 */}
                {expanded ? (
                  <span className="shrink-0 rounded-sm border border-border/70 px-1 text-xs text-muted-foreground">
                    {t(`evidence.kind.${item.kind}`)}
                  </span>
                ) : null}
                {/* ⚠ `high` 走 applied 绿、`low` 走 risk 橙，中间档留
                    `muted-foreground`：三档各给一个颜色会让整片证据变成灯泡墙。 */}
                <span
                  data-testid="operator-research-evidence-confidence"
                  className={cn(
                    'shrink-0 text-xs',
                    item.confidence === 'high'
                      ? 'text-status-applied'
                      : item.confidence === 'low'
                        ? 'text-status-risk'
                        : 'text-muted-foreground',
                  )}
                >
                  {t(`evidence.confidence.${item.confidence}`)}
                </span>
              </span>
              {/* ⛔ 摘录默认不铺：一条萌娘百科的整段简介就能吃掉半屏，而它不是
                  结论。展开之后才是可复核的那一半。 */}
              {expanded ? (
                <span
                  data-testid="operator-research-evidence-snippet"
                  className="mt-0.5 block text-md leading-relaxed text-muted-foreground"
                >
                  {item.snippet}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {/* 「还有 M 条」/「收起」—— 与头上那颗数字是**同一个**开关，只是长在列表
          尾巴上（读到底的人手边就有它，⛔ 不用滑回顶上去找）。 */}
      {hidden.length > 0 || expanded ? (
        <button
          type="button"
          data-testid="operator-research-evidence-more"
          aria-expanded={expanded}
          aria-controls={EVIDENCE_LIST_ID}
          onClick={() => setExpanded((current) => !current)}
          className="block w-full px-3 pb-2 text-left text-2sm text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {expanded
            ? t('research.evidenceLess')
            : t('research.evidenceMore', { count: hidden.length })}
        </button>
      ) : null}

      {imageSteps.map((item) => (
        <div key={item.entryId} className="px-3 pb-3">
          <StudioOperatorWebCandidateGrid
            entryId={item.entryId}
            images={item.images}
            webImport={webImportStates[item.entryId]}
            limit={webImportLimit}
            onToggle={onToggleWebImage}
          />
        </div>
      ))}

      {children ? (
        <details
          data-testid="operator-research-process"
          className="border-t border-border"
        >
          <summary className="cursor-pointer list-none px-3 py-2 text-2sm text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
            {t('research.process')}
          </summary>
          <div className="flex flex-col gap-1.5 border-l border-border px-3 pb-3 pl-2.5">
            {children}
          </div>
        </details>
      ) : null}
    </div>
  )
}
