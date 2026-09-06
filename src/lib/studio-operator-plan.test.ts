import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_PLAN_CARD_MIN_STEPS,
  ASSISTANT_PLAN_REQUEST_REASON_IDS,
} from '@/constants/assistant-operator'
import { shouldShowPlanCard } from '@/lib/studio-operator-plan'
import type { AssistantOperatorPlanRequestEvent } from '@/types/assistant-operator'

/**
 * 计划卡出卡判据（§5「客户端硬判」）。
 *
 * ⚠ 最后那条（四条都不成立 → 不出卡）是这份测试**最值得留**的一条：前四条写错了
 * 用户会看见一张多余的卡，最后一条写错了每改一句提示词都先弹一张卡 —— 后者会让
 * 整个面板变成一个问卷机器。
 */

function buildPlan(
  overrides: Partial<AssistantOperatorPlanRequestEvent> = {},
): AssistantOperatorPlanRequestEvent {
  return {
    type: 'plan_request',
    steps: [
      { id: 'plan-1', label: '写提示词' },
      { id: 'plan-2', label: '挂参考图' },
    ],
    questions: [],
    estimate: {},
    reason: ASSISTANT_PLAN_REQUEST_REASON_IDS.multiStep,
    ...overrides,
  }
}

describe('shouldShowPlanCard', () => {
  it('「先问我」开着就无条件出卡 —— 哪怕只有一步', () => {
    expect(
      shouldShowPlanCard(
        buildPlan({ steps: [{ id: 'plan-1', label: '改一句' }] }),
        {
          forcePlan: true,
        },
      ),
    ).toBe(true)
  })

  it('这一轮要花钱就出卡 —— 步数再少也拦一下', () => {
    expect(
      shouldShowPlanCard(
        buildPlan({
          steps: [{ id: 'plan-1', label: '发出去' }],
          reason: ASSISTANT_PLAN_REQUEST_REASON_IDS.spend,
        }),
        {},
      ),
    ).toBe(true)
  })

  it(`步数 ≥ ${ASSISTANT_PLAN_CARD_MIN_STEPS} 出卡`, () => {
    const steps = Array.from(
      { length: ASSISTANT_PLAN_CARD_MIN_STEPS },
      (_, index) => ({ id: `plan-${index + 1}`, label: `第 ${index + 1} 步` }),
    )
    expect(shouldShowPlanCard(buildPlan({ steps }), {})).toBe(true)
  })

  it('⭐ 有反问题就出卡 —— 哪怕只有一步、不花钱', () => {
    expect(
      shouldShowPlanCard(
        buildPlan({
          steps: [{ id: 'plan-1', label: '写提示词' }],
          questions: [
            {
              id: 'question-1',
              header: '风格',
              question: '要哪种画风？',
              multiSelect: false,
              allowOther: true,
              options: [
                {
                  id: 'option-1-1',
                  label: '3D 游戏渲染',
                  description: '接近官方立绘的引擎质感。',
                },
                {
                  id: 'option-1-2',
                  label: '厚涂',
                  description: '笔触留得住，像插画。',
                },
              ],
            },
          ],
        }),
        {},
      ),
    ).toBe(true)
  })

  it('⛔ 四条都不成立就不出卡（不花钱 · 步数不够 · 没问题 · 没开先问我）', () => {
    expect(shouldShowPlanCard(buildPlan(), {})).toBe(false)
    // 「先问我」显式关掉与缺席是同一件事。
    expect(shouldShowPlanCard(buildPlan(), { forcePlan: false })).toBe(false)
  })
})
