'use client'

/**
 * 九宫格分镜的「切开」（node-canvas-v2 §3「九宫格分镜」，设计画布「画布 · 九宫格分镜」A）。
 *
 * 两条路进来：
 * - **出完自动切**：开着九宫格开关的卡，**打开画布之后**才长出来的那一版生成图。
 *   卡片提示词栏、多选回车、助手、刷新后回填都会让版本表长一格，所以盯版本表，⛔ 不在
 *   每条发送路径里各挂一次。打开画布时已有的版本、事后才打开开关的图都不切。
 * - **手动切**：图片卡 ⋯「切宫格 3×3 / 2×2」，以及认不出九宫格时卡上那两颗键。
 *
 * 切开 = 读图 → 认格缝 → 逐格存进素材库 → 九张带着图一次落下（一个撤销条目，
 * 重做也带图）→ 按宫格原样 3×3 排在原图右边。⛔ 不连线：来源写在每张卡的版本里，
 * 组号写在 `storyboardCell`，画布左边那道浅括号按它画。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { AUDIO_CLIP_SOURCE } from '@/constants/audio-options'
import {
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_V4_CARD,
} from '@/constants/node-studio'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
} from '@/constants/node-types'
import {
  STORYBOARD_BRACKET,
  STORYBOARD_CELL_GAP,
  type StoryboardGridSize,
} from '@/constants/storyboard-grid'
import {
  collapsedImageHeight,
  collapsedImageWidth,
} from '@/components/business/node/nodes/v4/image/image-node-model'
import type { NodeGraphV4 } from '@/hooks/node/use-node-graph-v4'
import { uploadImageMediaPatch } from '@/hooks/node/use-node-upload-v4'
import { notifyGalleryChanged } from '@/lib/gallery-revision'
import { readOutputIndex, readOutputVersions } from '@/lib/node-output-versions'
import { splitImageIntoCells } from '@/lib/storyboard-grid'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4, NodeV4ImageData } from '@/types/node-workflow'

/** 卡名在卡外上方那一行（画布坐标下的高），排行距时要让出来。 */
const NAME_ROW = 24

export type StoryboardIssue = 'notDetected'

/** 刚切开的那一组：九张卡落地时从原图上各自那一格飞过来。 */
export interface StoryboardLanding {
  readonly groupId: string
  readonly sourceId: string
  readonly size: StoryboardGridSize
  readonly at: number
}

export interface StoryboardSplitApi {
  split(nodeId: string, size: StoryboardGridSize): void
  /** 认不出九宫格的卡（卡上说一句 + 手动切）。 */
  readonly issues: Readonly<Record<string, StoryboardIssue>>
  dismissIssue(nodeId: string): void
  /** 正在切的卡（卡上走进度、菜单项灰掉）。 */
  readonly splitting: ReadonlySet<string>
  readonly landing: StoryboardLanding | null
}

function withoutKey<T>(
  record: Readonly<Record<string, T>>,
  key: string,
): Record<string, T> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

function mintGroupId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `g${Date.now().toString(36)}`
}

function isImage(node: NodeV4): node is NodeV4 & { data: NodeV4ImageData } {
  return node.data.kind === NODE_MEDIA_KIND_IDS.image
}

