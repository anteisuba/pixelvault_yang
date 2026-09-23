import {
  STUDIO_OPERATOR_GENERATE_KNOB_IDS,
  type StudioOperatorGenerateKnob,
} from '@/constants/studio-assistant-operator'
import type { StudioOperatorGenerationControls } from '@/types/studio-assistant-operator'

/** 一颗旋钮摆什么：读数 + 候选表。⚠ 候选空 = 这个模型没有它，这一颗不画。 */
export interface StudioOperatorKnobSpec {
  id: StudioOperatorGenerateKnob
  /** chip 上写的那串（张数是「3 张」，模型是标签）。 */
  value: string
  /** 打勾比的那一份原值（张数是 `"3"`，模型是 id）。 */
  current: string
  options: readonly { value: string; label: string }[]
}

/**
 * 工作台此刻的四颗旋钮（模型 · 比例 · 张数 · 清晰度）—— 确认卡与输入框上方的
 * 规格行共用这一份（D12 B6）。
 *
 * ⭐ 真值只有 `controls`（宿主现算的工作台读数），⛔ 两处不各攒一份档位表。
 * ⚠ 候选空或读数空的那一颗不给：一颗什么都没写、或点开没得选的旋钮比没有更难读。
 */
export function buildOperatorKnobSpecs(
  controls: StudioOperatorGenerationControls,
  countLabel: (count: number) => string,
): readonly StudioOperatorKnobSpec[] {
  const choices = controls.choicesByModel[controls.model?.id ?? ''] ?? {
    aspectRatios: [],
    resolutions: [],
    counts: [],
  }
  const knobs: StudioOperatorKnobSpec[] = [
    {
      id: STUDIO_OPERATOR_GENERATE_KNOB_IDS.model,
      value: controls.model?.label ?? '',
      current: controls.model?.id ?? '',
      options: controls.models.map((model) => ({
        value: model.id,
        label: model.label,
      })),
    },
    {
      id: STUDIO_OPERATOR_GENERATE_KNOB_IDS.aspect,
      value: controls.aspectRatio,
      current: controls.aspectRatio,
      options: choices.aspectRatios.map((ratio) => ({
        value: ratio,
        label: ratio,
      })),
    },
    {
      id: STUDIO_OPERATOR_GENERATE_KNOB_IDS.count,
      value: countLabel(controls.count),
      current: String(controls.count),
      options: choices.counts.map((count) => ({
        value: String(count),
        label: countLabel(count),
      })),
    },
    {
      id: STUDIO_OPERATOR_GENERATE_KNOB_IDS.resolution,
      value: controls.resolution ?? '',
      current: controls.resolution ?? '',
      options: choices.resolutions.map((resolution) => ({
        value: resolution,
        label: resolution,
      })),
    },
  ]
  return knobs.filter(
    (knob) => knob.options.length > 0 && knob.value.length > 0,
  )
}
