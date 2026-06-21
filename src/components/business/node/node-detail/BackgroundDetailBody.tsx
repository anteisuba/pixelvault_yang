'use client'

import { BackgroundImageInspector } from '../inspector/BackgroundImageInspector'
import type { NodeDetailBodyProps } from './registry'

/**
 * Detail body for background (背景) nodes = BackgroundImageInspector (场景图:
 * use existing · from background card · generate in node, plus location/mood/
 * lighting/prompt fields, model, references). The 环境音/氛围 half is omitted —
 * no ambient-audio field, node type, or upload path exists yet (GAP). The
 * inspector reads only node.id + node.data, so a synthesized node is safe.
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
