'use client'

/**
 * **只重跑下游**的只读名单卡（第三期，owner 2026-09-07 定）。
 *
 * ⭐ 它与 `CanvasOpProposalCard` **不是同一张卡**，也不该并进去：提案卡上的每一
 * 行都是一条**会发生的**动作（落图 / 删节点 / 花钱），而这张卡上一条都不会 ——
 * 它只回答「你改了这一个，哪些东西因此过期了」。混在一起的下场是用户以为点
 * 「应用」就会开跑，而这张卡上根本没有那颗按钮。
 *
 * ⚠ **没有确认按钮**（`ui-defaults.md` 状态配方：不适用的动作不渲染）。要真的
 * 重跑，助手接下来发的是一串 `generate` op —— 那条走提案卡的花钱硬确认档，
 * ⛔ 这里不开第二条路。
 * ⚠ 名字点得动（`onFocusNode`）：一份读不动的 id 名单等于没给。
 */

import { useTranslations } from 'next-intl'
import { ListOrdered } from '@/components/icons'

import { NODE_MEDIA_KINDS } from '@/constants/node-types'
import type { RerunDownstreamPlan } from '@/lib/node-rerun-downstream'

interface CanvasRerunDownstreamCardProps {
  readonly plan: RerunDownstreamPlan
  onFocusNode(nodeId: string): void
}

export function CanvasRerunDownstreamCard({
  plan,
  onFocusNode,
}: CanvasRerunDownstreamCardProps) {
  const t = useTranslations('StudioNode.rerunDownstream')
  const tKinds = useTranslations('StudioNode.v4.kinds')

  /**
   * 「图 2 · 视频 1」——⚠ **只写非零的那几族**（⛔ 不写「音频 0」：一个恒等于 0 的
   * 计数只是噪音，与进度带那条成本注脚同一条论据）。
   * ⚠ 顺序走 `NODE_MEDIA_KINDS` 那张表，⛔ 不按 Object.keys：后者的顺序随插入
   *   变化，同一份名单两次渲染可能给出两种排法。
   */
  const paidSummary = NODE_MEDIA_KINDS.filter(
    (kind) => (plan.paidByKind[kind] ?? 0) > 0,
  )
    .map((kind) => `${tKinds(kind)} ${plan.paidByKind[kind]}`)
    .join(' · ')

  return (
    <div
      data-testid="canvas-rerun-downstream"
      data-count={plan.entries.length}
      className="mt-2 rounded-2xl border border-node-panel-inner bg-node-canvas/50 p-2.5"
    >
      <p className="flex items-center gap-1.5 text-2xs font-semibold text-node-foreground">
        <ListOrdered className="size-3 shrink-0" aria-hidden />
        {t('title', { origin: plan.originName, count: plan.entries.length })}
      </p>

      <ul className="mt-1.5 space-y-1">
        {plan.entries.map((entry, index) => (
          <li key={entry.id}>
            <button
              type="button"
              data-testid="canvas-rerun-downstream-item"
              data-paid={entry.paid ? 'true' : 'false'}
              onClick={() => onFocusNode(entry.id)}
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-2xs text-node-muted transition-colors hover:bg-node-panel-soft hover:text-node-foreground"
            >
              {/* 序号 = 重跑顺序（近的先跑），⛔ 不是「第几镜」。 */}
              <span className="shrink-0 font-mono tabular-nums text-node-subtle">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              <span className="shrink-0 text-node-subtle">
                {entry.paid ? tKinds(entry.kind) : t('free')}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-1.5 px-1.5 text-2xs text-node-subtle">
        {paidSummary ? t('estimate', { summary: paidSummary }) : t('noCost')}
      </p>
    </div>
  )
}
