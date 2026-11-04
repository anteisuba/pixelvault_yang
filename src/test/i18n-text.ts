/**
 * 断言用：某语言某句文案，占位 / 复数照真 next-intl 的规矩翻出来（界面上就是这句）。
 */
import { createTranslator } from 'next-intl'

import type { AppLocale } from '@/i18n/routing'
import { MESSAGES } from '@/messages'

export function text(
  path: string,
  values: Record<string, string | number> = {},
  locale: AppLocale = 'zh',
): string {
  const t = createTranslator({ locale, messages: MESSAGES[locale] })
  return (t as unknown as (key: string, v: typeof values) => string)(
    path,
    values,
  )
}
