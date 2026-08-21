import { describe, it, expect } from 'vitest'

import { extractAssistantProtocolBlocks } from '@/lib/assistant-protocol-blocks'

const ASK_BLOCK = `[[ask]]
{"questions":[{"id":"q1","question":"要什么主体？","options":[{"id":"o1","label":"人物"}],"multiSelect":false,"allowCustom":true,"allowSkip":false}]}
[[/ask]]`

const NEXT_BLOCK = `[[next]]
{"satisfied":"就这样生成","adjust":"再调一版"}
[[/next]]`

const PROMPT_BLOCK = `[[prompt]]
{"positive":"a moody ivory hallway, soft window light","negative":"blurry, watermark","aspectRatio":"16:9"}
[[/prompt]]`

describe('extractAssistantProtocolBlocks', () => {
  it('剥掉两个块并保留正文', () => {
    const result = extractAssistantProtocolBlocks(
      `先说一句。\n\n${ASK_BLOCK}\n\n${NEXT_BLOCK}`,
      { streamComplete: true },
    )

    expect(result.content).toBe('先说一句。')
    expect(result.ask).toHaveLength(1)
    expect(result.ask?.[0]?.question).toBe('要什么主体？')
    expect(result.next?.satisfied).toBe('就这样生成')
    expect(result.protocolMalformed).toBeUndefined()
  })

  // ── 流式语义：这一组是整条流式化改造的真正验收面 ──────────────────

  it('块只写了一半时：藏起来，且不产出载荷', () => {
    const halfWritten = `先说一句。\n\n[[ask]]\n{"questions":[{"id":"q1","ques`

    const result = extractAssistantProtocolBlocks(halfWritten, {
      streamComplete: false,
    })

    // 半截 JSON 绝不能漏进正文 —— 用户会看到一段没人管的花括号
    expect(result.content).toBe('先说一句。')
    expect(result.content).not.toContain('questions')
    expect(result.ask).toBeUndefined()
    // 还在写，不是写坏了
    expect(result.protocolMalformed).toBeUndefined()
  })

  it('正文边流边长，块闭合前不产出 ask', () => {
    const frames = [
      '先',
      '先说一句。',
      `先说一句。\n\n[[ask]]`,
      `先说一句。\n\n[[ask]]\n{"questions":[]`,
      `先说一句。\n\n${ASK_BLOCK}`,
    ]

    const asks = frames.map(
      (frame) =>
        extractAssistantProtocolBlocks(frame, { streamComplete: false }).ask,
    )

    expect(asks.slice(0, 4).every((ask) => ask === undefined)).toBe(true)
    expect(asks.at(-1)).toHaveLength(1)
  })

  it('流结束但闭合标记缺失时，尽力解析而不是永远藏着', () => {
    const noClose = `先说一句。\n\n[[ask]]\n{"questions":[{"id":"q1","question":"要什么主体？","options":[{"id":"o1","label":"人物"}],"multiSelect":false,"allowCustom":true,"allowSkip":false}]}`

    // 流没结束：当成还在写
    expect(
      extractAssistantProtocolBlocks(noClose, { streamComplete: false }).ask,
    ).toBeUndefined()

    // 流结束了：必须给个交代
    const done = extractAssistantProtocolBlocks(noClose, {
      streamComplete: true,
    })
    expect(done.ask).toHaveLength(1)
    expect(done.content).toBe('先说一句。')
  })

  it('完整的块但载荷坏掉时报 malformed，不静默吞', () => {
    const broken = `先说一句。\n\n[[ask]]\n{不是 JSON}\n[[/ask]]`

    const result = extractAssistantProtocolBlocks(broken, {
      streamComplete: true,
    })

    expect(result.ask).toBeUndefined()
    expect(result.protocolMalformed).toBe(true)
    // 坏载荷也不许留在正文里
    expect(result.content).toBe('先说一句。')
  })

  it('没有任何标记时原样返回', () => {
    const result = extractAssistantProtocolBlocks('就是一段普通回答。', {
      streamComplete: true,
    })

    expect(result.content).toBe('就是一段普通回答。')
    expect(result.ask).toBeUndefined()
    expect(result.next).toBeUndefined()
    expect(result.protocolMalformed).toBeUndefined()
  })

  it('默认不传 streamComplete 时按「还在流」处理', () => {
    const noClose = `正文\n\n[[next]]\n{"label":"生成","action":"generate"}`

    expect(extractAssistantProtocolBlocks(noClose).next).toBeUndefined()
  })

  // ── §3.0b 第 0 条：`[[prompt]]` 回填载荷 ──────────────────────────

  it('三个块串着抽，正文剥干净', () => {
    const result = extractAssistantProtocolBlocks(
      `这版走冷调。\n\n${PROMPT_BLOCK}\n\n${NEXT_BLOCK}`,
      { streamComplete: true },
    )

    expect(result.content).toBe('这版走冷调。')
    expect(result.promptDraft?.positive).toBe(
      'a moody ivory hallway, soft window light',
    )
    expect(result.promptDraft?.negative).toBe('blurry, watermark')
    expect(result.promptDraft?.aspectRatio).toBe('16:9')
    expect(result.next?.satisfied).toBe('就这样生成')
  })

  it('负面和宽高比缺省时不编造，也不把它们塞进 positive', () => {
    const onlyPositive = `[[prompt]]\n{"positive":"just this"}\n[[/prompt]]`

    const result = extractAssistantProtocolBlocks(onlyPositive, {
      streamComplete: true,
    })

    expect(result.promptDraft?.positive).toBe('just this')
    // ⚠ 缺省 = 「这次没建议」，**不是**「清空它」。回填时不该动那两个框。
    expect(result.promptDraft?.negative).toBeUndefined()
    expect(result.promptDraft?.aspectRatio).toBeUndefined()
  })

  it('prompt 块还没写完时不产出半截提示词', () => {
    // 这条是回填按钮的流式安全底线：块没闭合就产出 promptDraft，
    // 用户会看到一个「填入」按钮，点下去灌进去半句提示词。
    const halfWritten = `这版走冷调。\n\n[[prompt]]\n{"positive":"a moody ivo`

    const result = extractAssistantProtocolBlocks(halfWritten, {
      streamComplete: false,
    })

    expect(result.content).toBe('这版走冷调。')
    expect(result.content).not.toContain('positive')
    expect(result.promptDraft).toBeUndefined()
    expect(result.protocolMalformed).toBeUndefined()
  })

  it('positive 为空的完整块报 malformed，而不是产出一个填空气的按钮', () => {
    const emptyPositive = `[[prompt]]\n{"positive":"   "}\n[[/prompt]]`

    const result = extractAssistantProtocolBlocks(emptyPositive, {
      streamComplete: true,
    })

    expect(result.promptDraft).toBeUndefined()
    expect(result.protocolMalformed).toBe(true)
  })

  // ── §3.0b 第 1 条：`[[setup]]` 工作台配置提案 ──────────────────────

  it('四个块串着抽，正文剥干净', () => {
    const setup = `[[setup]]\n{"model":"illustrious-xl","batchCount":2}\n[[/setup]]`
    const result = extractAssistantProtocolBlocks(
      `这版走冷调。\n\n${ASK_BLOCK}\n\n${PROMPT_BLOCK}\n\n${setup}\n\n${NEXT_BLOCK}`,
      { streamComplete: true },
    )

    expect(result.content).toBe('这版走冷调。')
    expect(result.ask).toHaveLength(1)
    expect(result.promptDraft?.positive).toBe(
      'a moody ivory hallway, soft window light',
    )
    expect(result.setup?.model).toBe('illustrious-xl')
    expect(result.setup?.batchCount).toBe(2)
    expect(result.next?.satisfied).toBe('就这样生成')
  })

  it('setup 不依赖 prompt —— 档 2 只提配置也成立', () => {
    // 「这个动画质感该换 Illustrious」在还没交付提示词时就成立。
    // 如果 setup 被并进 prompt 块，这种回复要么没地方放，要么逼助手提前交付。
    const onlySetup = `先聊方向。\n\n[[setup]]\n{"model":"illustrious-xl"}\n[[/setup]]`

    const result = extractAssistantProtocolBlocks(onlySetup, {
      streamComplete: true,
    })

    expect(result.content).toBe('先聊方向。')
    expect(result.setup?.model).toBe('illustrious-xl')
    expect(result.promptDraft).toBeUndefined()
  })

  it('两个字段都空的 setup 块判 malformed，不产出空提案', () => {
    const empty = `[[setup]]\n{}\n[[/setup]]`

    const result = extractAssistantProtocolBlocks(empty, {
      streamComplete: true,
    })

    expect(result.setup).toBeUndefined()
    expect(result.protocolMalformed).toBe(true)
  })

  it('setup 块还没写完时不产出半截提案', () => {
    const halfWritten = `先聊方向。\n\n[[setup]]\n{"model":"illust`

    const result = extractAssistantProtocolBlocks(halfWritten, {
      streamComplete: false,
    })

    expect(result.content).toBe('先聊方向。')
    expect(result.content).not.toContain('model')
    expect(result.setup).toBeUndefined()
    expect(result.protocolMalformed).toBeUndefined()
  })

  // ── 2026-08-21 真机事故（图片工作台 /studio/image，流式）─────────────
  //
  // 一轮回复里同时出了 `[[setup]]` 和 `[[ask]]`。两个症状：
  //   ① 打字机过程中裸的 `[[set` 蹦进可见正文（流结束后才被清掉）；
  //   ② ask 块降级成「那段回复读不出来」，而同一轮的 setup chips 正常。

  const SETUP_BLOCK = `[[setup]]\n{"model":"illustrious-xl","batchCount":2}\n[[/setup]]`

  it('逐字流入时，任何一帧的可见正文都不含残缺标记', () => {
    const full = `长离的立绘建议走 Illustrious 系底模。\n\n${SETUP_BLOCK}\n\n${ASK_BLOCK}\n\n${NEXT_BLOCK}`
    const leaked: string[] = []

    // 打字机是逐字吐的，所以抽取器会在**每一个**切点上被喂一次。切点数就是
    // 用户眼睛能看到的帧数，一帧都不能漏。
    for (let cut = 1; cut <= full.length; cut++) {
      const { content } = extractAssistantProtocolBlocks(full.slice(0, cut), {
        streamComplete: false,
      })
      if (content.includes('[')) leaked.push(JSON.stringify(content.slice(-24)))
    }

    expect(leaked).toEqual([])
  })

  it('setup 与 ask 共存时两个块都解析得出来', () => {
    const result = extractAssistantProtocolBlocks(
      `长离的立绘建议走 Illustrious 系底模。\n\n${SETUP_BLOCK}\n\n${ASK_BLOCK}\n\n${NEXT_BLOCK}`,
      { streamComplete: true },
    )

    expect(result.ask).toHaveLength(1)
    expect(result.setup?.model).toBe('illustrious-xl')
    expect(result.next?.satisfied).toBe('就这样生成')
    expect(result.protocolMalformed).toBeUndefined()
    expect(result.content).toBe('长离的立绘建议走 Illustrious 系底模。')
  })

  // ── ask 载荷的无损归一化 ─────────────────────────────────────────────
  //
  // id 是**纯记账字段**：控件只拿它当 React key 和答案表的键，模型写什么、写不写
  // 都不改变这张卡的意思。让整块反问因为少一个 `"id"` 而降级成一行灰字，是拿协议
  // 最没信息量的字段去否掉最有信息量的内容。⚠ 归一化只做「读法唯一」的形状，
  // 真读不出来的照旧走 malformed。

  it('模型漏写 option id 时按位置补，而不是整块降级', () => {
    const raw = `你想要什么方向？\n\n[[ask]]\n{"questions":[{"id":"q-1","question":"你想让长离穿什么衣服？","options":[{"label":"原作黑金战斗服"},{"label":"日常私服"},{"label":"礼服"}]}]}\n[[/ask]]`

    const result = extractAssistantProtocolBlocks(raw, { streamComplete: true })

    expect(result.protocolMalformed).toBeUndefined()
    expect(result.ask?.[0]?.options.map((option) => option.label)).toEqual([
      '原作黑金战斗服',
      '日常私服',
      '礼服',
    ])
    // 补出来的 id 必须在同一题内互不相同 —— 撞了就是「点一个亮两个」。
    const ids = result.ask?.[0]?.options.map((option) => option.id) ?? []
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('模型漏写 question id 时按位置补', () => {
    const raw = `[[ask]]\n{"questions":[{"question":"衣服？","options":[{"id":"o-1","label":"战斗服"}]},{"question":"动作与背景？","options":[{"id":"o-1","label":"持刀站姿"}]}]}\n[[/ask]]`

    const result = extractAssistantProtocolBlocks(raw, { streamComplete: true })

    expect(result.protocolMalformed).toBeUndefined()
    expect(result.ask).toHaveLength(2)
    const ids = result.ask?.map((question) => question.id) ?? []
    expect(new Set(ids).size).toBe(2)
  })

  it('模型把 options 写成纯字符串数组时按字面读', () => {
    const raw = `[[ask]]\n{"questions":[{"id":"q-1","question":"衣服？","options":["战斗服","私服"]}]}\n[[/ask]]`

    const result = extractAssistantProtocolBlocks(raw, { streamComplete: true })

    expect(result.protocolMalformed).toBeUndefined()
    expect(result.ask?.[0]?.options.map((option) => option.label)).toEqual([
      '战斗服',
      '私服',
    ])
  })

  it('模型漏掉 questions 外壳、直接写数组时也能读', () => {
    const raw = `[[ask]]\n[{"id":"q-1","question":"衣服？","options":[{"id":"o-1","label":"战斗服"}]}]\n[[/ask]]`

    const result = extractAssistantProtocolBlocks(raw, { streamComplete: true })

    expect(result.protocolMalformed).toBeUndefined()
    expect(result.ask?.[0]?.question).toBe('衣服？')
  })

  it('归一化不吃掉真正读不出来的载荷', () => {
    // 尾逗号这类坏 JSON 归一化救不了，也不该救 —— 既有的体面降级路径照旧。
    const raw = `[[ask]]\n{"questions":[{"id":"q-1","question":"衣服？","options":[{"id":"o-1","label":"战斗服"},]},]}\n[[/ask]]`

    const result = extractAssistantProtocolBlocks(raw, { streamComplete: true })

    expect(result.ask).toBeUndefined()
    expect(result.protocolMalformed).toBe(true)
  })
})
