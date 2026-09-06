import enMessages from '@/messages/en.json'
import jaMessages from '@/messages/ja.json'
import zhMessages from '@/messages/zh.json'
import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_PLAN_VISUAL_IDS,
  ASSISTANT_PLAN_VISUAL_KINDS,
  ASSISTANT_PLAN_VISUALS,
  buildAssistantPlanVisualCatalog,
  getAssistantPlanVisual,
  type AssistantPlanVisual,
} from '@/constants/assistant-plan-visuals'

/**
 * ⚠ 遍历时把它当**基类型**看，不看 `as const` 那份逐项字面量：后者是 32 个各不
 * 相同的形状，`visual.paths` 在没有 paths 的那几项上压根不存在这个属性。
 */
const VISUALS: readonly AssistantPlanVisual[] = ASSISTANT_PLAN_VISUALS

/**
 * 图示词表的结构闸（§9）。
 *
 * ⚠ 这份测试的价值全在**词表长大的那一天**：加一项而忘了给画法 / 忘了三语文案，
 * 表现是计划卡上一个空图位或一句 `planVisual.xxx.yyy` 原文 —— 两种都会一路绿灯
 * 走到真机上。
 */

const MESSAGES = { en: enMessages, ja: jaMessages, zh: zhMessages }

describe('计划卡图示词表', () => {
  it('id 唯一，且都是「组.名」两段', () => {
    expect(new Set(ASSISTANT_PLAN_VISUAL_IDS).size).toBe(
      ASSISTANT_PLAN_VISUAL_IDS.length,
    )
    for (const id of ASSISTANT_PLAN_VISUAL_IDS) {
      expect(id.split('.')).toHaveLength(2)
    }
  })

  it('⭐ 每一项**恰好**有一种画法（lucide / 自绘 / 比例 / 色块）', () => {
    for (const visual of VISUALS) {
      const ways = [
        visual.lucide,
        visual.paths,
        visual.ratio,
        visual.swatch,
      ].filter((way) => way !== undefined)
      expect(ways, `${visual.id} 的画法不是恰好一种`).toHaveLength(1)
      // 色块只走色块那一族，线描三种都归 icon 族。
      expect(visual.kind).toBe(
        visual.swatch
          ? ASSISTANT_PLAN_VISUAL_KINDS.swatch
          : ASSISTANT_PLAN_VISUAL_KINDS.icon,
      )
    }
  })

  it('⛔ 色块只用脊柱 token，一个 hex 都没有', () => {
    for (const visual of VISUALS) {
      for (const token of visual.swatch ?? []) {
        expect(
          token.startsWith('--'),
          `${visual.id} 的 ${token} 不是 token`,
        ).toBe(true)
        expect(token).not.toMatch(/#|rgb|oklch/)
      }
    }
  })

  it('三语文案都在（⛔ 少一条就是卡上一句原文键名）', () => {
    for (const [locale, messages] of Object.entries(MESSAGES)) {
      const planVisual = (
        messages as unknown as {
          StudioOperator: { planVisual: Record<string, Record<string, string>> }
        }
      ).StudioOperator.planVisual
      for (const visual of VISUALS) {
        const [group, name] = visual.labelKey.split('.')
        expect(
          planVisual[group as string]?.[name as string],
          `${locale} 缺 planVisual.${visual.labelKey}`,
        ).toBeTruthy()
      }
    }
  })

  it('词表外的 id 查不到（⛔ 不兜一个近似项）', () => {
    expect(getAssistantPlanVisual('comp.wholeThing')).toBeNull()
    expect(getAssistantPlanVisual(undefined)).toBeNull()
    expect(getAssistantPlanVisual('comp.fullBody')?.id).toBe('comp.fullBody')
  })

  it('给模型看的那份清单逐项列全（⛔ 不是一句「从词表里选」）', () => {
    const catalog = buildAssistantPlanVisualCatalog()
    for (const id of ASSISTANT_PLAN_VISUAL_IDS) {
      expect(catalog).toContain(id)
    }
  })
})
