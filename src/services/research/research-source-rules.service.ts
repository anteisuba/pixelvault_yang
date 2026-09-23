import 'server-only'

import {
  ASSISTANT_RESEARCH_SOURCES,
  ASSISTANT_RESEARCH_SOURCE_IDS,
  PROJECT_RULE_KIND_IDS,
  type AssistantResearchSource,
} from '@/constants/assistant-operator'
import type { ResearchSourceId } from '@/constants/research'
import { SOURCE_GROUP_MEMBERS } from '@/services/research/research-fanout.service'
import {
  normalizeProjectRuleSourceToken,
  type ProjectRule,
} from '@/types/assistant-persona'

/**
 * **来源白 / 黑名单**（assistant-shell-v2 §9.3）—— 名单 → 这一轮真的能打谁。
 *
 * ── 为什么这一层是纯函数 ──────────────────────────────────────────
 * 名单从库里读（`project-rule.service`），打源在扇出层（`research-fanout`），
 * 而「名单怎么变成一份源清单」是两者之间的一条判断。放在工具环里写就是把同一段
 * 判断在查证与找图两处各抄一遍，而那两处**必须**得出同一个答案：用户屏蔽掉的站
 * 在查证里不出现、在找图里照样出现，等于这条闸不存在。
 *
 * ── 三条硬纪律（逐条对着 §9.3）────────────────────────────────────
 *  ① 白名单**非空时只打名单内的源**，⛔ 不偷偷扩源（「再多找几个源」也不例外 ——
 *    那颗按钮说的是「这几条不够」，不是「我收回我设的名单」）；
 *  ② 黑名单**任何时候**都过滤掉，白名单里也写了也照样滤（用户两边都写了，
 *    说明后写的那次改了主意，而屏蔽是更强的那一条）；
 *  ③ 打不到时**如实说**：清单被清空了就把这件事写进观察，⛔ 不静默回落成
 *    「什么都没查到」—— 那句话会让助手以为这个问题查不到，然后开始编。
 */

/** 名单一条装的是来源 id 还是域名 —— 两者的匹配方式完全不同。 */
function isSourceGroupToken(token: string): token is AssistantResearchSource {
  return ASSISTANT_RESEARCH_SOURCES.some((source) => source === token)
}

/** `zh.moegirl.org.cn` 命中 `moegirl.org.cn`，⛔ 但不命中 `moegirl.org.cn.evil.com`。 */
export function matchesDomainToken(
  host: string | undefined,
  token: string,
): boolean {
  if (!host) return false
  const normalized = normalizeProjectRuleSourceToken(host)
  return normalized === token || normalized.endsWith(`.${token}`)
}

/** 一条 URL 的主机名。⚠ 取不到就是 `undefined`，⛔ 不回落成整条串去比。 */
export function hostOfUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname || undefined
  } catch {
    return undefined
  }
}

/** 真源 id（`moegirl` / `web_search` …）→ 它属于哪一组（`wiki` / `web` …）。 */
const GROUP_BY_SOURCE_ID = new Map<ResearchSourceId, AssistantResearchSource>(
  ASSISTANT_RESEARCH_SOURCES.flatMap((group) =>
    SOURCE_GROUP_MEMBERS[group].map(
      (sourceId) =>
        [sourceId, group] as [ResearchSourceId, AssistantResearchSource],
    ),
  ),
)

export interface SourceRuleFilter {
  /** 白名单里点名的来源组。 */
  allowSources: AssistantResearchSource[]
  /** 白名单里点名的域名。 */
  allowDomains: string[]
  denySources: AssistantResearchSource[]
  denyDomains: string[]
  /** 白名单非空吗 —— 三条纪律的第 ① 条只在这时生效。 */
  hasAllowlist: boolean
  /** 这一轮的白名单是创作者在话里临时指的那份吗（说给用户听时口径不同）。 */
  allowlistIsTemporary: boolean
}

/** 库里的名单 → 闸。 */
export function buildSourceRuleFilter(
  rules: readonly ProjectRule[],
): SourceRuleFilter {
  const persisted = { sources: [] as string[], domains: [] as string[] }
  const denied = { sources: [] as string[], domains: [] as string[] }

  for (const rule of rules) {
    const token = normalizeProjectRuleSourceToken(rule.text)
    if (!token) continue
    const bucket =
      rule.kind === PROJECT_RULE_KIND_IDS.sourceAllow
        ? persisted
        : rule.kind === PROJECT_RULE_KIND_IDS.sourceDeny
          ? denied
          : null
    if (!bucket) continue
    if (isSourceGroupToken(token)) bucket.sources.push(token)
    else bucket.domains.push(token)
  }

  const allowSources = [
    ...new Set(persisted.sources.filter(isSourceGroupToken)),
  ] as AssistantResearchSource[]
  const allowDomains = [...new Set(persisted.domains)]

  return {
    allowSources,
    allowDomains,
    denySources: [
      ...new Set(denied.sources.filter(isSourceGroupToken)),
    ] as AssistantResearchSource[],
    denyDomains: [...new Set(denied.domains)],
    hasAllowlist: allowSources.length > 0 || allowDomains.length > 0,
    allowlistIsTemporary: false,
  }
}

