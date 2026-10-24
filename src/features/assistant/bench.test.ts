import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/kernel/assistant-operator.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-image.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-lora.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-cards.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-bench.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-steps.service', () => ({}))
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

  it('台上没有的那一格回一句说明，列出这台有的（⛔ 不抛）', () => {
    const mutation = toV3Mutation('lora', { op: 'count', count: 2 })
    expect(mutation.tool).toBeNull()
    expect(mutation.tool === null && mutation.error).toContain(
      '"count" is not a control on this bench',
    )
    expect(mutation.tool === null && mutation.error).toContain('add_lora')
    const cards = toV3Mutation('cards', { op: 'prompt', text: 'x' })
    expect(cards.tool === null && cards.error).toContain('on this page')
  })

  it('视频台：时长随尺寸一起、首尾帧走 slot', () => {
    expect(
      toV3Mutation('video', {
        op: 'specs',
        duration: 5.2,
        aspectRatio: '16:9',
      }),
    ).toEqual({
      tool: 'edit',
      input: {
        ops: [
          {
            op: 'set_specs',
            duration: 5,
            aspectRatio: '16:9',
            resolution: null,
          },
        ],
      },
    })
    expect(
      toV3Mutation('video', {
        op: 'add_reference',
        picture: 'gen-1',
        slot: 'first',
      }),
    ).toEqual({
      tool: 'edit',
      input: {
        ops: [{ op: 'mount_reference', asset: 'gen-1', slot: 'first' }],
      },
    })
    expect(toV3Mutation('video', { op: 'count', count: 2 }).tool).toBeNull()
  })

  it('角色页：提议设定补齐可空的那几格', () => {
    expect(
      toV3Mutation('cards', {
        op: 'propose_profile',
        character: 'char-b27ce8',
        fields: [{ field: 'look', text: 'silver hair' }],
      }),
    ).toEqual({
      tool: 'edit',
      input: {
        ops: [
          {
            op: 'propose_profile',
            character: 'char-b27ce8',
            say: '',
            fields: [
              {
                field: 'look',
                text: 'silver hair',
                source: '',
                sourceUrl: null,
                added: null,
              },
            ],
          },
        ],
      },
    })
  })

  it('缺必需那一格说清是哪一格', () => {
    expect(toV3Mutation('image', { op: 'option', key: 'style' })).toEqual({
      tool: null,
      error: 'option needs value.',
    })
  })
})
