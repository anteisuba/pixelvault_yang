import { describe, expect, it } from 'vitest'

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { NodeScriptDocRequestSchema, ScriptDocSchema } from '@/types/script-doc'
import { NodeWorkflowStateDataSchema } from '@/types/node-workflow'

const VALID_DOC = {
  title: 'Night Garden Signal',
  logline: 'A botanist chases a radio signal through a night garden.',
  styleNote: 'Intimate botanical mystery.',
  roles: [{ id: 'role-1', name: 'Mira', description: 'a botanist' }],
  shots: [
    {
      id: 'shot-1',
      summary: 'Mira kneels by a glowing flower bed.',
      camera: 'slow push-in',
      roleIds: ['role-1'],
      dialogue: [{ id: 'line-1', speakerRoleId: 'role-1', line: 'Here.' }],
    },
  ],
}

describe('ScriptDocSchema', () => {
  it('accepts a well-formed doc', () => {
    expect(ScriptDocSchema.safeParse(VALID_DOC).success).toBe(true)
  })

  it('accepts the optional content fields (background / duration / emotion / personality / goal)', () => {
    const rich = {
      ...VALID_DOC,
      background: 'A drowned city where sound is currency.',
      targetDuration: '12-15s',
      roles: [
        {
          id: 'role-1',
          name: 'Mira',
          description: 'a botanist',
          personality: 'guarded, methodical',
          goal: 'to be heard',
        },
      ],
      shots: [
        {
          id: 'shot-1',
          summary: 'Mira kneels by a glowing flower bed.',
          emotion: 'surface awe · undercurrent loneliness',
          camera: 'slow push-in',
          roleIds: ['role-1'],
          dialogue: [{ id: 'line-1', speakerRoleId: 'role-1', line: 'Here.' }],
        },
      ],
    }
    expect(ScriptDocSchema.safeParse(rich).success).toBe(true)
  })

  it('treats the new content fields as optional (a simple skit omits them)', () => {
    const parsed = ScriptDocSchema.parse({
      title: 'Skit',
      roles: [{ id: 'role-1', name: 'A', description: '' }],
      shots: [{ id: 'shot-1', summary: 'A waves.', roleIds: [], dialogue: [] }],
    })
    expect(parsed.background).toBeUndefined()
    expect(parsed.targetDuration).toBeUndefined()
    expect(parsed.shots[0]?.emotion).toBeUndefined()
    expect(parsed.roles[0]?.personality).toBeUndefined()
  })

  it('applies permissive defaults for absent arrays / logline', () => {
    const parsed = ScriptDocSchema.parse({ title: 'X' })
    expect(parsed.roles).toEqual([])
    expect(parsed.shots).toEqual([])
    expect(parsed.logline).toBe('')
  })

  it('rejects an empty title', () => {
    expect(ScriptDocSchema.safeParse({ title: '' }).success).toBe(false)
  })

  // 画布对齐三梁 · 梁1：每镜显式时长（秒）。上限取自 Seedance 2.5 硬顶。
  it('accepts an in-range per-shot durationSeconds', () => {
    const withDuration = {
      ...VALID_DOC,
      shots: [{ ...VALID_DOC.shots[0], durationSeconds: 8 }],
    }
    expect(ScriptDocSchema.safeParse(withDuration).success).toBe(true)
  })

  it('rejects a durationSeconds beyond the Seedance 2.5 cap (30s)', () => {
    const tooLong = {
      ...VALID_DOC,
      shots: [{ ...VALID_DOC.shots[0], durationSeconds: 31 }],
    }
    expect(ScriptDocSchema.safeParse(tooLong).success).toBe(false)
  })

  it('rejects a negative durationSeconds', () => {
    const negative = {
      ...VALID_DOC,
      shots: [{ ...VALID_DOC.shots[0], durationSeconds: -1 }],
    }
    expect(ScriptDocSchema.safeParse(negative).success).toBe(false)
  })

  it('treats durationSeconds as optional (a shot with no explicit duration)', () => {
    const parsed = ScriptDocSchema.parse(VALID_DOC)
    expect(parsed.shots[0]?.durationSeconds).toBeUndefined()
  })
})

