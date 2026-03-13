import { enUS, jaJP, zhCN } from '@clerk/localizations'

import type { AppLocale } from '@/i18n/routing'

export const CLERK_LOCALIZATIONS = {
  en: enUS,
  ja: jaJP,
  zh: zhCN,
} as const satisfies Record<AppLocale, typeof enUS>
