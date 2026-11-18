import {
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
} from '@/constants/assistant-operator'
import {
  STUDIO_OPERATOR_GENERATE_KNOB_IDS as KNOB,
  type StudioOperatorGenerateKnob,
} from '@/constants/studio-assistant-operator'
import type { StudioOperatorThreadEntry } from '@/types/studio-assistant-operator'

/**
 * **确认卡「旧值 → 新值」里的旧值**（11-18：确认卡只做摘要，⛔ 不再是第三处能改值的地方）。
 *
 * 这一轮（创作者最后一句话之后）助手动过的那几颗：取**第一次**动它之前的值（那一步的
 * `inverse`），新值由卡按工作台现值写（工作台是真值）。撤销过的步不算。
 * ⚠ 值是原值（模型 id、比例串、张数的数字串）；`null` = 改之前那一格没设（模型默认）。
 *   没出现的那颗 = 这一轮没动过它，卡上只写现值、不画箭头。
 */
export type StudioOperatorKnobOrigins = Partial<
  Record<StudioOperatorGenerateKnob, string | null>
>

export function operatorTurnKnobOrigins(
  entries: readonly StudioOperatorThreadEntry[],
): StudioOperatorKnobOrigins {
  const origins: StudioOperatorKnobOrigins = {}
  const keep = (knob: StudioOperatorGenerateKnob, value: string | null) => {
    if (!(knob in origins)) origins[knob] = value
  }
  const lastUser = entries.findLastIndex((entry) => entry.kind === 'user')
  for (const entry of entries.slice(lastUser + 1)) {
    if (entry.kind !== 'step' || entry.undone) continue
    const step = entry.step
    if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) continue
    switch (step.tool) {
      case TOOL.setModel:
        keep(KNOB.model, step.inverse.modelId)
        break
      case TOOL.setSpecs:
        keep(KNOB.aspect, step.inverse.aspectRatio)
        keep(KNOB.resolution, step.inverse.resolution)
        break
      case TOOL.setVideoSpecs:
        keep(KNOB.aspect, step.inverse.aspectRatio)
        keep(KNOB.resolution, step.inverse.resolution)
        break
      case TOOL.setCount:
        keep(KNOB.count, String(step.inverse.count))
        break
      default:
        break
    }
  }
  return origins
}
