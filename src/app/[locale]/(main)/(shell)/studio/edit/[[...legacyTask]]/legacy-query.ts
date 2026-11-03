import { EDIT_TASK_LIST } from '@/constants/edit-tasks'

/**
 * 旧编辑链接 → 画布的查询参数（从 page.tsx 拆出：Next 的 page 文件只能导出页面和页面配置，
 * 多导出的函数会让 webpack 构建的类型检查失败）。
 */

const LEGACY_SOURCE_QUERY_KEYS = [
  'generationId',
  'sourceUrl',
  'width',
  'height',
] as const

export type LegacySearchParams = Record<string, string | string[] | undefined>

function isEditTask(
  value: string | undefined,
): value is (typeof EDIT_TASK_LIST)[number] {
  return value !== undefined && EDIT_TASK_LIST.some((task) => task === value)
}

function firstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export function buildLegacyStudioEditQuery(
  searchParams: LegacySearchParams,
  legacyTask?: string[],
): Record<string, string> {
  const query: Record<string, string> = { canvasTool: 'image-edit' }

  for (const key of LEGACY_SOURCE_QUERY_KEYS) {
    const value = firstQueryValue(searchParams[key])
    if (value !== undefined) query[key] = value
  }

  const task = legacyTask?.length === 1 ? legacyTask[0] : undefined
  if (isEditTask(task)) query.editTask = task

  return query
}
