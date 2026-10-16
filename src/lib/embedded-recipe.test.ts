import { describe, expect, it } from 'vitest'

import { embeddedRecipeText } from '@/lib/embedded-recipe'

const LIMITS = { maxChars: 6_000, maxValueChars: 2_000 }

const A1111 = `masterpiece, 1girl, silver hair, rain
Negative prompt: lowres, bad hands
Steps: 28, Sampler: DPM++ 2M, Schedule type: Karras, CFG scale: 6, Seed: 42, Size: 832x1216, Model hash: abc123, Model: animagine-xl-4.0`

describe('embeddedRecipeText', () => {
  it('A1111 的 parameters 原样给，不拆字段', () => {
    expect(
      embeddedRecipeText([{ keyword: 'parameters', text: A1111 }], LIMITS),
    ).toBe(`parameters: ${A1111}`)
  })

  it('NovelAI：几块都给，JSON 压成一行、长编码串只写长度', () => {
    const comment = JSON.stringify(
      {
        prompt: '1girl, rain',
        uc: 'lowres',
        steps: 28,
        signed_hash: 'A'.repeat(300),
      },
      null,
      2,
    )
    const text = embeddedRecipeText(
      [
        { keyword: 'Software', text: 'NovelAI' },
        { keyword: 'Source', text: 'NovelAI Diffusion V4.5' },
        { keyword: 'Comment', text: comment },
      ],
      LIMITS,
    )
    expect(text).toBe(
      [
        'Software: NovelAI',
        'Source: NovelAI Diffusion V4.5',
        'Comment: {"prompt":"1girl, rain","uc":"lowres","steps":28,"signed_hash":"[300 characters of encoded data]"}',
      ].join('\n'),
    )
  })

  it('ComfyUI：实际跑的那张图一个节点一行，连线写成 ←#，编辑器那张不要', () => {
    const prompt = {
      '3': {
        class_type: 'KSampler',
        inputs: {
          seed: 7,
          steps: 20,
          cfg: 5.5,
          sampler_name: 'euler',
          model: ['4', 0],
          positive: ['6', 0],
          negative: ['7', 0],
        },
      },
      '4': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: 'noob.safetensors' },
      },
      '6': {
        class_type: 'CLIPTextEncode',
        inputs: { text: '1girl, rain', clip: ['4', 1] },
        _meta: { title: 'Positive' },
      },
      '7': {
        class_type: 'CLIPTextEncode',
        inputs: { text: 'lowres', clip: ['4', 1] },
      },
    }
    const text = embeddedRecipeText(
      [
        { keyword: 'prompt', text: JSON.stringify(prompt) },
        { keyword: 'workflow', text: JSON.stringify({ nodes: [], links: [] }) },
      ],
      LIMITS,
    )
    expect(text).toBe(
      [
        'prompt: #3 KSampler: seed=7, steps=20, cfg=5.5, sampler_name="euler", model←#4, positive←#6, negative←#7',
        '#4 CheckpointLoaderSimple: ckpt_name="noob.safetensors"',
        '#6 CLIPTextEncode "Positive": text="1girl, rain", clip←#4',
        '#7 CLIPTextEncode: text="lowres", clip←#4',
      ].join('\n'),
    )
  })

  it('ComfyUI 只有编辑器那张：有填值的节点一行，关掉的标出来', () => {
    const workflow = {
      nodes: [
        { id: 6, type: 'CLIPTextEncode', widgets_values: ['1girl'] },
        {
          id: 9,
          type: 'LoraLoader',
          mode: 4,
          widgets_values: ['x.safetensors', 0.8, 0.8],
        },
        { id: 10, type: 'VAEDecode', widgets_values: [] },
        { id: 11, type: 'Reroute' },
      ],
      links: [],
    }
    expect(
      embeddedRecipeText(
        [{ keyword: 'workflow', text: JSON.stringify(workflow) }],
        LIMITS,
      ),
    ).toBe(
      [
        'workflow: #6 CLIPTextEncode: "1girl"',
        '#9 LoraLoader (off): "x.safetensors", 0.8, 0.8',
      ].join('\n'),
    )
  })

  it('不是配方的块不要：酒馆卡、XMP、整块编码数据、空字', () => {
    expect(
      embeddedRecipeText(
        [
          { keyword: 'chara', text: 'eyJuYW1lIjoieCJ9' },
          { keyword: 'XML:com.adobe.xmp', text: '<x:xmpmeta/>' },
          { keyword: 'Raw profile type exif', text: 'exif\n 12\n4578' },
          { keyword: 'blob', text: 'Q'.repeat(400) },
          { keyword: 'Title', text: '   ' },
        ],
        LIMITS,
      ),
    ).toBeNull()
  })

  it('不像 ComfyUI 的 prompt 块当普通文字给', () => {
    expect(
      embeddedRecipeText(
        [{ keyword: 'prompt', text: 'a cat on a roof' }],
        LIMITS,
      ),
    ).toBe('prompt: a cat on a roof')
  })

  it('超长截断并标出来', () => {
    const text = embeddedRecipeText(
      [{ keyword: 'parameters', text: 'x'.repeat(50) }],
      { maxChars: 30, maxValueChars: 20 },
    )
    // 一格先截到 20 字，整段再截到 30 字。
    expect(text).toBe(`parameters: ${'x'.repeat(18)}…[cut]`)
  })
})
