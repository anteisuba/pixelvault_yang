'use client'

import { CharacterImageInspector } from '../inspector/CharacterImageInspector'
import type { NodeDetailBodyProps } from './registry'

/**
 * Detail body for character (角色) nodes = the full CharacterImageInspector
 * (identity · card binding · 参考图集 · LoRA · AI generate) relocated into the
 * ⤢ panel. It already renders the bound-voice (音色集) hint from an upstream
 * voice node, so no extra section is needed here. The inspector reads only
 * node.id + node.data, so a synthesized node is safe.
 */
export function CharacterDetailBody({
  nodeId,
  type,
  data,
}: NodeDetailBodyProps) {
  return (
    <CharacterImageInspector
      node={{ id: nodeId, type, position: { x: 0, y: 0 }, data }}
    />
  )
}
