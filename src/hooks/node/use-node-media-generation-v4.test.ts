import { describe, expect, it } from 'vitest'

import { NODE_SLOT_IDS, NODE_SLOT_OUTPUT_IDS } from '@/constants/node-slots'
import { V4_SLOT_ISSUE_IDS } from '@/lib/node-slot-payload'
import type { CharacterCardRecord } from '@/types'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowEdgeV4,
} from '@/types/node-workflow'

import {
  planV4Generation,
  preflightV4Plan,
  type V4GenerationPlan,
} from './use-node-media-generation-v4'

const NOW = '2026-09-07T00:00:00.000Z'
const MODEL = {
  optionId: 'opt',
  modelId: 'seedance-2.5',
  adapterType: 'fal',
  apiKeyId: 'key-1',
} as NodeV4Data extends { model?: infer M } ? NonNullable<M> : never

function node(
  id: string,
  data: Partial<NodeV4Data> & { kind: NodeV4Data['kind'] },
): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { name: id, status: 'idle', createdAt: NOW, ...data } as NodeV4Data,
  }
}

function edge(
  id: string,
  source: string,
  target: string,
  slot: NodeWorkflowEdgeV4['slot'],
): NodeWorkflowEdgeV4 {
  return {
    id,
    source,
    sourceHandle: NODE_SLOT_OUTPUT_IDS.out,
    target,
    slot,
  }
}

const first = node('first', {
  kind: 'image',
  subtype: 'shot',
  url: 'https://cdn/first.png',
})
const last = node('last', {
  kind: 'image',
  subtype: 'shot',
  url: 'https://cdn/last.png',
})
const character = node('char', {
  kind: 'image',
  subtype: 'character',
  name: '阿岚',
  url: 'https://cdn/char.png',
})
const voice = node('v', {
  kind: 'audio',
  subtype: 'voice',
  url: 'https://cdn/v.mp3',
  ownerName: '阿岚',
})
const script = node('t1', {
  kind: 'text',
  subtype: 'shotNote',
  body: '她回头',
  defaultRole: 'script',
})
const style = node('t2', {
  kind: 'text',
  subtype: 'rule',
  body: '胶片颗粒',
  defaultRole: 'style',
})
const shot = node('shot', {
  kind: 'video',
  subtype: 'shot',
  label: '走廊',
  prompt: '镜头缓推',
  model: MODEL,
  negativePrompt: '模糊',
  params: { aspectRatio: '16:9', resolution: '1080p', duration: '8', seed: 7 },
})

const graph = {
  nodes: [first, last, character, voice, script, style, shot],
  edges: [
    edge('e1', 'first', 'shot', NODE_SLOT_IDS.firstFrame),
    edge('e2', 'last', 'shot', NODE_SLOT_IDS.lastFrame),
    edge('e3', 'char', 'shot', NODE_SLOT_IDS.reference),
    edge('e4', 'v', 'shot', NODE_SLOT_IDS.voice),
    edge('e5', 't1', 'shot', NODE_SLOT_IDS.text),
    edge('e6', 't2', 'shot', NODE_SLOT_IDS.text),
  ],
}

