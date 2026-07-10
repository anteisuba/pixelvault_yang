import { createHash } from 'node:crypto'

import { FEATURE_FLAGS, type FeatureFlag } from '@/constants/feature-flags'

/**
 * Per-flag rollout percentage (0–100). Read from
 * `NEXT_PUBLIC_FF_<NAME>_ROLLOUT` so percentage gates can ship without a code
 * change. When the env var is missing the helper falls back to the boolean
 * `FEATURE_FLAGS[flag]` — i.e. the existing on/off semantics still work.
 *
 * Example: `NEXT_PUBLIC_FF_VARIANT_GEN_ROLLOUT=10` opens the variant flow
 * for ~10% of users, sliced by a stable hash of `userId`.
 */
const ROLLOUT_ENV_BY_FLAG: Record<FeatureFlag, string> = {
  smartPrompt: 'NEXT_PUBLIC_FF_SMART_PROMPT_ROLLOUT',
  variantGeneration: 'NEXT_PUBLIC_FF_VARIANT_GEN_ROLLOUT',
  multiModelCompare: 'NEXT_PUBLIC_FF_MULTI_COMPARE_ROLLOUT',
  imageEditing: 'NEXT_PUBLIC_FF_IMAGE_EDITING_ROLLOUT',
  seriesMode: 'NEXT_PUBLIC_FF_SERIES_MODE_ROLLOUT',
  // Owner-only on/off toggle (single RunPod endpoint) — no phased rollout in
  // practice, but the env var exists for consistency with the other flags.
  comfyRunner: 'NEXT_PUBLIC_FF_COMFY_RUNNER_ROLLOUT',
}

function readRolloutPercent(flag: FeatureFlag): number | null {
  const envName = ROLLOUT_ENV_BY_FLAG[flag]
  const raw = process.env[envName]
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed)) return null
  return Math.max(0, Math.min(100, parsed))
}

/**
 * Stable 0-99 bucket for a user. Same userId always returns the same bucket
 * so rollouts are sticky — a user inside the cohort stays inside even after
 * a refresh; a user outside it can't refresh their way in.
 */
function userBucket(userId: string, flag: FeatureFlag): number {
  const hash = createHash('sha1').update(`${flag}:${userId}`).digest()
  return hash.readUInt32BE(0) % 100
}

/**
 * Is `flag` enabled for `userId`?
 *
 *   - Flag off globally → false
 *   - Flag on + no rollout env → true (existing on/off behaviour)
 *   - Flag on + rollout=N → bucket < N
 *
 * Anonymous callers (no userId) get the global value only — they can never
 * land inside a percentage cohort because there's no stable identifier.
 */
export function isFeatureEnabledForUser(
  flag: FeatureFlag,
  userId: string | null | undefined,
): boolean {
  if (!FEATURE_FLAGS[flag]) return false
  const rollout = readRolloutPercent(flag)
  if (rollout === null) return true
  if (rollout >= 100) return true
  if (rollout <= 0) return false
  if (!userId) return false
  return userBucket(userId, flag) < rollout
}