// 画布对齐三梁 · 梁3：容器字段（parentId / collapsed）。框节点类型随 UI 落地，
// 这里只验证数据层是纯加法——本次 schema 改动绝不能让存量项目 parse 失败
// （`node-workflow.service.ts` 的 `validateState` 会把 parse 失败整个 state
// 清空），也不能在 round-trip 时悄悄丢字段。
describe('NodeWorkflowNodeSchema container fields (parentId / collapsed)', () => {
  const OLD_NODE = {
    id: 'node-1',
    type: NODE_TYPE_IDS.shotText,
    position: { x: 0, y: 0 },
    data: { prompt: '', status: NODE_STATUS_IDS.idle },
  }

  it('兼容性不变量：不含 parentId/collapsed 的旧 state 原样 parse 通过', () => {
    const parsed = NodeWorkflowStateDataSchema.parse({
      nodes: [OLD_NODE],
      edges: [],
    })
    expect(parsed.nodes).toHaveLength(1)
    expect(parsed.nodes[0]?.parentId).toBeUndefined()
    expect(parsed.nodes[0]?.collapsed).toBeUndefined()
  })

  it('round-trips parentId / collapsed without dropping them', () => {
    const parsed = NodeWorkflowStateDataSchema.parse({
      nodes: [{ ...OLD_NODE, parentId: 'frame-1', collapsed: true }],
      edges: [],
    })
    expect(parsed.nodes[0]?.parentId).toBe('frame-1')
    expect(parsed.nodes[0]?.collapsed).toBe(true)
  })

  it('rejects a non-boolean collapsed instead of silently coercing it', () => {
    const parsed = NodeWorkflowStateDataSchema.safeParse({
      nodes: [{ ...OLD_NODE, collapsed: 'yes' }],
      edges: [],
    })
    expect(parsed.success).toBe(false)
  })
})

describe('NodeWorkflowStateDataSchema scriptDoc field', () => {
  it('round-trips a valid scriptDoc persisted on the state', () => {
    const parsed = NodeWorkflowStateDataSchema.parse({
      nodes: [],
      edges: [],
      scriptDoc: VALID_DOC,
    })
    expect(parsed.scriptDoc?.title).toBe(VALID_DOC.title)
  })

  it('seatbelt: a malformed scriptDoc degrades to undefined without wiping the state', () => {
    // A too-strict failure must NOT fail the whole-state parse — the server's
    // validateState coerces a parse failure to an EMPTY state (wiping nodes).
    const parsed = NodeWorkflowStateDataSchema.parse({
      nodes: [],
      edges: [],
      scriptDoc: { title: '' },
    })
    expect(parsed.scriptDoc).toBeUndefined()
    expect(parsed.nodes).toEqual([])
  })

  it('persists the workspace UI state (stage / depth / locks)', () => {
    const parsed = NodeWorkflowStateDataSchema.parse({
      nodes: [],
      edges: [],
      scriptDocStage: 'shots',
      scriptDocDepth: 'cinematic',
      scriptDocLocks: ['title', 'shot:shot-1:camera'],
    })
    expect(parsed.scriptDocStage).toBe('shots')
    expect(parsed.scriptDocDepth).toBe('cinematic')
    expect(parsed.scriptDocLocks).toEqual(['title', 'shot:shot-1:camera'])
  })

  it('seatbelt: malformed workspace UI state degrades to undefined, not a wipe', () => {
    const parsed = NodeWorkflowStateDataSchema.parse({
      nodes: [],
      edges: [],
      scriptDocStage: 'bogus',
      scriptDocDepth: 42,
      scriptDocLocks: 'not-an-array',
    })
    expect(parsed.scriptDocStage).toBeUndefined()
    expect(parsed.scriptDocDepth).toBeUndefined()
    expect(parsed.scriptDocLocks).toBeUndefined()
    expect(parsed.nodes).toEqual([])
  })
})

describe('NodeScriptDocRequestSchema stage', () => {
  const BASE = {
    messages: [{ role: 'user' as const, content: 'A signal in a garden.' }],
    locale: 'en' as const,
  }

  it('accepts a request without a stage (back-compat default)', () => {
    const parsed = NodeScriptDocRequestSchema.safeParse(BASE)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.stage).toBeUndefined()
  })

  it('accepts the outline and shots stages', () => {
    expect(
      NodeScriptDocRequestSchema.safeParse({ ...BASE, stage: 'outline' })
        .success,
    ).toBe(true)
    expect(
      NodeScriptDocRequestSchema.safeParse({ ...BASE, stage: 'shots' }).success,
    ).toBe(true)
  })

  it('rejects an unknown stage', () => {
    expect(
      NodeScriptDocRequestSchema.safeParse({ ...BASE, stage: 'final' }).success,
    ).toBe(false)
  })

  it('accepts the simple / standard / cinematic depths and rejects others', () => {
    for (const depth of ['simple', 'standard', 'cinematic']) {
      expect(
        NodeScriptDocRequestSchema.safeParse({ ...BASE, depth }).success,
      ).toBe(true)
    }
    expect(
      NodeScriptDocRequestSchema.safeParse({ ...BASE, depth: 'epic' }).success,
    ).toBe(false)
  })
})
