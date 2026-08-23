import { describe, expect, it } from 'vitest'

import {
  RESEARCH_FRESHNESS,
  RESEARCH_GOALS,
  RESEARCH_SOURCE_GROUPS,
} from '@/constants/research'
import {
  extractUrlsFromText,
  planResearchHeuristically,
  stripUrls,
  withForcedSearch,
} from '@/lib/research-intent'

describe('planResearchHeuristically — URL', () => {
  it('reads the URL the user pasted instead of searching around it', () => {
    const plan = planResearchHeuristically(
      '看看这个 https://example.com/post 讲了什么',
    )

    expect(plan.shouldSearch).toBe(true)
    expect(plan.urls).toEqual(['https://example.com/post'])
    // 用户给了确切出处还去搜索，等于用二手摘要盖过一手原文
    expect(plan.queries).toHaveLength(0)
  })

  it('strips punctuation the URL regex greedily swallowed', () => {
    expect(extractUrlsFromText('见 https://example.com/a.')).toEqual([
      'https://example.com/a',
    ])
    expect(stripUrls('见 https://example.com/a 就懂了')).toBe('见 就懂了')
  })
})

// ── 一条 URL 只能被一条线认领（AI 导演内核 §4.2 / 边界 18）──────────
//
// 🔬 2026-08-21 受控复现：同一轮里 YouTube 链接被两条线同时认领，检索线赢了 ——
// `url_reader` 把 YouTube 页读回来只有一句「401 Unauthorized」，模型据此认定自己
// 拿不到视频，背出记忆里的 19:13（真值 18:40），而视频本体当时就在它上下文里
// （Gemini 实收 101,923 个视频 token）。这一组测试守的就是「检索线别再认领它」。
describe('planResearchHeuristically — 视频链接归视觉线', () => {
  it('不把 YouTube 链接交给 url_reader 去当网页读', () => {
    const plan = planResearchHeuristically(
      '这个视频有多长？https://www.youtube.com/watch?v=aircAruvnKk',
    )

    expect(plan.urls).toEqual([])
    // 剩下的话只有指示代词，没有主语可搜 —— 打源换回来的只会是无关页面，
    // 而无关证据在「数字只能来自证据」的规矩下比没有证据更危险。
    expect(plan.shouldSearch).toBe(false)
    expect(plan.queries).toHaveLength(0)
  })

  it('短链 / shorts / 视频直链同样归视觉线', () => {
    for (const text of [
      '看看 https://youtu.be/dQw4w9WgXcQ 讲了什么',
      '这个 https://www.youtube.com/shorts/dQw4w9WgXcQ 的运镜怎么做的',
      '分析一下 https://cdn.example.com/shot-01.mp4',
    ]) {
      expect(planResearchHeuristically(text).urls).toEqual([])
    }
  })

  it('中文句号粘在链接尾巴上也认得出来', () => {
    // 共享的 URL 提取只剥 ASCII 标点，中文句号会留在 URL 里 —— 归属判定必须
    // 走 `classifyVideoLink` 自带的归一化，不能自己再判一遍。
    const plan = planResearchHeuristically(
      '这个视频多长？https://www.youtube.com/watch?v=aircAruvnKk。',
    )

    expect(plan.urls).toEqual([])
  })

  it('B站 / X / 抖音的平台页仍归检索线 —— 我们不解流，靠元数据卡', () => {
    const plan = planResearchHeuristically(
      '帮我看看 https://www.bilibili.com/video/BV1GJ411x7h7 这个视频',
    )

    expect(plan.urls).toEqual(['https://www.bilibili.com/video/BV1GJ411x7h7'])
    expect(plan.shouldSearch).toBe(true)
  })

  it('一句话里既有视频链接又有普通网页时，只把网页留给检索线', () => {
    const plan = planResearchHeuristically(
      '对照 https://example.com/post 看这个 https://youtu.be/dQw4w9WgXcQ',
    )

    expect(plan.urls).toEqual(['https://example.com/post'])
  })

  it('剩下的话点名了外部主语时照常检索 —— 视觉线不联网，那部分得检索线补', () => {
    const plan = planResearchHeuristically(
      '这个视频里的角色是鸣潮的长离吗，她的发色是什么？https://youtu.be/dQw4w9WgXcQ',
    )

    expect(plan.urls).toEqual([])
    expect(plan.shouldSearch).toBe(true)
    expect(plan.sourceGroup).toBe(RESEARCH_SOURCE_GROUPS.ipCharacter)
    expect(plan.queries).toHaveLength(1)
  })
})

