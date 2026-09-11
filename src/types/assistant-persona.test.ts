import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_PERSONA_DEFAULTS,
  ASSISTANT_PERSONA_LIMITS,
  ASSISTANT_ROUTE_MODEL_AUTO,
  getAssistantRouteModelEntry,
} from '@/constants/assistant-persona'
import { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } from '@/constants/node-studio'
import {
  ASSISTANT_SOURCE_ALLOWLIST_LIMITS,
  PROJECT_RULE_KIND_IDS,
} from '@/constants/assistant-operator'
import {
  CreateProjectRuleSchema,
  ProjectRuleSchema,
  UpdateAssistantPersonaSchema,
} from '@/types/assistant-persona'
import { AssistantOperatorRequestSchema } from '@/types/assistant-operator'

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
  nextStepHint: ASSISTANT_PERSONA_DEFAULTS.nextStepHint,
  useMyWords: ASSISTANT_PERSONA_DEFAULTS.useMyWords,
  addressUserAs: ASSISTANT_PERSONA_DEFAULTS.addressUserAs,
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

/**
 * v2 §11.3 的三项（commit #15）—— 两个开关**不可空**、称呼是可空短字符串。
 */
describe('AssistantPersona 的三项用户偏好', () => {
  const WITH_MODEL = { ...BASE, routeModel: ASSISTANT_ROUTE_MODEL_AUTO }

  it('两个开关缺席即拒 —— 少递一列会把用户的选择打回默认', () => {
    for (const key of ['nextStepHint', 'useMyWords'] as const) {
      const payload: Record<string, unknown> = { ...WITH_MODEL }
      delete payload[key]
      expect(UpdateAssistantPersonaSchema.safeParse(payload).success).toBe(
        false,
      )
    }
  })

  it('开关只收布尔，⛔ 不收 null / 字符串', () => {
    for (const bad of [null, 'true', 1]) {
      expect(
        UpdateAssistantPersonaSchema.safeParse({
          ...WITH_MODEL,
          nextStepHint: bad,
        }).success,
      ).toBe(false)
    }
  })

  it('称呼：null 收，正常短串收，空串与超长拒', () => {
    expect(
      UpdateAssistantPersonaSchema.safeParse({
        ...WITH_MODEL,
        addressUserAs: null,
      }).success,
    ).toBe(true)
    expect(
      UpdateAssistantPersonaSchema.safeParse({
        ...WITH_MODEL,
        addressUserAs: '阿羊',
      }).success,
    ).toBe(true)
    for (const bad of [
      '',
      '   ',
      'x'.repeat(ASSISTANT_PERSONA_LIMITS.maxAddressUserAsChars + 1),
    ]) {
      expect(
        UpdateAssistantPersonaSchema.safeParse({
          ...WITH_MODEL,
          addressUserAs: bad,
        }).success,
      ).toBe(false)
    }
  })

  /** ⚠ 代码默认值与库上的 `@default` 必须逐字一致（两处漂 = 两个助手）。 */
  it('默认值：下一步建议关、用我的词开、称呼为空', () => {
    expect(ASSISTANT_PERSONA_DEFAULTS.nextStepHint).toBe(false)
    expect(ASSISTANT_PERSONA_DEFAULTS.useMyWords).toBe(true)
    expect(ASSISTANT_PERSONA_DEFAULTS.addressUserAs).toBeNull()
  })
})

/**
 * **来源白 / 黑名单**的 schema 那一半（assistant-shell-v2 §9.3）。
 *
 * ⚠ 钉的是「来源类规则收的是来源 id 或域名，⛔ 不是一句话」——收下一句话的表现
 * 是名单里永远有一条匹配不到任何东西，而用户以为自己设了闸。
 */
describe('项目规则 · kind 与来源 token（v2 §9.3）', () => {
  it('缺省 kind = 普通规则，原文一个字都不动', () => {
    const parsed = CreateProjectRuleSchema.safeParse({
      text: '  画面里不要出现文字  ',
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.kind).toBe(PROJECT_RULE_KIND_IDS.note)
    expect(parsed.success && parsed.data.text).toBe('画面里不要出现文字')
  })

  it('来源类规则把地址收成域名：协议头 / 路径 / www 都剥掉', () => {
    const parsed = CreateProjectRuleSchema.safeParse({
      text: 'https://WWW.Danbooru.donmai.us/posts?tags=x',
      kind: PROJECT_RULE_KIND_IDS.sourceAllow,
    })
    expect(parsed.success && parsed.data.text).toBe('danbooru.donmai.us')
  })

  it('来源类规则收不下一句话', () => {
    for (const kind of [
      PROJECT_RULE_KIND_IDS.sourceAllow,
      PROJECT_RULE_KIND_IDS.sourceDeny,
    ]) {
      expect(
        CreateProjectRuleSchema.safeParse({ text: '只信官方设定集', kind })
          .success,
      ).toBe(false)
    }
  })

  it('读回来的规则缺 kind 时当普通规则，⛔ 不判成读不出来', () => {
    const parsed = ProjectRuleSchema.safeParse({
      id: 'rule-1',
      scope: null,
      text: '画面里不要出现文字',
      source: 'creator',
      createdAt: '2026-09-10T00:00:00.000Z',
    })
    expect(parsed.success && parsed.data.kind).toBe(PROJECT_RULE_KIND_IDS.note)
  })
})

/** 单轮临时白名单（§9.3 的「+」菜单那一半）走的是同一把刀。 */
describe('请求体 · sourceAllowlist（v2 §9.3）', () => {
  const BASE = {
    messages: [{ role: 'user' as const, content: '查一下' }],
    domain: 'image' as const,
    snapshot: { prompt: '', availableModels: [] },
  }

  it('每一条收成域名或来源 id；⛔ 一句话进不来', () => {
    const ok = AssistantOperatorRequestSchema.safeParse({
      ...BASE,
      sourceAllowlist: ['wiki', 'https://Danbooru.donmai.us/posts'],
    })
    expect(ok.success && ok.data.sourceAllowlist).toEqual([
      'wiki',
      'danbooru.donmai.us',
    ])

    expect(
      AssistantOperatorRequestSchema.safeParse({
        ...BASE,
        sourceAllowlist: ['只信官方设定集'],
      }).success,
    ).toBe(false)
  })

  it('超过上限整条拒，⛔ 不静默截断', () => {
    expect(
      AssistantOperatorRequestSchema.safeParse({
        ...BASE,
        sourceAllowlist: Array.from(
          { length: ASSISTANT_SOURCE_ALLOWLIST_LIMITS.maxPerTurn + 1 },
          (_, index) => `site${index}.example`,
        ),
      }).success,
    ).toBe(false)
  })
})
