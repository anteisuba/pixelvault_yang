/**
 * 剧本卡 → 时间轴镜头的**投影计划**（进度表 24，画板 `DesignD7Script.dc.html`）。
 *
 * ⚠ 这一层只**算 diff**，一个字都不改图：算与改分开，是因为 diff 的三条规则各自
 * 有一条不能违反的纪律，而它们都只有在能单独断言的时候才守得住：
 *
 * ① **新增的镜才新建**。同一份正文拆两次得到同一批键（`lib/node-script-shots.ts`），
 *    所以「第三镜改了一句话」不会被读成「删了三镜又建了三镜」。
 * ② **文案变了的旧镜只标「已变」**，⛔ 不覆盖节点上的内容 —— 用户可能已经在这
 *    一镜上改过提示词、出过片。新文本摆在 `pendingText` 上等他自己决定。
 * ③ **剧本里删掉的镜标灰，⛔ 不删节点** —— 上面可能挂着已经生成的产物，而一次
 *    「同步」把它们带走看起来和投影成功一模一样。
 *
 * ⛔ 纯函数：不铸 id、不读时钟、不碰 DOM。
 */

import { NODE_SCRIPT_SHOT_STATE_IDS } from '@/constants/node-script'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { parseScriptShots, type ScriptShotDraft } from '@/lib/node-script-shots'
import type { NodeV4, NodeV4ScriptShot } from '@/types/node-workflow'

/** 一面**已经**由某张剧本卡投出来的镜。 */
export interface ProjectedShotNode {
  readonly node: NodeV4
  readonly ref: NodeV4ScriptShot
}

export interface ScriptProjectionPlan {
  /** 这次拆出来的全部分镜，按正文顺序。 */
  readonly shots: readonly ScriptShotDraft[]
  /** 剧本卡上那段大纲（第一个分段标记之前的正文）。 */
  readonly outline: string
  readonly actCount: number
  /** 这张剧本卡此刻已经投出来的镜（按镜号 / 出现顺序）。 */
  readonly projected: readonly ProjectedShotNode[]
  /** 剧本里有、图上没有 → 新建。 */
  readonly toCreate: readonly ScriptShotDraft[]
  /** 图上有、剧本里那一段变了 → 标「已变」并带上新文本。 */
  readonly toMark: readonly {
    readonly node: NodeV4
    readonly shot: ScriptShotDraft
  }[]
  /** 图上有、文本与剧本一致 → 回到 `synced`（被标过的那些因此能自己消掉角标）。 */
  readonly toResync: readonly NodeV4[]
  /** 剧本里没有了 → 标灰。⛔ 不删。 */
  readonly toDrop: readonly NodeV4[]
  /**
   * 拆镜：新镜 `s7a` / `s7b` 来自这次标灰的 `s7` → 新卡照它的模型、参数和参考线来
   * （v3 回放 T22：拆出来的两镜什么都没有，要从头配）。键 = 新镜的 `shotKey`。
   */
  readonly splitFrom: ReadonlyMap<string, NodeV4>
}

export function readScriptShotRef(node: NodeV4): NodeV4ScriptShot | undefined {
  const data = node.data
  if (data.kind !== NODE_MEDIA_KIND_IDS.video) return undefined
  if (data.subtype !== NODE_V4_VIDEO_SUBTYPE_IDS.shot) return undefined
  return data.scriptShot
}

/** 这张剧本卡投出来的那些镜，按出现顺序。 */
export function listProjectedShots(
  nodes: readonly NodeV4[],
  scriptNodeId: string,
): readonly ProjectedShotNode[] {
  const found: ProjectedShotNode[] = []
  for (const node of nodes) {
    const ref = readScriptShotRef(node)
    if (!ref || ref.scriptNodeId !== scriptNodeId) continue
    found.push({ node, ref })
  }
  return found
}

/**
 * 两段镜头文案算不算同一段：行尾 Markdown 强制换行的反斜杠不算差别（2026-10-09 v3 回放
 * T08：写剧本卡时那个反斜杠会被剥掉，早先投出去的镜存的文案还带着它，改一句台词就把
 * 列车段五镜全标成「已变」）。
 */
function sameShotText(a: string, b: string): boolean {
  const plain = (text: string) => text.replace(/[ \t]*\\$/gm, '').trim()
  return a === b || plain(a) === plain(b)
}

export function planScriptProjection(
  nodes: readonly NodeV4[],
  scriptNodeId: string,
  body: string,
): ScriptProjectionPlan {
  const breakdown = parseScriptShots(body)
  const projected = listProjectedShots(nodes, scriptNodeId)
  const byKey = new Map(projected.map((item) => [item.ref.shotKey, item]))

  const toCreate: ScriptShotDraft[] = []
  const toMark: { node: NodeV4; shot: ScriptShotDraft }[] = []
  const toResync: NodeV4[] = []
  const seen = new Set<string>()

  for (const shot of breakdown.shots) {
    const existing = byKey.get(shot.key)
    if (!existing) {
      toCreate.push(shot)
      continue
    }
    seen.add(shot.key)
    if (sameShotText(existing.ref.projectedText, shot.text)) {
      // ⚠ 已经是 `synced` 的也报进来：调用方据此把曾经的「已变 / 标灰」角标消掉。
      toResync.push(existing.node)
      continue
    }
    toMark.push({ node: existing.node, shot })
  }

  // ⚠ 已经是 `dropped` 的不再报：重投影两次不该产生第二条「又标灰了一面镜」。
  const toDrop = projected
    .filter(
      (item) =>
        !seen.has(item.ref.shotKey) &&
        item.ref.state !== NODE_SCRIPT_SHOT_STATE_IDS.dropped,
    )
    .map((item) => item.node)

  const dropping = new Map(
    toDrop.flatMap((node) => {
      const ref = readScriptShotRef(node)
      return ref ? [[ref.shotKey, node] as const] : []
    }),
  )
  const splitFrom = new Map<string, NodeV4>()
  for (const shot of toCreate) {
    const parentKey = /^(.*\d)[a-z]$/i.exec(shot.key)?.[1]
    const parent = parentKey ? dropping.get(parentKey) : undefined
    if (parent) splitFrom.set(shot.key, parent)
  }

  return {
    shots: breakdown.shots,
    outline: breakdown.outline,
    actCount: breakdown.actCount,
    projected,
    toCreate,
    toMark,
    toResync,
    toDrop,
    splitFrom,
  }
}
