import { ROUTES } from '@/constants/routes'
import { redirect } from '@/i18n/navigation'
import { DEFAULT_LOCALE } from '@/i18n/routing'

export default function RootPage() {
  redirect({ locale: DEFAULT_LOCALE, href: ROUTES.HOME })
}
