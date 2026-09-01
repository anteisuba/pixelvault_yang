import { describe, expect, it } from 'vitest'

import {
  addDialogue,
  addRole,
  addShot,
  applyFocusedResult,
  focusLockKeys,
  mergeLockedFields,
  moveShot,
  nextScriptDocId,
  removeDialogue,
  removeRole,
  removeShot,
  scriptDocLockKey,
  setShotDuration,
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

describe('setShotDuration', () => {
  it('sets an in-range duration', () => {
    const next = setShotDuration(DOC, 'shot-1', 8)
    expect(next.shots[0]?.durationSeconds).toBe(8)
  })

  it('clamps an over-range duration to the 30s Seedance 2.5 cap', () => {
    const next = setShotDuration(DOC, 'shot-1', 999)
    expect(next.shots[0]?.durationSeconds).toBe(30)
  })

  it('clamps a negative duration to 0', () => {
    const next = setShotDuration(DOC, 'shot-1', -5)
    expect(next.shots[0]?.durationSeconds).toBe(0)
  })

  it('clears the duration when given undefined', () => {
    const withDuration = setShotDuration(DOC, 'shot-1', 8)
    const cleared = setShotDuration(withDuration, 'shot-1', undefined)
    expect(cleared.shots[0]?.durationSeconds).toBeUndefined()
  })

  it('only touches the targeted shot', () => {
    const twoShot: ScriptDoc = {
      ...DOC,
      shots: [
        DOC.shots[0]!,
        { id: 'shot-2', summary: 'Theo waits', roleIds: [], dialogue: [] },
      ],
    }
    const next = setShotDuration(twoShot, 'shot-1', 10)
    expect(next.shots[0]?.durationSeconds).toBe(10)
    expect(next.shots[1]?.durationSeconds).toBeUndefined()
  })
})

describe('moveShot', () => {
  const THREE_SHOT_DOC: ScriptDoc = {
    ...DOC,
    shots: [
      { id: 'shot-1', summary: 'First', roleIds: [], dialogue: [] },
      { id: 'shot-2', summary: 'Second', roleIds: [], dialogue: [] },
      { id: 'shot-3', summary: 'Third', roleIds: [], dialogue: [] },
    ],
  }

  it('moves a shot forward', () => {
    const next = moveShot(THREE_SHOT_DOC, 'shot-1', 2)
    expect(next.shots.map((s) => s.id)).toEqual(['shot-2', 'shot-3', 'shot-1'])
  })

  it('moves a shot backward', () => {
    const next = moveShot(THREE_SHOT_DOC, 'shot-3', 0)
    expect(next.shots.map((s) => s.id)).toEqual(['shot-3', 'shot-1', 'shot-2'])
  })

  it('clamps an out-of-range toIndex to the last valid slot', () => {
    const next = moveShot(THREE_SHOT_DOC, 'shot-1', 999)
    expect(next.shots.map((s) => s.id)).toEqual(['shot-2', 'shot-3', 'shot-1'])
  })

  it('clamps a negative toIndex to 0', () => {
    const next = moveShot(THREE_SHOT_DOC, 'shot-3', -99)
    expect(next.shots.map((s) => s.id)).toEqual(['shot-3', 'shot-1', 'shot-2'])
  })

  it('returns the same doc reference for a nonexistent shot id', () => {
    expect(moveShot(THREE_SHOT_DOC, 'ghost', 0)).toBe(THREE_SHOT_DOC)
  })

  it('returns the same doc reference for a no-op move (already at toIndex)', () => {
    expect(moveShot(THREE_SHOT_DOC, 'shot-2', 1)).toBe(THREE_SHOT_DOC)
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

  // ⚠ 顺手修：sceneLabel / composition 此前在 SHOT_FIELDS 列表里缺席，
  // mergeLockedFields 的 shot 分支也没有对应字段 —— 锁键存在、能被设置，
  // 但从来没被这个函数读到过，AI 重写永远覆盖。此前是空转，这里锁死。
  it('restores locked sceneLabel / composition instead of taking the AI rewrite', () => {
    const userDoc: ScriptDoc = {
      ...DOC,
      shots: [
        {
          ...DOC.shots[0]!,
          sceneLabel: 'INT. GREENHOUSE - NIGHT',
          composition: 'rule of thirds, subject left',
        },
      ],
    }
    const locked = new Set([
      scriptDocLockKey.shot('shot-1', 'sceneLabel'),
      scriptDocLockKey.shot('shot-1', 'composition'),
    ])
    const aiDoc: ScriptDoc = {
      ...DOC,
      shots: [
        {
          ...DOC.shots[0]!,
          sceneLabel: 'AI rewrote the scene label',
          composition: 'AI rewrote the composition',
        },
      ],
    }

    const merged = mergeLockedFields(aiDoc, userDoc, locked)
    expect(merged.shots[0]?.sceneLabel).toBe('INT. GREENHOUSE - NIGHT')
    expect(merged.shots[0]?.composition).toBe('rule of thirds, subject left')
  })

  // 画布对齐三梁 · 梁1：durationSeconds 同样走锁定态还原。
  it('restores a locked durationSeconds instead of taking the AI rewrite', () => {
    const userDoc = setShotDuration(DOC, 'shot-1', 12)
    const locked = new Set([scriptDocLockKey.shot('shot-1', 'durationSeconds')])
    const aiDoc = setShotDuration(DOC, 'shot-1', 6)

    const merged = mergeLockedFields(aiDoc, userDoc, locked)
    expect(merged.shots[0]?.durationSeconds).toBe(12)
  })

  it('takes the AI durationSeconds when it is not locked', () => {
    const userDoc = setShotDuration(DOC, 'shot-1', 12)
    const aiDoc = setShotDuration(DOC, 'shot-1', 6)

    const merged = mergeLockedFields(aiDoc, userDoc, new Set(['title']))
    expect(merged.shots[0]?.durationSeconds).toBe(6)
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

  // 顺手修的另一半：sceneLabel / composition 现在也在这份清单里——focus 重写
  // 一个镜头时，它们的锁跟 summary/emotion/camera 一样被清空。
  it('shot focus also clears sceneLabel / composition locks', () => {
    const keys = focusLockKeys(DOC, { kind: 'shot', id: 'shot-1' })
    expect(keys).toContain(scriptDocLockKey.shot('shot-1', 'sceneLabel'))
    expect(keys).toContain(scriptDocLockKey.shot('shot-1', 'composition'))
  })
})