describe('planV4Generation · 视频', () => {
  const plan = planV4Generation('shot', graph)!

  it('首帧/尾帧/参考/语音各落各的位置；Seedance 2.5 接受 1080p', () => {
    expect(plan.kind).toBe('video')
    expect(plan.referenceImages).toEqual([
      'https://cdn/first.png',
      'https://cdn/last.png',
      'https://cdn/char.png',
    ])
    expect(plan.audioUrls).toEqual(['https://cdn/v.mp3'])
    expect(plan.audioBindings).toEqual([
      { url: 'https://cdn/v.mp3', characterName: '阿岚' },
    ])
    expect(plan.aspectRatio).toBe('16:9')
    expect(plan.resolution).toBe('1080p')
    expect(plan.duration).toBe(8)
    expect(plan.seed).toBe(7)
    expect(plan.negativePrompt).toBe('模糊')
  })

  it('三类文本分流：剧本进正文，风格约束排在最后', () => {
    expect(plan.prompt).toBe('她回头\n\n镜头缓推\n\n胶片颗粒')
  })

  it('填满的镜头没有校验问题', () => {
    expect(plan.issues).toEqual([])
  })

  it('挂了参考项 → 端点换成该型号的**参考变体**（spec §5 推出来的模式）', () => {
    // 这张图上挂着角色卡（参考图）与语音 —— 推出来的模式是「全能参考」。
    expect(plan.modelId).toBe('seedance-2.5-reference')
  })

  it('只有首 / 尾帧 → 留在关键帧端点，⛔ 不偷偷换到参考端点', () => {
    const keyframeOnly = planV4Generation('shot', {
      nodes: graph.nodes,
      edges: [
        edge('e1', 'first', 'shot', NODE_SLOT_IDS.firstFrame),
        edge('e2', 'last', 'shot', NODE_SLOT_IDS.lastFrame),
      ],
    })!
    expect(keyframeOnly.modelId).toBe('seedance-2.5')
  })

  it('Seedance 2.5 不接受 3s：吸附到 4s，1080p 原样带过去', () => {
    const short = node('short', {
      kind: 'video',
      subtype: 'shot',
      prompt: '缓推',
      model: MODEL,
      params: { duration: '3', resolution: '1080p', aspectRatio: '9:16' },
    })
    const planShort = planV4Generation('short', {
      nodes: [character, short],
      edges: [edge('e1', 'char', 'short', NODE_SLOT_IDS.reference)],
    })!
    expect(planShort.duration).toBe(4)
    expect(planShort.resolution).toBe('1080p')
    expect(planShort.aspectRatio).toBe('9:16')
  })

  it('这个型号在这条渠道上没有参考变体 → **保留原选择**，⛔ 不回退到别的端点', () => {
    const veo = node('veo', {
      kind: 'video',
      subtype: 'shot',
      prompt: '推近',
      model: {
        optionId: 'opt',
        modelId: 'veo-3.1',
        adapterType: 'fal',
        apiKeyId: 'key-1',
      } as typeof MODEL,
    })
    const plan31 = planV4Generation('veo', {
      nodes: [character, veo],
      edges: [edge('e1', 'char', 'veo', NODE_SLOT_IDS.reference)],
    })!
    expect(plan31.modelId).toBe('veo-3.1')
  })
})

