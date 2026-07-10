import 'server-only'

import { AI_ADAPTER_TYPES } from '@/constants/providers'

import type { ProviderAdapter } from '@/services/providers/types'

/**
 * Comfy Runner (RunPod Serverless ComfyUI) — registered in the adapter
 * registry so `resolveImageRouteAndValidate` (shared by both the sync and
 * async image-generation paths) accepts RUNNER as a real model adapter.
 *
 * Unlike every other adapter here, RUNNER never actually executes through
 * this `generateImage()` method: RUNNER is unconditionally in
 * `WORKER_MIGRATED_IMAGE_ADAPTERS` (see constants/execution.ts) because
 * RunPod cold starts can run 150s+ — there's no acceptable synchronous path.
 * `submitImageGeneration()` always dispatches RUNNER to the Cloudflare
 * Worker, which does the real RunPod submit/poll/decode
 * (workers/execution/src/index.ts + models/runner/*). This method exists
 * only to satisfy the ProviderAdapter contract and fail loudly if some
 * future caller ever reaches the synchronous `generateImageForUser` path
 * with a RUNNER model.
 */
export const runnerAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.RUNNER,
  async generateImage() {
    throw new Error(
      'Comfy Runner only supports async generation via the execution worker ' +
        '(submitImageGeneration) — cold starts are too long for a synchronous call.',
    )
  },
}
