/**
 * 手机端镜头带视图的**分列表**（node-canvas-v2 §7.x）——纯读函数。
 *
 * ⛔ 不新增任何数据：四个列表都是同一份 `state.nodes` 的投影。镜头列表的顺序
 * **必须**与桌面镜头带 / 剪辑台一致，所以排序判据只有一条：`shotNo` 升序
 * （`node-shot-layout.listShotNos` 用的是同一个字段）。还没归镜的镜头卡排在
 * 末尾、保持它们在图里的相对顺序 —— ⛔ 不按名字或时间重排（那会让手机上的顺序
 * 与桌面对不上）。
 */

import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import type { NodeV4 } from '@/types/node-workflow'

export interface MobileRailLists {
  /** 镜头带：`video` 卡，按镜头带序。 */
  readonly shots: readonly NodeV4[]
  readonly images: readonly NodeV4[]
  readonly voices: readonly NodeV4[]
  readonly texts: readonly NodeV4[]
}

/** 镜头带序：有 `shotNo` 的按号升序在前，没归镜的按原顺序排在后面。 */
export function orderShots(nodes: readonly NodeV4[]): NodeV4[] {
  const shots = nodes.filter(
    (node) => node.data.kind === NODE_MEDIA_KIND_IDS.video,
  )
  const numbered = shots.filter((node) => typeof node.data.shotNo === 'number')
  const loose = shots.filter((node) => typeof node.data.shotNo !== 'number')
  numbered.sort((a, b) => (a.data.shotNo ?? 0) - (b.data.shotNo ?? 0))
  return [...numbered, ...loose]
}

export function buildMobileRailLists(
  nodes: readonly NodeV4[],
): MobileRailLists {
  return {
    shots: orderShots(nodes),
    images: nodes.filter(
      (node) => node.data.kind === NODE_MEDIA_KIND_IDS.image,
    ),
    voices: nodes.filter(
      (node) => node.data.kind === NODE_MEDIA_KIND_IDS.audio,
    ),
    texts: nodes.filter((node) => node.data.kind === NODE_MEDIA_KIND_IDS.text),
  }
}

/** 这张卡是不是「镜头」（而不是散片段）—— 只有镜头才带 `S<nn>·` 前缀。 */
export function isShotNode(node: NodeV4): boolean {
  return (
    node.data.kind === NODE_MEDIA_KIND_IDS.video &&
    node.data.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
  )
}
