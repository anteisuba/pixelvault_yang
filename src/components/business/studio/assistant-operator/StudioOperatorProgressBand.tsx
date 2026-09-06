'use client'

/**
 * 顶部**进度带**（§2.4 / 拍板 10 改口：头部改进度带，~40px 钉住）。
 *
 * ⭐ 两副面孔，同一条带：
 *  · 运行中 → `进度环 · 3/6 · 正在挂 LoRA`，点开展完整清单；
 *  · 空闲   → 退化回旧头部那一行 `域 chip · 会话名 · ⋯ · 收起`。
 * 「长任务里还剩几步」是耐心的唯一来源 —— 过程折叠（方向 C 的前提）之后，
 * 没有这条带就等于进度完全不可见。
 *
 * ⚠ 会话 / 历史 / 新对话**全收进 ⋯**（拍板 10 改口）：头部只剩一行的宽度，
 * 再摆一颗独立的「会话」按钮就把标题挤没了。
 * ⚠ 清单的数据是**从线程现算的**（`steps` prop），⛔ store 里不另存一份
 * 「进度清单」：两份会分叉，而分叉的表现是带上写着 4/6、点开只有 5 行。
 */

import { useState } from 'react'
import {
  Check,
  MessageSquarePlus,
  MoreHorizontal,
  PanelRightClose,
} from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { STUDIO_OPERATOR_SHELL } from '@/constants/studio-assistant-operator'
import type { AssistantOperatorDomain } from '@/constants/assistant-operator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { UseStudioOperatorHistoryResult } from '@/hooks/use-studio-operator-history'
import { cn } from '@/lib/utils'
import {
  ASSISTANT_SURFACE_IDS,
  type AssistantSurfaceId,
} from '@/types/assistant-conversation'

/**
 * 会话行上那枚域标签读哪条词条。
 *
 * ⚠ `Record<Surface, …>`：surface 表加一档而这里没跟上，编译期就红 ——
 * 漏掉的表现是菜单上一枚印着 `undefined` 的标签。
 * ⚠ 画布不是操作员的域，`domainName` 里也没有它的词条 —— 不画标签。
 */
const SESSION_DOMAIN_BY_SURFACE: Record<
  AssistantSurfaceId,
  AssistantOperatorDomain | null
> = {
  [ASSISTANT_SURFACE_IDS.imageStudio]: ASSISTANT_PROTOCOL_DOMAIN_IDS.image,
  [ASSISTANT_SURFACE_IDS.videoStudio]: ASSISTANT_PROTOCOL_DOMAIN_IDS.video,
  [ASSISTANT_SURFACE_IDS.lora]: ASSISTANT_PROTOCOL_DOMAIN_IDS.lora,
  [ASSISTANT_SURFACE_IDS.nodeCanvas]: null,
}

/** 清单里一行的三态 —— 与 §11.2 的状态色分工一一对应。 */
export const STUDIO_OPERATOR_BAND_STEP_STATES = {
  done: 'done',
  running: 'running',
  failed: 'failed',
} as const

export type StudioOperatorBandStepState =
  (typeof STUDIO_OPERATOR_BAND_STEP_STATES)[keyof typeof STUDIO_OPERATOR_BAND_STEP_STATES]

export interface StudioOperatorBandStep {
  id: string
  title: string
  state: StudioOperatorBandStepState
}

const RING_RADIUS = 7
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface StudioOperatorProgressBandProps {
  domain: AssistantOperatorDomain
  working: boolean
  stepsDone: number
  plannedSteps: number
  /** 现在这一步在做什么 —— `null` = 计划已下但还没有步在跑。 */
  currentStepTitle: string | null
  steps: readonly StudioOperatorBandStep[]
  history: UseStudioOperatorHistoryResult
  onNewThread(): void
  onCollapse(): void
}

