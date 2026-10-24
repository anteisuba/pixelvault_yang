import { EDIT_TASK_LIST } from '@/constants/edit-tasks'
import { ROUTES } from '@/constants/routes'
import { redirect } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'

const LEGACY_SOURCE_QUERY_KEYS = [
  'generationId',
  'sourceUrl',
  'width',
  'height',
] as const

type LegacySearchParams = Record<string, string | string[] | undefined>

interface LegacyStudioEditPageProps {
  params: Promise<{ locale: AppLocale; legacyTask?: string[] }>
  searchParams: Promise<LegacySearchParams>
}

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

/** Temporary compatibility redirect (307) while legacy edit links converge. */
export default async function LegacyStudioEditPage({
  params,
  searchParams,
}: LegacyStudioEditPageProps) {
  const [{ locale, legacyTask }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ])

  redirect({
    locale,
    href: {
      pathname: ROUTES.STUDIO_NODE,
      query: buildLegacyStudioEditQuery(resolvedSearchParams, legacyTask),
    },
  })
}
