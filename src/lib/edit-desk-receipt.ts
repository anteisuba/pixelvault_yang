/**
 * 剪辑台回执与段闪的**判据**（④ A 关键切片 · node-canvas-v2 §6「回执与段闪」）。
 *
 * 外部改动（外部 Claude 经 MCP）换进来时，台面要答两件事：改了**几段**（回执上的
 * 数）、改了**哪几段**（段闪）。两件事读同一份前后对比，⛔ 不各算一遍。
 *
 * ⚠ 纯函数：不碰 DOM、不碰 React。闪那一下在 `edit-desk-flash.ts`。
 */

import { AUDIO_CLIP_SOURCE } from '@/constants/audio-options'
import { readOutputVersions } from '@/lib/node-output-versions'
import type { EditProject, NodeWorkflowStateV4 } from '@/types/node-workflow'

export interface EditTimelineTouch {
  /** 两边都在、内容变了的段 —— 闪这几段。⚠ 新加的段不闪（出现本身就是反馈）。 */
  readonly changedIds: readonly string[]
  /** 回执上的「N 段」：改的 + 加的 + 删的。 */
  readonly count: number
}

type AnyEditClip =
  | EditProject['tracks']['video'][number]
  | EditProject['tracks']['text'][number]

function clipsById(project: EditProject | undefined): Map<string, AnyEditClip> {
  const byId = new Map<string, AnyEditClip>()
  if (!project) return byId
  const { video, audio, music, text } = project.tracks
  for (const clip of [...video, ...audio, ...music, ...text]) {
    byId.set(clip.id, clip)
  }
  return byId
}

/**
 * 时间线前后对比。⚠ 按段 id 比内容（⛔ 不按下标）：磁吸轨上删一段，后面的段
 * 只是往前挪了位置，内容没变 —— 它们不算「被改」，也不该闪。
 */
export function diffEditTimeline(
  before: EditProject | undefined,
  after: EditProject | undefined,
): EditTimelineTouch {
  const was = clipsById(before)
  const now = clipsById(after)
  const changedIds: string[] = []
  let added = 0
  for (const [id, clip] of now) {
    const prior = was.get(id)
    if (!prior) {
      added += 1
      continue
    }
    if (JSON.stringify(prior) !== JSON.stringify(clip)) changedIds.push(id)
  }
  let removed = 0
  for (const id of was.keys()) {
    if (!now.has(id)) removed += 1
  }
  return { changedIds, count: changedIds.length + added + removed }
}

export interface LandedRender {
  readonly nodeId: string
  readonly generationId?: string
}

/**
 * 这次换进来的 state 里**新落的成片卡**（服务端在成片回调里落，mcp.md §7）。
 * 判据 = 新出现的卡、它有一版的来源是 `render`。
 */
export function findLandedRender(
  before: NodeWorkflowStateV4,
  after: NodeWorkflowStateV4,
): LandedRender | null {
  const known = new Set(before.nodes.map((node) => node.id))
  for (const node of after.nodes) {
    if (known.has(node.id)) continue
    const version = readOutputVersions(node.data).find(
      (item) => item.source?.kind === AUDIO_CLIP_SOURCE.render,
    )
    if (!version) continue
    return {
      nodeId: node.id,
      ...(version.generationId ? { generationId: version.generationId } : {}),
    }
  }
  return null
}

/** 某次成片（按 `generationId`）落成了哪张卡 —— 「回画布看」要选中它。 */
export function findNodeByGenerationId(
  state: NodeWorkflowStateV4,
  generationId: string,
): string | null {
  const node = state.nodes.find((item) =>
    readOutputVersions(item.data).some(
      (version) => version.generationId === generationId,
    ),
  )
  return node?.id ?? null
}

/**
 * 删一段主线会一起带走的挂件（v2 关键切片「删镜头时挂着的台词、字幕一起删」）：回执上
 * 写「带走 N 条台词、M 条字幕」。只有主线段有挂件。
 */
export function countClipRiders(
  project: EditProject,
  clipId: string,
): { readonly lines: number; readonly captions: number } {
  return {
    lines: project.tracks.audio.filter((clip) => clip.attach?.clipId === clipId)
      .length,
    captions: project.tracks.text.filter(
      (clip) => clip.attach?.clipId === clipId,
    ).length,
  }
}
