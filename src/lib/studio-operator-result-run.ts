import { resolveAdapterType } from '@/constants/models'
import {
  getPromptDialect,
  type PromptDialect,
} from '@/constants/prompt-dialects'
import { resolveGenerationDisplayName } from '@/lib/generation-name'
import type { ActiveRun, GenerationRecord, RunItem } from '@/types'
import type {
  StudioOperatorResultItem,
  StudioOperatorResultOwner,
  StudioOperatorResultRun,
} from '@/types/studio-assistant-operator'

interface StudioResultWorkspace {
  outputType: 'image' | 'video' | 'audio'
  promptDialect: PromptDialect
}

export function isStudioResultInWorkspace(
  outputType: GenerationRecord['outputType'],
  modelId: string,
  workspace: StudioResultWorkspace,
): boolean {
  if (outputType.toLowerCase() !== workspace.outputType) return false
  return (
    outputType !== 'IMAGE' ||
    getPromptDialect(resolveAdapterType(modelId) ?? undefined) ===
      workspace.promptDialect
  )
}

export function studioRunForWorkspace(
  run: ActiveRun | null | undefined,
  workspace: StudioResultWorkspace,
): ActiveRun | null {
  if (!run || run.outputType.toLowerCase() !== workspace.outputType) return null
  const items = run.items.filter((item) =>
    isStudioResultInWorkspace(run.outputType, item.modelId, workspace),
  )
  if (items.length === 0) return null
  if (items.length === run.items.length) return run
  return {
    ...run,
    items,
    selectedItemId: items.some((item) => item.id === run.selectedItemId)
      ? run.selectedItemId
      : null,
  }
}

/**
 * **这一批结果**（§2.11 结果行卡）—— 数据源是宿主本来就在跑的那条回流
 * （`activeRun`），⛔ 没有新轮询器。工作台与 LoRA 装配台共用这一份。
 * ⚠ 只收**跑完且有地址**的那些：`pending` / `generating` 的格子画出来是一个
 *   永远转着的骨架，而这张卡的意义是「这一批出来了，挑一张说话」。
 */
export function toOperatorRunResults(
  items: readonly RunItem[],
): StudioOperatorResultItem[] {
  return items.flatMap((item) => {
    const generation = item.generation
    if (item.status !== 'completed' || !generation?.url) return []
    return [
      {
        id: generation.id,
        url: generation.url,
        ...(generation.thumbnailUrl
          ? { thumbnailUrl: generation.thumbnailUrl }
          : {}),
        /**
         * ⭐ label = **产物名**（`图_012·银发少女立绘`，切片 N1）而不是提示词
         * 前 40 字：这条 label 会成为 chip 上、灯箱标题上和 `@` 选择器里显示的
         * 那串字，而用户要能**照着它打出来**指认这一张。
         */
        label: resolveGenerationDisplayName(generation),
        /**
         * ⭐ 角标与 `@` 指认认的是**真序号**（`Generation.seq`，切片 N1 收口）
         * —— 列表口读得到它（`generation.service.ts` 的 select 里有这一列）。
         * ⚠ 缺席就让它缺席：结果行卡因此不画角标，⛔ 不在这里编一个。
         */
        seq: generation.seq,
        outputType: generation.outputType,
      },
    ]
  })
}

/**
 * **这一批的在飞读数**（v2 §6.3，commit #10）—— 结果卡的生成中态读它。
 *
 * ⭐ 与 `toOperatorRunResults` 同源同一条回流，只是**不过滤**：占位格数是「这一批
 * 一共几条」，而结果只留跑完的那几条。两个数从同一个数组算出来，⛔ 别让结果卡
 * 去外面再问一次「这次要出几张」。
 * ⚠ `settled` 在这里判：`cancelled` 与 `failed` 同等对待（都是不会再变的终态）。
 */
export function toOperatorResultRun(
  items: readonly RunItem[] | undefined,
  results: readonly StudioOperatorResultItem[],
  owner?: StudioOperatorResultOwner,
): StudioOperatorResultRun | undefined {
  if (!items || items.length === 0) return undefined
  if (owner) {
    items = items.filter((item) =>
      matchesOperatorResultOwner(item.operatorResultOwner, owner),
    )
    if (items.length === 0) return undefined
    results = toOperatorRunResults(items)
  }
  const sourceOwner = owner ? items[0]?.operatorResultOwner : undefined
  const failureReason = items.find((item) => item.status === 'failed')?.error
  return {
    ...(sourceOwner ? { owner: sourceOwner } : {}),
    ...(failureReason ? { failureReason } : {}),
    total: items.length,
    completed: items.filter((item) => item.status === 'completed').length,
    failed: items.filter(
      (item) => item.status === 'failed' || item.status === 'cancelled',
    ).length,
    settled: items.every(
      (item) =>
        item.status === 'completed' ||
        item.status === 'failed' ||
        item.status === 'cancelled',
    ),
    items: results,
  }
}

export function matchesOperatorResultOwner(
  owner: StudioOperatorResultOwner | undefined,
  thread: {
    threadScope: string | null
    localThreadId: string
    pendingResultId: string | null
  },
): boolean {
  return Boolean(
    owner &&
    owner.threadScope === thread.threadScope &&
    owner.localThreadId === thread.localThreadId &&
    owner.pendingResultId === thread.pendingResultId,
  )
}
