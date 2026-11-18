/**
 * Comfy Runner (ComfyUI on Modal) checkpoint manifest — Worker side.
 *
 * ⭐ One table: this re-exports `src/constants/runner-checkpoints.ts` by
 * relative path (same as `generation-errors` / `pixai` / `novelai`). It used to
 * be a hand-kept copy, and the two drifted on sampler defaults; ⛔ don't copy
 * it back.
 *
 * Volume 布局与预置资产清单见 docs/references/domains/runner.md §3。
 */

export {
  getRunnerCheckpointById,
  RUNNER_CHECKPOINTS,
  RUNNER_DEFAULT_CFG,
  RUNNER_DEFAULT_STEPS,
  type RunnerCheckpointManifestEntry as RunnerCheckpointDefinition,
} from '../../../../../src/constants/runner-checkpoints'
