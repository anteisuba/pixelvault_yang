'use client'

import { useTranslations } from 'next-intl'

import { STATUS_COLORS } from '@/constants/node-tokens'
import {
  NODE_STATUS_IDS,
  type NodeWorkflowStatus,
} from '@/constants/node-types'
import { cn } from '@/lib/utils'

interface NodeStatusBadgeProps {
  status: NodeWorkflowStatus
}

/**
 * 盖章状态系统（§4）+ 强度梯度（台账 §17.3，owner 2026-08-03 拍板）。
 *
 * 两个态**没有章**：
 *   · `idle` = 素卡，还没开始 —— 原本就是这样
 *   · `done` = 完成 —— 拍板①新增。完成的证据是卡上那张图，再盖一枚是说两遍
 *
 * ⚠ 曾经有个 `queued` 分支渲染 `<Loader2 className="animate-spin" />`，已删：
 * `queued` 全仓**没有任何 writer**，那段是死代码。三个不可达态（queued /
 * stale / disabled）现在统一走中性兜底（拍板③），枚举值仍留在
 * `NODE_STATUS_IDS` 里不动 —— 老项目 JSON 可能存着，删了 Zod 会整份解析失败。
 */
export function NodeStatusBadge({ status }: NodeStatusBadgeProps) {
  const t = useTranslations('StudioNode.statuses')
  const isRunning = status === NODE_STATUS_IDS.running

  if (status === NODE_STATUS_IDS.idle || status === NODE_STATUS_IDS.done) {
    return null
  }

  return (
    <span
      className={cn(
        'inline-flex h-7 -rotate-2 items-center gap-1.5 rounded-none border px-2.5 text-xs font-semibold uppercase tracking-nav-dense',
        STATUS_COLORS[status],
      )}
    >
      {/* running 是唯一带动效的态。⚠ 点的颜色走 `.canvas-status-dot` 由
          canvas.css 上石绿，不用 `bg-current` —— 章文是墨色，跟着 current 会让
          点也变成墨色，那样 running 与 ready 就又只剩文案的差别了。
          `animate-pulse` 在 2026-08-03 之前是**死的**（globals.css 的
          `--animate-pulse` 覆盖占用了 Tailwind 内建名，见 eb3c7d7d）。 */}
      {isRunning ? (
        <span className="canvas-status-dot size-1.5 rounded-full animate-pulse" />
      ) : null}
      {t(status)}
    </span>
  )
}
