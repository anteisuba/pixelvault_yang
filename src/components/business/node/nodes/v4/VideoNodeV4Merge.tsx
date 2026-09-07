'use client'

/**
 * `video.merge` 展开态的**九槽阵列 + 逐段裁剪**（第三期 · 画布 C3c-②Q ·
 * 盘点 §1 `VideoMergeNode`(161) + §2 `VideoMergeDetailBody`(394)）。
 *
 * legacy 里这一块分住两处：卡的右侧侧车只有「n/9 + 开始合并」，格子阵列与逐段
 * 裁剪要点 ⤢ 进详情面板才看得到。v4 取消覆盖面板，两块合成这一块。
 *
 * ── 纪律 ──────────────────────────────────────────────────────────────
 * ① **格子与裁剪的对齐不在这里算** —— `buildV4MergePlan` 按 url 认领（换序之后
 *    裁剪跟着素材走），组件只渲染它的结论。
 * ② **写入走 `onApplyOp(set_merge_clips)`**，载荷由 `planV4MergeTrimUpdate` 装配，
 *    ⛔ 不在这里手拼 clips 数组。
 * ③ **非法区间在 UI 上就说**（`start >= end` 合出来是零帧），并把合并钮按住 ——
 *    ⛔ 不把一次必然失败推到后端。
 */

import { useCallback, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  buildV4MergePlan,
  planV4MergeTrimUpdate,
  summarizeV4MergePlan,
} from '@/lib/node-v4-merge'
import { validateV4Slots } from '@/lib/node-slot-payload'
import { cn } from '@/lib/utils'
import type { NodeV4 } from '@/types/node-workflow'

import { useNodeV4Canvas } from './NodeV4Context'

export interface VideoNodeV4MergeProps {
  readonly node: NodeV4
}

export function VideoNodeV4Merge({ node }: VideoNodeV4MergeProps) {
  const t = useTranslations('StudioNode.v4.merge')
  const canvas = useNodeV4Canvas()
  const [trimOpen, setTrimOpen] = useState(false)

  const plan = useMemo(
    () =>
      buildV4MergePlan({
        nodeId: node.id,
        nodes: canvas.nodes,
        edges: canvas.edges,
      }),
    [node.id, canvas.nodes, canvas.edges],
  )
  const summary = summarizeV4MergePlan(plan)
  // 「够不够段」照抄 `validateV4Slots`（`clip` 槽 min=2），⛔ 不在 UI 层再判一次。
  const issues = useMemo(
    () => validateV4Slots(node, canvas.edges, canvas.nodes),
    [node, canvas.edges, canvas.nodes],
  )

  const applyTrim = useCallback(
    (index: number, patch: { startSec?: number; endSec?: number }) => {
      void canvas.onApplyOp({
        op: NODE_ASSISTANT_OP_V4_IDS.setMergeClips,
        target: node.id,
        clips: planV4MergeTrimUpdate(plan, index, patch),
      })
    },
    [canvas, node.id, plan],
  )

  return (
    <section
      data-merge-panel
      className="space-y-2 rounded-xl border bg-card p-3"
    >
      {/* ── 九槽阵列 ─────────────────────────────────────────────────── */}
      <div data-merge-grid className="grid grid-cols-3 gap-1">
        {plan.slots.map((slot) => (
          <div
            key={slot.index}
            data-merge-slot={slot.index}
            data-merge-filled={slot.url ? 'true' : 'false'}
            data-merge-required={slot.required ? 'true' : 'false'}
            className={cn(
              'flex h-10 items-center justify-center rounded-md border text-2xs',
              slot.url ? 'bg-muted/40' : 'border-dashed text-muted-foreground',
              slot.invalidRange && 'border-destructive text-destructive',
            )}
          >
            {slot.url
              ? t('slotFilled', { index: slot.index + 1 })
              : slot.required
                ? t('slotRequired', { index: slot.index + 1 })
                : t('slotOptional', { index: slot.index + 1 })}
          </div>
        ))}
      </div>

      {/* ── 摘要即标签：点开才是格子（legacy `SpecSummaryButton` 的同一条） ── */}
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-merge-summary
        aria-expanded={trimOpen}
        onClick={() => setTrimOpen((open) => !open)}
      >
        {t('summary', summary)}
      </Button>

      {trimOpen ? (
        <ul data-merge-trim className="space-y-1">
          {plan.slots
            .filter((slot) => slot.url)
            .map((slot) => (
              <li
                key={slot.index}
                data-merge-trim-row={slot.index}
                className="flex items-center gap-2"
              >
                <span className="w-8 shrink-0 text-2xs text-muted-foreground">
                  {t('clipIndex', { index: slot.index + 1 })}
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={slot.startSec ?? ''}
                  aria-label={t('startSec', { index: slot.index + 1 })}
                  placeholder={t('startPlaceholder')}
                  className="w-16 rounded-md border bg-background px-2 py-1 text-2xs"
                  onChange={(event) =>
                    applyTrim(slot.index, {
                      ...(event.target.value
                        ? { startSec: Number(event.target.value) }
                        : {}),
                      ...(slot.endSec === undefined
                        ? {}
                        : { endSec: slot.endSec }),
                    })
                  }
                />
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={slot.endSec ?? ''}
                  aria-label={t('endSec', { index: slot.index + 1 })}
                  placeholder={t('endPlaceholder')}
                  className="w-16 rounded-md border bg-background px-2 py-1 text-2xs"
                  onChange={(event) =>
                    applyTrim(slot.index, {
                      ...(slot.startSec === undefined
                        ? {}
                        : { startSec: slot.startSec }),
                      ...(event.target.value
                        ? { endSec: Number(event.target.value) }
                        : {}),
                    })
                  }
                />
                {slot.invalidRange ? (
                  <span
                    data-merge-invalid
                    className="text-2xs text-destructive"
                  >
                    {t('invalidRange')}
                  </span>
                ) : null}
              </li>
            ))}
        </ul>
      ) : null}

      {/* ── 阻塞原因：一次说全 ───────────────────────────────────────── */}
      {issues.length > 0 ? (
        <p data-merge-blocked className="text-2xs text-destructive">
          {t('needMoreClips', { min: 2 })}
        </p>
      ) : null}
      {plan.hasInvalidRange ? (
        <p data-merge-blocked-range className="text-2xs text-destructive">
          {t('invalidRangeBlocks')}
        </p>
      ) : null}
    </section>
  )
}
