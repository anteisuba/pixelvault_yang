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
    expect(userPrompt).not.toContain('THE CONVERSATION SO FAR')
    expect(userPrompt).toContain(
      '(Reply as Warm Female) Only what you say out loud.',
    )
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
