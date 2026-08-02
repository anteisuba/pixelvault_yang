import { describe, expect, it } from 'vitest'

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_TYPE_IDS,
  type NodeImageRole,
} from '@/constants/node-types'
import {
  buildDisplayNamePatch,
  resolveNodeDisplayName,
  stripFileExtension,
} from '@/lib/node-display-name'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

function data(patch: Partial<NodeWorkflowNodeData>): NodeWorkflowNodeData {
  return { prompt: '', status: 'idle', ...patch } as NodeWorkflowNodeData
}

// 台账 C5：写侧去噪。读侧的精确相等守卫接不住「拖入一个 hash 命名的下载
// 文件」——它不等于任何 id 字段，只能在写入前剥掉扩展名减轻观感。
describe('stripFileExtension', () => {
  it.each([
    ['IMG_2043.png', 'IMG_2043'],
    [
      'cbf13d8d9e967d35c185019db8431c80.jpeg',
      'cbf13d8d9e967d35c185019db8431c80',
    ],
    ['无扩展名', '无扩展名'],
    ['  留白.webp  ', '留白'],
  ])('%s → %s', (input, expected) => {
    expect(stripFileExtension(input)).toBe(expected)
  })

  it('不截断名字里正常出现的点', () => {
    // `v1.5 概念稿` 的 `.5 概念稿` 不是扩展名（不是 1–8 位字母数字）。
    expect(stripFileExtension('v1.5 概念稿')).toBe('v1.5 概念稿')
    expect(stripFileExtension('2026.08.02 分镜')).toBe('2026.08.02 分镜')
  })

  it('全是扩展名时返回空串，让调用方落自己的兜底文案', () => {
    expect(stripFileExtension('.png')).toBe('')
  })
})

describe('resolveNodeDisplayName', () => {
  it('从没命名过时返回 undefined，不编一个兜底出来', () => {
    // 可编辑标签靠这个区分「用户起过名」和「我们编了个名」——塞兜底进来，
    // LooseImageCard 的输入框一次原样回车就会把兜底文案存成真名字。
    expect(resolveNodeDisplayName(data({}))).toBeUndefined()
    expect(resolveNodeDisplayName(data({ mediaLabel: '   ' }))).toBeUndefined()
  })

  it.each([
    ['characterName', { characterName: '小林' }, '小林'],
    [
      'character.name',
      { character: { characterId: 'r1', name: '常客', visualSeed: 'x' } },
      '常客',
    ],
    ['backgroundName', { backgroundName: '夜市' }, '夜市'],
    ['shotName', { shotName: '雨夜开场镜' }, '雨夜开场镜'],
    ['voiceName', { voiceName: '旁白' }, '旁白'],
    ['mediaLabel', { mediaLabel: '散图 A' }, '散图 A'],
    ['sourceLabel', { sourceLabel: '来源 B' }, '来源 B'],
  ])('读得到 %s', (_label, patch, expected) => {
    expect(resolveNodeDisplayName(data(patch))).toBe(expected)
  })

  // 台账 C5（2026-08-02）：快捷编辑面板显示「正在编辑 [cbf13d8d…]」——
  // 素材库选图那条路径把 generation id 写进了显示名字段。与模型 id 同治。
  it.each([
    ['generationId', 'generationId'],
    ['sourceGenerationId', 'sourceGenerationId'],
    ['derivedFromGenerationId', 'derivedFromGenerationId'],
  ])('丢掉「其实是 %s」的标签', (_label, field) => {
    const id = 'cbf13d8d9e967d35c185019db8431c80'
    const dirty = data({
      mediaLabel: id,
      sourceLabel: id,
      [field]: id,
    } as Partial<NodeWorkflowNodeData>)
    expect(resolveNodeDisplayName(dirty)).toBeUndefined()
  })

  it('用户把图起成 hex 名字时照常显示 —— 只挡精确相等，不做模式匹配', () => {
    // 判据纪律：绝不能因为「长得像 hash」就丢掉，用户完全可以这么起名。
    const named = data({
      mediaLabel: 'cbf13d8d9e967d35c185019db8431c80',
      generationId: 'a-completely-different-id',
    } as Partial<NodeWorkflowNodeData>)
    expect(resolveNodeDisplayName(named)).toBe(
      'cbf13d8d9e967d35c185019db8431c80',
    )
  })

  it('丢掉「其实是模型 id」的标签 —— 存量项目里的脏数据', () => {
    // 生成流程曾把 generation.model 写进 mediaLabel（写侧已修），但老项目里
    // 那些标签还在。判据是与本节点自己的 modelId **精确相等**，不是模式匹配。
    const dirty = data({
      mediaLabel: 'gemini-3.1-flash-image-preview',
      sourceLabel: 'gemini-3.1-flash-image-preview',
      model: {
        optionId: 'workspace:gemini-3.1-flash-image-preview',
        modelId: 'gemini-3.1-flash-image-preview',
        adapterType: 'gemini',
        providerConfig: { label: 'Gemini', baseUrl: 'https://x' },
      },
    } as Partial<NodeWorkflowNodeData>)
    expect(resolveNodeDisplayName(dirty)).toBeUndefined()
  })

  it('用户真把图叫成模型名之外的名字时照常显示', () => {
    // 只有「与本节点实际用的 modelId 一字不差」才丢弃；别的都留。
    const named = data({
      mediaLabel: 'gemini 那张',
      model: {
        optionId: 'workspace:gemini-3.1-flash-image-preview',
        modelId: 'gemini-3.1-flash-image-preview',
        adapterType: 'gemini',
        providerConfig: { label: 'Gemini', baseUrl: 'https://x' },
      },
    } as Partial<NodeWorkflowNodeData>)
    expect(resolveNodeDisplayName(named)).toBe('gemini 那张')
  })

  it('专有身份名优先于通用媒体标签', () => {
    expect(
      resolveNodeDisplayName(
        data({ shotName: '雨夜开场镜', mediaLabel: 'IMG_2201' }),
      ),
    ).toBe('雨夜开场镜')
  })
})

