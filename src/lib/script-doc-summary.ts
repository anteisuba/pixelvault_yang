/**
 * ScriptDoc → **一行给模型看的摘要**（C3，任务书附录 I §3）。
 *
 * ── 为什么是共享纯函数而不是就地拼一段 ──────────────────────────────
 * 两处要用它，而且必须是**同一段字**：
 *   · 画布宿主构快照时（`lib/canvas-operator-snapshot.ts`）—— 进 `canvas.scriptDoc.summary`；
 *   · 服务端 `update_script_doc` 落笔后重算工作副本的摘要
 *     （`services/kernel/assistant-operator.service.ts`）—— 同一轮里后续的
 *     `read_graph` 必须读到**改后**的摘要。
 * 抄成两份的表现是：助手刚写完剧本，下一步 `read_graph` 却仍报旧标题 —— 而没有
 * 任何人会去查那种不一致。
 *
 * ── 摘要里放什么、不放什么 ────────────────────────────────────────
 * 放：标题 · logline · 幕（= 镜头的 `sceneLabel` 去重后的场次）· 镜头数 · 角色名。
 * ⛔ **不放镜头正文、台词、外观描述**：它与画布概览受同一条 K-4 规矩管 ——
 * 每一轮的系统/用户提示都驮着它，一份 24 镜的剧本全文塞进去就是每步一次的账单。
 * 摘要回答的是「这个项目有没有剧本、它讲的是什么、有几场几镜几个人」，
 * 细节该由后续动作去取。
 *
 * ⚠ 「幕」在本仓的 ScriptDoc 里**没有独立字段** —— `ScriptDocShot.sceneLabel` 就是
 * 场次标记，所以这里按它去重计数，⛔ 不发明一个 `acts` 结构塞进 `ScriptDocSchema`
 * （那张 schema 嵌在 `NodeWorkflowStateDataSchema` 里，动它会波及存量项目的读路径）。
 */

import { SCRIPT_DOC_LIMITS } from '@/constants/script-doc'
import type { ScriptDoc } from '@/types/script-doc'

/** 摘要里每一段的截断宽度 —— 与 ScriptDoc 自己的字段宽度同源，⛔ 不另拍一个数。 */
const SUMMARY_LOGLINE_CHARS = SCRIPT_DOC_LIMITS.loglineMaxLength

function clamp(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value
}

/**
 * 去重后的场次标记，按镜头出现顺序。
 * ⚠ 空 `sceneLabel` 不占一格：那是「这一镜没标场次」，不是「有一场叫空」。
 */
export function scriptDocSceneLabels(doc: ScriptDoc): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const shot of doc.shots) {
    const label = shot.sceneLabel?.trim()
    if (!label || seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }
  return labels
}

export function buildScriptDocSummary(doc: ScriptDoc): string {
  const scenes = scriptDocSceneLabels(doc)
  const cast = doc.roles
    .map((role) => role.name.trim())
    .filter((name) => name.length > 0)
  const logline = doc.logline.trim()

  return [
    `"${doc.title.trim()}"`,
    logline ? clamp(logline, SUMMARY_LOGLINE_CHARS) : null,
    scenes.length > 0
      ? `${scenes.length} scene(s): ${scenes.join(', ')}`
      : 'no scene labels',
    `${doc.shots.length} shot(s)`,
    cast.length > 0 ? `cast: ${cast.join(', ')}` : 'no cast yet',
  ]
    .filter((part): part is string => part !== null)
    .join(' · ')
}
