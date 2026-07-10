'use client'

import { CharacterImageInspector } from '../inspector/CharacterImageInspector'
import type { NodeDetailBodyProps } from './registry'

/**
 * Detail body for character (角色) nodes = the full CharacterImageInspector,
 * upgraded to the S5c 二.2 档案面板 (dossier): 视觉身份区 (main photo + an
 * always-visible reference gallery grid, closeups merged in) · 身份词条区
 * (name + read-only visual seed) · 听觉身份区 (bound voice + ＋绑定) · 出演区
 * (downstream shots/videos, click to focus on canvas) · card binding · LoRA ·
 * AI generate. The inspector reads only node.id + node.data, so a synthesized
 * node is safe.
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
