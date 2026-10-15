import { describe, expect, it, vi } from 'vitest'

import {
  expectSelectedProviderOnly,
  keyLookupUsesOf,
  providerUsesOf,
} from '@/test/selected-provider-only'

/** 断言本身也要会失败：漏报一次越界，它就成了摆设。 */
describe('expectSelectedProviderOnly', () => {
  it('路由本身、带 route 的对象都认得；全是所选那一家就过', () => {
    const complete = vi.fn()
    complete({ adapterType: 'anthropic', apiKey: 'a', userPrompt: 'x' })
    const plan = vi.fn()
    plan({ route: { adapterType: 'anthropic', apiKey: 'a' }, text: 'x' })

    expectSelectedProviderOnly(
      [...providerUsesOf(complete, 'main'), ...providerUsesOf(plan, 'plan')],
      { adapterType: 'anthropic', apiKey: 'a' },
    )
  })

  it('有一跳换了别家就失败，并点名那一跳', () => {
    const plan = vi.fn()
    plan({ route: { adapterType: 'gemini', apiKey: 'g' } })

    expect(() =>
      expectSelectedProviderOnly(providerUsesOf(plan, 'research planner'), {
        adapterType: 'anthropic',
      }),
    ).toThrow(/research planner/)
  })

  it('同一家换了一把别的 key 也算越界', () => {
    const complete = vi.fn()
    complete({ adapterType: 'openai', apiKey: 'platform-key' })

    expect(() =>
      expectSelectedProviderOnly(providerUsesOf(complete, 'main'), {
        adapterType: 'openai',
        apiKey: 'user-key',
      }),
    ).toThrow()
  })

  it('认不出是哪一家的调用记成 (unknown)，同样不合格', () => {
    const vision = vi.fn()
    vision({ userId: 'u', thumbnails: [] })

    expect(providerUsesOf(vision, 'vision')).toEqual([
      { via: 'vision', adapterType: '(unknown)' },
    ])
    expect(() =>
      expectSelectedProviderOnly(providerUsesOf(vision, 'vision'), {
        adapterType: 'openai',
      }),
    ).toThrow()
  })

  it('按厂商查 key 的每一次都记；按 id 查的不记', () => {
    const findFirst = vi.fn()
    findFirst({ where: { userId: 'u', adapterType: 'gemini', isActive: true } })
    findFirst({ where: { id: 'key-1', userId: 'u' } })

    expect(keyLookupUsesOf(findFirst)).toEqual([
      { via: 'key lookup', adapterType: 'gemini' },
    ])
  })
})
