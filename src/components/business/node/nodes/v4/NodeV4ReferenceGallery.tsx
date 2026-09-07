'use client'

/**
 * 参考图集（legacy `CharacterImageReferenceControls` / `ImageFamilyBody` 素材架的
 * v4 落点）。
 *
 * ⚠ **语义搬家，不是字段改名**（盘点 §7 风险 2）：v3 是「一个节点挂 N 张图」
 * （`referenceAssets` 数组），v4 是「**一图一节点、靠边落进 `reference` 槽**」。
 * 所以这里读的是槽的 `versions`，每一版背后是一个真的上游节点：
 *
 * · 「增」= 把画布上一个已有的图片节点 `connect` 进这个槽（⛔ 不是往数组里 push
 *   一个 URL —— 那样它就没有自己的名字、审核态和下游关系）；
 * · 「删」= `disconnect` 那条边，**节点本身留在画布上**；
 * · 「拆出为独立节点」= 断边 + 把相机飞过去 —— 在 v4 里它本来就已经是独立节点，
 *   所谓「拆出」只剩下「不再挂在我身上」这一半。
 *
 * ⛔ 图集不得静默变空：这里一条 `versions` 都没有时显式说「空」，不是渲染 0 个格子。
 */

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  NODE_SLOT_IDS,
  getNodeV4Ports,
  type NodeSlotId,
} from '@/constants/node-slots'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import type { NodeV4 } from '@/types/node-workflow'

import { useNodeV4Canvas } from './NodeV4Context'

export interface NodeV4ReferenceGalleryProps {
  readonly node: NodeV4
  /** 默认 `reference` 槽；角色卡的特写图集传 `closeup`。 */
  readonly slot?: NodeSlotId
}

export function NodeV4ReferenceGallery({
  node,
  slot = NODE_SLOT_IDS.reference,
}: NodeV4ReferenceGalleryProps) {
  const t = useTranslations('StudioNode.v4')
  const canvas = useNodeV4Canvas()
  const [picking, setPicking] = useState(false)

  const binding = node.data.slots?.[slot]
  const versions = binding?.versions ?? []
  const max =
    getNodeV4Ports(node.data.kind, node.data.subtype)?.inputs.find(
      (spec) => spec.slot === slot,
    )?.max ?? null

  /** 可加进来的候选 = 画布上还没连进这个槽的图片节点（⛔ 不含自己）。 */
  const candidates = useMemo(() => {
    const used = new Set(versions.map((version) => version.sourceNodeId))
    return canvas.nodes.filter(
      (item) =>
        item.id !== node.id &&
        item.data.kind === NODE_MEDIA_KIND_IDS.image &&
        !used.has(item.id),
    )
  }, [canvas.nodes, node.id, versions])

  const full = max !== null && versions.length >= max

  return (
    <div data-reference-gallery={slot} className="space-y-1">
      <div className="flex items-center gap-2">
        <p className="text-2xs text-muted-foreground">
          {t('gallery.title', {
            slot: t(`slots.${slot}`),
            count: versions.length,
          })}
        </p>
        <button
          type="button"
          data-gallery-add
          disabled={full || candidates.length === 0}
          onClick={() => setPicking((value) => !value)}
          className="nodrag ml-auto rounded border px-1.5 text-2xs disabled:opacity-40"
        >
          {t('gallery.add')}
        </button>
      </div>

      {versions.length === 0 ? (
        <p data-gallery-empty className="text-2xs text-muted-foreground">
          {t('gallery.empty')}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {versions.map((version) => {
            const source = canvas.nodes.find(
              (item) => item.id === version.sourceNodeId,
            )
            const url =
              source && source.data.kind !== NODE_MEDIA_KIND_IDS.text
                ? source.data.url
                : undefined
            return (
              <li
                key={version.id}
                data-gallery-item={version.sourceNodeId}
                className="w-16 space-y-0.5"
              >
                <button
                  type="button"
                  data-gallery-focus
                  aria-label={source?.data.name ?? version.sourceNodeId}
                  onClick={() => canvas.onFocusNode(version.sourceNodeId)}
                  className="nodrag block w-full"
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={source?.data.name ?? ''}
                      draggable={false}
                      className="dark h-12 w-full rounded-sm object-cover"
                    />
                  ) : (
                    <span className="flex h-12 items-center justify-center rounded-sm border border-dashed text-2xs text-muted-foreground">
                      {t('slotEmpty')}
                    </span>
                  )}
                </button>
                <p className="truncate text-2xs text-muted-foreground">
                  {source?.data.name ?? version.sourceNodeId}
                </p>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    data-gallery-remove
                    onClick={() =>
                      canvas.onDisconnectSlot(node.id, slot, version.id)
                    }
                    className="nodrag flex-1 rounded border text-2xs"
                  >
                    {t('gallery.remove')}
                  </button>
                  <button
                    type="button"
                    data-gallery-extract
                    onClick={() => {
                      canvas.onDisconnectSlot(node.id, slot, version.id)
                      canvas.onFocusNode(version.sourceNodeId)
                    }}
                    className="nodrag flex-1 rounded border text-2xs"
                  >
                    {t('gallery.extract')}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {picking ? (
        <ul data-gallery-picker className="max-h-24 space-y-0.5 overflow-auto">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                data-gallery-pick={candidate.id}
                onClick={() => {
                  void canvas.onApplyOp({
                    op: NODE_ASSISTANT_OP_V4_IDS.connect,
                    source: candidate.id,
                    target: node.id,
                    slot,
                  })
                  setPicking(false)
                }}
                className="nodrag w-full truncate rounded border px-1 text-left text-2xs"
              >
                {candidate.data.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
