import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_PERSONA_DEFAULTS,
  ASSISTANT_ROUTE_MODEL_AUTO,
  getAssistantRouteModelEntry,
} from '@/constants/assistant-persona'
import { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } from '@/constants/node-studio'
import { UpdateAssistantPersonaSchema } from '@/types/assistant-persona'

/**
 * 文本模型 chip 的持久化字段（v2 §4.5）。
 *
 * ⚠ 这里问的是**边界**：词表 = 「自动」+ 路由表的全部条目，名单外的值必须被拒，
 * ⛔ 不静默回落 —— 回落发生在**读**那一跳（存量行悬空 id），写入口不该放行。
 */

const BASE = {
  name: null,
  avatarPreset: null,
  tone: ASSISTANT_PERSONA_DEFAULTS.tone,
  toneCustom: null,
  verbosity: ASSISTANT_PERSONA_DEFAULTS.verbosity,
  planMode: ASSISTANT_PERSONA_DEFAULTS.planMode,
  language: ASSISTANT_PERSONA_DEFAULTS.language,
}

describe('AssistantPersona.routeModel', () => {
  it('「自动」与路由表里的每一条都收', () => {
    expect(
      UpdateAssistantPersonaSchema.safeParse({
        ...BASE,
        routeModel: ASSISTANT_ROUTE_MODEL_AUTO,
      }).success,
    ).toBe(true)

    for (const model of NODE_STUDIO_ASSISTANT_ROUTE_MODELS) {
      expect(
        UpdateAssistantPersonaSchema.safeParse({
          ...BASE,
          routeModel: model.modelId,
        }).success,
      ).toBe(true)
    }
  })

  it('名单外的值一律拒（含已退役的模型 id 与空串）', () => {
    for (const bad of ['qwen3-max', 'gpt-4', '', 'AUTO']) {
      expect(
        UpdateAssistantPersonaSchema.safeParse({ ...BASE, routeModel: bad })
          .success,
      ).toBe(false)
    }
  })

  it('缺这一格也拒 —— 少递一列会把用户的选择打回自动', () => {
    expect(UpdateAssistantPersonaSchema.safeParse(BASE).success).toBe(false)
  })

  it('词表 = 路由表，⛔ 不是手抄的第二份名单', () => {
    for (const model of NODE_STUDIO_ASSISTANT_ROUTE_MODELS) {
      expect(getAssistantRouteModelEntry(model.modelId)).toEqual(model)
    }
    expect(getAssistantRouteModelEntry(ASSISTANT_ROUTE_MODEL_AUTO)).toBeNull()
    expect(getAssistantRouteModelEntry(null)).toBeNull()
    expect(getAssistantRouteModelEntry('qwen3-max')).toBeNull()
  })
})
