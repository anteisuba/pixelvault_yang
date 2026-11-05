/**
 * 出口「+」长下游卡（node-canvas-v2 §1 第 18 条尾句，owner 2026-11-05 定视频只续拍）。
 *
 * 点卡右缘的「+」= 在右边长一张**空的**下游卡并连线，与「连到镜头」弹层（第 14 条）
 * 汇到同一份槽绑定（一批 `add_node` + `connect`，一个撤销）。每类卡的去处：
 *
 * | 来源 | 去处                                                     |
 * | ---- | -------------------------------------------------------- |
 * | 图   | 图片（`image.shot` 的参考槽）· 视频（`video.shot` 首帧） |
 * | 视频 | 续拍（`useVideoContinue`，⛔ 不走这里）                   |
 * | 文本 | 图片 · 视频（`onDeriveFromText`，⛔ 不走这里）            |
 * | 音频 | 视频（`video.shot` 的语音槽）                             |
 *
 * ⚠ 视频 → 音频这条 owner 11-05 定「这批不放」：音频卡没有能接视频的入口。
 * ⚠ 图 → 视频与 ⋯「生镜头」同一个形状：新镜头沿用来源的镜号。
 */

import { useTranslations } from 'next-intl'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS, type NodeSlotId } from '@/constants/node-slots'
import { NODE_STUDIO_DOCK } from '@/constants/node-studio'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4 } from '@/types/node-workflow'

import { flashNodeCard } from './chrome/node-card-flash'
import type { NodePortGrow } from './chrome/NodePorts'
import { useNodeV4Canvas, type NodeV4CanvasContextValue } from './NodeV4Context'

/** 批内别名（只在这一批之内有效）。 */
const GROW_REF = 'grown'

export const NODE_GROW_TARGET_IDS = {
  image: 'image',
  video: 'video',
} as const
export type NodeGrowTarget =
  (typeof NODE_GROW_TARGET_IDS)[keyof typeof NODE_GROW_TARGET_IDS]

interface GrowPlan {
  readonly kind: NodeV4['data']['kind']
  readonly subtype: NodeV4['data']['subtype']
  readonly slot: NodeSlotId
  readonly keepShotNo: boolean
}

const VIDEO_SHOT = {
  kind: NODE_MEDIA_KIND_IDS.video,
  subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
} as const

/** 图 / 文本 / 音频卡的「+」能长哪几样（视频卡只续拍，由卡自己给）。 */
export function growTargetsOf(source: NodeV4): readonly NodeGrowTarget[] {
  switch (source.data.kind) {
    case NODE_MEDIA_KIND_IDS.image:
    case NODE_MEDIA_KIND_IDS.text:
      return [NODE_GROW_TARGET_IDS.image, NODE_GROW_TARGET_IDS.video]
    case NODE_MEDIA_KIND_IDS.audio:
      return [NODE_GROW_TARGET_IDS.video]
    default:
      return []
  }
}

function planOf(source: NodeV4, target: NodeGrowTarget): GrowPlan | null {
  if (source.data.kind === NODE_MEDIA_KIND_IDS.image) {
    return target === NODE_GROW_TARGET_IDS.image
      ? {
          kind: NODE_MEDIA_KIND_IDS.image,
          subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
          slot: NODE_SLOT_IDS.reference,
          keepShotNo: false,
        }
      : { ...VIDEO_SHOT, slot: NODE_SLOT_IDS.firstFrame, keepShotNo: true }
  }
  if (
    source.data.kind === NODE_MEDIA_KIND_IDS.audio &&
    target === NODE_GROW_TARGET_IDS.video
  ) {
    return { ...VIDEO_SHOT, slot: NODE_SLOT_IDS.voice, keepShotNo: false }
  }
  return null
}

/** 长下游卡的那一批（建卡 + 连线）。去处不认识时返回空。 */
export function buildGrowOps(
  source: NodeV4,
  target: NodeGrowTarget,
  position?: { readonly x: number; readonly y: number },
): readonly NodeAssistantOpV4[] {
  const plan = planOf(source, target)
  if (!plan) return []
  const shotNo =
    plan.keepShotNo && 'shotNo' in source.data ? source.data.shotNo : undefined
  return [
    {
      op: NODE_ASSISTANT_OP_V4_IDS.addNode,
      kind: plan.kind,
      subtype: plan.subtype,
      ref: GROW_REF,
      ...(shotNo === undefined ? {} : { shotNo }),
      ...(position ? { position: { x: position.x, y: position.y } } : {}),
    } as NodeAssistantOpV4,
    {
      op: NODE_ASSISTANT_OP_V4_IDS.connect,
      source: source.id,
      target: GROW_REF,
      slot: plan.slot,
    },
  ]
}

type GrowCanvas = Pick<
  NodeV4CanvasContextValue,
  | 'readGraph'
  | 'onPlaceBeside'
  | 'onApplyBatch'
  | 'onFocusNode'
  | 'onSelectNode'
>

/** 落到右边第一个空位、建完选中并亮一下（与「转文字」「裁剪」长新卡同一套）。 */
export async function growDownstreamCard(
  canvas: GrowCanvas,
  sourceId: string,
  target: NodeGrowTarget,
): Promise<string | undefined> {
  const source = canvas.readGraph().nodes.find((node) => node.id === sourceId)
  if (!source) return undefined
  const plan = planOf(source, target)
  if (!plan) return undefined
  const position = canvas.onPlaceBeside(sourceId, [
    { kind: plan.kind, subtype: plan.subtype },
  ])?.[0]
  const outcome = await canvas.onApplyBatch(
    buildGrowOps(source, target, position),
  )
  const created = outcome?.createdNodeIds?.[0]
  if (created) {
    canvas.onFocusNode(created)
    canvas.onSelectNode?.(created)
    flashNodeCard(created, NODE_STUDIO_DOCK.focusDurationMs)
  }
  return created
}

/**
 * 图 / 文本 / 音频卡给 `NodePorts` 的那份「+」。`ready = false`（图 / 音频还没有内容）
 * 时不出「+」—— 一张空图当参考、一段没声音的配音接进镜头都没有意义。
 *
 * ⚠ 文本卡走它工具条上那两个派生（生图 / 生镜头，`onDeriveFromText`）：落点、连哪个
 * 槽、建完选中都已经在那条路上，⛔ 这里另写一份。
 */
export function useNodeGrow(
  node: NodeV4 | undefined,
  ready: boolean,
): NodePortGrow {
  const t = useTranslations('StudioNode.v4.ports')
  const canvas = useNodeV4Canvas()
  // 卡在提前返回之前调它（hook 不能跟着 `node` 有无走），所以 `node` 可能还不在。
  if (!node) return { disabled: true, choices: [] }
  return {
    disabled: !ready,
    choices: growTargetsOf(node).map((target) => ({
      id: target,
      label: t(`growTo.${target}`),
      onSelect: () => {
        if (node.data.kind === NODE_MEDIA_KIND_IDS.text) {
          canvas.onDeriveFromText(
            node.id,
            target === NODE_GROW_TARGET_IDS.image ? 'shotImage' : 'video',
          )
          return
        }
        void growDownstreamCard(canvas, node.id, target)
      },
    })),
  }
}
