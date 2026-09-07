import { describe, expect, it } from 'vitest'

import type { NodeV4, NodeV4Data } from '@/types/node-workflow'

import { inferV4ComposerHost } from './use-generate-composer-v4'

const NOW = '2026-09-07T00:00:00.000Z'

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

const first = node('first', {
  kind: 'image',
  subtype: 'shot',
  name: '首帧图',
  url: 'https://cdn/first.png',
})
const character = node('char', {
  kind: 'image',
  subtype: 'character',
  name: '阿岚',
  url: 'https://cdn/char.png',
})
const mutedVoice = node('v0', { kind: 'audio', subtype: 'voice', name: '无音' })
const script = node('t1', {
  kind: 'text',
  subtype: 'shotNote',
  name: '第一镜文本',
  body: '她回头',
  defaultRole: 'script',
})
const shot = node('shot', {
  kind: 'video',
  subtype: 'shot',
  label: '走廊',
  name: 'S01·镜头',
})

describe('inferV4ComposerHost · 卡片不是生成落点', () => {
  it('角色卡 / 背景卡返回 null（它们自己不产图）', () => {
    expect(inferV4ComposerHost(character)).toBeNull()
    expect(
      inferV4ComposerHost(node('bg', { kind: 'image', subtype: 'background' })),
    ).toBeNull()
  })

  it('文本 / 视频不归生成框（视频留在组装台）', () => {
    expect(inferV4ComposerHost(script)).toBeNull()
    expect(inferV4ComposerHost(shot)).toBeNull()
  })

  it('图 / 音各自报自己的档，hasMedia 跟着 url 走', () => {
    expect(inferV4ComposerHost(first)).toEqual({
      nodeId: 'first',
      mode: 'image',
      hasMedia: true,
      mediaUrl: 'https://cdn/first.png',
      label: '首帧图',
    })
    expect(inferV4ComposerHost(mutedVoice)).toEqual({
      nodeId: 'v0',
      mode: 'audio',
      hasMedia: false,
      label: '无音',
    })
  })
})
