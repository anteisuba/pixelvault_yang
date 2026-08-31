import { describe, expect, it } from 'vitest'

import { STUDIO_OPERATOR_CLAIM_TTL_MS } from '@/constants/studio-assistant-operator'
import {
  bindOperatorClaim,
  createOperatorClaim,
  isOperatorClaimSettled,
  readOperatorClaimEvidence,
  type StudioOperatorClaimItem,
} from '@/lib/studio-operator-claim'
import type { GenerationRecord } from '@/types'

/**
 * 归属追踪的判据闸（P3-C，拍板 4「自动只看它自己备的那次 / 用户自己发的不打扰」）。
 *
 * 这一层钉的每一条都对应一个**编译期看不见**的误判：
 *  ① 领票之前就在跑的那些不算这一枪 —— 算了就是助手去评一张不是它备的图；
 *  ② 已绑定的票不吸收后来排进来的 —— 视频档的队列**复用同一个 run id**，
 *    按 run 认就会把用户自己排的第二条也认领了（台账「共享的 pollRef」同类错）；
 *  ③ 票有保质期 —— 没打出去的那一枪留下的票会飘到用户下一次自己发的那一枪上；
 *  ④ 一批没跑完不算跑完 —— 四张里第一张先回来时就去评，评的是半批。
 */

const NOW = 1_700_000_000_000

function generation(
  overrides: Partial<GenerationRecord> = {},
): GenerationRecord {
  return {
    id: 'gen-1',
    createdAt: new Date(NOW),
    outputType: 'IMAGE',
    status: 'COMPLETED',
    url: 'https://cdn.example.com/a.png',
    storageKey: 'a.png',
    mimeType: 'image/png',
    width: 1024,
    height: 1024,
    prompt: 'a girl under a red umbrella',
    model: 'Seedream 4',
    provider: 'byteplus',
    requestCount: 1,
    isPublic: false,
    isPromptPublic: false,
    ...overrides,
  } as GenerationRecord
}

function item(
  id: string,
  status: StudioOperatorClaimItem['status'],
  gen: GenerationRecord | null = null,
): StudioOperatorClaimItem {
  return { id, status, generation: gen }
}

describe('归属追踪 · 领票与绑定', () => {
  it('只认领票之后新冒出来的那一批 —— 之前就在跑的不算这一枪', () => {
    const claim = createOperatorClaim(NOW, ['old-1', 'old-2'])
    const binding = bindOperatorClaim(
      claim,
      [
        item('old-1', 'completed', generation()),
        item('old-2', 'completed', generation()),
        item('new-1', 'generating'),
      ],
      NOW + 500,
    )

    expect(binding.kind).toBe('bound')
    if (binding.kind !== 'bound') return
    expect(binding.claim.boundItemIds).toEqual(['new-1'])
  })

  it('新的一批还没出现时继续等，不乱绑', () => {
    const claim = createOperatorClaim(NOW, ['old-1'])
    const binding = bindOperatorClaim(
      claim,
      [item('old-1', 'completed', generation())],
      NOW + 500,
    )
    expect(binding.kind).toBe('waiting')
  })

  /** ⭐ 视频档的队列复用同一个 run id —— 按 run 认就会误标用户自己排的那条。 */
  it('绑定之后不再吸收后来排进来的条目', () => {
    const claim = createOperatorClaim(NOW, [])
    const first = bindOperatorClaim(
      claim,
      [item('mine', 'generating')],
      NOW + 10,
    )
    expect(first.kind).toBe('bound')
    if (first.kind !== 'bound') return

    const second = bindOperatorClaim(
      first.claim,
      [item('mine', 'generating'), item('theirs', 'generating')],
      NOW + 2_000,
    )
    expect(second.kind).toBe('bound')
    if (second.kind !== 'bound') return
    expect(second.claim.boundItemIds).toEqual(['mine'])
  })

  it('票过期就作废 —— 一张永不过期的票会认领用户下一次自己发的那一枪', () => {
    const claim = createOperatorClaim(NOW, [])
    const binding = bindOperatorClaim(
      claim,
      [item('much-later', 'generating')],
      NOW + STUDIO_OPERATOR_CLAIM_TTL_MS + 1,
    )
    expect(binding.kind).toBe('expired')
  })

  it('刚好卡在 TTL 上仍然算数（边界不吃掉合法的那一枪）', () => {
    const claim = createOperatorClaim(NOW, [])
    const binding = bindOperatorClaim(
      claim,
      [item('mine', 'generating')],
      NOW + STUDIO_OPERATOR_CLAIM_TTL_MS,
    )
    expect(binding.kind).toBe('bound')
  })
})

describe('归属追踪 · 什么时候算跑完', () => {
  it('还没绑的票永远不算跑完', () => {
    const claim = createOperatorClaim(NOW, [])
    expect(isOperatorClaimSettled(claim, [])).toBe(false)
  })

  it('一批里还有在跑的就不算跑完 —— 半批不评', () => {
    const claim = {
      ...createOperatorClaim(NOW, []),
      boundItemIds: ['a', 'b'],
    }
    expect(
      isOperatorClaimSettled(claim, [
        item('a', 'completed', generation()),
        item('b', 'generating'),
      ]),
    ).toBe(false)
  })

  it('全部有了结局才算跑完（失败也是结局）', () => {
    const claim = {
      ...createOperatorClaim(NOW, []),
      boundItemIds: ['a', 'b'],
    }
    expect(
      isOperatorClaimSettled(claim, [
        item('a', 'completed', generation()),
        item('b', 'failed'),
      ]),
    ).toBe(true)
  })

  it('条目整个消失了（换模态 / 清批次）也算收尾，不永远等下去', () => {
    const claim = { ...createOperatorClaim(NOW, []), boundItemIds: ['gone'] }
    expect(isOperatorClaimSettled(claim, [])).toBe(true)
  })
})

describe('归属追踪 · 拿出来给助手看的那张', () => {
  it('一批多张时只取第一张成的（评价卡内嵌的是单数那一张）', () => {
    const claim = {
      ...createOperatorClaim(NOW, []),
      boundItemIds: ['a', 'b'],
    }
    const evidence = readOperatorClaimEvidence(claim, [
      item('a', 'failed'),
      item(
        'b',
        'completed',
        generation({ id: 'gen-b', url: 'https://cdn.example.com/b.png' }),
      ),
    ])

    expect(evidence).toEqual({
      url: 'https://cdn.example.com/b.png',
      generationId: 'gen-b',
      modelLabel: 'Seedream 4',
      prompt: 'a girl under a red umbrella',
    })
  })

  it('全失败时没有证据 —— ⛔ 不拿一句「失败了」去请一次视觉', () => {
    const claim = { ...createOperatorClaim(NOW, []), boundItemIds: ['a'] }
    expect(readOperatorClaimEvidence(claim, [item('a', 'failed')])).toBeNull()
  })

  it('有缩略图就带上（卡片画的是它，灯箱开的才是原图）', () => {
    const claim = { ...createOperatorClaim(NOW, []), boundItemIds: ['a'] }
    const evidence = readOperatorClaimEvidence(claim, [
      item(
        'a',
        'completed',
        generation({ thumbnailUrl: 'https://cdn.example.com/a-thumb.png' }),
      ),
    ])
    expect(evidence?.thumbnailUrl).toBe('https://cdn.example.com/a-thumb.png')
  })
})
