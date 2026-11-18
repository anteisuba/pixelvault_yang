import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { QUERY_KEYS } from '@/constants/query'
import { cardGreetings } from '@/lib/tavern-card'

/**
 * 她先开口（酒馆 first_mes / alternate_greetings）：摆出来、左右切、发第一句时接进线程。
 * ⚠ store 与摆着的那份都是模块级单例：每例重新载一份。
 */
type Greeting =
  typeof import('@/features/assistant/hooks/use-operator-greeting')
type Store = typeof import('@/hooks/use-studio-operator-store')

let greeting: Greeting
let store: Store

const CHARACTER = {
  id: 'card-1',
  name: 'Denia',
  faceUrl: null,
  hasSpeech: true,
  hasProfile: true,
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('@/hooks/use-studio-operator-store')
  greeting = await import('@/features/assistant/hooks/use-operator-greeting')
  const { queryClient } = await import('@/lib/query-client')
  queryClient.setQueryData(QUERY_KEYS.assistantPersona, {
    character: CHARACTER,
  })
  // 开场白只摆在首页那张脸（没台）：11-18 起看的是有没有台，⛔ 再看「聊天 / 工作」档。
  store.claimOperatorThreadScope(
    'acct:home',
    ASSISTANT_PROTOCOL_DOMAIN_IDS.home,
  )
})

describe('cardGreetings', () => {
  it('开场白在前、备选跟后；宏换成名字；空的重复的不要；*动作* 原样留', () => {
    expect(
      cardGreetings(
        {
          name: 'Denia',
          opening: '*{{char}}从书堆后探出头* {{user}}，你来啦。',
          alternateGreetings: [
            '<BOT>：又是你，<USER>。',
            '  ',
            '*Denia从书堆后探出头* 小林，你来啦。',
          ],
        },
        '小林',
      ),
    ).toEqual(['*Denia从书堆后探出头* 小林，你来啦。', 'Denia：又是你，小林。'])
  })

  it('没写开场白 = 不开口（只有备选也不算）', () => {
    expect(
      cardGreetings(
        { name: 'Denia', opening: ' ', alternateGreetings: ['在吗'] },
        '你',
      ),
    ).toEqual([])
  })
})

describe('摆出来的开场白', () => {
  it('几版时带 versions，左右切换版；越界不动', () => {
    const threadId = store.getOperatorState().localThreadId
    greeting.offerOperatorGreeting(threadId, CHARACTER.id, [
      '你来啦。',
      '又是你。',
    ])
    expect(greeting.offeredGreetingEntry()).toMatchObject({
      text: '你来啦。',
      chat: true,
      greeting: true,
      versions: ['你来啦。', '又是你。'],
      versionIndex: 0,
    })
    greeting.selectOperatorGreeting(1)
    expect(greeting.offeredGreetingEntry()?.text).toBe('又是你。')
    greeting.selectOperatorGreeting(5)
    expect(greeting.offeredGreetingEntry()?.versionIndex).toBe(1)
    // 同一条线程、同样几版再登记一次（每次渲染都会）：选中的那版不被打回第一版。
    greeting.offerOperatorGreeting(threadId, CHARACTER.id, [
      '你来啦。',
      '又是你。',
    ])
    expect(greeting.offeredGreetingEntry()?.versionIndex).toBe(1)
  })

  it('只有一版时不带 versions（没有左右切）；没有开场白 = 不摆', () => {
    const threadId = store.getOperatorState().localThreadId
    greeting.offerOperatorGreeting(threadId, CHARACTER.id, ['你来啦。'])
    expect(greeting.offeredGreetingEntry()?.versions).toBeUndefined()
    greeting.offerOperatorGreeting(threadId, CHARACTER.id, [])
    expect(greeting.offeredGreetingEntry()).toBeNull()
  })
})

describe('发第一句时接进线程', () => {
  it('选中的那版成为线程里她的第一句（之后进上下文），接一次就收起', () => {
    const threadId = store.getOperatorState().localThreadId
    greeting.offerOperatorGreeting(threadId, CHARACTER.id, [
      '*探头* 你来啦。',
      '又是你。',
    ])
    greeting.selectOperatorGreeting(1)
    greeting.commitOperatorGreeting()
    const [first, ...rest] = store.getOperatorState().entries
    expect(rest).toEqual([])
    expect(first).toMatchObject({
      kind: 'message',
      text: '又是你。',
      chat: true,
      greeting: true,
    })
    expect(greeting.offeredGreetingEntry()).toBeNull()
    greeting.commitOperatorGreeting()
    expect(store.getOperatorState().entries).toHaveLength(1)
  })

  it('线程不空、换了会话、到了台上、换了人：都不接', () => {
    const threadId = store.getOperatorState().localThreadId
    // 换了会话
    greeting.offerOperatorGreeting('another-thread', CHARACTER.id, ['你来啦。'])
    greeting.commitOperatorGreeting()
    expect(store.getOperatorState().entries).toEqual([])
    // 换了人
    greeting.offerOperatorGreeting(threadId, 'card-2', ['你来啦。'])
    greeting.commitOperatorGreeting()
    expect(store.getOperatorState().entries).toEqual([])
    // 到了台上（同一条线程换到图片台：开口就是干活，开场白不接）
    store.claimOperatorThreadScope(
      'acct:home',
      ASSISTANT_PROTOCOL_DOMAIN_IDS.image,
    )
    greeting.offerOperatorGreeting(threadId, CHARACTER.id, ['你来啦。'])
    greeting.commitOperatorGreeting()
    expect(store.getOperatorState().entries).toEqual([])
    // 线程不空（回到首页）
    store.claimOperatorThreadScope(
      'acct:home',
      ASSISTANT_PROTOCOL_DOMAIN_IDS.home,
    )
    store.appendOperatorEntry({
      kind: 'user',
      id: 'user-1',
      text: '在吗',
      attachments: [],
    })
    greeting.offerOperatorGreeting(threadId, CHARACTER.id, ['你来啦。'])
    greeting.commitOperatorGreeting()
    expect(store.getOperatorState().entries).toHaveLength(1)
  })
})
