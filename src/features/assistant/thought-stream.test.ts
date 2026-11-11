import { describe, expect, it } from 'vitest'

import { chatPlanThoughts, createThoughtSplitter } from './thought-stream'

/** 按给定分片喂一遍，收拢成「正文 + 想法」。 */
function feed(chunks: readonly string[]) {
  const splitter = createThoughtSplitter()
  let reply = ''
  const thoughts: string[] = []
  for (const chunk of [
    ...chunks.map((c) => splitter.push(c)),
    splitter.end(),
  ]) {
    reply += chunk.reply
    thoughts.push(...chunk.thoughts)
  }
  return { reply, thoughts }
}

describe('「我的想法」与正文分流', () => {
  it('开头一段想法：一行一句交出去，闭合之后才是正文（去掉开头空白）', () => {
    expect(
      feed([
        '<thought>\n台上是雨天那张，**只动环境**。\n你说过喜欢冷色调〔记忆·偏好冷色调〕\n</thought>\n\n改好了。',
      ]),
    ).toEqual({
      reply: '改好了。',
      thoughts: [
        '台上是雨天那张，**只动环境**。',
        '你说过喜欢冷色调〔记忆·偏好冷色调〕',
      ],
    })
  })

  it('标签被切在分片中间：照样认出来，⛔ 把半个标签当正文发出去', () => {
    expect(
      feed([
        '  <th',
        'ought>第一句',
        '\n第二',
        '句</tho',
        'ught>',
        '\n好的',
        '，马上。',
      ]),
    ).toEqual({ reply: '好的，马上。', thoughts: ['第一句', '第二句'] })
  })

  it('开头不是想法：整段原样是正文（含前面的空白与像标签的字）', () => {
    expect(feed(['好的', '<thought>x</thought>'])).toEqual({
      reply: '好的<thought>x</thought>',
      thoughts: [],
    })
    expect(feed(['<p>段落</p>'])).toEqual({
      reply: '<p>段落</p>',
      thoughts: [],
    })
  })

  it('想的时候一句写完就交，⛔ 等整段闭合', () => {
    const splitter = createThoughtSplitter()
    expect(splitter.push('<thought>第一句\n第')).toEqual({
      reply: '',
      thoughts: ['第一句'],
    })
    expect(splitter.push('二句\n')).toEqual({ reply: '', thoughts: ['第二句'] })
  })

  it('只有想法没有正文（接着调工具）：正文为空', () => {
    expect(feed(['<thought>先查一下库\n</thought>'])).toEqual({
      reply: '',
      thoughts: ['先查一下库'],
    })
  })

  it('流断在想法中间：攒着的那句照样交，⛔ 当正文', () => {
    expect(feed(['<thought>第一句\n第二句没写完'])).toEqual({
      reply: '',
      thoughts: ['第一句', '第二句没写完'],
    })
  })

  it('整段只有半个开头标签就结束：当正文放行', () => {
    expect(feed(['<th'])).toEqual({ reply: '<th', thoughts: [] })
  })

  it('一句太长截到上限', () => {
    const splitter = createThoughtSplitter({ maxLineChars: 5 })
    expect(splitter.push('<thought>一二三四五六七\n').thoughts).toEqual([
      '一二三四五',
    ])
  })
})

describe('聊天档的「我的想法」= 回复前想的那一步', () => {
  it('为什么 · 心情与强度（实际刻度）· 怎么接；决定加深', () => {
    expect(
      chatPlanThoughts(
        {
          mood: '有点担心',
          intensity: 2,
          why: '他今天第三次提钱的事了',
          stance: '先接住情绪，不说教',
          reply: 'full',
        },
        'chinese',
      ),
    ).toEqual([
      '他今天第三次提钱的事了。',
      '我现在**有点担心（2/3）**。',
      '所以**先接住情绪，不说教**。',
    ])
  })

  it('平静、没写为什么、只回几个字', () => {
    expect(
      chatPlanThoughts(
        { mood: 'calm', intensity: 0, why: '', stance: '', reply: 'brief' },
        'english',
      ),
    ).toEqual([
      'I feel calm.',
      'Not in the mood to say much: **just a few words**.',
    ])
  })
})
