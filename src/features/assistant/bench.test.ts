import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/kernel/assistant-operator.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-image.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-lora.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-look.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-watch.service', () => ({}))

import { toV3Mutation } from './bench'

describe('新工具的一条改动 → v3 执行函数的入参', () => {
  it('提示词：给了 edits 没写 mode 当成「找句换句」', () => {
    expect(
      toV3Mutation('image', {
        op: 'prompt',
        edits: [{ find: 'girl', replace: 'boy' }],
      }),
    ).toEqual({
      tool: 'write',
      input: {
        writes: [
          {
            field: 'prompt',
            mode: 'edit',
            text: null,
            edits: [{ find: 'girl', replace: 'boy' }],
          },
        ],
      },
    })
  })

  it('LoRA 参数：别名认得，只动那一格', () => {
    expect(
      toV3Mutation('lora', { op: 'lora_param', key: 'Guidance', value: '6.5' }),
    ).toEqual({
      tool: 'edit',
      input: {
        ops: [
          {
            op: 'set_params',
            steps: null,
            cfg: 6.5,
            seed: null,
            width: null,
            height: null,
            sampler: null,
            scheduler: null,
          },
        ],
      },
    })
  })

  it('台上没有的那一格回一句说明（⛔ 不抛）', () => {
    const mutation = toV3Mutation('lora', { op: 'count', count: 2 })
    expect(mutation.tool).toBeNull()
    expect(mutation.tool === null && mutation.error).toContain('LoRA bench')
  })

  it('缺必需那一格说清是哪一格', () => {
    expect(toV3Mutation('image', { op: 'option', key: 'style' })).toEqual({
      tool: null,
      error: 'option needs value.',
    })
  })
})
