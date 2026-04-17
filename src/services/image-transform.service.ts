import 'server-only'

/**
 * Image Transform orchestrator — Strategy Pattern.
 *
 * Routes transformation requests to dimension-specific handlers.
 * Phase 1 only implements `style`; other types return 501.
 *
 * @see 02-功能/功能-路線決策結論書.md §4 — schema
 * @see 02-功能/功能-實作落地清單.md §1.2 — service layer
 */

import { NotImplementedError } from '@/lib/errors'
import type { TransformInput, TransformOutput } from '@/types/transform'

import { handleStyleTransform } from './image-transform/handle-style-transform'
import { handlePoseTransform } from './image-transform/handle-pose-transform'

export async function transformImage(
  clerkId: string,
  input: TransformInput,
): Promise<TransformOutput> {
  switch (input.transformation.type) {
    case 'style':
      return handleStyleTransform(clerkId, input)

    case 'pose':
      return handlePoseTransform(clerkId, input)

    case 'background':
    case 'garment':
    case 'detail':
      throw new NotImplementedError(
        `${input.transformation.type} transformation`,
      )
  }
}
