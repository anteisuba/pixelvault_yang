import { describe, expect, it } from 'vitest'

import {
  assistantBenchPath,
  assistantBenchReached,
} from '@/lib/assistant-workspace'

describe('开台去哪、到了没有（第 9e 步）', () => {
  it('各台的地址：画布带 project，角色页带 character', () => {
    expect(assistantBenchPath({ workspace: 'image-tags' })).toBe(
      '/studio/image/tags',
    )
    expect(assistantBenchPath({ workspace: 'video' })).toBe('/studio/video')
    expect(assistantBenchPath({ workspace: 'canvas', projectId: 'new' })).toBe(
      '/studio/node?project=new',
    )
    expect(
      assistantBenchPath({ workspace: 'cards', characterId: 'card-9' }),
    ).toBe('/cards?character=card-9')
  })

  it('画布要等那块真打开（new 不算到）；别的台只看台', () => {
    const canvas = { workspace: 'canvas' as const, projectId: 'proj-2' }
    expect(assistantBenchReached(canvas, 'canvas', 'proj-2')).toBe(true)
    expect(assistantBenchReached(canvas, 'canvas', 'proj-1')).toBe(false)
    expect(
      assistantBenchReached(
        { workspace: 'canvas', projectId: 'new' },
        'canvas',
        'proj-1',
      ),
    ).toBe(false)
    expect(
      assistantBenchReached({ workspace: 'video' }, 'video', undefined),
    ).toBe(true)
    expect(
      assistantBenchReached({ workspace: 'video' }, 'image-natural', undefined),
    ).toBe(false)
  })
})
