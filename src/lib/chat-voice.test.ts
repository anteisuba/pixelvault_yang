import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  normalizeVoiceCues,
  withoutVoiceCuesInProse,
  withoutStageDirections,
  chatBubbles,
  chatBubbleParts,
  displayVoiceText,
  greetingParagraphs,
  leadingVoiceCues,
  spokenVoiceText,
  stickerUrlOf,
  voiceCueIdsIn,
  voiceCueRules,
  withoutPictureHandles,
  withoutThoughtMarkup,
} from './chat-voice'

describe('voiceCueRules', () => {
  it('adds Drama 3 cues only for the expressive voice', () => {
    expect(voiceCueRules(false)).toContain('[laughing]')
    expect(voiceCueRules(false)).not.toContain('<whisper>')
    expect(voiceCueRules(true)).toContain('<whisper>…</whisper>')
  })

  it('teaches only cues from the official table (10-30: [pause] / [softly] are not in it)', () => {
    const rules = voiceCueRules(false)
    expect(rules).toContain('[break]')
    expect(rules).toContain('[soft tone]')
    expect(rules).not.toContain('[pause]')
    expect(rules).not.toContain('[softly]')
  })
})

describe('normalizeVoiceCues (10-30)', () => {
  it('maps near-miss cues to the official words', () => {
    expect(
      normalizeVoiceCues('[softly] 诶……可爱又不能当饭吃……[pause] 要是', false),
    ).toBe('[soft tone] 诶……可爱又不能当饭吃……[break] 要是')
  })

  it('drops cues and tags the cheaper voices do not understand', () => {
    expect(
      normalizeVoiceCues('[压低声音]别说<whisper>嘘</whisper>', false),
    ).toBe('别说嘘')
    expect(normalizeVoiceCues('[压低声音]别说', true)).toBe('[压低声音]别说')
  })

  it('closes a Drama 3 paired tag left open on its line', () => {
    expect(normalizeVoiceCues('<whisper>别说\n好了', true)).toBe(
      '<whisper>别说</whisper>\n好了',
    )
  })

  it('keeps the paired tag whole when read aloud', () => {
    expect(spokenVoiceText('> 引用\n<whisper>嘘</whisper>', true)).toBe(
      '引用\n<whisper>嘘</whisper>',
    )
  })
})

describe('withoutStageDirections (owner 10-30)', () => {
  it('drops *actions* and short (动作) asides, keeps bold, lists and real parentheses', () => {
    expect(
      withoutStageDirections('呢……头发是粉的。*光翼暗了一点* 我才没有介意呢。'),
    ).toBe('呢……头发是粉的。我才没有介意呢。')
    expect(withoutStageDirections('（笑）你又来了')).toBe('你又来了')
    expect(withoutStageDirections('**这张**最好')).toBe('**这张**最好')
    expect(withoutStageDirections('* 第一张\n* 第二张')).toBe(
      '* 第一张\n* 第二张',
    )
    expect(withoutStageDirections('LoRA（权重 0.8）挂上了')).toBe(
      'LoRA（权重 0.8）挂上了',
    )
    expect(withoutStageDirections('a*b*c')).toBe('a*b*c')
  })

  it('bubbles and the spoken text skip the action too', () => {
    expect(chatBubbles('*歪头*\n真的吗？')).toEqual(['真的吗？'])
    expect(spokenVoiceText('好啊 *笑着点头* 走吧')).toBe('好啊走吧')
  })
})

describe('withoutVoiceCuesInProse (owner 10-30)', () => {
  it('hides the voice cues in her bench replies but leaves prompt text in code alone', () => {
    expect(
      withoutVoiceCuesInProse(
        '[softly] 好了，换成这串：\n`[blue hair], 1girl`\n\n```\n[[masterpiece]]\n```\n[laughing] 再跑一次看看。',
      ),
    ).toBe(
      '好了，换成这串：\n`[blue hair], 1girl`\n\n```\n[[masterpiece]]\n```\n再跑一次看看。',
    )
    expect(withoutVoiceCuesInProse('看[链接](https://a.b)')).toBe(
      '看[链接](https://a.b)',
    )
  })

  it('keeps citation marks whole (11-05: only "](url)" was left)', () => {
    expect(
      withoutVoiceCuesInProse(
        '榜换得很快。[[1]](https://a.b/x) [softly] 就这样',
      ),
    ).toBe('榜换得很快。[[1]](https://a.b/x)就这样')
  })
})

