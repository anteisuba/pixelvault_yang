import 'server-only'

import { AI_MODELS, getModelById } from '@/constants/models'
import { findRunnerLoraAllowlistEntry } from '@/constants/runner-checkpoints'
import type { AdvancedParams } from '@/types'

/**
 * Hosted models with a runner-backed "faithful clone" counterpart. When a
 * request attaches a LoRA we know breaks the hosted model's loader (see
 * `findRunnerLoraAllowlistEntry`), route resolution upgrades the request to
 * the runner model instead of letting it fail with hosted's raw
 * `layer ... not supported` error.
 *
 * See docs/plans/comfy-runner-HANDOFF-2026-07.md §4.2 ("能力路由"). This is
 * intentionally narrow (v1): it only recognizes LoRAs already verified
 * against the runner's allowlist. An unrecognized LoRA still gets a much
 * better error message via GENERATION_ERROR_CODES.LORA_INCOMPATIBLE_HOSTED
 * (constants/generation-errors.ts), it just isn't auto-upgraded.
 */
const HOSTED_MODEL_RUNNER_UPGRADE_TARGET: Partial<Record<string, AI_MODELS>> = {
  [AI_MODELS.ILLUSTRIOUS_XL]: AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE,
}

/**
 * Given the requested model id and any attached LoRAs, return the model id
 * that should actually be routed to. Returns the original `requestedModelId`
 * unchanged unless every one of these holds:
 *   1. The requested model has a known runner upgrade target.
 *   2. That runner target model is currently available (flag-gated).
 *   3. At least one attached LoRA is a known runner-allowlisted LoRA (i.e.
 *      one we've verified breaks the hosted loader).
 */
export function resolveRunnerCapableModelId(
  requestedModelId: string,
  loras: AdvancedParams['loras'] | undefined,
): string {
  if (!loras || loras.length === 0) return requestedModelId

  const upgradeTarget = HOSTED_MODEL_RUNNER_UPGRADE_TARGET[requestedModelId]
  if (!upgradeTarget) return requestedModelId

  const upgradeModel = getModelById(upgradeTarget)
  if (!upgradeModel?.available) return requestedModelId

  const needsUpgrade = loras.some(
    (lora) => findRunnerLoraAllowlistEntry(lora.url) !== undefined,
  )

  return needsUpgrade ? upgradeTarget : requestedModelId
}
