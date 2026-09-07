'use client'

/**
 * 关系带 —— **下游反查**（legacy `node-detail/RelationsStrip.tsx` 的 v4 落点）。
 *
 * ⚠ 方向和槽卡相反：槽卡回答「我用了谁」（上游），这条带回答「谁在用我」（下游）。
 * 少了它，删一张参考图之前没人知道三个镜头正靠着它——这正是 v3 里被抓到的
 * 「删完才发现下游空了」。
 *
 * 点 chip = 飞相机去那个节点（`onFocusNode`），⛔ 不是打开它：展开是「我正在看
 * 哪一个」，一次误点把用户从当前卡上弹走比什么都烦。
 */

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { formatShotDisplayName } from '@/lib/node-display-name'
import type { NodeV4 } from '@/types/node-workflow'

import { useNodeV4Canvas } from './NodeV4Context'
import { NodeV4Disclosure } from './NodeV4Disclosure'

export function NodeV4RelationBand({ node }: { node: NodeV4 }) {
  const t = useTranslations('StudioNode.v4')
  const canvas = useNodeV4Canvas()

  const uses = useMemo(() => {
    const seen = new Set<string>()
    const rows: { id: string; label: string; slot: string }[] = []
    for (const edge of canvas.edges) {
      if (edge.source !== node.id) continue
      const key = `${edge.target}:${edge.slot}`
      if (seen.has(key)) continue
      seen.add(key)
      const target = canvas.nodes.find((item) => item.id === edge.target)
      if (!target) continue
      rows.push({
        id: target.id,
        slot: edge.slot,
        label:
          target.data.kind === NODE_MEDIA_KIND_IDS.video
            ? formatShotDisplayName(
                target.data.label ?? target.data.name,
                target.data.shotNo,
              )
            : target.data.name,
      })
    }
    return rows
  }, [canvas.edges, canvas.nodes, node.id])

  return (
    <div data-relation-band>
      {/* ⚠ 默认**展开**：A 方向把这条带放在滚动条尽头本来就是最大的代价，默认
          展开 + 计数是最小的补偿——它是 v3「删完才发现下游空了」的解药。 */}
      <NodeV4Disclosure
        testId="relations"
        title={t('relations.title')}
        count={uses.length}
        defaultOpen
      >
        {uses.length === 0 ? (
          <p data-relation-empty className="text-3xs text-muted-foreground">
            {t('relations.empty')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {uses.map((use) => (
              <button
                key={`${use.id}:${use.slot}`}
                type="button"
                data-relation-chip={use.id}
                onClick={() => canvas.onFocusNode(use.id)}
                className="nodrag rounded-full bg-surface-fill-hover px-2.5 py-1 text-3xs transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-fill-track"
              >
                {t('relations.chip', {
                  name: use.label,
                  slot: t(`slots.${use.slot}`),
                })}
              </button>
            ))}
          </div>
        )}
      </NodeV4Disclosure>
    </div>
  )
}
