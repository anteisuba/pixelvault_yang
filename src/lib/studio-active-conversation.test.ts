import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  onStudioConversationActivity,
  setActiveStudioConversation,
  withActiveStudioConversation,
} from '@/lib/studio-active-conversation'

describe('studio-active-conversation（9f-3）', () => {
  afterEach(() => {
    setActiveStudioConversation(null)
    vi.useRealTimers()
  })

  it('外壳开着对话时请求带上它；调用方自己写了就用它的；不在外壳里就不带', () => {
    expect(withActiveStudioConversation({ modelId: 'm' })).toEqual({
      modelId: 'm',
    })
    setActiveStudioConversation('c-1')
    expect(withActiveStudioConversation({ modelId: 'm' })).toEqual({
      modelId: 'm',
      conversationId: 'c-1',
    })
    expect(
      withActiveStudioConversation({ modelId: 'm', conversationId: 'c-2' }),
    ).toEqual({ modelId: 'm', conversationId: 'c-2' })
  })

  it('带上对话的那一枪过一会儿让左边列表去问进度', () => {
    vi.useFakeTimers()
    const listener = vi.fn()
    const off = onStudioConversationActivity(listener)
    setActiveStudioConversation('c-1')
    withActiveStudioConversation({})
    expect(listener).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(listener).toHaveBeenCalledTimes(1)
    off()
  })
})
