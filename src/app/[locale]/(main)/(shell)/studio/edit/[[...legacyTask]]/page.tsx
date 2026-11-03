import { ROUTES } from '@/constants/routes'
import { redirect } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'

import {
  buildLegacyStudioEditQuery,
  type LegacySearchParams,
} from './legacy-query'

interface LegacyStudioEditPageProps {
  params: Promise<{ locale: AppLocale; legacyTask?: string[] }>
  searchParams: Promise<LegacySearchParams>
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
