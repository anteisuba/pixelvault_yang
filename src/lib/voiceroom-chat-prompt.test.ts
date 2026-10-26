import { describe, expect, it } from 'vitest'

import { CharacterPersonaSchema } from '@/types'

import {
  buildVoiceChatPrompt,
  chatBubbles,
  cleanVoiceChatReply,
  pictureHandlesOf,
  spokenVoiceText,
  withoutPictureHandles,
} from './voiceroom-chat-prompt'

describe('buildVoiceChatPrompt', () => {
  it('puts the bound character profile first and keeps only spoken words', () => {
    const persona = CharacterPersonaSchema.parse({
      identity: '图书馆管理员',
      speech: '说话慢，爱用省略号。偶尔反问。',
      catchphrases: ['嗯……'],
      examples: [{ user: '在吗', reply: '在的……找书吗？' }],
    })
    const { systemPrompt, userPrompt } = buildVoiceChatPrompt({
      name: 'Denia',
      persona,
      history: [
        { who: 'user', name: '', text: '晚上好' },
        { who: 'self', name: 'Warm', text: '晚上好……' },
        { who: 'other', name: '晴', text: '我也在。' },
      ],
      message: '今天看了什么书？',
    })

    expect(systemPrompt).toContain('You are Denia')
    expect(systemPrompt).toContain('- Who you are: 图书馆管理员')
    expect(systemPrompt).toContain('「嗯……」')
    expect(systemPrompt).toContain('You: 在的……找书吗？')
    expect(systemPrompt).toContain('[laughing]')
    expect(systemPrompt).toContain('No action or stage directions')

    expect(userPrompt).toContain('Creator: 晚上好\nYou: 晚上好……\n晴: 我也在。')
    expect(userPrompt).toContain('THE CREATOR NOW SAYS\n今天看了什么书？')
    // 末尾那句「别出戏」只带说话方式的第一句。
    expect(userPrompt).toContain(
      '(Reply as Denia — 说话慢，爱用省略号。) Only what you say out loud.',
    )
  })

  it('lets an unbound voice be itself, with no history block on the first line', () => {
    const { systemPrompt, userPrompt } = buildVoiceChatPrompt({
      name: 'Warm Female',
      persona: null,
      history: [],
      message: 'hi',
    })
    expect(systemPrompt).toContain('No profile was written for you')
    // 句中也能放提示（owner 10-23）；成对标签只有 Drama 3 才说。
    expect(systemPrompt).toContain('or in the middle of it')
    expect(systemPrompt).not.toContain('<whisper>')
    expect(userPrompt).not.toContain('THE CONVERSATION SO FAR')
    expect(userPrompt).toContain(
      '(Reply as Warm Female) Only what you say out loud.',
    )
  })
})

describe('buildVoiceChatPrompt with Drama 3', () => {
  it('tells her about cues in her own language and paired tags', () => {
    const { systemPrompt } = buildVoiceChatPrompt({
      name: 'Warm',
      persona: null,
      history: [],
      message: 'hi',
      expressiveVoice: true,
    })
    expect(systemPrompt).toContain('[压低声音，带着笑意]')
    expect(systemPrompt).toContain('<whisper>…</whisper>')
  })
})

describe('cleanVoiceChatReply', () => {
  it('drops a leading name tag and wrapping quotes, nothing else', () => {
    expect(cleanVoiceChatReply('Denia: 「嗯……在的。」', 'Denia')).toBe(
      '嗯……在的。',
    )
    expect(cleanVoiceChatReply('  "Hi there."  ', 'Denia')).toBe('Hi there.')
    expect(cleanVoiceChatReply('[sighs] 好吧。', 'Denia')).toBe(
      '[sighs] 好吧。',
    )
    // 中间还有引号就不是「整句被包起来」，原样留着。
    expect(cleanVoiceChatReply('"A" and "B"', 'Denia')).toBe('"A" and "B"')
  })

  it('keeps one bubble per line, cleans each, and folds extras into the last', () => {
    expect(
      cleanVoiceChatReply(
        'Denia: 画崩了？\n\n「嘿嘿」\n好啦，拿给我看看',
        'Denia',
      ),
    ).toBe('画崩了？\n嘿嘿\n好啦，拿给我看看')
    expect(cleanVoiceChatReply('一\n二\n三\n四\n五', 'Denia')).toBe(
      '一\n二\n三\n四 五',
    )
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
})

describe('picture handles in her reply', () => {
  const reply = '给你找到了 图_12 和 图_7，还有 图_12。'

  it('lists each picture once, in order', () => {
    expect(pictureHandlesOf(reply)).toEqual(['图_12', '图_7'])
  })

  it('leaves only her words in the bubble', () => {
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
