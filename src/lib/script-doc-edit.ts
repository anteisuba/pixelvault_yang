/**
 * Pure ScriptDoc editing helpers for the canvas assistant's manual-edit surface.
 *
 * The workspace renders every field editable; these immutable transforms keep
 * the doc valid (stable ids, schema-safe placeholders) and live outside React so
 * they can be unit-tested. `mergeLockedFields` implements the "manual wins"
 * rule: fields the user hand-edited (locked) survive a whole-doc AI regeneration.
 */

import {
  SCRIPT_DOC_FOCUS_KIND_IDS,
  SCRIPT_DOC_LIMITS,
} from '@/constants/script-doc'
import type {
  ScriptDoc,
  ScriptDocDialogueLine,
  ScriptDocFocus,
  ScriptDocShot,
} from '@/types/script-doc'

export type ScriptDocTextField =
  | 'title'
  | 'logline'
  | 'styleNote'
  | 'background'
  | 'targetDuration'
export type ScriptDocRoleField = 'name' | 'description' | 'personality' | 'goal'
/**
 * ⚠ 2026-08-02 补 `sceneLabel` / `composition`。此前这两个字段没有任何人类
 * 可达的写入端 —— `sceneLabel` 在剧本笺里只读、只能由 LLM 起草或 planner
 * 迁移写入；`composition` 更极端，ScriptDoc 里压根没有它，却在 shotText 节点
 * 上参与最终 prompt 拼接。owner 拍板「助手自动生成与用户手动输入是同一种
 * 东西」后，四个镜头字段统一以 ScriptDoc 为事实源，写入端必须齐。
 */
export type ScriptDocShotField =
  | 'summary'
  | 'emotion'
  | 'camera'
  | 'sceneLabel'
  | 'composition'
  | 'durationSeconds'

/**
 * Field-key scheme shared by the lock set, the lock UI, and the merge. Built,
 * never parsed — both writer (component) and reader (merge) construct the same
 * key from ids so the strings always agree.
 */
export const scriptDocLockKey = {
  doc: (field: ScriptDocTextField): string => field,
  role: (roleId: string, field: ScriptDocRoleField): string =>
    `role:${roleId}:${field}`,
  shot: (shotId: string, field: ScriptDocShotField): string =>
    `shot:${shotId}:${field}`,
  line: (lineId: string): string => `line:${lineId}`,
}

