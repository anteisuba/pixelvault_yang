import { describe, expect, it } from 'vitest'

import {
  addDialogue,
  addRole,
  addShot,
  applyFocusedResult,
  focusLockKeys,
  mergeLockedFields,
  nextScriptDocId,
  removeDialogue,
  removeRole,
  removeShot,
  scriptDocLockKey,
  setShotField,
} from '@/lib/script-doc-edit'
import type { ScriptDoc } from '@/types/script-doc'

const DOC: ScriptDoc = {
  title: 'Night Garden',
  logline: 'A botanist chases a signal.',
  styleNote: 'Intimate mystery.',
  roles: [
    { id: 'role-1', name: 'Mira', description: 'a botanist' },
    { id: 'role-2', name: 'Echo', description: 'a voice' },
  ],
  shots: [
    {
      id: 'shot-1',
      summary: 'Mira kneels by the bed.',
      camera: 'push-in',
      roleIds: ['role-1', 'role-2'],
      dialogue: [{ id: 'line-1', speakerRoleId: 'role-2', line: 'Here.' }],
    },
  ],
}

describe('nextScriptDocId', () => {
  it('returns the next free index, ignoring gaps and foreign ids', () => {
    expect(nextScriptDocId('role', ['role-1', 'role-3', 'shot-9'])).toBe(
      'role-4',
    )
    expect(nextScriptDocId('shot', [])).toBe('shot-1')
  })
})

describe('structural edits', () => {
  it('adds a role with a fresh id and placeholder name', () => {
    const next = addRole(DOC, 'New role')
    expect(next.roles).toHaveLength(3)
    expect(next.roles[2]).toMatchObject({ id: 'role-3', name: 'New role' })
  })

  it('removing a role detaches it from shot bindings and dialogue', () => {
    const next = removeRole(DOC, 'role-2')
    expect(next.roles.map((r) => r.id)).toEqual(['role-1'])
    expect(next.shots[0]?.roleIds).toEqual(['role-1'])
    // The only dialogue line was spoken by role-2 → removed with the role.
    expect(next.shots[0]?.dialogue).toHaveLength(0)
  })

  it('adds and removes shots and dialogue lines with stable ids', () => {
    const withShot = addShot(DOC, 'A new beat.')
    expect(withShot.shots.map((s) => s.id)).toEqual(['shot-1', 'shot-2'])

    const withLine = addDialogue(DOC, 'shot-1', 'role-1', 'A new line.')
    expect(withLine.shots[0]?.dialogue.map((l) => l.id)).toEqual([
      'line-1',
      'line-2',
    ])

    const removedLine = removeDialogue(withLine, 'shot-1', 'line-1')
    expect(removedLine.shots[0]?.dialogue.map((l) => l.id)).toEqual(['line-2'])

    const removedShot = removeShot(withShot, 'shot-1')
    expect(removedShot.shots.map((s) => s.id)).toEqual(['shot-2'])
  })
})

describe('mergeLockedFields', () => {
  it('returns the AI doc unchanged when nothing is locked', () => {
    const aiDoc: ScriptDoc = { ...DOC, title: 'AI Title' }
    expect(mergeLockedFields(aiDoc, DOC, new Set())).toBe(aiDoc)
  })

  it('keeps locked fields from the current doc, takes AI for the rest', () => {
    // User hand-edited the title and shot-1's camera; AI rewrote everything.
    const userDoc = setShotField(
      { ...DOC, title: 'My Title' },
      'shot-1',
      'camera',
      'my handheld move',
    )
    const locked = new Set([
      scriptDocLockKey.doc('title'),
      scriptDocLockKey.shot('shot-1', 'camera'),
    ])
    const aiDoc: ScriptDoc = {
      ...DOC,
      title: 'AI Title',
      logline: 'AI rewrote the logline.',
      shots: [
        {
          ...DOC.shots[0]!,
          summary: 'AI rewrote the summary.',
          camera: 'AI dolly zoom',
        },
      ],
    }

    const merged = mergeLockedFields(aiDoc, userDoc, locked)
    expect(merged.title).toBe('My Title') // locked → user value
    expect(merged.logline).toBe('AI rewrote the logline.') // unlocked → AI value
    expect(merged.shots[0]?.camera).toBe('my handheld move') // locked → user
    expect(merged.shots[0]?.summary).toBe('AI rewrote the summary.') // unlocked → AI
  })

  it('passes brand-new AI roles/shots through even with locks present', () => {
    const aiDoc: ScriptDoc = {
      ...DOC,
      roles: [
        ...DOC.roles,
        { id: 'role-9', name: 'Newcomer', description: '' },
      ],
    }
    const locked = new Set([scriptDocLockKey.doc('title')])
    const merged = mergeLockedFields(aiDoc, DOC, locked)
    expect(merged.roles.map((r) => r.id)).toContain('role-9')
  })
})

describe('applyFocusedResult', () => {
  it('roles focus takes only the AI cast, keeps everything else', () => {
    const aiDoc: ScriptDoc = {
      ...DOC,
      title: 'AI drifted the title',
      roles: [
        ...DOC.roles,
        { id: 'role-3', name: 'Villain', description: 'a shadow' },
      ],
      shots: [{ ...DOC.shots[0]!, summary: 'AI drifted the shot' }],
    }
    const result = applyFocusedResult(DOC, aiDoc, { kind: 'roles' })
    expect(result.roles.map((r) => r.id)).toEqual([
      'role-1',
      'role-2',
      'role-3',
    ])
    expect(result.title).toBe(DOC.title)
    expect(result.shots[0]?.summary).toBe(DOC.shots[0]?.summary)
  })

  it('shot focus replaces only the targeted shot', () => {
    const twoShot: ScriptDoc = {
      ...DOC,
      shots: [
        DOC.shots[0]!,
        { id: 'shot-2', summary: 'Theo waits', roleIds: [], dialogue: [] },
      ],
    }
    const aiDoc: ScriptDoc = {
      ...twoShot,
      title: 'AI drift',
      shots: [
        { ...twoShot.shots[0]!, summary: 'AI drifted shot-1' },
        {
          ...twoShot.shots[1]!,
          summary: 'Theo waits, tense',
          camera: 'push-in',
        },
      ],
    }
    const result = applyFocusedResult(twoShot, aiDoc, {
      kind: 'shot',
      id: 'shot-2',
    })
    expect(result.shots[0]?.summary).toBe('Mira kneels by the bed.')
    expect(result.shots[1]?.summary).toBe('Theo waits, tense')
    expect(result.shots[1]?.camera).toBe('push-in')
    expect(result.title).toBe(DOC.title)
  })

  it('returns the current doc when the focused shot id is missing', () => {
    const result = applyFocusedResult(DOC, DOC, { kind: 'shot', id: 'ghost' })
    expect(result).toEqual(DOC)
  })
})

describe('focusLockKeys', () => {
  it('roles focus clears every role field lock', () => {
    const keys = focusLockKeys(DOC, { kind: 'roles' })
    expect(keys).toContain(scriptDocLockKey.role('role-1', 'name'))
    expect(keys).toContain(scriptDocLockKey.role('role-2', 'goal'))
  })

  it('shot focus clears the shot fields and its dialogue line locks', () => {
    const keys = focusLockKeys(DOC, { kind: 'shot', id: 'shot-1' })
    expect(keys).toContain(scriptDocLockKey.shot('shot-1', 'camera'))
    expect(keys).toContain(scriptDocLockKey.line('line-1'))
  })
})