describe('planV4Generation · 其余分支', () => {
  it('文本节点没有生成落点 → null', () => {
    expect(planV4Generation('t1', graph)).toBeNull()
  })

  it('没选模型 → null（⛔ 不替用户代选一个再发出去）', () => {
    const noModel = node('n', { kind: 'image', subtype: 'shot' })
    expect(planV4Generation('n', { nodes: [noModel], edges: [] })).toBeNull()
  })

  it('图：参考槽的图进 referenceImages，文本进正文', () => {
    const still = node('still', {
      kind: 'image',
      subtype: 'shot',
      model: MODEL,
      prompt: '走廊全景',
      params: { aspectRatio: '3:4' },
    })
    const plan = planV4Generation('still', {
      nodes: [...graph.nodes, still],
      edges: [
        edge('a', 'char', 'still', NODE_SLOT_IDS.reference),
        edge('b', 't1', 'still', NODE_SLOT_IDS.text),
      ],
    })!
    expect(plan.kind).toBe('image')
    expect(plan.referenceImages).toEqual(['https://cdn/char.png'])
    expect(plan.prompt).toContain('Image 1 = "阿岚"')
    expect(plan.prompt).toContain('她回头\n\n走廊全景')
    expect(plan.aspectRatio).toBe('3:4')
  })

  it('图 · 九宫格：发出去的那一份包上分镜模板、只出一张；卡上的原句不动', () => {
    const sheet = node('sheet', {
      kind: 'image',
      subtype: 'shot',
      model: MODEL,
      prompt: '雨夜的天台，她等了很久，最后转身离开',
      params: { aspectRatio: '16:9', count: 4, storyboardGrid: true },
    })
    const plan = planV4Generation('sheet', { nodes: [sheet], edges: [] })!
    expect(plan.prompt).toContain('3×3 storyboard grid')
    expect(plan.prompt).toContain('雨夜的天台，她等了很久，最后转身离开')
    expect(plan.count).toBe(1)
    expect(sheet.data.kind === 'image' && sheet.data.prompt).toBe(
      '雨夜的天台，她等了很久，最后转身离开',
    )
  })

  it('图 · 九宫格关着：照常按张数发、不包模板', () => {
    const still = node('still', {
      kind: 'image',
      subtype: 'shot',
      model: MODEL,
      prompt: '走廊全景',
      params: { count: 2, storyboardGrid: false },
    })
    const plan = planV4Generation('still', { nodes: [still], edges: [] })!
    expect(plan.prompt).toBe('走廊全景')
    expect(plan.count).toBe(2)
  })

  it('图 · 先搜再画：卡上开着、型号支持才带上', () => {
    const grounded = node('g', {
      kind: 'image',
      subtype: 'shot',
      model: Object.assign({}, MODEL, { modelId: 'gemini-nano-banana-2.1' }),
      prompt: '台北 101 雨夜',
      params: { searchGrounding: true },
    })
    expect(
      planV4Generation('g', { nodes: [grounded], edges: [] })!.searchGrounding,
    ).toBe(true)

    const unsupported = node('u', {
      kind: 'image',
      subtype: 'shot',
      model: MODEL,
      prompt: '台北 101 雨夜',
      params: { searchGrounding: true },
    })
    expect(
      planV4Generation('u', { nodes: [unsupported], edges: [] })!
        .searchGrounding,
    ).toBeUndefined()
  })

  it('音：台词经 text 槽进 prompt', () => {
    const out = node('out', { kind: 'audio', subtype: 'voice', model: MODEL })
    const plan = planV4Generation('out', {
      nodes: [out, script],
      edges: [edge('a', 't1', 'out', NODE_SLOT_IDS.text)],
    })!
    expect(plan.kind).toBe('audio')
    expect(plan.prompt).toBe('她回头')
  })

  it('合并节点少于 2 条片段 → 计划里带 belowMin，调用方必须先看它', () => {
    const clip = node('c1', {
      kind: 'video',
      subtype: 'clip',
      url: 'https://cdn/c1.mp4',
    })
    const merge = node('m', { kind: 'video', subtype: 'merge', model: MODEL })
    const plan = planV4Generation('m', {
      nodes: [clip, merge],
      edges: [edge('a', 'c1', 'm', NODE_SLOT_IDS.clip)],
    })!
    expect(plan.issues).toEqual([
      {
        slot: NODE_SLOT_IDS.clip,
        issue: V4_SLOT_ISSUE_IDS.belowMin,
        i18nKey: 'StudioNode.v4.slotIssue.belowMin',
      },
    ])
  })
})

describe('planV4Generation · 镜头里 @她（画布用角色 ④ 第 2 片）', () => {
  const DENIA = {
    id: 'denia',
    name: 'Denia',
    referenceSlots: [
      { id: 's_main', url: 'https://cdn/denia.png', isPrimary: true },
    ],
    sourceImageUrl: null,
    variants: [],
  } as unknown as CharacterCardRecord

  it('只挂首帧 + @她：带上她和勾的图，端点换成参考变体，正文里的 @ 去掉', () => {
    const keyframeShot = node('ks', {
      kind: 'video',
      subtype: 'shot',
      label: '回头',
      prompt: '@Denia 在雨里回头',
      model: MODEL,
      characterPicks: { denia: [{ generationId: 'g_1' }] },
    })
    const plan = planV4Generation(
      'ks',
      {
        nodes: [first, keyframeShot],
        edges: [edge('e1', 'first', 'ks', NODE_SLOT_IDS.firstFrame)],
      },
      { characterCards: [DENIA] },
    )!
    expect(plan.characterCardIds).toEqual(['denia'])
    expect(plan.characterImagePicks).toEqual({
      denia: [{ generationId: 'g_1' }],
    })
    expect(plan.modelId).toBe('seedance-2.5-reference')
    expect(plan.prompt).toContain('Denia 在雨里回头')
    expect(plan.prompt).not.toContain('@Denia')
  })

  it('图片卡 @她 没勾过：带主图 1 张', () => {
    const still = node('st', {
      kind: 'image',
      subtype: 'shot',
      prompt: '@Denia 的半身',
      model: MODEL,
    })
    const plan = planV4Generation(
      'st',
      { nodes: [still], edges: [] },
      { characterCards: [DENIA] },
    )!
    expect(plan.characterImagePicks).toEqual({ denia: [{ slotId: 's_main' }] })
    expect(plan.prompt).toBe('Denia 的半身')
  })

  it('没给角色库：不认 @，行为与从前一样', () => {
    const still = node('st2', {
      kind: 'image',
      subtype: 'shot',
      prompt: '@Denia 的半身',
      model: MODEL,
    })
    const plan = planV4Generation('st2', { nodes: [still], edges: [] })!
    expect(plan.characterCardIds).toBeUndefined()
  })
})

