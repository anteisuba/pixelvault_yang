import { describe, expect, it } from 'vitest'

import { GENERATION_ERROR_CODES } from '@/constants/generation-errors'
import enMessages from '@/messages/en.json'
import jaMessages from '@/messages/ja.json'
import zhMessages from '@/messages/zh.json'

/**
 * 每个生成错误码都要有三语文案 —— 否则用户看到的是 key 路径本身。
 *
 * ── 为什么值得单开一个测试 ─────────────────────────────────────────────
 * 2026-08-22 真机撞到：本地执行 worker 没起，弹窗上写的是
 * 「Errors.generation.execution_worker_unavailable」。next-intl 查不到 key 时
 * **把 key 路径当文案渲染**，所以「忘了写翻译」的表现不是报错、不是空白，而是
 * 一行乱码直接摆在用户面前。当时一共漏了四个码（execution_worker_unavailable ·
 * lora_incompatible_hosted · runner_monthly_limit_exceeded ·
 * runner_lora_unavailable），全量 tsc 与全量 vitest 都照过 —— 没有任何一道闸看得见。
 *
 * ⚠ 渲染侧那道 `tErrors.has()` 守卫（`StudioGenerationErrorDialog`）是**兜底**，
 *   不是许可：它把乱码换成「未知错误」，用户仍然拿不到那句该有的说明。真正的
 *   修法是把文案写齐，所以判据留在这里。
 *
 * ⚠ 断言到「非空字符串」而不是「键存在」：`"": ""` 这种占位同样会让弹窗空着。
 */
const LOCALES = {
  zh: zhMessages,
  en: enMessages,
  ja: jaMessages,
} as const

describe('生成错误码 × 三语文案', () => {
  const codes = Object.values(GENERATION_ERROR_CODES)

  it('码表本身不为空（防空转：码表读空了下面的循环会一条都不跑）', () => {
    expect(codes.length).toBeGreaterThan(15)
  })

  for (const [locale, messages] of Object.entries(LOCALES)) {
    it(`${locale}：每个错误码都有非空文案`, () => {
      const generation = (
        messages as { Errors: { generation: Record<string, string> } }
      ).Errors.generation
      const missing = codes.filter(
        (code) => typeof generation[code] !== 'string' || !generation[code],
      )
      expect(missing).toEqual([])
    })
  }

  it('三语的 Errors.generation 键集逐键一致', () => {
    const [zh, en, ja] = (['zh', 'en', 'ja'] as const).map((locale) =>
      Object.keys(
        (LOCALES[locale] as { Errors: { generation: Record<string, string> } })
          .Errors.generation,
      ).sort(),
    )
    expect(en).toEqual(zh)
    expect(ja).toEqual(zh)
  })
})
