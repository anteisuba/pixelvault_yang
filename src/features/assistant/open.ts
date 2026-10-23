import 'server-only'

import { CANVAS_NEW_PROJECT_QUERY_VALUE } from '@/constants/routes'
import type { AssistantOperatorBenchOpen } from '@/types/assistant-operator'
import type { AssistantWorkspace } from '@/types/assistant-workspace'
import { assistantWorkspaceFromKey } from '@/lib/assistant-workspace'
import { findOwnCharacter } from '@/services/assistant-library-write.service'
import type { V3Context } from '@/services/kernel/assistant-v3-steps.service'
import { listRecentNodeWorkflowProjectsForUser } from '@/services/node/node-workflow.service'
import {
  ASSISTANT_NEXT_OPEN_BENCH_WORKSPACES,
  type AssistantNextOpenBench,
} from '@/features/assistant/constants'
import type { OpenInput } from '@/features/assistant/tools'
import { parseWorkspaceHandle } from '@/features/assistant/workspace.service'

/**
 * 开台（第 9e 步，owner 10-23：直接开、不先问；改到一半也不拦；画布默认最近那块）。
 *
 * ⭐ 一步里 `open` 最后跑：这一跳存好（结果待补），帧上带着去哪，停在 `bench_open`；浏览器换过去、
 *   等那个台准备好，带着接力条与新台面接着发。到了那一跳，这次调用的结果就是新台的板子，模型用那个台的
 *   改法接着摆（每一项照样带撤销）。⛔ 开台不花钱；花钱那一步照旧是确认卡 /「交给 AI 出图」。
 * ⚠ 去哪由服务端认（画布最近那块、角色按名字），⛔ 不收模型写的 id。
 */

export interface BenchOpening {
  readonly target: AssistantOperatorBenchOpen
  /** 给模型看的台名（结果里那一句）。 */
  readonly label: string
}

const LABEL: Record<AssistantWorkspace, string> = {
  'image-natural': 'the image bench',
  'image-tags': 'the tag bench',
  video: 'the video bench',
  audio: 'the audio bench',
  lora: 'the LoRA bench',
  canvas: 'the canvas',
  cards: 'the character page',
}

export function benchLabel(workspace: AssistantWorkspace): string {
  return LABEL[workspace]
}

function currentWorkspace(context: V3Context) {
  return assistantWorkspaceFromKey(context.request.workspaceKey)
}

async function characterOf(
  context: V3Context,
  raw: string,
): Promise<{ id: string; name: string } | null> {
  const onPage = context.request.snapshot.cards?.characters.find(
    (entry) => entry.id === context.handles.idOf(raw),
  )
  if (onPage) return { id: onPage.id, name: onPage.name }
  const handle = parseWorkspaceHandle(raw)
  const name =
    handle?.kind === 'character' ? handle.name : raw.split('/')[0]!.trim()
  const card = await findOwnCharacter(context.prepared.user.id, name)
  return card ? { id: card.id, name: card.name } : null
}

/** `open` 这一次调用：认出去哪；就在那个台上就直说，⛔ 不白跳一次。 */
export async function planOpen(
  context: V3Context,
  input: OpenInput,
): Promise<{ output: string; error: boolean; opening?: BenchOpening }> {
  const bench: AssistantNextOpenBench = input.bench
  const workspace = ASSISTANT_NEXT_OPEN_BENCH_WORKSPACES[bench]
  const here = currentWorkspace(context)
  const label = benchLabel(workspace)

  if (workspace === 'canvas') {
    if (input.canvas === 'new')
      return {
        output: `Opening a new canvas…`,
        error: false,
        opening: {
          target: { workspace, projectId: CANVAS_NEW_PROJECT_QUERY_VALUE },
          label: 'a new canvas',
        },
      }
    if (here?.workspace === 'canvas')
      return {
        output: `You are on the canvas already. To start another one, open canvas "new".`,
        error: false,
      }
    const recent = await listRecentNodeWorkflowProjectsForUser(context.clerkId)
    const project = recent[0]
    return project
      ? {
          output: `Opening the canvas 「${project.name}」…`,
          error: false,
          opening: {
            target: { workspace, projectId: project.id },
            label: `the canvas 「${project.name}」`,
          },
        }
      : {
          output: `Opening a new canvas (they have none yet)…`,
          error: false,
          opening: {
            target: { workspace, projectId: CANVAS_NEW_PROJECT_QUERY_VALUE },
            label: 'a new canvas',
          },
        }
  }

  if (workspace === 'cards') {
    const raw = input.character?.trim()
    const character = raw ? await characterOf(context, raw) : null
    if (raw && !character)
      return {
        output: `${raw}: not a character of theirs. Use "角色·<name>"; find can look it up.`,
        error: true,
      }
    const openId = context.request.snapshot.cards?.open?.id ?? null
    if (here?.workspace === 'cards' && (!character || character.id === openId))
      return {
        output: `You are on the character page already${character ? ` with ${character.name} open` : ''}.`,
        error: false,
      }
    return {
      output: `Opening ${label}${character ? ` with ${character.name}` : ''}…`,
      error: false,
      opening: {
        target: {
          workspace,
          ...(character ? { characterId: character.id } : {}),
        },
        label: character ? `${label} (${character.name} open)` : label,
      },
    }
  }

  if (here?.workspace === workspace)
    return { output: `You are on ${label} already.`, error: false }
  return {
    output: `Opening ${label}…`,
    error: false,
    opening: { target: { workspace }, label },
  }
}

/** 到了没有：现在这一跳的台就是要开的那个（新画布认任何一块，角色页不看开着谁）。 */
export function arrivedAt(
  context: V3Context,
  target: AssistantOperatorBenchOpen,
): boolean {
  const here = currentWorkspace(context)
  if (!here || here.workspace !== target.workspace) return false
  if (
    target.workspace === 'canvas' &&
    target.projectId &&
    target.projectId !== CANVAS_NEW_PROJECT_QUERY_VALUE
  )
    return here.projectId === target.projectId
  return true
}

/** 到了那一跳，这次 `open` 的结果：新台的板子；没到就如实说现在在哪。 */
export function openedOutput(
  context: V3Context,
  opening: BenchOpening,
  board: () => string,
): { output: string; error: boolean } {
  if (arrivedAt(context, opening.target))
    return {
      output: `Opened ${opening.label}. You are working here now (the board in the first message was the previous bench). It is as follows:\n${board()}`,
      error: false,
    }
  const here = currentWorkspace(context)
  return {
    output: `${opening.label} did not open; the creator is on ${here ? benchLabel(here.workspace) : 'another page'}. Carry on here, or tell them.`,
    error: true,
  }
}
