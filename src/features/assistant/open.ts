import 'server-only'

import { CANVAS_NEW_PROJECT_QUERY_VALUE } from '@/constants/routes'
import type {
  AssistantLibraryShow,
  AssistantOperatorBenchOpen,
} from '@/types/assistant-operator'
import type { AssistantWorkspace } from '@/types/assistant-workspace'
import { assistantWorkspaceFromKey } from '@/lib/assistant-workspace'
import type { V3Context } from '@/services/kernel/assistant-v3-steps.service'
import { listRecentNodeWorkflowProjectsForUser } from '@/services/node/node-workflow.service'
import { renderLibraryView } from '@/features/assistant/bench'
import {
  ASSISTANT_NEXT_OPEN_BENCH_WORKSPACES,
  ASSISTANT_NEXT_OPEN_LIBRARIES,
  ASSISTANT_NEXT_OPEN_LIBRARY_BENCH,
} from '@/features/assistant/constants'
import type { OpenInput } from '@/features/assistant/tools'
import { libraryItemShown } from '@/lib/assistant-workspace'
import {
  parseWorkspaceHandle,
  resolvePicture,
} from '@/features/assistant/workspace.service'

/**
 * 开台（第 9e 步，owner 10-23：直接开、不先问；改到一半也不拦；画布默认最近那块）。
 *
 * ⭐ 一步里 `open` 最后跑：这一跳存好（结果待补），帧上带着去哪，停在 `bench_open`；浏览器换过去、
 *   等那个台准备好，带着接力条与新台面接着发。到了那一跳，这次调用的结果就是新台的板子，模型用那个台的
 *   改法接着摆（每一项照样带撤销）。⛔ 开台不花钱；花钱那一步照旧是确认卡 /「交给 AI 出图」。
 * ⚠ 去哪由服务端认（画布最近那块），⛔ 不收模型写的 id。
 * ⚠ 没有角色页（10-26）：它进了库、不当宿主，开过去永远「没到」；角色在哪个台都用 edit 改。
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
  lora: 'the LoRA bench',
  canvas: 'the canvas',
  cards: 'the character page',
  home: 'the home page',
}

export function benchLabel(workspace: AssistantWorkspace): string {
  return LABEL[workspace]
}

function currentWorkspace(context: V3Context) {
  return assistantWorkspaceFromKey(context.request.workspaceKey)
}

/** `open` 这一次调用：认出去哪；就在那个台上就直说，⛔ 不白跳一次。 */
export async function planOpen(
  context: V3Context,
  input: OpenInput,
): Promise<{ output: string; error: boolean; opening?: BenchOpening }> {
  if (input.bench === ASSISTANT_NEXT_OPEN_LIBRARY_BENCH)
    return planLibraryShow(context, input)
  const workspace = ASSISTANT_NEXT_OPEN_BENCH_WORKSPACES[input.bench]
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

  if (here?.workspace === workspace)
    return { output: `You are on ${label} already.`, error: false }
  return {
    output: `Opening ${label}…`,
    error: false,
    opening: { target: { workspace }, label },
  }
}

const LIBRARY_LABEL: Record<AssistantLibraryShow['library'], string> = {
  assets: 'their asset library',
  cards: 'their character library',
  prompts: 'their saved-prompt library',
  lora: 'their LoRA library',
  tavern: 'the character-card library',
  tags: 'the tag library',
  voices: 'the voice library',
  gallery: 'the gallery',
}

/**
 * 库那一支（owner 10-28「就地翻给你看」）：台不动，库换到那一页、打开那一样 / 搜那个词。
 * ⭐ 图按编号由这里认成 id；角色 / 提示词 / LoRA 只带名字，页面在自己的列表里按名字找（找不到就搜这个名字）。
 */
async function planLibraryShow(
  context: V3Context,
  input: OpenInput,
): Promise<{ output: string; error: boolean; opening?: BenchOpening }> {
  if (!input.library)
    return {
      output:
        'bench "library" needs library: assets, characters, prompts or loras.',
      error: true,
    }
  const library = ASSISTANT_NEXT_OPEN_LIBRARIES[input.library]
  const show: AssistantLibraryShow = { library }
  const search = input.search?.trim()
  if (search) show.search = search
  if (input.section && library === 'lora') show.section = input.section
  const raw = input.show?.trim()
  if (raw) {
    const handle = parseWorkspaceHandle(raw)
    if (handle?.kind === 'picture') {
      if (library !== 'assets')
        return {
          output: `${raw} is a picture: show it with library "assets".`,
          error: true,
        }
      const picture = await resolvePicture(
        {
          userId: context.prepared.user.id,
          clerkId: context.clerkId,
          incognito: context.request.incognito === true,
        },
        raw,
      ).catch(() => null)
      if (!picture)
        return { output: `${raw} is not one of their pictures.`, error: true }
      show.itemId = picture.generationId
      show.itemName = picture.label
    } else {
      const name =
        handle?.kind === 'character' ||
        handle?.kind === 'prompt' ||
        handle?.kind === 'lora'
          ? handle.name
          : raw
      if (library === 'assets')
        return {
          output: `In the asset library show a picture by number (图_N).`,
          error: true,
        }
      show.itemName = name
    }
  }
  const label = LIBRARY_LABEL[library]
  const here = currentWorkspace(context)
  return {
    output: `Showing ${label}…`,
    error: false,
    opening: {
      target: {
        workspace: here?.workspace ?? 'home',
        ...(here?.projectId ? { projectId: here.projectId } : {}),
        library: show,
      },
      label,
    },
  }
}

/** 库那一支到了没有：库是那一个，要的那一样打开了（或就在屏上），要搜的词在搜索框里。 */
function libraryArrived(
  context: V3Context,
  show: AssistantLibraryShow,
): boolean {
  const view = context.request.libraryView
  if (!view || view.library !== show.library) return false
  if (show.search && view.screen?.search !== show.search) return false
  return !show.itemName || libraryItemShown(show.itemName, view)
}

/** 到了没有：现在这一跳的台就是要开的那个（新画布认任何一块）。 */
export function arrivedAt(
  context: V3Context,
  target: AssistantOperatorBenchOpen,
): boolean {
  if (target.library) return libraryArrived(context, target.library)
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
  if (opening.target.library) {
    const screen = renderLibraryView(context.request.libraryView).trim()
    return arrivedAt(context, opening.target)
      ? {
          output: `Now showing ${opening.label}. Their screen:\n${screen}`,
          error: false,
        }
      : {
          output: `Could not show all of it in ${opening.label} (the item was not found there, or the page did not answer). Their screen now:\n${screen || 'the library is not open.'}`,
          error: true,
        }
  }
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