export function StudioOperatorProgressBand({
  domain,
  working,
  stepsDone,
  plannedSteps,
  currentStepTitle,
  steps,
  history,
  onNewThread,
  onCollapse,
}: StudioOperatorProgressBandProps) {
  const t = useTranslations('StudioOperator')
  const format = useFormatter()
  const [open, setOpen] = useState(false)

  const hasProgress = working && plannedSteps > 0
  const ratio = hasProgress ? Math.min(stepsDone / plannedSteps, 1) : 0
  const sessionTitle =
    history.sessions.find((item) => item.id === history.currentSessionId)
      ?.title ?? t('newThread')

  return (
    <div
      data-testid="operator-progress-band"
      data-working={working ? 'true' : 'false'}
      data-open={open ? 'true' : 'false'}
      className="shrink-0 border-b border-border bg-card"
    >
      <div
        style={{ height: `${STUDIO_OPERATOR_SHELL.progressBandHeightPx}px` }}
        className="flex items-center gap-2 px-3"
      >
        {working ? (
          <>
            <svg
              data-testid="operator-band-ring"
              viewBox="0 0 18 18"
              className="size-4.5 shrink-0"
              aria-hidden
            >
              <circle
                cx="9"
                cy="9"
                r={RING_RADIUS}
                fill="none"
                strokeWidth="2.5"
                className="stroke-border"
              />
              <circle
                cx="9"
                cy="9"
                r={RING_RADIUS}
                fill="none"
                strokeWidth="2.5"
                strokeLinecap="round"
                transform="rotate(-90 9 9)"
                style={{
                  strokeDasharray: RING_CIRCUMFERENCE,
                  strokeDashoffset: RING_CIRCUMFERENCE * (1 - ratio),
                }}
                className="stroke-primary transition-[stroke-dashoffset] duration-(--duration-slow) ease-standard motion-reduce:transition-none"
              />
            </svg>
            {hasProgress ? (
              <span
                data-testid="operator-band-fraction"
                className="shrink-0 font-mono text-2xs tracking-nav tabular-nums text-foreground"
              >
                {`${stepsDone}/${plannedSteps}`}
              </span>
            ) : null}
          </>
        ) : (
          <span
            data-testid="operator-domain-chip"
            className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground"
          >
            {t(`domainName.${domain}`)}
          </span>
        )}

        {/* 标题即展开钮：运行中点开是清单，空闲时清单是空的，按钮自己停用。 */}
        <button
          type="button"
          data-testid="operator-band-toggle"
          aria-expanded={open}
          disabled={steps.length === 0}
          onClick={() => setOpen((value) => !value)}
          className="min-w-0 flex-1 truncate text-left text-xs font-medium text-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground disabled:cursor-default"
        >
          {working
            ? (currentStepTitle ?? t('band.working'))
            : (sessionTitle ?? t('newThread'))}
        </button>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="operator-session-menu"
              aria-label={t('more')}
              className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground"
            >
              <MoreHorizontal className="size-3.5" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="max-h-96 min-w-72 overflow-y-auto"
          >
            <DropdownMenuItem onSelect={() => onNewThread()}>
              <MessageSquarePlus className="size-4" aria-hidden />
              {t('newThread')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">
              {t('history.heading')}
            </DropdownMenuLabel>
            {history.isHydrating ? (
              <DropdownMenuItem disabled className="text-2xs">
                {t('history.loading')}
              </DropdownMenuItem>
            ) : null}
            {!history.isHydrating && history.sessions.length === 0 ? (
              <DropdownMenuItem disabled className="text-2xs">
                {t('history.empty')}
              </DropdownMenuItem>
            ) : null}
            {history.sessions.map((session) => {
              /* ⚠ 域标签读的是 `surface`（线程**起始**域）—— 一条线程后来切去
                 哪儿只在它自己的域标记里，列表这一层看不到，也不该猜。
                 ⚠ 先取出来再判：直接把索引表达式塞进模板串，`null` 会一起进
                 `t()` 的键类型里（编译期就红）。 */
              const sessionDomain = SESSION_DOMAIN_BY_SURFACE[session.surface]
              return (
                <DropdownMenuItem
                  key={session.id}
                  data-testid="operator-session-item"
                  data-session-id={session.id}
                  data-surface={session.surface}
                  data-current={
                    session.id === history.currentSessionId ? 'true' : 'false'
                  }
                  onSelect={() => history.selectSession(session)}
                >
                  {sessionDomain ? (
                    <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
                      {t(`domainName.${sessionDomain}`)}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">
                    {session.title ?? t('history.untitled')}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
                    {format.dateTime(new Date(session.updatedAt), {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {session.id === history.currentSessionId ? (
                    <Check className="size-3.5 shrink-0" aria-hidden />
                  ) : null}
                </DropdownMenuItem>
              )
            })}
            {history.error ? (
              <DropdownMenuItem disabled className="text-2xs text-destructive">
                {history.error}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            {/* 分享要有一条落了库的会话才有东西可分享 —— 现在诚实地停用。 */}
            <DropdownMenuItem disabled>{t('share')}</DropdownMenuItem>
            <DropdownMenuItem disabled>{t('feedback')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          data-testid="operator-collapse"
          aria-label={t('collapse')}
          onClick={onCollapse}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground"
        >
          <PanelRightClose className="size-3.5" aria-hidden />
        </button>
      </div>

      {/* 完整清单：`grid-template-rows` 0fr↔1fr 配方（`ui-defaults.md §4`）。 */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-(--duration-base) ease-standard motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <ul data-testid="operator-band-list" className="px-3 pb-2">
            {steps.map((step, index) => (
              <li
                key={step.id}
                data-state={step.state}
                className="flex items-center gap-2 py-1 text-xs text-muted-foreground data-[state=running]:font-medium data-[state=running]:text-foreground data-[state=done]:text-foreground"
              >
                <span className="shrink-0 font-mono text-3xs tracking-nav tabular-nums text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1 truncate">{step.title}</span>
                <span
                  className={cn(
                    'shrink-0 font-mono text-3xs tracking-nav',
                    step.state === STUDIO_OPERATOR_BAND_STEP_STATES.done &&
                      'text-status-applied',
                    step.state === STUDIO_OPERATOR_BAND_STEP_STATES.running &&
                      'text-status-warning',
                    step.state === STUDIO_OPERATOR_BAND_STEP_STATES.failed &&
                      'text-status-risk',
                  )}
                >
                  {t(`band.state.${step.state}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
