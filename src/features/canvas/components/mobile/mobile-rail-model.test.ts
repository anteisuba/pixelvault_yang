import { describe, expect, it } from 'vitest'

import type { NodeV4 } from '@/types/node-workflow'

import {
  buildMobileRailLists,
  isShotNode,
  orderShots,
} from './mobile-rail-model'

function node(
  id: string,
  kind: NodeV4['data']['kind'],
  subtype: string,
  shotNo?: number,
): NodeV4 {
  return {
    id,
    type: 'v4',
    position: { x: 0, y: 0 },
    data: {
      kind,
      subtype,
      name: id,
      ...(shotNo === undefined ? {} : { shotNo }),
    },
  } as unknown as NodeV4
}

describe('mobile-rail-model', () => {
  it('镜头顺序 = 镜头带序（shotNo 升序），没归镜的排在末尾且保持原顺序', () => {
    const nodes = [
      node('c', 'video', 'shot', 3),
      node('loose1', 'video', 'clip'),
      node('a', 'video', 'shot', 1),
      node('loose2', 'video', 'clip'),
      node('b', 'video', 'shot', 2),
    ]
    expect(orderShots(nodes).map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
      'loose1',
      'loose2',
    ])
  })

  it('四个列表就是同一份 nodes 的投影，⛔ 不新增数据', () => {
    const nodes = [
      node('shot', 'video', 'shot', 1),
      node('img', 'image', 'shot'),
      node('voice', 'audio', 'voice'),
      node('text', 'text', 'script'),
    ]
    const lists = buildMobileRailLists(nodes)
    expect(lists.shots.map((item) => item.id)).toEqual(['shot'])
    expect(lists.images.map((item) => item.id)).toEqual(['img'])
    expect(lists.voices.map((item) => item.id)).toEqual(['voice'])
    expect(lists.texts.map((item) => item.id)).toEqual(['text'])
    expect(
      lists.shots.length +
        lists.images.length +
        lists.voices.length +
        lists.texts.length,
    ).toBe(nodes.length)
  })

  it('只有 video.shot 是「镜头」——散片段不带 S<nn> 前缀', () => {
    expect(isShotNode(node('a', 'video', 'shot', 1))).toBe(true)
    expect(isShotNode(node('b', 'video', 'clip'))).toBe(false)
    expect(isShotNode(node('c', 'image', 'shot'))).toBe(false)
  })
})
