'use client'

/**
 * 证据抽屉 —— 「这次**真正**会送出什么」（legacy `node-detail/EvidenceDrawer.tsx`）。
 *
 * 这是契约核心诉求：编排区上面写着提示词和模型，但真正发出去的还包括各槽当前版本
 * 的那几张图。两者对不上时，用户唯一能自己查清的地方就是这里。
 *
 * ⚠ 值**从图里现算**，⛔ 不缓存、⛔ 不在别处再算一份：一份会漂的「预览」比没有
 * 预览更糟。
 */

import { useTranslations } from 'next-intl'

import { getNodeV4Ports } from '@/constants/node-slots'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import type { NodeV4 } from '@/types/node-workflow'

import { useNodeV4Canvas } from './NodeV4Context'
import { NodeV4Disclosure } from './NodeV4Disclosure'

/** 证据行：`80px / 1fr` 两列，右列的数字走等宽 tabular。 */
function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      data-evidence-row
      className="flex gap-2.5 py-0.5 text-3xs tracking-node-body"
    >
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words tabular-nums">{value}</span>
    </div>
  )
}

export function NodeV4EvidenceDrawer({ node }: { node: NodeV4 }) {
  const t = useTranslations('StudioNode.v4')
  const canvas = useNodeV4Canvas()

  const data = node.data
  const ports = getNodeV4Ports(data.kind, data.subtype)
  const rows: { label: string; value: string }[] = []

  if (data.kind !== NODE_MEDIA_KIND_IDS.text) {
    rows.push({
      label: t('evidence.model'),
      value: data.model?.modelId ?? t('evidence.none'),
    })
    rows.push({
      label: t('evidence.prompt'),
      value: data.prompt?.trim() || t('evidence.none'),
    })
    // `blocked` 只长在 image 上（video 的失败走 `status`），⛔ 不给别的形状硬读。
    if (data.kind === NODE_MEDIA_KIND_IDS.image && data.blockedReason) {
      rows.push({ label: t('evidence.blocked'), value: data.blockedReason })
    }
  }
  for (const spec of ports?.inputs ?? []) {
    const binding = data.slots?.[spec.slot]
    const current = binding?.versions.find((item) => item.id === binding.cur)
    const source = current
      ? canvas.nodes.find((item) => item.id === current.sourceNodeId)
      : undefined
    rows.push({
      label: t(`slots.${spec.slot}`),
      value: source
        ? t('evidence.slotValue', {
            name: source.data.name,
            count: binding?.versions.length ?? 0,
          })
        : t('evidence.none'),
    })
  }

  return (
    <div data-evidence-drawer>
      <NodeV4Disclosure
        testId="evidence"
        // 证据默认收起：它是「要查的时候查」，不是每次展开都得读一遍的东西。
        // 计数已经在标题的 `{count}` 里，⛔ 不再在右侧重复一遍。
        title={t('evidence.title', { count: rows.length })}
      >
        <div className="space-y-0.5">
          {rows.map((row) => (
            <EvidenceRow key={row.label} label={row.label} value={row.value} />
          ))}
        </div>
      </NodeV4Disclosure>
    </div>
  )
}
