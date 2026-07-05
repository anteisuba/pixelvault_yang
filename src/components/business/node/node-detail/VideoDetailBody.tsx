'use client'

import { VideoComposer } from '../composer/VideoComposer'
import type { NodeDetailBodyProps } from './registry'

/**
 * Detail body for video (Seedance) nodes = the full B2 model-aware composer.
 * A thin dispatch — the monitor preview, references, prompt, and params all
 * live in `VideoComposer` (density='detail') per §0/§4 C4 of the v4 spec.
 */
export function VideoDetailBody({ nodeId, data }: NodeDetailBodyProps) {
  return <VideoComposer id={nodeId} data={data} density="detail" />
}