describe('chatBubbles', () => {
  it('splits on lines and drops empty ones', () => {
    expect(chatBubbles('  又熬夜了吧\n\n图先放着嘛\n')).toEqual([
      '又熬夜了吧',
      '图先放着嘛',
    ])
    expect(chatBubbles('')).toEqual([])
  })

  it('greeting: one paragraph per line, every *action* kept (no length cap), asterisks dropped', () => {
    const longAction = `*${'耳边的声音压得很低，带着笑。'.repeat(8)}*`
    expect(
      greetingParagraphs(
        `*她从书堆后探出头* 你来啦。\n\n${longAction}\n*她把声音放得更轻，凑过来：*\n「坐吧。」*笑*`,
      ),
    ).toEqual([
      [
        { action: true, text: '她从书堆后探出头' },
        { action: false, text: '你来啦。' },
      ],
      [{ action: true, text: longAction.slice(1, -1) }],
      [{ action: true, text: '她把声音放得更轻，凑过来：' }],
      [
        { action: false, text: '「坐吧。」' },
        { action: true, text: '笑' },
      ],
    ])
    // 她自己的回复照旧洗掉动作。
    expect(chatBubbles('*她从书堆后探出头* 你来啦。')).toEqual(['你来啦。'])
  })

  it('hides the voice cues she writes for her voice', () => {
    expect(
      chatBubbles(
        '嗨！[laughing] 我这边挺顺利的。\n[sighs]\n<whisper>别告诉别人</whisper> [压低声音，带着笑意]好吗？\nOh [laughing] really',
      ),
    ).toEqual(['嗨！我这边挺顺利的。', '别告诉别人好吗？', 'Oh really'])
    expect(chatBubbles('看[这里](https://a.b)')).toEqual([
      '看[这里](https://a.b)',
    ])
  })

  it('keeps citation marks whole and splits them out to be drawn as links', () => {
    const bubbles = chatBubbles(
      '主人，查到了～[[1]](https://a.b/1)\n多巴胺中毒的小孩。[[2]](https://ja.wikipedia.org/wiki/%E3%83%89)末尾',
    )
    expect(bubbles).toEqual([
      '主人，查到了～[[1]](https://a.b/1)',
      '多巴胺中毒的小孩。[[2]](https://ja.wikipedia.org/wiki/%E3%83%89)末尾',
    ])
    expect(chatBubbleParts(bubbles[1]!)).toEqual([
      '多巴胺中毒的小孩。',
      { cite: 2, url: 'https://ja.wikipedia.org/wiki/%E3%83%89' },
      '末尾',
    ])
    expect(chatBubbleParts('看[[1]](javascript:alert(1))')).toEqual([
      '看[[1]](javascript:alert(1))',
    ])
  })
})

describe('picture handles in her reply', () => {
  it('leaves only her words', () => {
    expect(withoutPictureHandles('看这张 图_12。')).toBe('看这张。')
    expect(withoutPictureHandles('图_12')).toBe('')
  })

  it('reads aloud only the words, keeping delivery cues', () => {
    expect(
      spokenVoiceText(
        '[laughing] 看 图_3，**很像**吧？来源 [官网](https://a.example) https://b.example',
      ),
    ).toBe('[laughing] 看，很像吧？来源 官网')
    expect(spokenVoiceText('图_3')).toBe('图_3')
  })
})

