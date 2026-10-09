import {
  LORA_BASE_MODELS,
  normalizeToLoraBaseFamily,
} from '@/constants/lora-base-models'
import {
  LORA_PROMPT_DIALECTS,
  type LoraPromptDialect,
} from '@/constants/lora-prompt-dialects'
import {
  getRunnerCheckpointById,
  isRunnerNegativePromptInert,
  RUNNER_DEFAULT_CFG,
} from '@/constants/runner-checkpoints'
import type { AssistantOperatorRequest } from '@/types/assistant-operator'

/**
 * 当前底模家族那一族的方言（§6.3 第 3 条）。
 *
 * ⚠ 家族值是快照里的**原始 baseModel 串**，归一走 `normalizeToLoraBaseFamily` ——
 * ⛔ 别在这里按名字猜（"Anima Pencil XL" 报的是 `SDXL 1.0`，按子串猜必错）。
 */
export function resolveLoraDialect(
  rawBaseFamily: string | null,
): LoraPromptDialect | null {
  if (!rawBaseFamily) return null
  const family = normalizeToLoraBaseFamily(rawBaseFamily)
  return family ? LORA_PROMPT_DIALECTS[family] : null
}

/** 装配台上选中的那一条底模与这一刻的 CFG（用户没填 = `null`，按底模默认）。 */
export interface LoraBenchBase {
  baseId: string | null
  cfg: number | null | undefined
}

/**
 * 这台底模上负面词起不起作用：CFG 恰好是 1（步数蒸馏档，或参数里调成 1）时 ComfyUI
 * 整个跳过负面那一支。⭐ 与装配台负面 chip 让开**同一个判据**
 * （`isRunnerNegativePromptInert`，checkpoint 取底模条目的 `runnerCheckpointId`）。
 */
export function isLoraNegativeInert({ baseId, cfg }: LoraBenchBase): boolean {
  const base = baseId
    ? LORA_BASE_MODELS.find((item) => item.id === baseId)
    : undefined
  return base
    ? isRunnerNegativePromptInert(base.runnerCheckpointId, cfg)
    : false
}

/**
 * 这条底模自己的出图默认（清单写了才有）。来源图底模那一档的实际默认看来源图，⛔ 不写 ——
 * 与装配台参数 chip 写的底模默认同一个口径。
 */
export function loraBaseSamplingDefaults(baseId: string | null): string | null {
  const base = baseId
    ? LORA_BASE_MODELS.find((item) => item.id === baseId)
    : undefined
  if (!base || base.recipeCheckpointMode === 'source') return null
  const checkpoint = getRunnerCheckpointById(base.runnerCheckpointId)
  if (checkpoint?.recommendedSteps == null) return null
  return `${checkpoint.recommendedSampler} + ${checkpoint.recommendedScheduler}, ${checkpoint.recommendedSteps} steps, CFG ${checkpoint.recommendedCfg ?? RUNNER_DEFAULT_CFG}`
}

/**
 * LoRA 域系统提示里的方言段。
 *
 * ⛔ **只注入当前那一族**：六族全倒进上下文的下场是模型在 FLUX 上写 score 前缀
 * 「因为上面也写着」—— 一段读得到的别族习惯就是一条它会去试的路。
 * 底模未定时不猜，明说「先别按任何一族的习惯写」。
 */
export function buildLoraDialectRule(
  rawBaseFamily: string | null,
  bench: LoraBenchBase,
): string {
  const dialect = resolveLoraDialect(rawBaseFamily)
  if (!dialect) {
    return "- PROMPT DIALECT: no base model is settled yet, so do not write in any family's habits yet — settle the base first, then write in that family's dialect."
  }
  const lines = [
    `- PROMPT DIALECT — the base on the bench is ${rawBaseFamily}, and this is the only dialect that applies here:`,
    `  · a subject prompt reads like: ${dialect.skeleton.subject}`,
    `  · a style prompt reads like: ${dialect.skeleton.style}`,
    `  · real recipes on this family line things up as: ${dialect.order}`,
    dialect.weightedParens
      ? '  · (tag:1.2) parenthesis weighting works on this family.'
      : '  · (tag:1.2) parenthesis weighting does NOT work on this family — write the word plainly instead.',
  ]
  lines.push(
    isLoraNegativeInert(bench)
      ? '  · the selected base runs at CFG 1, where the negative prompt is skipped entirely — leave it empty and do not propose negative tags.'
      : dialect.negative.length > 0
        ? `  · the negative staples here are: ${dialect.negative.join(', ')}`
        : '  · this family does not use a negative prompt — leave it empty.',
  )
  const ownDefaults = loraBaseSamplingDefaults(bench.baseId)
  if (ownDefaults) {
    lines.push(
      `  · the selected base's own defaults are ${ownDefaults} — start from these when Runner parameters go on a setup card.`,
    )
  } else if (dialect.parameters) {
    lines.push(
      `  · real recipes on this family usually run ${dialect.parameters} — start from these when Runner parameters go on a setup card.`,
    )
  }
  for (const rule of dialect.forbidden) {
    lines.push(`  · never write that here: ${rule.why}`)
  }
  return lines.join('\n')
}

/** 系统提示里的那一段：按快照里的底模与 CFG。 */
export function buildLoraDialectSection(
  request: AssistantOperatorRequest,
): string {
  return buildLoraDialectRule(request.snapshot.loras?.baseFamily ?? null, {
    baseId: request.snapshot.model?.id ?? null,
    cfg: request.snapshot.loraParameters?.guidanceScale,
  })
}
