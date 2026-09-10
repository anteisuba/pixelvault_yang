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

import {
  getNodeV4Ports,
  slotSupportsVersions,
  NODE_SLOT_IDS,
  NODE_SLOT_OUTPUT_IDS,
  NODE_SLOT_TEXT_ROLE_IDS,
  type NodeSlotId,
} from '@/constants/node-slots'
import {
  NODE_IMAGE_ROLE_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_TYPE_IDS,
  NODE_V4_AUDIO_SUBTYPE_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_SUBTYPES_BY_KIND,
  NODE_V4_TEXT_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
  type NodeV4Subtype,
} from '@/constants/node-types'

import {
  canConnect,
  canConnectNodeTypes,
  listConnectableSlots,
  resolveTextSlotRole,
  NODE_CONNECT_REJECT_REASON_IDS,
  type NodeConnectionEndpoint,
} from './node-connection-rules'

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

  describe('提示词栏结果落点 (node-canvas-v2.md §9.4)', () => {
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

/* ─────────────────────────────────────────────────────────────────────────
 * v4 · 具名槽矩阵（spec §3.3）。矩阵**每一格**都有断言：合法矩阵表里的九行
 * 目标槽 × 四个源 kind = 36 格，全打；再加容量、语义门、自环、未知槽。
 * ───────────────────────────────────────────────────────────────────────── */

const KINDS = [
  NODE_MEDIA_KIND_IDS.text,
  NODE_MEDIA_KIND_IDS.image,
  NODE_MEDIA_KIND_IDS.audio,
  NODE_MEDIA_KIND_IDS.video,
] as const

function src(
  kind: (typeof KINDS)[number],
  subtype: NodeV4Subtype,
  blocked?: boolean,
): NodeConnectionEndpoint {
  return { id: 'src', kind, subtype, ...(blocked ? { blocked } : {}) }
}

const SUBTYPE_OF_KIND = {
  [NODE_MEDIA_KIND_IDS.text]: NODE_V4_TEXT_SUBTYPE_IDS.script,
  [NODE_MEDIA_KIND_IDS.image]: NODE_V4_IMAGE_SUBTYPE_IDS.reference,
  [NODE_MEDIA_KIND_IDS.audio]: NODE_V4_AUDIO_SUBTYPE_IDS.voice,
  [NODE_MEDIA_KIND_IDS.video]: NODE_V4_VIDEO_SUBTYPE_IDS.clip,
} as const

const VIDEO_SHOT: NodeConnectionEndpoint = {
  id: 'tgt',
  kind: NODE_MEDIA_KIND_IDS.video,
  subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
}
const IMAGE_SHOT: NodeConnectionEndpoint = {
  id: 'tgt',
  kind: NODE_MEDIA_KIND_IDS.image,
  subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
}
const IMAGE_CHARACTER: NodeConnectionEndpoint = {
  id: 'tgt',
  kind: NODE_MEDIA_KIND_IDS.image,
  subtype: NODE_V4_IMAGE_SUBTYPE_IDS.character,
}
const AUDIO_VOICE: NodeConnectionEndpoint = {
  id: 'tgt',
  kind: NODE_MEDIA_KIND_IDS.audio,
  subtype: NODE_V4_AUDIO_SUBTYPE_IDS.voice,
}
const VIDEO_MERGE: NodeConnectionEndpoint = {
  id: 'tgt',
  kind: NODE_MEDIA_KIND_IDS.video,
  subtype: NODE_V4_VIDEO_SUBTYPE_IDS.merge,
}
const TEXT_NOTE: NodeConnectionEndpoint = {
  id: 'tgt',
  kind: NODE_MEDIA_KIND_IDS.text,
  subtype: NODE_V4_TEXT_SUBTYPE_IDS.shotNote,
}

/** 矩阵一行：目标节点 + 槽 → 允许的源 kind 集合。 */
const MATRIX: ReadonlyArray<{
  label: string
  target: NodeConnectionEndpoint
  slot: NodeSlotId
  allow: readonly (typeof KINDS)[number][]
}> = [
  {
    label: 'video.shot firstFrame',
    target: VIDEO_SHOT,
    slot: NODE_SLOT_IDS.firstFrame,
    allow: [NODE_MEDIA_KIND_IDS.image],
  },
  {
    label: 'video.shot lastFrame',
    target: VIDEO_SHOT,
    slot: NODE_SLOT_IDS.lastFrame,
    allow: [NODE_MEDIA_KIND_IDS.image],
  },
  {
    label: 'image family reference',
    target: IMAGE_SHOT,
    slot: NODE_SLOT_IDS.reference,
    allow: [NODE_MEDIA_KIND_IDS.image],
  },
  {
    label: 'video.shot reference',
    target: VIDEO_SHOT,
    slot: NODE_SLOT_IDS.reference,
    allow: [NODE_MEDIA_KIND_IDS.image, NODE_MEDIA_KIND_IDS.video],
  },
  {
    label: 'video.shot voice',
    target: VIDEO_SHOT,
    slot: NODE_SLOT_IDS.voice,
    allow: [NODE_MEDIA_KIND_IDS.audio],
  },
  {
    label: 'video.shot text',
    target: VIDEO_SHOT,
    slot: NODE_SLOT_IDS.text,
    allow: [NODE_MEDIA_KIND_IDS.text],
  },
  {
    label: 'audio.voice timbre',
    target: AUDIO_VOICE,
    slot: NODE_SLOT_IDS.timbre,
    allow: [NODE_MEDIA_KIND_IDS.audio],
  },
  {
    label: 'image.character closeup',
    target: IMAGE_CHARACTER,
    slot: NODE_SLOT_IDS.closeup,
    allow: [NODE_MEDIA_KIND_IDS.image],
  },
  {
    label: 'video.merge clip',
    target: VIDEO_MERGE,
    slot: NODE_SLOT_IDS.clip,
    allow: [NODE_MEDIA_KIND_IDS.video],
  },
  {
    label: 'text source',
    target: TEXT_NOTE,
    slot: NODE_SLOT_IDS.source,
    allow: KINDS,
  },
]

describe('canConnect · 合法矩阵（源 kind × 目标槽）', () => {
  for (const row of MATRIX) {
    for (const kind of KINDS) {
      const expected = row.allow.includes(kind)
      it(`${row.label} ${expected ? '收' : '拒'} ${kind}`, () => {
        const result = canConnect(
          src(kind, SUBTYPE_OF_KIND[kind]),
          row.target,
          { slot: row.slot },
        )
        expect(result.ok).toBe(expected)
        if (!result.ok) {
          expect(result.reason).toBe(
            NODE_CONNECT_REJECT_REASON_IDS.kindNotAllowed,
          )
        }
      })
    }
  }
})

describe('剪辑台成片卡（S11b）', () => {
  /*
   * 成片落成的是一张普通的 `video.shot`（⛔ 不复活 `video.merge`，S8 已把它迁成
   * 时间线）。所以「成片能不能当参考接进下一个镜头」这件事，就是端口表里
   * `video.shot.reference` 收不收 video —— 钉住它，免得下次收窄 sourceKinds 时
   * 把剪辑台 → 画布这条回路无声掐断。
   */
  const FINAL_CUT: NodeConnectionEndpoint = {
    id: 'cut',
    kind: NODE_MEDIA_KIND_IDS.video,
    subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
  }

  it('成片（video.shot）可以作 reference 连进别的镜头', () => {
    expect(
      canConnect(FINAL_CUT, VIDEO_SHOT, { slot: NODE_SLOT_IDS.reference }).ok,
    ).toBe(true)
  })

  it('端口表上 video.shot 的 reference 明写收 video', () => {
    const spec = getNodeV4Ports(
      NODE_MEDIA_KIND_IDS.video,
      NODE_V4_VIDEO_SUBTYPE_IDS.shot,
    )?.inputs.find((input) => input.slot === NODE_SLOT_IDS.reference)
    expect(spec?.sourceKinds).toContain(NODE_MEDIA_KIND_IDS.video)
  })

  it('成片仍然有 out 出口（不然连不出去）', () => {
    expect(
      getNodeV4Ports(NODE_MEDIA_KIND_IDS.video, NODE_V4_VIDEO_SUBTYPE_IDS.shot)
        ?.outputs,
    ).toContain(NODE_SLOT_OUTPUT_IDS.out)
  })
})

describe('canConnect · 子型门 / 语义门 / 容量 / 自环', () => {
  it('closeup 只收 reference / character 两种图，镜头图被拒且理由是子型', () => {
    for (const subtype of [
      NODE_V4_IMAGE_SUBTYPE_IDS.reference,
      NODE_V4_IMAGE_SUBTYPE_IDS.character,
    ]) {
      expect(
        canConnect(src(NODE_MEDIA_KIND_IDS.image, subtype), IMAGE_CHARACTER, {
          slot: NODE_SLOT_IDS.closeup,
        }).ok,
      ).toBe(true)
    }
    const rejected = canConnect(
      src(NODE_MEDIA_KIND_IDS.image, NODE_V4_IMAGE_SUBTYPE_IDS.shot),
      IMAGE_CHARACTER,
      { slot: NODE_SLOT_IDS.closeup },
    )
    expect(rejected).toEqual({
      ok: false,
      reason: NODE_CONNECT_REJECT_REASON_IDS.subtypeNotAllowed,
    })
  })

  it('已判失败的素材连首/尾帧被拒（§3.3 语义门），但作参考仍可以', () => {
    const blocked = src(
      NODE_MEDIA_KIND_IDS.image,
      NODE_V4_IMAGE_SUBTYPE_IDS.shot,
      true,
    )
    for (const slot of [NODE_SLOT_IDS.firstFrame, NODE_SLOT_IDS.lastFrame]) {
      expect(canConnect(blocked, VIDEO_SHOT, { slot })).toEqual({
        ok: false,
        reason: NODE_CONNECT_REJECT_REASON_IDS.blockedSource,
      })
    }
    expect(
      canConnect(blocked, VIDEO_SHOT, { slot: NODE_SLOT_IDS.reference }).ok,
    ).toBe(true)
  })

  it('轮播槽（max=1）已有内容时再连一条不算超限——那是加新版本', () => {
    expect(
      canConnect(
        src(NODE_MEDIA_KIND_IDS.image, NODE_V4_IMAGE_SUBTYPE_IDS.shot),
        VIDEO_SHOT,
        { slot: NODE_SLOT_IDS.firstFrame, occupancy: 5 },
      ).ok,
    ).toBe(true)
  })

  it('merge 的 clip 槽静态上限 9，满了就拒', () => {
    const clip = src(NODE_MEDIA_KIND_IDS.video, NODE_V4_VIDEO_SUBTYPE_IDS.clip)
    expect(
      canConnect(clip, VIDEO_MERGE, { slot: NODE_SLOT_IDS.clip, occupancy: 8 })
        .ok,
    ).toBe(true)
    expect(
      canConnect(clip, VIDEO_MERGE, { slot: NODE_SLOT_IDS.clip, occupancy: 9 }),
    ).toEqual({ ok: false, reason: NODE_CONNECT_REJECT_REASON_IDS.slotFull })
  })

  it('0..N 槽的实际上限跟模型走：不传 capacity 不设限，传了就按它拒', () => {
    const image = src(
      NODE_MEDIA_KIND_IDS.image,
      NODE_V4_IMAGE_SUBTYPE_IDS.reference,
    )
    expect(
      canConnect(image, VIDEO_SHOT, {
        slot: NODE_SLOT_IDS.reference,
        occupancy: 99,
      }).ok,
    ).toBe(true)
    expect(
      canConnect(image, VIDEO_SHOT, {
        slot: NODE_SLOT_IDS.reference,
        occupancy: 3,
        capacity: 3,
      }),
    ).toEqual({ ok: false, reason: NODE_CONNECT_REJECT_REASON_IDS.slotFull })
  })

  it('叶子源没有任何入口槽；不存在的槽给 unknownSlot 而不是静默 false', () => {
    const leaf: NodeConnectionEndpoint = {
      id: 'tgt',
      kind: NODE_MEDIA_KIND_IDS.image,
      subtype: NODE_V4_IMAGE_SUBTYPE_IDS.reference,
    }
    expect(
      canConnect(
        src(NODE_MEDIA_KIND_IDS.image, NODE_V4_IMAGE_SUBTYPE_IDS.shot),
        leaf,
        { slot: NODE_SLOT_IDS.reference },
      ),
    ).toEqual({ ok: false, reason: NODE_CONNECT_REJECT_REASON_IDS.unknownSlot })
    expect(
      canConnect(
        src(NODE_MEDIA_KIND_IDS.image, NODE_V4_IMAGE_SUBTYPE_IDS.shot),
        VIDEO_SHOT,
        { slot: NODE_SLOT_IDS.timbre },
      ).ok,
    ).toBe(false)
  })

  it('自环先于一切被拒', () => {
    const self: NodeConnectionEndpoint = {
      id: 'same',
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
    }
    expect(
      canConnect({ ...self }, { ...self }, { slot: NODE_SLOT_IDS.reference }),
    ).toEqual({ ok: false, reason: NODE_CONNECT_REJECT_REASON_IDS.selfLoop })
  })
})

describe('canConnect · 文本槽三档容量（C1 契约修正 2）', () => {
  const text = (subtype: NodeV4Subtype) =>
    src(NODE_MEDIA_KIND_IDS.text, subtype)

  it('script 0..1：已有一份剧本再连一条剧本是超限', () => {
    expect(
      canConnect(text(NODE_V4_TEXT_SUBTYPE_IDS.script), VIDEO_SHOT, {
        slot: NODE_SLOT_IDS.text,
        occupancy: 1,
        role: NODE_SLOT_TEXT_ROLE_IDS.script,
      }),
    ).toEqual({ ok: false, reason: NODE_CONNECT_REJECT_REASON_IDS.slotFull })
    expect(
      canConnect(text(NODE_V4_TEXT_SUBTYPE_IDS.script), VIDEO_SHOT, {
        slot: NODE_SLOT_IDS.text,
        occupancy: 0,
        role: NODE_SLOT_TEXT_ROLE_IDS.script,
      }).ok,
    ).toBe(true)
  })

  it('style / character 0..N：可叠加，不设静态上限', () => {
    for (const role of [
      NODE_SLOT_TEXT_ROLE_IDS.style,
      NODE_SLOT_TEXT_ROLE_IDS.character,
    ]) {
      expect(
        canConnect(text(NODE_V4_TEXT_SUBTYPE_IDS.rule), VIDEO_SHOT, {
          slot: NODE_SLOT_IDS.text,
          occupancy: 9,
          role,
        }).ok,
      ).toBe(true)
    }
  })

  it('缺省角色 = script：不传 role 时按 0..1 判', () => {
    expect(
      canConnect(text(NODE_V4_TEXT_SUBTYPE_IDS.script), VIDEO_SHOT, {
        slot: NODE_SLOT_IDS.text,
        occupancy: 1,
      }),
    ).toEqual({ ok: false, reason: NODE_CONNECT_REJECT_REASON_IDS.slotFull })
  })
})

describe('resolveTextSlotRole · 角色优先链', () => {
  it('显式 > defaultRole > 子型 > script', () => {
    expect(
      resolveTextSlotRole({
        subtype: NODE_V4_TEXT_SUBTYPE_IDS.rule,
        defaultRole: NODE_SLOT_TEXT_ROLE_IDS.character,
        explicitRole: NODE_SLOT_TEXT_ROLE_IDS.script,
      }),
    ).toBe(NODE_SLOT_TEXT_ROLE_IDS.script)
    expect(
      resolveTextSlotRole({
        subtype: NODE_V4_TEXT_SUBTYPE_IDS.rule,
        defaultRole: NODE_SLOT_TEXT_ROLE_IDS.character,
      }),
    ).toBe(NODE_SLOT_TEXT_ROLE_IDS.character)
    // 子型推两档：script 子型 → 剧本、rule 子型 → 风格约束。
    expect(
      resolveTextSlotRole({ subtype: NODE_V4_TEXT_SUBTYPE_IDS.rule }),
    ).toBe(NODE_SLOT_TEXT_ROLE_IDS.style)
    expect(
      resolveTextSlotRole({ subtype: NODE_V4_TEXT_SUBTYPE_IDS.script }),
    ).toBe(NODE_SLOT_TEXT_ROLE_IDS.script)
    // shotNote 不猜，落回 script。
    expect(
      resolveTextSlotRole({ subtype: NODE_V4_TEXT_SUBTYPE_IDS.shotNote }),
    ).toBe(NODE_SLOT_TEXT_ROLE_IDS.script)
  })
})

describe('listConnectableSlots', () => {
  it('拖一张图到镜头上：点亮首帧 / 尾帧 / 参考，顺序与端口表一致', () => {
    expect(
      listConnectableSlots(
        src(NODE_MEDIA_KIND_IDS.image, NODE_V4_IMAGE_SUBTYPE_IDS.shot),
        VIDEO_SHOT,
      ),
    ).toEqual([
      NODE_SLOT_IDS.firstFrame,
      NODE_SLOT_IDS.lastFrame,
      NODE_SLOT_IDS.reference,
    ])
  })

  it('已判失败的图只剩参考槽点亮', () => {
    expect(
      listConnectableSlots(
        src(NODE_MEDIA_KIND_IDS.image, NODE_V4_IMAGE_SUBTYPE_IDS.shot, true),
        VIDEO_SHOT,
      ),
    ).toEqual([NODE_SLOT_IDS.reference])
  })

  it('容量满的槽不点亮', () => {
    expect(
      listConnectableSlots(
        src(NODE_MEDIA_KIND_IDS.image, NODE_V4_IMAGE_SUBTYPE_IDS.reference),
        VIDEO_SHOT,
        { capacityBySlot: { reference: 2 }, occupancyBySlot: { reference: 2 } },
      ),
    ).toEqual([NODE_SLOT_IDS.firstFrame, NODE_SLOT_IDS.lastFrame])
  })

  it('叶子源目标一个槽都不点亮', () => {
    expect(
      listConnectableSlots(
        src(NODE_MEDIA_KIND_IDS.image, NODE_V4_IMAGE_SUBTYPE_IDS.shot),
        {
          id: 'tgt',
          kind: NODE_MEDIA_KIND_IDS.video,
          subtype: NODE_V4_VIDEO_SUBTYPE_IDS.clip,
        },
      ),
    ).toEqual([])
  })
})

describe('端口表自洽（spec §3.2）', () => {
  it('video.shot 的入口顺序就是 §6 版式的槽顺序', () => {
    expect(
      getNodeV4Ports(
        NODE_MEDIA_KIND_IDS.video,
        NODE_V4_VIDEO_SUBTYPE_IDS.shot,
      )?.inputs.map((input) => input.slot),
    ).toEqual([
      NODE_SLOT_IDS.firstFrame,
      NODE_SLOT_IDS.lastFrame,
      NODE_SLOT_IDS.reference,
      NODE_SLOT_IDS.voice,
      NODE_SLOT_IDS.text,
    ])
  })

  it('只有 video.shot 有 tailFrame 出口', () => {
    expect(
      getNodeV4Ports(NODE_MEDIA_KIND_IDS.video, NODE_V4_VIDEO_SUBTYPE_IDS.shot)
        ?.outputs,
    ).toContain(NODE_SLOT_OUTPUT_IDS.tailFrame)
    expect(
      getNodeV4Ports(NODE_MEDIA_KIND_IDS.video, NODE_V4_VIDEO_SUBTYPE_IDS.merge)
        ?.outputs,
    ).toEqual([NODE_SLOT_OUTPUT_IDS.out])
  })

  it('轮播只作用在 0..1 槽上', () => {
    const shotPorts = getNodeV4Ports(
      NODE_MEDIA_KIND_IDS.video,
      NODE_V4_VIDEO_SUBTYPE_IDS.shot,
    )
    const versioned = shotPorts?.inputs
      .filter((input) => slotSupportsVersions(input))
      .map((input) => input.slot)
    expect(versioned).toEqual([
      NODE_SLOT_IDS.firstFrame,
      NODE_SLOT_IDS.lastFrame,
    ])
  })

  it('每个 kind 的每个子型都在端口表里有一条', () => {
    for (const [kind, subtypes] of Object.entries(NODE_V4_SUBTYPES_BY_KIND)) {
      for (const subtype of subtypes) {
        expect(
          getNodeV4Ports(kind as (typeof KINDS)[number], subtype),
        ).toBeDefined()
      }
    }
  })
})
