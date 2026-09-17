'use client'

/**
 * **排队条**（`pages/assistant-shell.md` §3.1 ㉒–㉔ / §4.2 / §11.4）。
 *
 * 干活时回车不再掐掉在飞的那一轮（见 `use-assistant-operator.ts` 头注）：那句话
 * 排进队列，这条虚线警示条浮在输入框上方说清楚三件事 ——
 * 「已排队」·「下一个停顿点处理」·「撤回」。
 *
 * ⚠ **档位是 warning 不是 destructive**（§11.2 状态四 token 分工：warning 管
 * 「花钱与排队」）：排队不是错误也不是破坏性动作，用红色说这件事会让人以为
 * 自己刚才干了什么坏事。
 *
 * ⚠ **虚线边取 `/70` 而不是规格里写的 40%**（contrast-check 实算，本片订正）：
 * 条底 `--status-warning-surface` 对面板底只有 **1.10:1** —— 也就是说这条边
 * **就是**这个组件唯一的边界，得按 WCAG 1.4.11 的 3:1 走。40% 合成后只有
 * **1.81:1**（对条内底）/ **1.85:1**（对面板底），`/70` 是刚好过线的那一档：
 * **3.02:1** / **3.20:1**。正文 `#a04f00` 对条底 **5.28:1**，hover 底
 * （warning/10）上仍有 **4.62:1**。⛔ 别改回 40%，那是规格里一个没算过的数
 * （切片 A 已经按同样的理由订正过两处）。
 * ⚠ 原文要 `truncate`：排队的可能是一整段话，撑高输入区会把提示词框顶出视口。
 * ⚠ **只做入场、不做退场**（与 `StudioOperatorDock` / 灯箱同一条）：隐藏标签页里
 * rAF 冻结 → `AnimatePresence` 的退场永远不完成 → 一条 `opacity:0` 的条子留在
 * DOM 里吃掉输入框上沿的点击。撤回时它直接消失 —— 而线程里那行系统行就是交代。
 * ⚠ 这颗组件**不认识队列从哪来**：它只画 items 与一颗撤回。接住的时机、系统行、
 * 重发全在驱动 hook 里 —— 组件里再判一次「该不该接」就是两份会分叉的判据。
 */

import { motion, useReducedMotion } from 'motion/react'
import { X } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { motionTransition } from '@/constants/motion'
import type { StudioOperatorQueuedMessage } from '@/types/studio-assistant-operator'

interface StudioOperatorQueueBarProps {
  items: readonly StudioOperatorQueuedMessage[]
  /** 撤回一条 —— 通报（系统行）由 hook 负责，⛔ 组件不自己插。 */
  onCancel(id: string): void
}

export function StudioOperatorQueueBar({
  items,
  onCancel,
}: StudioOperatorQueueBarProps) {
  const t = useTranslations('StudioOperator')
  const reduceMotion = useReducedMotion()

  if (items.length === 0) return null

  return (
    <div
      data-testid="operator-queue-bar"
      data-count={items.length}
      className="flex shrink-0 flex-col gap-1 px-3 pb-1.5"
    >
      {items.map((item) => (
        <motion.div
          key={item.id}
          data-testid="operator-queue-item"
          // ⚠ 只动 opacity / transform（§11.5），⛔ 不做高度动画：这一条就长在
          //    输入框上方，高度动画会把输入框推着走，正在打字的人会打错位置。
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={motionTransition('base', reduceMotion)}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-status-warning/70 bg-status-warning-surface px-2 py-1.5 text-2sm text-status-warning"
        >
          <span className="shrink-0 font-mono text-xs tracking-nav uppercase">
            {t('queue.badge')}
          </span>
          <span className="min-w-0 flex-1 truncate" title={item.text}>
            {item.text}
          </span>
          <span className="shrink-0 font-mono text-xs tracking-nav">
            {t('queue.hint')}
          </span>
          <button
            type="button"
            data-testid="operator-queue-cancel"
            aria-label={t('queue.cancel')}
            title={t('queue.cancel')}
            onClick={() => onCancel(item.id)}
            className="flex shrink-0 items-center gap-0.5 rounded-md px-1 py-0.5 transition-colors duration-(--duration-fast) ease-standard hover:bg-status-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-2.5" aria-hidden />
            {t('queue.cancel')}
          </button>
        </motion.div>
      ))}
    </div>
  )
}
