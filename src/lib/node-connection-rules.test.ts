import { describe, expect, it } from 'vitest'

/**
 * ⚠ 2026-07-28 owner：「全部放开。这些都不做限制了。」
 *
 * `canConnectNodeTypes` 现在恒返回 true，所以原来那批「某某组合应当被拒绝」的
 * 断言全部作废——它们钉的是已经被 owner 推翻的产品规则，留着只会在下次有人想
 * 收紧时给出**假的安全感**（测试绿 ≠ 规则还在生效）。
 *
 * 保留的是「应当允许」那一半：它们现在恒真，价值不在于证明矩阵，而在于万一有人
 * 把早退去掉、矩阵重新生效时，这些基本组合不能回归成拒绝。
 *
 * 真要恢复限制时：把早退去掉 + 恢复这些拒绝断言 + **先给拒绝一个可见理由**
 * （见函数注释末尾那条）。
 */

import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'

import { canConnectNodeTypes } from './node-connection-rules'

describe('canConnectNodeTypes', () => {
  it('allows every edge the ScriptDoc projection creates', () => {
    // scriptDocToGraph: shotText/character/voice → seedance, seedance → merge.
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.shotText, NODE_TYPE_IDS.seedance),
    ).toBe(true)
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.characterImage, NODE_TYPE_IDS.seedance),
    ).toBe(true)
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.voice, NODE_TYPE_IDS.seedance),
    ).toBe(true)
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.seedance, NODE_TYPE_IDS.videoMerge),
    ).toBe(true)
  })

  it('allows the voice→character audio-binding hop', () => {
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.voice, NODE_TYPE_IDS.characterImage),
    ).toBe(true)
  })

  it('allows the closeup→character 1-hop (§9 B) into legacy + unified character', () => {
    // image[closeup] → legacy characterImage
    expect(
      canConnectNodeTypes(
        NODE_TYPE_IDS.image,
        NODE_TYPE_IDS.characterImage,
        undefined,
        NODE_IMAGE_ROLE_IDS.closeup,
      ),
    ).toBe(true)
    // image[closeup] → unified image[character]
    expect(
      canConnectNodeTypes(
        NODE_TYPE_IDS.image,
        NODE_TYPE_IDS.image,
        NODE_IMAGE_ROLE_IDS.character,
        NODE_IMAGE_ROLE_IDS.closeup,
      ),
    ).toBe(true)
  })

  describe('生成提示词框结果落点 (canvas-generate-composer.md §7)', () => {
    // A populated image card's generate composer spawns a NEW loose
    // (role-less) result card and wires source→result as a real edge — every
    // image family is a valid "改前" host.
    it('allows any image-kind source into a loose (role-less) image target', () => {
      expect(
        canConnectNodeTypes(NODE_TYPE_IDS.image, NODE_TYPE_IDS.image),
      ).toBe(true)
      expect(
        canConnectNodeTypes(NODE_TYPE_IDS.characterImage, NODE_TYPE_IDS.image),
      ).toBe(true)
      expect(
        canConnectNodeTypes(NODE_TYPE_IDS.backgroundImage, NODE_TYPE_IDS.image),
      ).toBe(true)
      expect(
        canConnectNodeTypes(NODE_TYPE_IDS.frameImage, NODE_TYPE_IDS.image),
      ).toBe(true)
      expect(canConnectNodeTypes(NODE_TYPE_IDS.shot, NODE_TYPE_IDS.image)).toBe(
        true,
      )
      // sourceRole doesn't matter — any role on a unified `image` source
      // still resolves to the image media kind.
      expect(
        canConnectNodeTypes(
          NODE_TYPE_IDS.image,
          NODE_TYPE_IDS.image,
          undefined,
          NODE_IMAGE_ROLE_IDS.shot,
        ),
      ).toBe(true)
    })
  })

  it('allows all reference families + video chains into seedance', () => {
    for (const source of [
      NODE_TYPE_IDS.backgroundImage,
      NODE_TYPE_IDS.frameImage,
      NODE_TYPE_IDS.shot,
      NODE_TYPE_IDS.seedance,
      NODE_TYPE_IDS.videoReference,
      NODE_TYPE_IDS.videoMerge,
    ]) {
      expect(canConnectNodeTypes(source, NODE_TYPE_IDS.seedance)).toBe(true)
    }
  })

  it('allows character + background image references into shot', () => {
    // Legacy per-role types.
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.characterImage, NODE_TYPE_IDS.shot),
    ).toBe(true)
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.backgroundImage, NODE_TYPE_IDS.shot),
    ).toBe(true)
    // Unified image source, resolved by sourceRole (4th arg).
    expect(
      canConnectNodeTypes(
        NODE_TYPE_IDS.image,
        NODE_TYPE_IDS.shot,
        undefined,
        NODE_IMAGE_ROLE_IDS.character,
      ),
    ).toBe(true)
    expect(
      canConnectNodeTypes(
        NODE_TYPE_IDS.image,
        NODE_TYPE_IDS.shot,
        undefined,
        NODE_IMAGE_ROLE_IDS.background,
      ),
    ).toBe(true)
    // Same edges land on a unified image target with role=shot.
    expect(
      canConnectNodeTypes(
        NODE_TYPE_IDS.characterImage,
        NODE_TYPE_IDS.image,
        NODE_IMAGE_ROLE_IDS.shot,
      ),
    ).toBe(true)
  })

  it('allows video sources into videoMerge', () => {
    expect(
      canConnectNodeTypes(
        NODE_TYPE_IDS.videoReference,
        NODE_TYPE_IDS.videoMerge,
      ),
    ).toBe(true)
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.videoMerge, NODE_TYPE_IDS.videoMerge),
    ).toBe(true)
  })
})
