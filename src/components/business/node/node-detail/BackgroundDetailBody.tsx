'use client'

import { BackgroundImageInspector } from '../inspector/BackgroundImageInspector'
import type { NodeDetailBodyProps } from './registry'

/**
 * Detail body for background (背景) nodes = BackgroundImageInspector, upgraded
 * to the S5c 二.2 档案面板 (dossier, "背景卡若同构顺带"): 视觉身份区 (场景图集
 * as an always-visible gallery grid) · 出演区 (downstream shots/videos) ·
 * location/mood/lighting/prompt fields, model, AI generate. The 听觉身份区
 * half is omitted — no ambient-audio field, node type, or upload path exists
 * yet (GAP, same as before this片). The inspector reads only node.id +
 * node.data, so a synthesized node is safe.
 */
export function BackgroundDetailBody({
  nodeId,
  type,
  data,
}: NodeDetailBodyProps) {
  return (
    <BackgroundImageInspector
      node={{ id: nodeId, type, position: { x: 0, y: 0 }, data }}
    />
  )
}
