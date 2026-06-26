'use client'

import { ShotInspector } from '../inspector/ShotInspector'
import type { NodeDetailBodyProps } from './registry'

/**
 * Detail body for shot (镜头) nodes = the unified NodeMediaInspector via
 * ShotInspector (preview / 素材库 / AI generate · prompt/camera/composition/
 * action fields · model · references · LoRA). Registering it here replaces the
 * old GenericDetailBody fallback so 镜头 matches the character/background detail
 * panel instead of drifting. The inspector reads only node.id + node.data, so a
 * synthesized node is safe.
 */
export function ShotDetailBody({ nodeId, type, data }: NodeDetailBodyProps) {
  return (
    <ShotInspector
      node={{ id: nodeId, type, position: { x: 0, y: 0 }, data }}
    />
  )
}
