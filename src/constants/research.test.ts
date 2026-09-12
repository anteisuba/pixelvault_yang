import { describe, expect, it } from 'vitest'

import {
  EVIDENCE_CREDIBILITY_IDS,
  RESEARCH_BIOGRAPHY_QUERY_TERMS,
  RESEARCH_CHARACTER_QUERY_SUFFIXES,
  RESEARCH_QUESTION_TYPES,
  RESEARCH_STYLE_QUERY_MODIFIERS,
  biasQueriesForQuestionType,
  detectResearchQuestionType,
  judgeEvidenceCredibility,
  scoreQuestionTypeBias,
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

/**
 * **题型偏置**（2026-09-12）。🔬 实测缺口：「新海诚式黄昏光怎么描述」被改写成
 * 人物向的词、又被选源送去百科，回来的全是导演生平页。
 */
describe('detectResearchQuestionType', () => {
  it('⭐ 「怎么描述 / 怎么画」是技法题（中 / 英 / 日）', () => {
    expect(detectResearchQuestionType('新海诚式的黄昏光怎么描述')).toBe(
      RESEARCH_QUESTION_TYPES.styleTechnique,
    )
    expect(
      detectResearchQuestionType('how to describe Makoto Shinkai lighting'),
    ).toBe(RESEARCH_QUESTION_TYPES.styleTechnique)
    expect(detectResearchQuestionType('新海誠 ライティングの描き方')).toBe(
      RESEARCH_QUESTION_TYPES.styleTechnique,
    )
  })

  it('⚠ 「这个是谁 / 是什么」是条目题；两头都不像走 general', () => {
    expect(detectResearchQuestionType('新海诚是谁')).toBe(
      RESEARCH_QUESTION_TYPES.entityFacts,
    )
    expect(detectResearchQuestionType('who is Makoto Shinkai')).toBe(
      RESEARCH_QUESTION_TYPES.entityFacts,
    )
    expect(detectResearchQuestionType('帮我排一下这几张图')).toBe(
      RESEARCH_QUESTION_TYPES.general,
    )
  })

  it('⭐ 两组词同时命中时**技法优先** —— 要的是怎么画，不是他是谁', () => {
    expect(detectResearchQuestionType('新海诚是谁？他的画风怎么描述')).toBe(
      RESEARCH_QUESTION_TYPES.styleTechnique,
    )
  })
})

describe('biasQueriesForQuestionType', () => {
  it('⭐ 技法题：三语各补上技法限定词', () => {
    const biased = biasQueriesForQuestionType(
      [
        { text: '新海诚 黄昏', lang: 'zh' as const },
        { text: 'Makoto Shinkai dusk', lang: 'en' as const },
        { text: '新海誠 夕暮れ', lang: 'ja' as const },
      ],
      RESEARCH_QUESTION_TYPES.styleTechnique,
    )
    expect(biased[0]?.text).toContain(RESEARCH_STYLE_QUERY_MODIFIERS.zh[0])
    expect(biased[1]?.text).toContain(RESEARCH_STYLE_QUERY_MODIFIERS.en[1])
    expect(biased[2]?.text).toContain(RESEARCH_STYLE_QUERY_MODIFIERS.ja[2])
    // 原来的主语一个字都没丢。
    expect(biased[0]?.text).toContain('新海诚 黄昏')
  })

  it('⭐ 技法题：生平向词被**删掉**，⛔ 不是降权', () => {
    const biased = biasQueriesForQuestionType(
      [
        { text: '新海诚 生平 人物', lang: 'zh' as const },
        { text: 'Makoto Shinkai biography filmography', lang: 'en' as const },
        { text: '新海誠 経歴 プロフィール', lang: 'ja' as const },
      ],
      RESEARCH_QUESTION_TYPES.styleTechnique,
    )
    for (const query of biased) {
      for (const term of RESEARCH_BIOGRAPHY_QUERY_TERMS) {
        expect(query.text.toLowerCase()).not.toContain(term.toLowerCase())
      }
    }
  })

  it('⚠ 已经带了限定词就不再叠加；其它题型**原样返回**', () => {
    expect(
      biasQueriesForQuestionType(
        [{ text: '新海诚 画风 特征', lang: 'zh' as const }],
        RESEARCH_QUESTION_TYPES.styleTechnique,
      )[0]?.text,
    ).toBe('新海诚 画风 特征')
    const untouched = [{ text: '无限大 时夜', lang: 'zh' as const }]
    expect(
      biasQueriesForQuestionType(
        untouched,
        RESEARCH_QUESTION_TYPES.entityFacts,
      ),
    ).toEqual(untouched)
    expect(
      biasQueriesForQuestionType(untouched, RESEARCH_QUESTION_TYPES.general),
    ).toEqual(untouched)
  })
})

describe('scoreQuestionTypeBias', () => {
  it('⭐ 技法题：生平条目降权、技法/术语页升权', () => {
    expect(
      scoreQuestionTypeBias(
        RESEARCH_QUESTION_TYPES.styleTechnique,
        '新海诚 - 维基百科：生平与导演经历',
      ),
    ).toBeLessThan(0)
    expect(
      scoreQuestionTypeBias(
        RESEARCH_QUESTION_TYPES.styleTechnique,
        'Makoto Shinkai lighting breakdown — how the sky is painted',
      ),
    ).toBeGreaterThan(0)
  })

  it('⚠ 其它题型恒 0 —— ⛔ 这次偏置不许动已经验过的排序', () => {
    expect(
      scoreQuestionTypeBias(RESEARCH_QUESTION_TYPES.entityFacts, '新海诚 生平'),
    ).toBe(0)
    expect(
      scoreQuestionTypeBias(RESEARCH_QUESTION_TYPES.general, '画风 教程'),
    ).toBe(0)
  })
})