/** Next `${prefix}-N` id that does not collide with existing ScriptDoc ids. */
export function nextScriptDocId(
  prefix: 'role' | 'shot' | 'line',
  existing: readonly string[],
): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`)
  let max = 0
  for (const id of existing) {
    const match = pattern.exec(id)
    if (match) {
      const value = Number(match[1])
      if (value > max) max = value
    }
  }
  return `${prefix}-${max + 1}`
}

function allDialogueLines(doc: ScriptDoc): ScriptDocDialogueLine[] {
  return doc.shots.flatMap((shot) => shot.dialogue)
}

export function setDocText(
  doc: ScriptDoc,
  field: ScriptDocTextField,
  value: string,
): ScriptDoc {
  switch (field) {
    case 'title':
      return { ...doc, title: value }
    case 'logline':
      return { ...doc, logline: value }
    case 'styleNote':
      return { ...doc, styleNote: value }
    case 'background':
      return { ...doc, background: value }
    case 'targetDuration':
      return { ...doc, targetDuration: value }
  }
}

export function setRoleField(
  doc: ScriptDoc,
  roleId: string,
  field: ScriptDocRoleField,
  value: string,
): ScriptDoc {
  return {
    ...doc,
    roles: doc.roles.map((role) => {
      if (role.id !== roleId) return role
      switch (field) {
        case 'name':
          return { ...role, name: value }
        case 'description':
          return { ...role, description: value }
        case 'personality':
          return { ...role, personality: value }
        case 'goal':
          return { ...role, goal: value }
      }
    }),
  }
}

export function setShotField(
  doc: ScriptDoc,
  shotId: string,
  field: ScriptDocShotField,
  value: string,
): ScriptDoc {
  return {
    ...doc,
    shots: doc.shots.map((shot) => {
      if (shot.id !== shotId) return shot
      switch (field) {
        case 'summary':
          return { ...shot, summary: value }
        case 'emotion':
          return { ...shot, emotion: value }
        case 'camera':
          return { ...shot, camera: value }
        case 'sceneLabel':
          return { ...shot, sceneLabel: value }
        case 'composition':
          return { ...shot, composition: value }
        case 'durationSeconds':
          // 数值字段，不走这条纯字符串通道 —— 用下面专门的 setShotDuration。
          return shot
      }
    }),
  }
}

/**
 * 每镜显式时长（秒）。越界夹取到 `[0, maxShotDurationSeconds]`
 * （Seedance 2.5 硬顶）而不是拒绝整次写入 —— 手填时长最常见的越界是「多打
 * 一位数」，夹取比让输入原地不动更顺手，也和 UI 滑杆/步进器的习惯一致。
 * `undefined` 清空这一镜的显式时长。
 */
export function setShotDuration(
  doc: ScriptDoc,
  shotId: string,
  seconds: number | undefined,
): ScriptDoc {
  const clamped =
    seconds === undefined
      ? undefined
      : Math.min(Math.max(seconds, 0), SCRIPT_DOC_LIMITS.maxShotDurationSeconds)
  return {
    ...doc,
    shots: doc.shots.map((shot) =>
      shot.id === shotId ? { ...shot, durationSeconds: clamped } : shot,
    ),
  }
}

export function setDialogueLine(
  doc: ScriptDoc,
  lineId: string,
  value: string,
): ScriptDoc {
  return {
    ...doc,
    shots: doc.shots.map((shot) => ({
      ...shot,
      dialogue: shot.dialogue.map((line) =>
        line.id === lineId ? { ...line, line: value } : line,
      ),
    })),
  }
}

export function setDialogueSpeaker(
  doc: ScriptDoc,
  lineId: string,
  speakerRoleId: string,
): ScriptDoc {
  return {
    ...doc,
    shots: doc.shots.map((shot) => ({
      ...shot,
      dialogue: shot.dialogue.map((line) =>
        line.id === lineId ? { ...line, speakerRoleId } : line,
      ),
    })),
  }
}

/** Append a role. `name` is a non-empty placeholder (schema requires min 1). */
export function addRole(doc: ScriptDoc, name: string): ScriptDoc {
  const id = nextScriptDocId(
    'role',
    doc.roles.map((role) => role.id),
  )
  return { ...doc, roles: [...doc.roles, { id, name, description: '' }] }
}

/** Remove a role and detach it from every shot binding + dialogue line. */
export function removeRole(doc: ScriptDoc, roleId: string): ScriptDoc {
  return {
    ...doc,
    roles: doc.roles.filter((role) => role.id !== roleId),
    shots: doc.shots.map((shot) => ({
      ...shot,
      roleIds: shot.roleIds.filter((id) => id !== roleId),
      dialogue: shot.dialogue.filter((line) => line.speakerRoleId !== roleId),
    })),
  }
}

/** Append a shot. `summary` is a non-empty placeholder (schema requires min 1). */
export function addShot(doc: ScriptDoc, summary: string): ScriptDoc {
  const id = nextScriptDocId(
    'shot',
    doc.shots.map((shot) => shot.id),
  )
  return {
    ...doc,
    shots: [...doc.shots, { id, summary, roleIds: [], dialogue: [] }],
  }
}

export function removeShot(doc: ScriptDoc, shotId: string): ScriptDoc {
  return { ...doc, shots: doc.shots.filter((shot) => shot.id !== shotId) }
}

/**
 * 显式重排：把 shotId 挪到 toIndex（越界夹取到 `[0, shots.length - 1]`）。
 * shotId 不存在或落点与当前位置相同时原样返回入参引用 —— 调用方靠 `===`
 * 判断没变化，与本文件其它「no-op 返回原引用」的函数
 * （`mergeLockedFields` / `applyFocusedResult`）同一套约定。
 *
 * ⛔ 不动 `SCRIPT_DOC_LIMITS` 之外的东西 —— LLM 是否允许重排是后续第⑤步
 * 的范围，这里只是纯数据层的顺序原语。
 */
export function moveShot(
  doc: ScriptDoc,
  shotId: string,
  toIndex: number,
): ScriptDoc {
  const fromIndex = doc.shots.findIndex((shot) => shot.id === shotId)
  if (fromIndex === -1) return doc

  const lastIndex = doc.shots.length - 1
  const clampedIndex = Math.min(Math.max(toIndex, 0), lastIndex)
  if (clampedIndex === fromIndex) return doc

  const shots = [...doc.shots]
  const [moved] = shots.splice(fromIndex, 1)
  shots.splice(clampedIndex, 0, moved as ScriptDocShot)
  return { ...doc, shots }
}

/**
 * Append a dialogue line to a shot. `speakerRoleId` must be an existing role id
 * (the UI only enables this when at least one role exists); `line` is a
 * non-empty placeholder.
 */
export function addDialogue(
  doc: ScriptDoc,
  shotId: string,
  speakerRoleId: string,
  line: string,
): ScriptDoc {
  const id = nextScriptDocId(
    'line',
    allDialogueLines(doc).map((entry) => entry.id),
  )
  return {
    ...doc,
    shots: doc.shots.map((shot) =>
      shot.id === shotId
        ? { ...shot, dialogue: [...shot.dialogue, { id, speakerRoleId, line }] }
        : shot,
    ),
  }
}

export function removeDialogue(
  doc: ScriptDoc,
  shotId: string,
  lineId: string,
): ScriptDoc {
  return {
    ...doc,
    shots: doc.shots.map((shot) =>
      shot.id === shotId
        ? { ...shot, dialogue: shot.dialogue.filter((l) => l.id !== lineId) }
        : shot,
    ),
  }
}

const ROLE_FIELDS: ScriptDocRoleField[] = [
  'name',
  'description',
  'personality',
  'goal',
]
// ⚠ 2026-09-02 补 `sceneLabel` / `composition`：此前这两个字段漏在这份列表
// 外，`mergeLockedFields` 的 shot 分支又只认这份列表 —— 结果这两个字段的锁
// 从来没被合并器读到过，AI 整份重写照样覆盖，锁是空转的（见下面 mergeLockedFields
// 的同批修复）。`durationSeconds` 不进这份列表：它只用于 `mergeLockedFields`
// 的锁定态还原（画布对齐三梁 · 梁1），不参与「focus 重写清空锁」——AI 的
// 结构化输出契约里没有这个字段，focus 重写不会产出它，谈不上要清它的锁。
const SHOT_FIELDS: ScriptDocShotField[] = [
  'summary',
  'emotion',
  'camera',
  'sceneLabel',
  'composition',
]

/**
 * Splice a focused AI result into the current doc: take ONLY the focused module
 * (the whole cast, or one shot by id) from the AI's doc and keep everything else
 * exactly as the user has it. Deterministic — "only this part changes" does not
 * depend on the model behaving.
 */
export function applyFocusedResult(
  currentDoc: ScriptDoc,
  aiDoc: ScriptDoc,
  focus: ScriptDocFocus,
): ScriptDoc {
  if (focus.kind === SCRIPT_DOC_FOCUS_KIND_IDS.roles) {
    return { ...currentDoc, roles: aiDoc.roles }
  }

  if (!focus.id) return currentDoc
  const aiShot = aiDoc.shots.find((shot) => shot.id === focus.id)
  if (!aiShot) return currentDoc
  return {
    ...currentDoc,
    shots: currentDoc.shots.map((shot) =>
      shot.id === focus.id ? aiShot : shot,
    ),
  }
}

/**
 * Lock keys belonging to a focused target. After a focus edit the user has
 * explicitly asked the AI to (re)write that module, so its manual-edit locks are
 * superseded and should be cleared.
 */
export function focusLockKeys(doc: ScriptDoc, focus: ScriptDocFocus): string[] {
  if (focus.kind === SCRIPT_DOC_FOCUS_KIND_IDS.roles) {
    return doc.roles.flatMap((role) =>
      ROLE_FIELDS.map((field) => scriptDocLockKey.role(role.id, field)),
    )
  }

  if (!focus.id) return []
  const shotId = focus.id
  const shot = doc.shots.find((entry) => entry.id === shotId)
  return [
    ...SHOT_FIELDS.map((field) => scriptDocLockKey.shot(shotId, field)),
    ...(shot
      ? shot.dialogue.map((line) => scriptDocLockKey.line(line.id))
      : []),
  ]
}

/**
 * Manual-wins merge: start from the AI's fresh doc, then restore every locked
 * field from the user's current doc (matched by stable id). Untouched fields
 * take the AI value; brand-new AI roles/shots/lines pass through unchanged.
 */
export function mergeLockedFields(
  aiDoc: ScriptDoc,
  currentDoc: ScriptDoc,
  locked: ReadonlySet<string>,
): ScriptDoc {
  if (locked.size === 0) return aiDoc

  const currentRoles = new Map(currentDoc.roles.map((role) => [role.id, role]))
  const currentShots = new Map(currentDoc.shots.map((shot) => [shot.id, shot]))
  const currentLines = new Map(
    allDialogueLines(currentDoc).map((line) => [line.id, line]),
  )

  return {
    ...aiDoc,
    title: locked.has('title') ? currentDoc.title : aiDoc.title,
    logline: locked.has('logline') ? currentDoc.logline : aiDoc.logline,
    styleNote: locked.has('styleNote') ? currentDoc.styleNote : aiDoc.styleNote,
    background: locked.has('background')
      ? currentDoc.background
      : aiDoc.background,
    targetDuration: locked.has('targetDuration')
      ? currentDoc.targetDuration
      : aiDoc.targetDuration,
    roles: aiDoc.roles.map((role) => {
      const current = currentRoles.get(role.id)
      if (!current) return role
      return {
        ...role,
        name: locked.has(scriptDocLockKey.role(role.id, 'name'))
          ? current.name
          : role.name,
        description: locked.has(scriptDocLockKey.role(role.id, 'description'))
          ? current.description
          : role.description,
        personality: locked.has(scriptDocLockKey.role(role.id, 'personality'))
          ? current.personality
          : role.personality,
        goal: locked.has(scriptDocLockKey.role(role.id, 'goal'))
          ? current.goal
          : role.goal,
      }
    }),
    shots: aiDoc.shots.map((shot) => {
      const current = currentShots.get(shot.id)
      const merged = current
        ? {
            ...shot,
            summary: locked.has(scriptDocLockKey.shot(shot.id, 'summary'))
              ? current.summary
              : shot.summary,
            emotion: locked.has(scriptDocLockKey.shot(shot.id, 'emotion'))
              ? current.emotion
              : shot.emotion,
            camera: locked.has(scriptDocLockKey.shot(shot.id, 'camera'))
              ? current.camera
              : shot.camera,
            // 顺手修：此前漏了这两个分支 —— 锁键存在但从未被这个函数读到，
            // AI 重写永远覆盖，锁是空转的。
            sceneLabel: locked.has(scriptDocLockKey.shot(shot.id, 'sceneLabel'))
              ? current.sceneLabel
              : shot.sceneLabel,
            composition: locked.has(
              scriptDocLockKey.shot(shot.id, 'composition'),
            )
              ? current.composition
              : shot.composition,
            // 画布对齐三梁 · 梁1：每镜显式时长同样走「锁定态还原」。
            durationSeconds: locked.has(
              scriptDocLockKey.shot(shot.id, 'durationSeconds'),
            )
              ? current.durationSeconds
              : shot.durationSeconds,
          }
        : shot
      return {
        ...merged,
        dialogue: merged.dialogue.map((line) => {
          const currentLine = currentLines.get(line.id)
          return currentLine && locked.has(scriptDocLockKey.line(line.id))
            ? { ...line, line: currentLine.line }
            : line
        }),
      }
    }),
  }
}
