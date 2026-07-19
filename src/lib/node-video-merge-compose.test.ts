import { describe, expect, it } from 'vitest'

import { NODE_TYPE_IDS } from '@/constants/node-types'

import {
  canComposeVideoMergeSelection,
  isVideoMergeSourceNodeType,
  sortNodesForVideoMergeCompose,
} from './node-video-merge-compose'

describe('isVideoMergeSourceNodeType', () => {
  it('accepts seedance / videoReference / videoMerge (mirrors the connection matrix)', () => {
    expect(isVideoMergeSourceNodeType(NODE_TYPE_IDS.seedance)).toBe(true)
    expect(isVideoMergeSourceNodeType(NODE_TYPE_IDS.videoReference)).toBe(true)
    expect(isVideoMergeSourceNodeType(NODE_TYPE_IDS.videoMerge)).toBe(true)
  })

  it('rejects non-video-source types', () => {
    expect(isVideoMergeSourceNodeType(NODE_TYPE_IDS.image)).toBe(false)
    expect(isVideoMergeSourceNodeType(NODE_TYPE_IDS.characterImage)).toBe(false)
    expect(isVideoMergeSourceNodeType(NODE_TYPE_IDS.voice)).toBe(false)
    expect(isVideoMergeSourceNodeType(NODE_TYPE_IDS.shot)).toBe(false)
  })

  it('rejects undefined (a node with no resolved type)', () => {
    expect(isVideoMergeSourceNodeType(undefined)).toBe(false)
  })
})

describe('canComposeVideoMergeSelection', () => {
  it('is true for 2+ nodes that are all legal videoMerge sources', () => {
    expect(
      canComposeVideoMergeSelection([
        { type: NODE_TYPE_IDS.seedance },
        { type: NODE_TYPE_IDS.videoReference },
      ]),
    ).toBe(true)
  })

  it('is true for a larger all-video selection (3+ clips)', () => {
    expect(
      canComposeVideoMergeSelection([
        { type: NODE_TYPE_IDS.seedance },
        { type: NODE_TYPE_IDS.seedance },
        { type: NODE_TYPE_IDS.videoMerge },
      ]),
    ).toBe(true)
  })

  it('is false for a single video node (below the 2-node floor)', () => {
    expect(
      canComposeVideoMergeSelection([{ type: NODE_TYPE_IDS.seedance }]),
    ).toBe(false)
  })

  it('is false for an empty selection', () => {
    expect(canComposeVideoMergeSelection([])).toBe(false)
  })

  it('is false when ANY selected node is not a video source, even 2+ video nodes present', () => {
    expect(
      canComposeVideoMergeSelection([
        { type: NODE_TYPE_IDS.seedance },
        { type: NODE_TYPE_IDS.seedance },
        { type: NODE_TYPE_IDS.image },
      ]),
    ).toBe(false)
  })

  it('is false when a selected node has no resolved type', () => {
    expect(
      canComposeVideoMergeSelection([
        { type: NODE_TYPE_IDS.seedance },
        { type: undefined },
      ]),
    ).toBe(false)
  })
})

describe('sortNodesForVideoMergeCompose', () => {
  it('sorts by x ascending', () => {
    const nodes = [
      { id: 'c', position: { x: 300, y: 0 } },
      { id: 'a', position: { x: 100, y: 0 } },
      { id: 'b', position: { x: 200, y: 0 } },
    ]
    expect(sortNodesForVideoMergeCompose(nodes).map((n) => n.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('breaks x ties with y ascending', () => {
    const nodes = [
      { id: 'bottom', position: { x: 100, y: 400 } },
      { id: 'top', position: { x: 100, y: 0 } },
      { id: 'middle', position: { x: 100, y: 200 } },
    ]
    expect(sortNodesForVideoMergeCompose(nodes).map((n) => n.id)).toEqual([
      'top',
      'middle',
      'bottom',
    ])
  })

  it('does not mutate the input array', () => {
    const nodes = [
      { id: 'b', position: { x: 200, y: 0 } },
      { id: 'a', position: { x: 100, y: 0 } },
    ]
    const original = [...nodes]
    sortNodesForVideoMergeCompose(nodes)
    expect(nodes).toEqual(original)
  })

  it('is stable for an already-sorted input', () => {
    const nodes = [
      { id: 'a', position: { x: 0, y: 0 } },
      { id: 'b', position: { x: 100, y: 0 } },
      { id: 'c', position: { x: 200, y: 0 } },
    ]
    expect(sortNodesForVideoMergeCompose(nodes).map((n) => n.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })
})