describe('planResearchHeuristically — 时效词', () => {
  it('opens a one-week window for "最新"', () => {
    const plan = planResearchHeuristically('最新的图像模型有哪些')

    expect(plan.shouldSearch).toBe(true)
    expect(plan.freshness).toBe(RESEARCH_FRESHNESS.week)
  })

  it('narrows to a single day for "今天"', () => {
    const plan = planResearchHeuristically('今天有什么新发布')

    expect(plan.freshness).toBe(RESEARCH_FRESHNESS.day)
  })

  it('searches quantitative questions — the model invents numbers otherwise', () => {
    // 🔬 切片 0 的 D2：先声明「我无法实时联网」，然后仍给出「大约 1,500 到
    //    2,500 张」（真值 3,644）。对冲不豁免编造。
    const plan = planResearchHeuristically('danbooru 上长离有多少张图')

    expect(plan.shouldSearch).toBe(true)
    expect(plan.sourceGroup).toBe(RESEARCH_SOURCE_GROUPS.ipCharacter)
  })

  it('lets freshness override the well-known-ecosystem shortcut', () => {
    const plan = planResearchHeuristically('最近 Civitai 上新出的底模有哪些')

    expect(plan.shouldSearch).toBe(true)
    expect(plan.sourceGroup).toBe(RESEARCH_SOURCE_GROUPS.aiEcosystem)
    expect(plan.freshness).toBe(RESEARCH_FRESHNESS.week)
  })
})

describe('planResearchHeuristically — IP / 角色', () => {
  it('routes character questions to the IP source group', () => {
    const plan = planResearchHeuristically('鸣潮长离的发色是什么')

    expect(plan.shouldSearch).toBe(true)
    expect(plan.sourceGroup).toBe(RESEARCH_SOURCE_GROUPS.ipCharacter)
    expect(plan.goal).toBe(RESEARCH_GOALS.analyzeCharacter)
    expect(plan.queries[0]?.text).toBe('鸣潮长离的发色是什么')
  })
})

describe('planResearchHeuristically — 要链接（2026-08-22 实拍幻觉）', () => {
  // owner 原话，一字未改。它既没有问号也没有问句词，改动前落到兜底分支判
  // `no retrieval signal` —— 于是证据规矩不注入、模型手上一个真 URL 都没有，
  // 结果编了两个：域名对、路径瞎编，一个图裂一个 404。
  it('⭐ 「给我一个适合作为参考图的网站」→ 打源', () => {
    const plan = planResearchHeuristically(
      '那你给我一个适合作为参考图的网站也可以，我自己上传',
    )

    expect(plan.shouldSearch).toBe(true)
    expect(plan.reason).toBe(
      'asked for a link — the model would otherwise invent one',
    )
  })

  it('同时点了 IP 角色时走角色源组', () => {
    const plan = planResearchHeuristically('给我一个鸣潮长离的官方立绘链接')

    expect(plan.shouldSearch).toBe(true)
    expect(plan.sourceGroup).toBe(RESEARCH_SOURCE_GROUPS.ipCharacter)
  })

  it('⛔ 名词面与动词面都要有：光提到「网站」不算', () => {
    // 「画一个网站界面」是创作请求，不是问我要链接 —— 拖去打源只会白花一次。
    const plan = planResearchHeuristically('画一个网站界面的概念图')

    expect(plan.shouldSearch).toBe(false)
  })
})

describe('planResearchHeuristically — 不检索的那些', () => {
  it('skips retrieval for stable ecosystem knowledge', () => {
    // 🔬 切片 0：LoRA 生态题两臂 5/5 全对 —— 检索管线不必平均用力
    const plan = planResearchHeuristically('SDXL 的许可是什么')

    expect(plan.shouldSearch).toBe(false)
    expect(plan.sourceGroup).toBe(RESEARCH_SOURCE_GROUPS.none)
    expect(plan.goal).toBe(RESEARCH_GOALS.findLora)
  })

  it('skips retrieval for a pure writing request', () => {
    const plan = planResearchHeuristically('帮我写一个赛博朋克街景的提示词')

    expect(plan.shouldSearch).toBe(false)
    expect(plan.reason).toContain('creative')
  })

  it('skips retrieval when there is no signal at all', () => {
    const plan = planResearchHeuristically('你好')

    expect(plan.shouldSearch).toBe(false)
    expect(plan.queries).toHaveLength(0)
  })

  it('returns a valid plan for empty input instead of throwing', () => {
    const plan = planResearchHeuristically('   ')

    expect(plan.shouldSearch).toBe(false)
    expect(plan.freshness).toBe(RESEARCH_FRESHNESS.none)
  })
})

describe('withForcedSearch — 用户手动开了联网', () => {
  it('fills in a source group and a query, not just the boolean', () => {
    // ⚠ 只翻 shouldSearch 而不补组，`none` 组的源列表是空数组 —— 结果是一个请求
    //   都不发却报「没搜到」。用户明明按了联网。
    const text = '帮我写一个赛博朋克街景的提示词'
    const forced = withForcedSearch(planResearchHeuristically(text), text)

    expect(forced.shouldSearch).toBe(true)
    expect(forced.sourceGroup).toBe(RESEARCH_SOURCE_GROUPS.general)
    expect(forced.queries).toHaveLength(1)
  })

  it('leaves an already-searching plan alone', () => {
    const text = '鸣潮长离的发色是什么'
    const plan = planResearchHeuristically(text)

    expect(withForcedSearch(plan, text)).toBe(plan)
  })

  it('keeps the url-only shortcut — a pasted link should still be read, not searched', () => {
    const text = '看看 https://example.com/post'
    const forced = withForcedSearch(planResearchHeuristically(text), text)

    expect(forced.urls).toHaveLength(1)
    expect(forced.queries).toHaveLength(0)
  })
})