/**
 * 创作者在话里临时指的那几个来源（D12 U3：「只在 danbooru 查」）并进闸。
 *
 * ⚠ **临时名单优先**（§9.3）：他这一句话比三周前写下的白名单更能说明这一轮要
 * 什么，所以它**顶掉**库里那份白名单。⛔ 但顶不掉黑名单：屏蔽是「永远别给我这个
 * 站」，不是「这一轮先不要」。
 */
export function withTurnAllowlist(
  filter: SourceRuleFilter,
  tokens: readonly string[],
): SourceRuleFilter {
  const temporary = tokens.map(normalizeProjectRuleSourceToken).filter(Boolean)
  if (temporary.length === 0) return filter
  const allowSources = [
    ...new Set(temporary.filter(isSourceGroupToken)),
  ] as AssistantResearchSource[]
  const allowDomains = [
    ...new Set(temporary.filter((token) => !isSourceGroupToken(token))),
  ]
  return {
    ...filter,
    allowSources,
    allowDomains,
    hasAllowlist: true,
    allowlistIsTemporary: true,
  }
}

/** 这个闸有内容吗 —— 没有的话每一条过滤都该直接短路（常态）。 */
export function hasSourceRules(filter: SourceRuleFilter): boolean {
  return (
    filter.hasAllowlist ||
    filter.denySources.length > 0 ||
    filter.denyDomains.length > 0
  )
}

/**
 * 选源那一步的闸：想打的那几组 → 真的能打的那几组。
 *
 * ⚠ 白名单里只写了域名（没写来源组）时**放行网搜**：域名只有网搜够得着，
 * 不放行的表现是「用户指名要 danbooru.donmai.us，助手一个源都打不了」。
 * ⛔ 这不是扩源 —— 结果照样按域名滤一遍（`filterEvidenceIndices`）。
 */
export function filterResearchSources(
  requested: readonly AssistantResearchSource[],
  filter: SourceRuleFilter,
): { sources: AssistantResearchSource[]; dropped: AssistantResearchSource[] } {
  if (!hasSourceRules(filter)) return { sources: [...requested], dropped: [] }

  const allowed = filter.hasAllowlist
    ? requested.filter(
        (source) =>
          filter.allowSources.includes(source) ||
          (filter.allowDomains.length > 0 &&
            source === ASSISTANT_RESEARCH_SOURCE_IDS.web),
      )
    : [...requested]

  const sources = allowed.filter(
    (source) => !filter.denySources.includes(source),
  )
  const dropped = requested.filter((source) => !sources.includes(source))
  return { sources, dropped }
}

/**
 * 结果那一步的闸：留下哪几条（按**下标**回答，因为证据投影与原件逐项同序）。
 *
 * ⚠ 判据喂的是**发布域名**，与「能不能当生成输入」那张判定表同一条纪律：
 * 图床与作品页常常不同域，而用户写进名单的是后者。
 */
export function filterEvidenceIndices(
  items: readonly { sourceId: ResearchSourceId; url?: string }[],
  filter: SourceRuleFilter,
): number[] {
  if (!hasSourceRules(filter)) return items.map((_, index) => index)

  const kept: number[] = []
  items.forEach((item, index) => {
    const host = hostOfUrl(item.url)
    const group = GROUP_BY_SOURCE_ID.get(item.sourceId)
    if (group && filter.denySources.includes(group)) return
    if (filter.denyDomains.some((token) => matchesDomainToken(host, token)))
      return
    if (!filter.hasAllowlist) {
      kept.push(index)
      return
    }
    const allowedByGroup = group ? filter.allowSources.includes(group) : false
    const allowedByDomain = filter.allowDomains.some((token) =>
      matchesDomainToken(host, token),
    )
    if (allowedByGroup || allowedByDomain) kept.push(index)
  })
  return kept
}

/**
 * 联网找图那一条的闸（§9.3 的「fanout 结果」另一半）——它整条就是网搜，
 * 所以只有域名判据。
 *
 * ⚠ 白名单只点了别的来源组（连 `web` 都没点）时**一张都不放行**：用户说的是
 * 「只信这几个」，而这条工具够不着它们。这时该说的是那句实话，⛔ 不是照常给图。
 */
export function isWebImageAllowed(
  domainOrUrl: string | undefined,
  filter: SourceRuleFilter,
): boolean {
  if (!hasSourceRules(filter)) return true
  const host = hostOfUrl(domainOrUrl) ?? domainOrUrl
  if (filter.denySources.includes(ASSISTANT_RESEARCH_SOURCE_IDS.web))
    return false
  if (filter.denyDomains.some((token) => matchesDomainToken(host, token)))
    return false
  if (!filter.hasAllowlist) return true
  if (filter.allowSources.includes(ASSISTANT_RESEARCH_SOURCE_IDS.web))
    return true
  return filter.allowDomains.some((token) => matchesDomainToken(host, token))
}

/**
 * 名单摊成一行人话 —— 观察与系统提示都印它，⛔ 两处不许各写一份。
 */
export function describeSourceRules(filter: SourceRuleFilter): string {
  const parts: string[] = []
  if (filter.hasAllowlist) {
    parts.push(
      `only these sources${filter.allowlistIsTemporary ? ' (chosen for this turn)' : ''}: ${[
        ...filter.allowSources,
        ...filter.allowDomains,
      ].join(', ')}`,
    )
  }
  if (filter.denySources.length > 0 || filter.denyDomains.length > 0) {
    parts.push(
      `never these: ${[...filter.denySources, ...filter.denyDomains].join(', ')}`,
    )
  }
  return parts.join(' · ')
}
