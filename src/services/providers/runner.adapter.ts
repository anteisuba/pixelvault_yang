import 'server-only'

import { AI_ADAPTER_TYPES } from '@/constants/providers'

import type { ProviderAdapter } from '@/services/providers/types'

/**
 * Comfy Runner (RunPod Serverless ComfyUI) — registered in the adapter
 * registry so `resolveImageRouteAndValidate` (shared ahead of the async
 * image-generation path) accepts RUNNER as a real model adapter.
 *
 * RUNNER is unconditionally in `WORKER_MIGRATED_IMAGE_ADAPTERS` (see
 * constants/execution.ts) because RunPod cold starts can run 150s+ —
 * there's no acceptable synchronous path. `submitImageGeneration()` always
 * dispatches RUNNER to the Cloudflare Worker, which does the real RunPod
 * submit/poll/decode (workers/execution/src/index.ts + models/runner/*).
 * This adapter carries no methods of its own — it exists purely so
 * `getProviderAdapter(AI_ADAPTER_TYPES.RUNNER)` resolves to a real object
 * instead of throwing "Provider adapter not available".
 */
export const runnerAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.RUNNER,
}
