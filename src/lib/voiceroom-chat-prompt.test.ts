import { describe, expect, it } from 'vitest'

import { CharacterPersonaSchema } from '@/types'

import {
  buildVoiceChatPrompt,
  cleanVoiceChatReply,
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
})