describe('displayVoiceText / withoutThoughtMarkup (11-17 内部标记泄漏)', () => {
  it('素材库音频卡：语气提示与想法标签都藏掉，正文照留', () => {
    expect(displayVoiceText('[curious] 我现在在…')).toBe('我现在在…')
    expect(displayVoiceText('<thought> 她要的…')).toBe('她要的…')
    expect(
      displayVoiceText(
        '<thought>\n她要的是冷色调\n</thought>\n[happy] 好的，改好了',
      ),
    ).toBe('好的，改好了')
    expect(displayVoiceText('普通台词')).toBe('普通台词')
  })

  it('只动展示：想法整段藏、落单标签只藏标签，没有标记原样返回', () => {
    expect(withoutThoughtMarkup('前<thought>想</thought>后')).toBe('前后')
    expect(withoutThoughtMarkup('前</thought>后')).toBe('前后')
    const plain = '[happy] 不归它管'
    expect(withoutThoughtMarkup(plain)).toBe(plain)
  })

  it('念之前（voice-speak 服务的那一道）：句中的想法段整段不念，语气标记照发', () => {
    const reply =
      '[happy] 好呀～\n<thought>她要的是\n轻松一点的</thought>\n[whispering] 我们走吧。'
    const spoken = spokenVoiceText(withoutThoughtMarkup(reply))
    expect(spoken).not.toContain('thought')
    expect(spoken).not.toContain('她要的是')
    expect(spoken).toContain('[happy] 好呀～')
    expect(spoken).toContain('[whispering] 我们走吧。')
    // 只剩想法 = 没东西可念（服务端据此拒，⛔ 退回原文把想法念出来）。
    expect(withoutThoughtMarkup('<thought>只是在想</thought>').trim()).toBe('')
  })

  it('对话气泡：开头漏进来的想法段（跨行）不成气泡', () => {
    expect(
      chatBubbles('<thought>\n她要的是冷色调\n再确认一下\n</thought>\n好的～'),
    ).toEqual(['好的～'])
    expect(chatBubbles('<thought> 她要的…')).toEqual(['她要的…'])
  })
})

describe('voiceCueIdsIn (配音台语气药丸)', () => {
  it('按出现顺序、去重，只认官方表里的词（含多词标记）', () => {
    expect(voiceCueIdsIn('[happy] 你好')).toEqual(['happy'])
    expect(
      voiceCueIdsIn(
        '[Happy] 你[in a hurry tone]快点 [happy] [不认识] [[1]](x)',
      ),
    ).toEqual(['happy', 'hurried'])
    expect(voiceCueIdsIn('没有语气')).toEqual([])
  })
})

describe('leadingVoiceCues', () => {
  it('pulls the cues at the start apart and leaves the rest', () => {
    expect(leadingVoiceCues('[whispering] [pause] 嘘，书会被吵醒的。')).toEqual(
      {
        cues: ['[whispering]', '[pause]'],
        rest: '嘘，书会被吵醒的。',
      },
    )
    expect(leadingVoiceCues('欢迎 [laughing] 来玩')).toEqual({
      cues: [],
      rest: '欢迎 [laughing] 来玩',
    })
  })
})

describe('her stickers (4d)', () => {
  beforeEach(() =>
    vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', 'https://cdn.test'),
  )
  afterEach(() => vi.unstubAllEnvs())

  it('recognises a sticker line only when it points at our own storage', () => {
    expect(
      stickerUrlOf('![表情](https://cdn.test/characters/u/c/stickers/a.png)'),
    ).toBe('https://cdn.test/characters/u/c/stickers/a.png')
    expect(stickerUrlOf('![表情](https://evil.example/a.png)')).toBeNull()
    expect(stickerUrlOf('好耶')).toBeNull()
  })

  it('keeps the sticker line as its own bubble and hides a raw token while writing', () => {
    expect(
      chatBubbles('笑死\n![表情](https://cdn.test/s.png)\n[表情·ab12cd]'),
    ).toEqual(['笑死', '![表情](https://cdn.test/s.png)'])
  })

  it('never reads a sticker out loud', () => {
    expect(spokenVoiceText('笑死\n![表情](https://cdn.test/s.png)')).toBe(
      '笑死',
    )
  })
})