describe('buildDisplayNamePatch', () => {
  it.each([
    [NODE_IMAGE_ROLE_IDS.character, 'characterName'],
    [NODE_IMAGE_ROLE_IDS.closeup, 'characterName'],
    [NODE_IMAGE_ROLE_IDS.background, 'backgroundName'],
    [NODE_IMAGE_ROLE_IDS.shot, 'shotName'],
  ] as Array<[NodeImageRole, string]>)('role=%s 写 %s', (role, field) => {
    expect(buildDisplayNamePatch({ role }, '新名字')).toEqual({
      [field]: '新名字',
    })
  })

  it('无 role 的节点落到通用媒体标签，两个字段一起写', () => {
    // 只写 mediaLabel 会让它和 sourceLabel 悄悄分叉。
    expect(
      buildDisplayNamePatch({ type: NODE_TYPE_IDS.image }, '散图'),
    ).toEqual({
      mediaLabel: '散图',
      sourceLabel: '散图',
    })
  })

  it('legacy type 仍然认得（合并前保存的项目）', () => {
    expect(
      buildDisplayNamePatch({ type: NODE_TYPE_IDS.characterImage }, '小林'),
    ).toEqual({ characterName: '小林' })
    expect(
      buildDisplayNamePatch({ type: NODE_TYPE_IDS.voice }, '常客'),
    ).toEqual({
      voiceName: '常客',
    })
  })

  it('role 优先于 type —— 统一 image 节点的身份在 role 上', () => {
    expect(
      buildDisplayNamePatch(
        { role: NODE_IMAGE_ROLE_IDS.shot, type: NODE_TYPE_IDS.image },
        '镜 01',
      ),
    ).toEqual({ shotName: '镜 01' })
  })
})

describe('读写闭环 —— 换组件渲染不丢名字', () => {
  /**
   * 这组断言是本包的正主。旧实现里同一个 `role=shot` 静帧：
   *   空态 → NodeMediaPreview，读写 shotName
   *   有图 → LooseImageCard，读写 mediaLabel
   * 于是「起完名再生成一张图」名字当场消失。收口后写侧只看 role，读侧的优先链
   * 含 shotName，所以两种呈现读到的是同一个值。
   */
  it.each([
    NODE_IMAGE_ROLE_IDS.character,
    NODE_IMAGE_ROLE_IDS.background,
    NODE_IMAGE_ROLE_IDS.shot,
    NODE_IMAGE_ROLE_IDS.closeup,
  ])('role=%s 写进去的名字一定读得回来', (role) => {
    const patch = buildDisplayNamePatch({ role }, '雨夜开场镜')
    expect(resolveNodeDisplayName(data({ role, ...patch }))).toBe('雨夜开场镜')
  })

  it('无 role 的散图同样闭环', () => {
    const patch = buildDisplayNamePatch({ type: NODE_TYPE_IDS.image }, '散图 A')
    expect(resolveNodeDisplayName(data(patch))).toBe('散图 A')
  })

  it('静帧出图前后是同一个字段 —— 不再依赖“当前由哪个组件渲染”', () => {
    const before = buildDisplayNamePatch(
      { role: NODE_IMAGE_ROLE_IDS.shot },
      '镜 01',
    )
    // 出图后 LooseImageCard 接手，它现在传的 identity 只有 role，结果必须相同。
    const after = buildDisplayNamePatch(
      { role: NODE_IMAGE_ROLE_IDS.shot },
      '镜 01',
    )
    expect(after).toEqual(before)
    expect(Object.keys(before)).toEqual(['shotName'])
  })
})
