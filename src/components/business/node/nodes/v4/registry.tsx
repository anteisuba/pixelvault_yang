'use client'

/**
 * v4 节点注册表（node-canvas-v2 §1.1 顶层四类）。
 *
 * ⚠ 只注册**四类** + 一个 legacy 空壳。legacy 空壳的存在理由是顺序纪律：
 * `NODE_TYPES` 的 12 个 enum 值要等 C3 的批量回填跑完并验证之后才删，在那之前
 * 存量项目里仍可能出现旧 type；没有空壳的话 ReactFlow 会对未注册的 type 报
 * 「Node type not found」并整块不渲染。空壳明写「已迁移」，⛔ 不是静默留白。
 */

import type { NodeTypes } from '@xyflow/react'

import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'

import { AudioNodeV4 } from './MediaNodeV4'
import { ImageNodeV4 } from './ImageNodeV4'
import { TextNodeV4 } from './TextNodeV4'
import { VideoNodeV4 } from './VideoNodeV4'
import { LegacyMigratedNode } from './LegacyMigratedNode'

/** ReactFlow 的 `nodeTypes` —— v4 里节点的 `type` 就是它的 `kind`。 */
export const NODE_V4_COMPONENTS: NodeTypes = {
  [NODE_MEDIA_KIND_IDS.text]: TextNodeV4,
  [NODE_MEDIA_KIND_IDS.image]: ImageNodeV4,
  [NODE_MEDIA_KIND_IDS.audio]: AudioNodeV4,
  [NODE_MEDIA_KIND_IDS.video]: VideoNodeV4,
  legacy: LegacyMigratedNode,
}
