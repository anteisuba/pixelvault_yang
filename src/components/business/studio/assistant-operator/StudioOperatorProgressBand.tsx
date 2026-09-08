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
  Settings2,
} from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

import {
  ASSISTANT_COST_TICK_KINDS,
  type AssistantCostTickKind,
} from '@/constants/assistant-operator'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import {
  STUDIO_OPERATOR_KEEP_OPEN_ATTR,
  STUDIO_OPERATOR_SHELL,
} from '@/constants/studio-assistant-operator'
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
import type { StudioOperatorCostTick } from '@/types/studio-assistant-operator'
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
  /**
   * 这条会话到此为止的**成本计数**（切片 Y）—— 按档累计的次数。
   *
   * ⭐ 它长在带子右侧那一行小字里：一轮里看了三张图、检索两轮、来回八次 LLM，
   * 日志上只看得见八条 step，而真正贵的是那三张图。⛔ 它**不是闸**：这里不拦、
   * 不弹窗，只如实说它做了多少次。
   * ⚠ 一档都没有时整块不渲染（⛔ 不画三个 0：那是给一条还没花过钱的会话摆一份
   *   账单）。
   */
  costs: Readonly<Record<AssistantCostTickKind, number>>
  /** hover 展开的那一列明细 —— 空数组 = 只有合计，没有细项。 */
  costDetails: readonly StudioOperatorCostTick[]
  working: boolean
  /**
   * 计划卡钉住了，球在用户脚下（§4.1 最后一行）。
   *
   * ⚠ 与 `working` **分开一个 prop** 而不是并进它：两件事要用户做的动作完全不同
   * ——「思考中」是等它，「等你确认计划」是等你。合成一个的表现是计划卡钉在屏幕上
   * 而带上还写着「思考中」，于是没人知道要去点那张卡。
   */
  awaitingPlan: boolean
  stepsDone: number
  plannedSteps: number
  /** 现在这一步在做什么 —— `null` = 计划已下但还没有步在跑。 */
  currentStepTitle: string | null
  steps: readonly StudioOperatorBandStep[]
  history: UseStudioOperatorHistoryResult
  onNewThread(): void
  /**
   * 「助手设置」（§8.1 主入口）—— **带上那颗常驻齿轮**（owner 2026-09-07）。
   *
   * ⭐ 由来：它此前只活在 ⋯ 菜单的第三格里，等于「要先知道它在那儿才找得到」。
   * 而「这个助手是谁」是每个人第一次用面板就要改的东西。
   * ⚠ ⋯ 菜单里那一项**已经删掉**（工程原则 1）：⛔ 不留两个入口 —— 两个入口的
   * 下场是有人改了菜单那一支而齿轮那一支还开着旧弹层。
   * ⚠ 弹层住在外壳（`StudioOperatorDock`）：收放法则（拍板 7）随时会把面板卸载，
   * 弹层跟着面板走的下场是它自己突然消失。
   */
  onOpenAssistantSettings(): void
  onCollapse(): void
  /**
   * **有未完成计划**（第三期 · 断点续跑）—— 刷新之后唯一还看得见的入口。
   *
   * ⭐ 它必须在带子上而不是只在流里：刷新之后线程是从库里载回来的**只读历史**
   * （`state.history`），checkpoint 薄卡那一档在历史类型里根本不存在 —— 于是
   * 「从第 N 步继续」在最需要它的那一刻（刚刷新完）一个入口都没有。
   * ⚠ 只在**空闲**时露脸：正在跑的时候带子上写的是这一轮的进度，再挤一颗
   *   「继续」按钮会让人以为要开第二条流。
   * ⚠ 缺席 = 没有没跑完的计划，⛔ 不画停用态。
   */
  resume?: {
    /** 1 起数。 */
    stepNumber: number
    onResume(): void
  }
}

