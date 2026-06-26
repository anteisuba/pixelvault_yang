import { describe, expect, it } from 'vitest'

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
