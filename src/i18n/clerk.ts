import { enUS, jaJP, zhCN } from '@clerk/localizations'

import type { AppLocale } from '@/i18n/routing'

const zhClerk = {
  ...zhCN,
  formFieldInputPlaceholder__firstName: '名字',
  formFieldInputPlaceholder__lastName: '姓氏',
  formFieldInputPlaceholder__password: '输入密码',
} as const satisfies typeof zhCN

export const CLERK_LOCALIZATIONS = {
  en: enUS,
  ja: jaJP,
  zh: zhClerk,
} as const satisfies Record<AppLocale, typeof enUS>