describe('preflightV4Plan · 发送前校验（owner 09-28：不发送 + 说清哪项超了多少）', () => {
  const SEEDANCE_20 = {
    optionId: 'opt',
    modelId: 'seedance-2.0',
    adapterType: 'fal',
    apiKeyId: 'key-1',
  } as typeof MODEL
  const DENIA = {
    id: 'denia',
    name: 'Denia',
    referenceSlots: [
      { id: 's_main', url: 'https://cdn/denia.png', isPrimary: true },
    ],
    sourceImageUrl: null,
    variants: [],
  } as unknown as CharacterCardRecord

  /** 一张挂了 n 张参考图的 2.0 镜头（参考槽，全部走参考端点）。 */
  function shotWithImages(count: number, prompt = '她回头') {
    const images = Array.from({ length: count }, (_, index) =>
      node(`img${index}`, {
        kind: 'image',
        subtype: 'reference',
        url: `https://cdn/ref${index}.png`,
      }),
    )
    const target = node('s20', {
      kind: 'video',
      subtype: 'shot',
      prompt,
      model: SEEDANCE_20,
    })
    return {
      nodes: [...images, target],
      edges: images.map((image, index) =>
        edge(`r${index}`, image.id, 's20', NODE_SLOT_IDS.reference),
      ),
    }
  }

  it('填满且都在上限内：没有拦截', () => {
    const plan = planV4Generation('shot', graph)!
    expect(preflightV4Plan(plan)).toEqual([])
  })

  it('发送合同是这一枪的端点：2.0 参考档 9/3/3、合计 12，时长 2–15s', () => {
    const plan = planV4Generation('s20', shotWithImages(2))!
    expect(plan.modelId).toBe('seedance-2.0-reference')
    expect(plan.referenceSlots).toMatchObject({
      images: 9,
      videos: 3,
      audio: 3,
      total: 12,
      videoSeconds: { perClipMin: 2, perClipMax: 15, total: 15 },
    })
  })

  it('参考图超过模型上限：拦下并给出张数与上限', () => {
    const plan = planV4Generation('s20', shotWithImages(10))!
    expect(preflightV4Plan(plan)).toEqual([
      { kind: 'tooMany', media: 'image', count: 10, max: 9 },
    ])
  })

  it('@她 让参考图超额：算上她的图并点名 —— 服务端满额时是静默不带她', () => {
    const plan = planV4Generation('s20', shotWithImages(9, '@Denia 回头'), {
      characterCards: [DENIA],
    })!
    expect(plan.characterImageExtras).toEqual([{ name: 'Denia', images: 1 }])
    expect(preflightV4Plan(plan)).toEqual([
      {
        kind: 'tooMany',
        media: 'image',
        count: 10,
        max: 9,
        characterImages: 1,
        characterNames: ['Denia'],
      },
    ])
  })

  it('她的图已经挂在参考轨上：不重复计，满 9 张照常发', () => {
    const graphWithDenia = shotWithImages(8, '@Denia 回头')
    const deniaOnRail = node('denia-img', {
      kind: 'image',
      subtype: 'reference',
      url: 'https://cdn/denia.png',
    })
    const plan = planV4Generation(
      's20',
      {
        nodes: [deniaOnRail, ...graphWithDenia.nodes],
        edges: [
          edge('rd', 'denia-img', 's20', NODE_SLOT_IDS.reference),
          ...graphWithDenia.edges,
        ],
      },
      { characterCards: [DENIA] },
    )!
    expect(plan.referenceImages).toHaveLength(9)
    expect(plan.characterImageExtras).toEqual([{ name: 'Denia', images: 0 }])
    expect(preflightV4Plan(plan)).toEqual([])
  })

  const base: V4GenerationPlan = {
    kind: 'video',
    modelId: 'seedance-2.0-reference',
    prompt: 'x',
    issues: [],
    referenceImages: ['https://cdn/a.png'],
    videoUrls: ['https://cdn/dance.mp4'],
    audioUrls: [],
    referenceSlots: {
      images: 9,
      videos: 3,
      audio: 3,
      total: 12,
      audioRequiresVisual: true,
      videoSeconds: { perClipMin: 2, perClipMax: 15, total: 15 },
      audioSeconds: { perClipMin: 2, perClipMax: 15, total: 15 },
    },
  }

  it('参考视频单段超长：说是哪一段、多长、上限多少；只有一段时不重复报总长', () => {
    expect(
      preflightV4Plan(base, { video: [{ name: '跳舞', seconds: 16.3 }] }),
    ).toEqual([
      {
        kind: 'clipTooLong',
        media: 'video',
        name: '跳舞',
        seconds: 16.3,
        limit: 15,
      },
    ])
  })

  it('两段各自合规、加起来超了：报总长', () => {
    expect(
      preflightV4Plan(
        { ...base, videoUrls: ['https://cdn/a.mp4', 'https://cdn/b.mp4'] },
        {
          video: [
            { name: 'A', seconds: 9 },
            { name: 'B', seconds: 8 },
          ],
        },
      ),
    ).toEqual([{ kind: 'totalTooLong', media: 'video', seconds: 17, max: 15 }])
  })

  it('太短也拦（官方单段下限 2s）；容器尾数不算超', () => {
    expect(
      preflightV4Plan(base, { video: [{ name: '闪', seconds: 1.2 }] }),
    ).toEqual([
      {
        kind: 'clipTooShort',
        media: 'video',
        name: '闪',
        seconds: 1.2,
        limit: 2,
      },
    ])
    expect(
      preflightV4Plan(base, { video: [{ name: '贴边', seconds: 15.02 }] }),
    ).toEqual([])
  })

  it('时长读不出来：放行，⛔ 不拿不知道的数去拦', () => {
    expect(preflightV4Plan(base, { video: [{ name: '未知' }] })).toEqual([])
  })

  it('只带参考音频、模型要求音频搭配画面：拦下', () => {
    expect(
      preflightV4Plan({
        ...base,
        referenceImages: [],
        videoUrls: [],
        audioUrls: ['https://cdn/v.mp3'],
      }),
    ).toEqual([{ kind: 'audioOnly' }])
  })

  it('关键帧端点挂了参考视频：上限是 0，照样拦（文案说「不收」）', () => {
    expect(
      preflightV4Plan({
        ...base,
        referenceSlots: { images: 1, videos: 0, audio: 0 },
      }),
    ).toEqual([{ kind: 'tooMany', media: 'video', count: 1, max: 0 }])
  })

  it('槽问题三类卡都拦；图片卡不查数量（超额有设计好的降级）', () => {
    const issue = {
      slot: NODE_SLOT_IDS.firstFrame,
      issue: V4_SLOT_ISSUE_IDS.currentMissing,
    }
    const imagePlan: V4GenerationPlan = {
      kind: 'image',
      modelId: 'gpt-image-2',
      prompt: 'x',
      issues: [issue],
      referenceImages: Array.from(
        { length: 40 },
        (_, i) => `https://cdn/${i}.png`,
      ),
    }
    expect(preflightV4Plan(imagePlan)).toEqual([{ kind: 'slot', issue }])
  })
})
