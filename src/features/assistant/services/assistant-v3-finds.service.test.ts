import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { ASSISTANT_RESEARCH_LIMITS } from '@/constants/assistant-operator'

import { sourcesOfStepResult } from './assistant-v3-finds.service'

const PAGE = 'https://harrypotter.fandom.com/wiki/Ronald_Weasley'

/**
 * ⭐ `read_url` 的最后一条退路（2026-10-15）：再读一页被站点挡了时只交那一页的**搜索摘要**。
 *   v3 每一跳的 run 是新的，摘要跟着资料号 `[n]` 搬进本轮记录、下一跳再放回来。
 */
describe('查证过的页的搜索摘要跟着 [n] 走', () => {
  it('⭐ 步骤结果 → 资料号对照表时带上这一跳记下的搜索摘要（读全文之前的那一段）', () => {
    const snippets: NonNullable<Parameters<typeof sourcesOfStepResult>[1]> =
      new Map([
        [
          PAGE,
          { title: 'Ronald Weasley', snippet: '柳木，十四英寸。'.repeat(40) },
        ],
      ])
    const result = {
      evidence: [
        // 快搜读到的正文顶掉了证据上的 snippet —— 对照表里存的是搜索摘要，⛔ 不是它。
        { cite: 1, title: 'Ronald Weasley', url: PAGE, snippet: 'PAGE-BODY' },
        { cite: 2, title: 'Tag counts', snippet: 'ron_weasley 1200' },
      ],
    }
    const sources = sourcesOfStepResult(result, snippets)
    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({ cite: 1, url: PAGE })
    expect(sources[0]?.snippet).toMatch(/^柳木，十四英寸。/)
    expect(sources[0]?.snippet?.length).toBeLessThanOrEqual(
      ASSISTANT_RESEARCH_LIMITS.maxEvidenceSnippetChars,
    )
    expect(sourcesOfStepResult(result)[0]).not.toHaveProperty('snippet')
  })
})