export function StudioOperatorProgressBand({
  domain,
  costs,
  costDetails,
  working,
  awaitingPlan,
  stepsDone,
  plannedSteps,
  currentStepTitle,
  steps,
  history,
  onNewThread,
  onOpenAssistantSettings,
  onCollapse,
  resume,
}: StudioOperatorProgressBandProps) {
  const t = useTranslations('StudioOperator')
  const format = useFormatter()
  const [open, setOpen] = useState(false)

  const hasProgress = working && plannedSteps > 0
  const ratio = hasProgress ? Math.min(stepsDone / plannedSteps, 1) : 0
  /** 进度环那一档露不露脸 —— 干活中和「等你定」共用它，空闲才退回域 chip。 */
  const busy = working || awaitingPlan
  /**
   * **还没有分母**（`plan` 帧还没到）—— 环转起来，⛔ 不画 `0/0`：
   * 一个没有分母的计数比一句「思考中」更像卡住了（§4.1 第三行）。
   */
  const indeterminate = working && !hasProgress
  const sessionTitle =
    history.sessions.find((item) => item.id === history.currentSessionId)
      ?.title ?? t('newThread')
  /**
   * 「看图 3 · 检索 2 · 往返 7」——**只写非零的那几档**（⛔ 不写 `看图 0`：
   * 一个恒等于 0 的计数只是噪音）。
   */
  const costTotal = ASSISTANT_COST_TICK_KINDS.reduce(
    (total, kind) => total + (costs[kind] ?? 0),
    0,
  )
  const costSummary = ASSISTANT_COST_TICK_KINDS.filter(
    (kind) => (costs[kind] ?? 0) > 0,
  )
    .map((kind) => `${t(`cost.${kind}`)} ${costs[kind]}`)
    .join(' · ')
  /**
   * hover 那一列 —— 逐条写「档位 ×次数 · 那一句标签」。
   * ⚠ 服务端给的 `label` 可能是一条 i18n 键（见 `ASSISTANT_COST_TICK_LABEL_KEYS`），
   *   也可能是一段原文（检索词）。⛔ 这里不去猜：键取不到就原样显示那一串 ——
   *   显示一句读得懂的原文，永远好过显示一个空行。
   */
  const costDetailText = costDetails
    .map(
      (tick) =>
        `${t(`cost.${tick.kind}`)} ×${tick.units}${tick.label ? ` · ${tick.label}` : ''}`,
    )
    .join('\n')
  const bandTitle = awaitingPlan
    ? t('band.awaitingPlan')
    : working
      ? (currentStepTitle ??
        (hasProgress ? t('band.working') : t('band.thinking')))
      : (sessionTitle ?? t('newThread'))

  return (
    <div
      data-testid="operator-progress-band"
      data-working={working ? 'true' : 'false'}
      data-awaiting-plan={awaitingPlan ? 'true' : 'false'}
      data-open={open ? 'true' : 'false'}
      className="shrink-0 border-b border-border bg-card"
    >
      <div
        style={{ height: `${STUDIO_OPERATOR_SHELL.progressBandHeightPx}px` }}
        className="flex items-center gap-2 px-3"
      >
        {busy ? (
          <>
            <svg
              data-testid="operator-band-ring"
              data-indeterminate={indeterminate ? 'true' : 'false'}
              viewBox="0 0 18 18"
              // ⚠ 转的是「不知道还剩多少」那一档；有了分母就停下来按比例画。
              className={cn(
                'size-4.5 shrink-0',
                indeterminate && 'animate-spin motion-reduce:animate-none',
              )}
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
                style={
                  indeterminate
                    ? // 固定一段弧，靠外层 `animate-spin` 转 —— 这就是环形 spinner。
                      {
                        strokeDasharray: `${RING_CIRCUMFERENCE * 0.28} ${RING_CIRCUMFERENCE}`,
                      }
                    : {
                        strokeDasharray: RING_CIRCUMFERENCE,
                        strokeDashoffset: RING_CIRCUMFERENCE * (1 - ratio),
                      }
                }
                className="stroke-primary transition-[stroke-dashoffset] duration-(--duration-slow) ease-standard motion-reduce:transition-none"
              />
            </svg>
            {hasProgress ? (
              <span
                data-testid="operator-band-fraction"
                className="shrink-0 font-mono text-2sm tracking-nav tabular-nums text-foreground"
              >
                {`${stepsDone}/${plannedSteps}`}
              </span>
            ) : null}
          </>
        ) : (
          <span
            data-testid="operator-domain-chip"
            className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-2sm font-medium text-muted-foreground"
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
          className="min-w-0 flex-1 truncate text-left text-md font-medium text-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground disabled:cursor-default"
        >
          {bandTitle}
        </button>

        {/* ── 有未完成计划（第三期 · 断点续跑）───────────────────────
            ⚠ 长在标题右边、成本计数左边：它是一个**动作**，而右边那两样是注脚
              与常驻入口 —— 动作排在注脚前面。
            ⚠ `busy` 时整块不渲染（见 prop 头注）。 */}
        {resume && !busy ? (
          <button
            type="button"
            data-testid="operator-band-resume"
            data-step={resume.stepNumber}
            onClick={resume.onResume}
            className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-2sm font-medium text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('resume.band', { step: resume.stepNumber })}
          </button>
        ) : null}

        {/* ── 成本计数（切片 Y）────────────────────────────────────
            ⚠ 长在标题右边、齿轮左边：它是「这一轮花了多少」的注脚，⛔ 不挤进
              标题那一格（标题要能占满剩下的宽度）。
            ⚠ `title` 就是 hover 明细：⛔ 不为它新做一颗 tooltip 组件 —— 这一行
              是注脚不是主角，而原生 title 在键盘聚焦时也念得出来。 */}
        {costTotal > 0 ? (
          <span
            data-testid="operator-cost-counter"
            title={costDetailText}
            className="shrink-0 font-mono text-2xs tracking-nav tabular-nums text-muted-foreground"
          >
            {costSummary}
          </span>
        ) : null}

        {/* 助手设置（§8.1 主入口）—— ⚠ 带 `data-operator-keep`：点它弹层要开，
            而收放法则（拍板 7）会因为「点了面板外面」把面板收掉，判据就是这个属性。
            ⚠ 命中区 32px（`ui-defaults.md §5`：fine 32/36）：它比旁边两颗 28 大
            一档是有意的 —— 常驻入口先保命中，⛔ 不为了对齐把它缩回 `size-7`。 */}
        <button
          type="button"
          data-testid="operator-assistant-settings"
          aria-label={t('assistantSettings')}
          {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}
          onClick={onOpenAssistantSettings}
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground active:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
        >
          <Settings2 className="size-4" aria-hidden />
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
            <DropdownMenuLabel className="text-2sm font-normal text-muted-foreground">
              {t('history.heading')}
            </DropdownMenuLabel>
            {history.isHydrating ? (
              <DropdownMenuItem disabled className="text-2sm">
                {t('history.loading')}
              </DropdownMenuItem>
            ) : null}
            {!history.isHydrating && history.sessions.length === 0 ? (
              <DropdownMenuItem disabled className="text-2sm">
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
                    <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-2sm text-muted-foreground">
                      {t(`domainName.${sessionDomain}`)}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">
                    {session.title ?? t('history.untitled')}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-2sm tabular-nums text-muted-foreground">
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
              <DropdownMenuItem disabled className="text-2sm text-destructive">
                {history.error}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            {/* ⛔ 这里**没有**「助手设置」：它已经是进度带上那颗常驻齿轮
                （owner 2026-09-07）。两个入口 = 两处要同步的接线。 */}
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
                className="flex items-center gap-2 py-1 text-md text-muted-foreground data-[state=running]:font-medium data-[state=running]:text-foreground data-[state=done]:text-foreground"
              >
                <span className="shrink-0 font-mono text-xs tracking-nav tabular-nums text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1 truncate">{step.title}</span>
                <span
                  className={cn(
                    'shrink-0 font-mono text-xs tracking-nav',
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