export function useStoryboardGridSplit(options: {
  readonly graph: NodeGraphV4
  /** 切完把镜头移到「原图 + 九张」那一片。 */
  onReveal?(nodeIds: readonly string[]): void
}): StoryboardSplitApi {
  const { graph, onReveal } = options
  const t = useTranslations('StudioNode.v4.image.storyboard')
  const [issues, setIssues] = useState<Record<string, StoryboardIssue>>({})
  const [splitting, setSplitting] = useState<ReadonlySet<string>>(new Set())
  const [landing, setLanding] = useState<StoryboardLanding | null>(null)
  const latest = useRef({ graph, onReveal, t })
  latest.current = { graph, onReveal, t }
  const inflight = useRef(new Set<string>())

  const run = useCallback(
    async (
      nodeId: string,
      size: StoryboardGridSize,
      mode: 'detect' | 'detectOrEqual',
    ) => {
      if (inflight.current.has(nodeId)) return
      const source = latest.current.graph.nodes.find(
        (node) => node.id === nodeId,
      )
      if (!source || !isImage(source) || !source.data.url) return
      inflight.current.add(nodeId)
      setSplitting(new Set(inflight.current))
      setIssues((prev) => withoutKey(prev, nodeId))
      const { t: tr } = latest.current
      const name = source.data.name ?? tr('fallbackName')
      try {
        const result = await splitImageIntoCells(source.data.url, size, {
          mode,
          baseName: name,
        })
        if (!result.ok) {
          if (result.reason === 'notDetected') {
            setIssues((prev) => ({ ...prev, [nodeId]: 'notDetected' }))
          } else {
            toast.error(tr('unreadable'))
          }
          return
        }

        const patches = []
        for (const [index, cell] of result.cells.entries()) {
          const uploaded = await uploadImageMediaPatch(cell.file, {
            note: tr('sourceLabel', { name, n: index + 1 }),
          })
          if (!uploaded.ok) {
            // 一格没存进去就整组不落：九宫格少一格比不切更难收拾。
            toast.error(tr('uploadFailed', { n: index + 1 }))
            return
          }
          patches.push(uploaded.patch)
        }
        notifyGalleryChanged()

        // 落点：原图右边，宫格原样 size × size；左边留出括号的位置。
        const fresh = latest.current.graph.nodes.find(
          (node) => node.id === nodeId,
        )
        const anchor = fresh ?? source
        const probe: NodeV4ImageData = {
          ...source.data,
          mediaWidth: result.cells[0]!.width,
          mediaHeight: result.cells[0]!.height,
        }
        const cellW = collapsedImageWidth(probe)
        const cellH = collapsedImageHeight(probe)
        const x0 =
          anchor.position.x +
          collapsedImageWidth(source.data) +
          NODE_V4_CARD.derivedGap +
          STORYBOARD_BRACKET.offset +
          STORYBOARD_BRACKET.width
        const y0 = anchor.position.y
        const groupId = mintGroupId()
        const ops: NodeAssistantOpV4[] = result.cells.map((_, index) => ({
          op: NODE_ASSISTANT_OP_V4_IDS.addNode,
          kind: NODE_MEDIA_KIND_IDS.image,
          subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
          ref: `storyboard-${index}`,
          name: tr('cellName', { name, n: index + 1 }),
          position: {
            x: x0 + (index % size) * (cellW + STORYBOARD_CELL_GAP),
            y:
              y0 +
              Math.floor(index / size) *
                (cellH + NAME_ROW + STORYBOARD_CELL_GAP),
          },
        }))
        const outcome = latest.current.graph.dispatchBatchWithMedia(
          ops,
          patches.map((patch, index) => ({
            media: {
              ...patch,
              imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
              source: {
                kind: AUDIO_CLIP_SOURCE.grid,
                label: tr('sourceLabel', { name, n: index + 1 }),
              },
            },
            decorate: (data) =>
              data.kind === NODE_MEDIA_KIND_IDS.image
                ? { ...data, storyboardCell: { groupId, cell: index } }
                : data,
          })),
        )
        if (outcome.createdNodeIds.length === 0) {
          toast.error(tr('failed'))
          return
        }
        setLanding({ groupId, sourceId: nodeId, size, at: Date.now() })
        latest.current.onReveal?.([nodeId, ...outcome.createdNodeIds])
      } catch {
        toast.error(tr('failed'))
      } finally {
        inflight.current.delete(nodeId)
        setSplitting(new Set(inflight.current))
      }
    },
    [],
  )

  const split = useCallback(
    (nodeId: string, size: StoryboardGridSize) => {
      void run(nodeId, size, 'detectOrEqual')
    },
    [run],
  )

  const dismissIssue = useCallback((nodeId: string) => {
    setIssues((prev) => withoutKey(prev, nodeId))
  }, [])

  // 出完自动切：盯版本表。⚠ 第一次看到一张卡只记数、不切 —— 打开画布时已有的版本
  //   不是「刚出来的」。
  const seenVersions = useRef(new Map<string, number>())
  useEffect(() => {
    const seen = seenVersions.current
    for (const node of graph.nodes) {
      if (!isImage(node)) continue
      const versions = readOutputVersions(node.data)
      const count = versions.length
      const before = seen.get(node.id)
      seen.set(node.id, count)
      if (before === undefined || count <= before) continue
      if (node.data.params?.storyboardGrid !== true) continue
      const current = versions[readOutputIndex(node.data)]
      if (
        current?.meta?.imageSource !==
        NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated
      )
        continue
      void run(node.id, 3, 'detect')
    }
  }, [graph.nodes, run])

  return { split, issues, dismissIssue, splitting, landing }
}
