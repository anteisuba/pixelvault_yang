import { describe, expect, it } from 'vitest'

import {
  EVIDENCE_CREDIBILITY_IDS,
  RESEARCH_CHARACTER_QUERY_SUFFIXES,
  judgeEvidenceCredibility,
} from '@/constants/research'

/**
 * 证据的可信度分级（2026-09-07）。
 *
 * 🔬 owner 真机打回的那一格：`ananta.163.com` / `www.anantagame.com` 是发行方
 * 自己的站，却与个人博客一样显示「资料」。
 */
describe('judgeEvidenceCredibility', () => {
  it('⭐ 权利方自己的域名 → 官方（子域也算）', () => {
    expect(judgeEvidenceCredibility('https://ananta.163.com/m/')).toBe(
      EVIDENCE_CREDIBILITY_IDS.official,
    )
    expect(judgeEvidenceCredibility('www.anantagame.com')).toBe(
      EVIDENCE_CREDIBILITY_IDS.official,
    )
    expect(judgeEvidenceCredibility('https://zh-cht.anantagame.com/x')).toBe(
      EVIDENCE_CREDIBILITY_IDS.official,
    )
  })

  it('平台上的官方页 → 官方转载', () => {
    expect(judgeEvidenceCredibility('https://www.taptap.cn/app/383874')).toBe(
      EVIDENCE_CREDIBILITY_IDS.officialMirror,
    )
  })

  it('百科 / 图库 → 资料', () => {
    expect(judgeEvidenceCredibility('https://zh.wikipedia.org/wiki/x')).toBe(
      EVIDENCE_CREDIBILITY_IDS.reference,
    )
    expect(judgeEvidenceCredibility('https://danbooru.donmai.us/posts')).toBe(
      EVIDENCE_CREDIBILITY_IDS.reference,
    )
  })

  it('⭐ 玩家 wiki 压过它所在平台的官方档（次序是判据的一部分）', () => {
    // ⚠ `wiki.biligame.com` ⊂ `biligame.com`，先查社区表才不会被当成官方转载。
    expect(judgeEvidenceCredibility('https://wiki.biligame.com/ys/x')).toBe(
      EVIDENCE_CREDIBILITY_IDS.communityDigest,
    )
    expect(judgeEvidenceCredibility('https://www.biligame.com/detail/')).toBe(
      EVIDENCE_CREDIBILITY_IDS.officialMirror,
    )
  })

  it('⛔ 未知域名回落到玩家整理，⛔ 不回落到「资料」', () => {
    // 🔬 owner 那一轮里未知域名显示成「资料」，于是个人整理页与维基条目在卡片上
    //    长得一模一样。
    expect(judgeEvidenceCredibility('https://mugendai-matome.com/260/')).toBe(
      EVIDENCE_CREDIBILITY_IDS.communityDigest,
    )
    expect(judgeEvidenceCredibility(undefined)).toBe(
      EVIDENCE_CREDIBILITY_IDS.communityDigest,
    )
    expect(judgeEvidenceCredibility('not a url')).toBe(
      EVIDENCE_CREDIBILITY_IDS.communityDigest,
    )
  })
})

describe('RESEARCH_CHARACTER_QUERY_SUFFIXES', () => {
  it('中文与日文各一条 —— 一手立绘发在这两个语种的渠道里', () => {
    expect(RESEARCH_CHARACTER_QUERY_SUFFIXES.zh).toBe('角色 设定')
    expect(RESEARCH_CHARACTER_QUERY_SUFFIXES.ja).toBe('キャラクター')
  })
})
