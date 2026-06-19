import { describe, expect, it } from 'vitest'

import { ScriptDocSchema } from '@/types/script-doc'
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
})
