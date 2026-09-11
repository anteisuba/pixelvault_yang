import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { PROJECT_RULE_KIND_IDS } from '@/constants/assistant-operator'
import {
  buildSourceRuleFilter,
  describeSourceRules,
  filterEvidenceIndices,
  filterResearchSources,
  isWebImageAllowed,
  matchesDomainToken,
} from '@/services/research/research-source-rules.service'
import type { ProjectRule } from '@/types/assistant-persona'

/**
 * 来源白 / 黑名单的那把闸（assistant-shell-v2 §9.3）。
 *
 * ⚠ 这一层是**纯函数**：它不读库、不打源。用例钉的是三条纪律
 * （白名单只留名单内 / 黑名单永远剔除 / 临时名单顶掉持久白名单），
 * ⛔ 不是「函数被调到了」。
 */

function rule(kind: ProjectRule['kind'], text: string): ProjectRule {
  return {
    id: `rule-${kind}-${text}`,
    scope: null,
    text,
    kind,
    source: 'creator',
    createdAt: '2026-09-10T00:00:00.000Z',
  }
}

describe('来源名单 · 解析', () => {
  it('来源 id 与域名分进两格，普通规则一条都不进', () => {
    const filter = buildSourceRuleFilter([
      rule(PROJECT_RULE_KIND_IDS.sourceAllow, 'wiki'),
      rule(PROJECT_RULE_KIND_IDS.sourceAllow, 'danbooru.donmai.us'),
      rule(PROJECT_RULE_KIND_IDS.sourceDeny, 'pinterest.com'),
      rule(PROJECT_RULE_KIND_IDS.note, '画面里不要出现文字'),
    ])

    expect(filter.allowSources).toEqual(['wiki'])
    expect(filter.allowDomains).toEqual(['danbooru.donmai.us'])
    expect(filter.denyDomains).toEqual(['pinterest.com'])
    expect(filter.hasAllowlist).toBe(true)
    expect(filter.allowlistIsTemporary).toBe(false)
  })

  /** 用户会原样贴一条带协议头的地址进来，而名单是拿来比域名的。 */
  it('临时名单顶掉持久白名单，但顶不掉黑名单', () => {
    const filter = buildSourceRuleFilter(
      [
        rule(PROJECT_RULE_KIND_IDS.sourceAllow, 'bilibili'),
        rule(PROJECT_RULE_KIND_IDS.sourceDeny, 'danbooru'),
      ],
      ['wiki', 'https://Danbooru.donmai.us/posts'],
    )

    expect(filter.allowSources).toEqual(['wiki'])
    expect(filter.allowDomains).toEqual(['danbooru.donmai.us'])
    expect(filter.denySources).toEqual(['danbooru'])
    expect(filter.allowlistIsTemporary).toBe(true)
  })
})

describe('来源名单 · 选源', () => {
  it('白名单非空时只留名单内的源', () => {
    const filter = buildSourceRuleFilter([
      rule(PROJECT_RULE_KIND_IDS.sourceAllow, 'wiki'),
    ])

    expect(filterResearchSources(['wiki', 'web', 'danbooru'], filter)).toEqual({
      sources: ['wiki'],
      dropped: ['web', 'danbooru'],
    })
  })

  /** 域名只有网搜够得着 —— 不放行的表现是「指名要某个站却一个源都打不了」。 */
  it('白名单只写了域名时放行网搜', () => {
    const filter = buildSourceRuleFilter([
      rule(PROJECT_RULE_KIND_IDS.sourceAllow, 'danbooru.donmai.us'),
    ])

    expect(filterResearchSources(['wiki', 'web'], filter).sources).toEqual([
      'web',
    ])
  })

  it('黑名单在没有白名单时也照样剔除', () => {
    const filter = buildSourceRuleFilter([
      rule(PROJECT_RULE_KIND_IDS.sourceDeny, 'bilibili'),
    ])

    expect(
      filterResearchSources(['wiki', 'bilibili', 'web'], filter).sources,
    ).toEqual(['wiki', 'web'])
  })

  it('名单把源全滤光时返回空清单（调用方据此如实说）', () => {
    const filter = buildSourceRuleFilter([
      rule(PROJECT_RULE_KIND_IDS.sourceAllow, 'bilibili'),
    ])

    expect(filterResearchSources(['wiki', 'web'], filter).sources).toEqual([])
  })
})

describe('来源名单 · 结果', () => {
  const ITEMS = [
    { sourceId: 'moegirl' as const, url: 'https://zh.moegirl.org.cn/a' },
    { sourceId: 'web_search' as const, url: 'https://www.pinterest.com/pin/1' },
    {
      sourceId: 'danbooru' as const,
      url: 'https://danbooru.donmai.us/posts/1',
    },
  ]

  it('黑名单域名按后缀命中，⛔ 不误伤同名前缀', () => {
    expect(matchesDomainToken('www.pinterest.com', 'pinterest.com')).toBe(true)
    expect(matchesDomainToken('pinterest.com.evil.com', 'pinterest.com')).toBe(
      false,
    )
  })

  it('黑名单域名的那条被剔掉，其余按下标返回', () => {
    const filter = buildSourceRuleFilter([
      rule(PROJECT_RULE_KIND_IDS.sourceDeny, 'pinterest.com'),
    ])

    expect(filterEvidenceIndices(ITEMS, filter)).toEqual([0, 2])
  })

  /** 白名单混着来源组与域名：两条判据是「或」，⛔ 不是「且」。 */
  it('白名单同时点了来源组与域名时两者都留', () => {
    const filter = buildSourceRuleFilter([
      rule(PROJECT_RULE_KIND_IDS.sourceAllow, 'wiki'),
      rule(PROJECT_RULE_KIND_IDS.sourceAllow, 'danbooru.donmai.us'),
    ])

    expect(filterEvidenceIndices(ITEMS, filter)).toEqual([0, 2])
  })

  it('没有名单时一条都不滤（绝大多数用户的形状）', () => {
    const filter = buildSourceRuleFilter([])
    expect(filterEvidenceIndices(ITEMS, filter)).toEqual([0, 1, 2])
    expect(isWebImageAllowed('pinterest.com', filter)).toBe(true)
    expect(describeSourceRules(filter)).toBe('')
  })
})

describe('来源名单 · 找图', () => {
  it('黑名单的站不放行；白名单只点了别的来源组时一张都不放行', () => {
    const denied = buildSourceRuleFilter([
      rule(PROJECT_RULE_KIND_IDS.sourceDeny, 'pinterest.com'),
    ])
    expect(isWebImageAllowed('www.pinterest.com', denied)).toBe(false)
    expect(isWebImageAllowed('zh.moegirl.org.cn', denied)).toBe(true)

    const wikiOnly = buildSourceRuleFilter([
      rule(PROJECT_RULE_KIND_IDS.sourceAllow, 'wiki'),
    ])
    expect(isWebImageAllowed('zh.moegirl.org.cn', wikiOnly)).toBe(false)

    const webAllowed = buildSourceRuleFilter([
      rule(PROJECT_RULE_KIND_IDS.sourceAllow, 'web'),
    ])
    expect(isWebImageAllowed('anything.example', webAllowed)).toBe(true)
  })

  it('名单摊成一行人话，临时那份说得出「这一轮」', () => {
    const filter = buildSourceRuleFilter(
      [rule(PROJECT_RULE_KIND_IDS.sourceDeny, 'pinterest.com')],
      ['wiki'],
    )

    expect(describeSourceRules(filter)).toBe(
      'only these sources (chosen for this turn): wiki · never these: pinterest.com',
    )
  })
})
